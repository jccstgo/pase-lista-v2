// ================================
// MANEJADORES DE EVENTOS - ADMIN PANEL
// ================================

// ================================
// MANEJADOR DE LOGIN
// ================================

async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showMessage('loginMessage', 'Usuario y contraseña son requeridos', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success && data.data?.token) {
            authToken = data.data.token;
            localStorage.setItem('adminToken', authToken);
            showAdminSection();
            await loadDashboard();
            updateSystemInfo();
            const overviewTab = document.querySelector('.tab[data-tab="overview"]');
            if (overviewTab) {
                showTab('overview', overviewTab);
            }
        } else {
            const errorMessage = data.error || data.message || 'Error de autenticación';
            showMessage('loginMessage', errorMessage, 'error');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showMessage('loginMessage', 'Error de conexión: ' + error.message, 'error');
    }
}

// ================================
// MANEJADOR DE CAMBIO DE CONTRASEÑA
// ================================

async function handleChangePassword(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (newPassword !== confirmPassword) {
        showMessage('passwordMessage', 'Las contraseñas no coinciden', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showMessage('passwordMessage', 'La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    changePasswordBtn.disabled = true;
    changePasswordBtn.textContent = 'Cambiando...';
    
    try {
        const response = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('passwordMessage', 'Contraseña cambiada exitosamente', 'success');
            document.getElementById('changePasswordForm').reset();
            
            setTimeout(() => {
                if (confirm('Contraseña cambiada exitosamente. ¿Deseas cerrar sesión para usar la nueva contraseña?')) {
                    logout();
                }
            }, 2000);
        } else {
            showMessage('passwordMessage', data.error, 'error');
        }
    } catch (error) {
        showMessage('passwordMessage', 'Error de conexión', 'error');
    } finally {
        changePasswordBtn.disabled = false;
        changePasswordBtn.textContent = 'Cambiar Contraseña';
    }
}

// ================================
// MANEJADOR DE RESTRICCIONES
// ================================

async function handleRestrictionsSubmit(e) {
    e.preventDefault();
    
    const saveBtn = document.getElementById('saveRestrictionsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    
    try {
        const formData = new FormData(document.getElementById('restrictionsForm'));
        const config = {};
        
        // Convertir checkbox a string boolean
        config.location_restriction_enabled = document.getElementById('locationRestrictionEnabled').checked ? 'true' : 'false';
        config.device_restriction_enabled = document.getElementById('deviceRestrictionEnabled').checked ? 'true' : 'false';
        config.admin_key_bypass_enabled = document.getElementById('adminKeyBypassEnabled').checked ? 'true' : 'false';
        
        // Otros campos
        config.location_name = formData.get('location_name') || '';
        config.location_latitude = formData.get('location_latitude') || '';
        config.location_longitude = formData.get('location_longitude') || '';
        config.location_radius_km = formData.get('location_radius_km') || '1';
        
        const response = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();

        if (response.ok) {
            showMessage('restrictionsMessage', 'Configuración guardada exitosamente', 'success');
            systemConfig = config;
            populateRestrictionsForm();
        } else {
            showMessage('restrictionsMessage', data.error, 'error');
        }
    } catch (error) {
        showMessage('restrictionsMessage', 'Error de conexión', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Configuración';
    }
}

// ================================
// MANEJADORES DE CLAVES ADMINISTRATIVAS
// ================================

function showCreateKeyForm() {
    document.getElementById('createKeyForm').classList.remove('hidden');
    document.getElementById('newAdminKey').focus();
}

function hideCreateKeyForm() {
    document.getElementById('createKeyForm').classList.add('hidden');
    document.getElementById('newAdminKey').value = '';
    document.getElementById('keyDescription').value = '';
}

async function createAdminKey() {
    const key = document.getElementById('newAdminKey').value.trim().toUpperCase();
    const description = document.getElementById('keyDescription').value.trim();
    
    if (!key || !description) {
        alert('Por favor, completa todos los campos');
        return;
    }
    
    if (key.length < 4) {
        alert('La clave debe tener al menos 4 caracteres');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/admin-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ key, description })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            hideCreateKeyForm();
            await loadAdminKeys();
            alert('Clave administrativa creada exitosamente');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function deactivateAdminKey(key) {
    if (!confirm(`¿Estás seguro de desactivar la clave "${key}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/admin-keys/${key}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            await loadAdminKeys();
            alert('Clave administrativa desactivada exitosamente');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

// ================================
// MANEJADORES DE ARCHIVOS CSV
// ================================

async function previewCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
        showMessage('uploadMessage', 'El archivo está vacío', 'error');
        return;
    }
    
    const rows = lines.map(line => {
        const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
        return columns;
    });
    
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    const expectedHeaders = ['matricula', 'nombre', 'grupo'];
    const hasRequiredHeaders = expectedHeaders.every(header => 
        headers.some(h => h.toLowerCase() === header)
    );
    
    if (!hasRequiredHeaders) {
        showMessage('uploadMessage', 
            'Headers obligatorios faltantes. Se requieren: matricula, nombre, grupo. Se encontraron: ' + headers.join(', '), 
            'error');
        return;
    }
    
    currentStudents = dataRows.map(row => {
        const student = {};
        headers.forEach((header, index) => {
            const cleanHeader = (header || '').toString().toLowerCase().trim();
            const cleanValue = (row[index] || '').toString().trim();
            student[cleanHeader] = cleanValue;
        });
        return student;
    }).filter(student => 
        student.matricula && 
        student.matricula.trim() !== '' && 
        student.nombre && 
        student.nombre.trim() !== ''
    );
    
    const preview = document.getElementById('csvPreview');
    let html = '<div style="margin: 20px 0;">';
    html += '<h3>Vista Previa (' + currentStudents.length + ' registros válidos)</h3>';
    html += '<div class="table-container" style="max-height: 300px;">';
    html += '<table><thead><tr><th>Matrícula</th><th>Nombre</th><th>Grupo</th></tr></thead><tbody>';

    currentStudents.slice(0, 10).forEach(student => {
        html += '<tr>';
        html += '<td>' + student.matricula + '</td>';
        html += '<td>' + decodeSpecialChars(student.nombre) + '</td>';
        html += '<td>' + decodeSpecialChars(student.grupo || '-').toUpperCase() + '</td>';
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    if (currentStudents.length > 10) {
        html += '<p style="color: #666; font-size: 14px;">Mostrando los primeros 10 de ' + currentStudents.length + ' registros</p>';
    }
    html += '</div>';
    
    preview.innerHTML = html;
    document.getElementById('uploadBtn').disabled = false;
}

async function uploadStudents() {
    if (currentStudents.length === 0) {
        showMessage('uploadMessage', 'No hay estudiantes para subir', 'error');
        return;
    }
    
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Subiendo...';
    
    try {
        const response = await fetch('/api/admin/upload-students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ students: currentStudents })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('uploadMessage', data.message, 'success');
            document.getElementById('csvFile').value = '';
            document.getElementById('csvPreview').innerHTML = '';
            currentStudents = [];
            
            await loadStats();
            
            // Mostrar advertencia sobre reinicio de restricciones
            if (systemConfig.device_restriction_enabled === 'true') {
                setTimeout(() => {
                    showMessage('uploadMessage', '⚠️ Los dispositivos registrados han sido reiniciados debido a la nueva lista de personal', 'warning');
                }, 3000);
            }
        } else {
            showMessage('uploadMessage', data.error, 'error');
        }
    } catch (error) {
        showMessage('uploadMessage', 'Error de conexión', 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Subir Lista de Personal';
    }
}

async function clearStudentsDatabase() {
    if (!authToken) {
        showMessage('uploadMessage', 'Debes iniciar sesión para realizar esta acción', 'error');
        return;
    }

    const confirmation = confirm('¿Estás seguro de que deseas eliminar todos los registros de personal? Esta acción no se puede deshacer.');
    if (!confirmation) {
        return;
    }

    const clearBtn = document.getElementById('clearStudentsBtn');
    if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.textContent = 'Limpiando...';
    }

    try {
        const response = await fetch('/api/admin/students/clear', {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + authToken
            }
        });

        const data = await response.json();

        if (response.ok) {
            showMessage('uploadMessage', data.message || 'Base de datos limpiada correctamente', 'success');
            document.getElementById('csvFile').value = '';
            document.getElementById('csvPreview').innerHTML = '';
            currentStudents = [];

            await Promise.all([
                loadStats(),
                loadDetailedList(),
                loadDevices()
            ]);
        } else {
            showMessage('uploadMessage', data.error || 'No se pudo limpiar la base de datos', 'error');
        }
    } catch (error) {
        showMessage('uploadMessage', 'Error de conexión al limpiar la base de datos', 'error');
    } finally {
        if (clearBtn) {
            clearBtn.disabled = false;
            clearBtn.textContent = 'Limpiar Base de Datos de Personal';
        }
    }
}

// ================================
// EXPONER FUNCIONES NECESARIAS
// ================================
window.handleLogin = handleLogin;
window.handleChangePassword = handleChangePassword;
window.handleRestrictionsSubmit = handleRestrictionsSubmit;
window.showCreateKeyForm = showCreateKeyForm;
window.hideCreateKeyForm = hideCreateKeyForm;
window.createAdminKey = createAdminKey;
window.deactivateAdminKey = deactivateAdminKey;
window.previewCSV = previewCSV;
window.uploadStudents = uploadStudents;
window.clearStudentsDatabase = clearStudentsDatabase;