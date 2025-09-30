const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware - Configuración más permisiva para producción
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use('/uploads', express.static('uploads'));

// Ruta de salud para verificar que el servidor funciona
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Servidor funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// Configurar SQLite - Usar path absoluto para Railway
const dbPath = process.env.NODE_ENV === 'production' 
    ? '/tmp/database.db' 
    : './database.db';

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error conectando a SQLite:', err);
    } else {
        console.log('Conectado a SQLite en:', dbPath);
    }
});

// Crear tablas
db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creando tabla users:', err);
    });
    
    // Tabla de archivos
    db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        uploaded_by INTEGER,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(uploaded_by) REFERENCES users(id)
    )`, (err) => {
        if (err) console.error('Error creando tabla files:', err);
    });
    
    // Insertar usuario por defecto
    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('admin', '123456')`, (err) => {
        if (err) console.error('Error insertando usuario por defecto:', err);
    });
});

// Configurar multer para archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB límite
    }
});

// Crear carpeta uploads si no existe
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
}

// 🔐 AUTH ENDPOINTS
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }
    
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
        if (err) {
            console.error('Error en login:', err);
            return res.status(500).json({ success: false, error: 'Error en la base de datos' });
        }
        
        if (user) {
            res.json({ 
                success: true, 
                user: { id: user.id, username: user.username } 
            });
        } else {
            res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }
    
    if (username.length < 3 || password.length < 3) {
        return res.status(400).json({ success: false, error: 'Usuario y contraseña deben tener al menos 3 caracteres' });
    }
    
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function(err) {
        if (err) {
            console.error('Error en registro:', err);
            return res.status(400).json({ success: false, error: 'Usuario ya existe' });
        }
        
        res.json({ 
            success: true, 
            user: { id: this.lastID, username: username } 
        });
    });
});

// 📁 FILE ENDPOINTS
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se subió ningún archivo' });
    }
    
    const { uploadedBy } = req.body;
    
    if (!uploadedBy) {
        // Eliminar el archivo subido
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'ID de usuario requerido' });
    }
    
    const fileInfo = {
        filename: req.file.filename,
        original_name: req.file.originalname,
        file_path: req.file.path,
        file_size: req.file.size,
        uploaded_by: uploadedBy
    };
    
    db.run(
        `INSERT INTO files (filename, original_name, file_path, file_size, uploaded_by) 
         VALUES (?, ?, ?, ?, ?)`,
        [fileInfo.filename, fileInfo.original_name, fileInfo.file_path, fileInfo.file_size, fileInfo.uploaded_by],
        function(err) {
            if (err) {
                console.error('Error guardando archivo:', err);
                // Eliminar el archivo físico si hay error en la BD
                fs.unlinkSync(req.file.path);
                return res.status(500).json({ success: false, error: 'Error guardando archivo en base de datos' });
            }
            
            res.json({ 
                success: true, 
                file: {
                    id: this.lastID,
                    original_name: fileInfo.original_name,
                    file_size: fileInfo.file_size,
                    upload_date: new Date().toISOString()
                }
            });
        }
    );
});

app.get('/api/files', (req, res) => {
    db.all(`
        SELECT f.*, u.username as uploaded_by_name 
        FROM files f 
        LEFT JOIN users u ON f.uploaded_by = u.id 
        ORDER BY f.upload_date DESC
    `, (err, files) => {
        if (err) {
            console.error('Error obteniendo archivos:', err);
            return res.status(500).json({ success: false, error: 'Error obteniendo archivos' });
        }
        
        res.json({ success: true, files: files || [] });
    });
});

app.get('/api/download/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    
    db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
        if (err || !file) {
            console.error('Archivo no encontrado:', fileId);
            return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        }
        
        if (!fs.existsSync(file.file_path)) {
            return res.status(404).json({ success: false, error: 'Archivo físico no encontrado' });
        }
        
        res.download(file.file_path, file.original_name, (err) => {
            if (err) {
                console.error('Error descargando archivo:', err);
            }
        });
    });
});

app.delete('/api/files/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    
    db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        }
        
        // Eliminar archivo físico
        if (fs.existsSync(file.file_path)) {
            fs.unlink(file.file_path, (err) => {
                if (err) {
                    console.error('Error eliminando archivo físico:', err);
                }
            });
        }
        
        // Eliminar de la base de datos
        db.run('DELETE FROM files WHERE id = ?', [fileId], function(err) {
            if (err) {
                console.error('Error eliminando archivo de BD:', err);
                return res.status(500).json({ success: false, error: 'Error eliminando archivo' });
            }
            
            res.json({ success: true, message: 'Archivo eliminado correctamente' });
        });
    });
});

// Ruta de prueba
app.get('/', (req, res) => {
    res.json({ 
        message: 'File Sync Backend funcionando!',
        endpoints: {
            auth: ['POST /api/login', 'POST /api/register'],
            files: ['GET /api/files', 'POST /api/upload', 'GET /api/download/:id', 'DELETE /api/files/:id'],
            health: 'GET /health'
        },
        timestamp: new Date().toISOString()
    });
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Base de datos: ${dbPath}`);
    console.log(`📁 Almacenamiento: uploads/`);
});