const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Configurar SQLite
const db = new sqlite3.Database('./database.db');

// Crear tablas
db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
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
    )`);
    
    // Insertar usuario por defecto
    db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('admin', '123456')`);
});

// Configurar multer para archivos
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

// Crear carpeta uploads si no existe
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// 🔐 AUTH ENDPOINTS
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
        if (err) {
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
    
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function(err) {
        if (err) {
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
                return res.status(500).json({ success: false, error: 'Error guardando archivo' });
            }
            
            res.json({ 
                success: true, 
                file: {
                    id: this.lastID,
                    original_name: fileInfo.original_name,
                    file_size: fileInfo.file_size,
                    upload_date: new Date()
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
            return res.status(500).json({ success: false, error: 'Error obteniendo archivos' });
        }
        
        res.json({ success: true, files });
    });
});

app.get('/api/download/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    
    db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        }
        
        res.download(file.file_path, file.original_name);
    });
});

app.delete('/api/files/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    
    db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
        if (err || !file) {
            return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
        }
        
        // Eliminar archivo físico
        fs.unlink(file.file_path, (err) => {
            if (err) {
                console.error('Error eliminando archivo físico:', err);
            }
            
            // Eliminar de la base de datos
            db.run('DELETE FROM files WHERE id = ?', [fileId], function(err) {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Error eliminando archivo' });
                }
                
                res.json({ success: true, message: 'Archivo eliminado' });
            });
        });
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
    console.log(`📊 Base de datos: SQLite`);
    console.log(`💾 Almacenamiento: Local (uploads/)`);
});