// Configuración
const API_BASE_URL = 'https://tu-backend.railway.app'; // Cambiar por tu URL de backend

// Estado de la aplicación
let currentUser = null;
let currentFiles = [];

// Inicializar aplicación
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    // Verificar si ya está logueado
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showScreen('appScreen');
        loadFiles();
        updateUserInfo();
    } else {
        showScreen('loginScreen');
    }
}

function setupEventListeners() {
    // Auth events
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('showRegister').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('registerScreen');
    });
    document.getElementById('showLogin').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('loginScreen');
    });
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // File events
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    uploadBtn.addEventListener('click', uploadFiles);
    document.getElementById('refreshBtn').addEventListener('click', loadFiles);
}

// Auth functions
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showScreen('appScreen');
            loadFiles();
            updateUserInfo();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            alert('✅ Cuenta creada exitosamente. Ahora inicia sesión.');
            showScreen('loginScreen');
            document.getElementById('registerForm').reset();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión: ' + error.message);
    }
}

function handleLogout() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        currentUser = null;
        localStorage.removeItem('currentUser');
        showScreen('loginScreen');
        document.getElementById('loginForm').reset();
    }
}

// File functions
function handleFiles(files) {
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (files.length > 0) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = `Subir ${files.length} archivo(s)`;
        
        // Mostrar preview
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.innerHTML = '';
        
        Array.from(files).forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'file-preview';
            fileElement.innerHTML = `
                <span class="file-icon">📄</span>
                <span class="file-name">${file.name}</span>
                <span class="file-size">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
            `;
            uploadArea.appendChild(fileElement);
        });
    }
}

async function uploadFiles() {
    const fileInput = document.getElementById('fileInput');
    const files = fileInput.files;
    
    if (files.length === 0 || !currentUser) return;

    const uploadBtn = document.getElementById('uploadBtn');
    const progressContainer = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    uploadBtn.disabled = true;
    progressContainer.style.display = 'flex';

    let uploadedCount = 0;
    const totalFiles = files.length;

    for (let file of files) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('uploadedBy', currentUser.id);

            const response = await fetch(`${API_BASE_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                uploadedCount++;
            } else {
                console.error('Error subiendo archivo:', file.name, result.error);
            }

            // Actualizar progreso
            const progress = (uploadedCount / totalFiles) * 100;
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;

        } catch (error) {
            console.error('Error subiendo archivo:', error);
        }
    }

    // Reset UI
    setTimeout(() => {
        progressContainer.style.display = 'none';
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Subir Archivos';
        fileInput.value = '';
        
        // Restaurar upload area
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.innerHTML = `
            <div class="upload-placeholder">
                <span class="upload-icon">📁</span>
                <p>Arrastra archivos aquí o haz clic para seleccionar</p>
                <small>Múltiples archivos permitidos</small>
            </div>
        `;

        // Recargar lista de archivos
        loadFiles();

        alert(`✅ ${uploadedCount} de ${totalFiles} archivos subidos exitosamente`);
    }, 1000);
}

async function loadFiles() {
    const filesList = document.getElementById('filesList');
    filesList.innerHTML = '<div class="loading">Cargando archivos...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/files`);
        const data = await response.json();

        if (data.success) {
            currentFiles = data.files;
            displayFiles(currentFiles);
        } else {
            filesList.innerHTML = `<div class="error">Error cargando archivos: ${data.error}</div>`;
        }
    } catch (error) {
        filesList.innerHTML = `<div class="error">Error de conexión: ${error.message}</div>`;
    }
}

function displayFiles(files) {
    const filesList = document.getElementById('filesList');
    
    if (files.length === 0) {
        filesList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📁</span>
                <h3>No hay archivos</h3>
                <p>Sube el primer archivo para comenzar</p>
            </div>
        `;
        return;
    }

    filesList.innerHTML = files.map(file => `
        <div class="file-item">
            <div class="file-info">
                <span class="file-icon">📄</span>
                <div class="file-details">
                    <div class="file-name">${file.original_name}</div>
                    <div class="file-meta">
                        Tamaño: ${(file.file_size / 1024 / 1024).toFixed(2)} MB • 
                        Subido por: ${file.uploaded_by_name} • 
                        ${new Date(file.upload_date).toLocaleDateString()}
                    </div>
                </div>
            </div>
            <div class="file-actions">
                <button class="download-btn" onclick="downloadFile(${file.id}, '${file.original_name}')">📥 Descargar</button>
                ${file.uploaded_by === currentUser.id ? 
                    `<button class="delete-btn" onclick="deleteFile(${file.id})">🗑️ Eliminar</button>` : 
                    ''
                }
            </div>
        </div>
    `).join('');
}

async function downloadFile(fileId, fileName) {
    try {
        window.open(`${API_BASE_URL}/api/download/${fileId}`);
    } catch (error) {
        alert('Error descargando archivo: ' + error.message);
    }
}

async function deleteFile(fileId) {
    if (confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                await loadFiles();
                alert('Archivo eliminado exitosamente');
            } else {
                alert('Error eliminando archivo: ' + data.error);
            }
        } catch (error) {
            alert('Error eliminando archivo: ' + error.message);
        }
    }
}

// Utility functions
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenName).classList.add('active');
}

function updateUserInfo() {
    if (currentUser) {
        document.getElementById('currentUser').textContent = currentUser.username;
    }
}

// Make functions global for onclick events
window.downloadFile = downloadFile;
window.deleteFile = deleteFile;