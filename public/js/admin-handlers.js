// ================================
// MANEJADORES DE EVENTOS - PANEL ADMINISTRATIVO
// ================================

// ================================
// MANEJADOR DE INICIO DE SESIÓN
// ================================

async function manejarInicioSesion(evento) {
    evento.preventDefault();

    const usuario = document.getElementById('username').value;
    const contrasena = document.getElementById('password').value;

    if (!usuario || !contrasena) {
        mostrarMensaje('loginMessage', 'Usuario y contraseña son requeridos', 'error');
        return;
    }

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usuario, password: contrasena })
        });

        const data = await response.json();

        if (response.ok && data.success && data.data?.token) {
            authToken = data.data.token;
            localStorage.setItem('adminToken', authToken);
            mostrarSeccionAdministracion();
            const pestanaResultados = document.querySelector('.dashboard-tab[data-target="resultsSection"]');
            if (pestanaResultados) {
                mostrarSeccionTablero('resultsSection', pestanaResultados);
            } else {
                mostrarSeccionTablero('resultsSection');
            }
            await cargarPanelAdministrativo();
            actualizarInformacionSistema();
            const pestanaResumen = document.querySelector('.tab[data-group="results"][data-tab="overview"]');
            if (pestanaResumen) {
                mostrarPestana('overview', pestanaResumen, 'results');
            }
            const pestanaAdminActiva = document.querySelector('.tab[data-group="admin"].active') || document.querySelector('.tab[data-group="admin"]');
            if (pestanaAdminActiva) {
                const grupo = pestanaAdminActiva.dataset.group || 'admin';
                mostrarPestana(pestanaAdminActiva.dataset.tab, pestanaAdminActiva, grupo);
            }
        } else {
            const mensajeError = data.error || data.message || 'Error de autenticación';
            mostrarMensaje('loginMessage', mensajeError, 'error');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        mostrarMensaje('loginMessage', 'Error de conexión: ' + error.message, 'error');
    }
}

// ================================
// MANEJADOR DE CAMBIO DE CONTRASEÑA
// ================================

async function manejarCambioContrasena(evento) {
    evento.preventDefault();

    const contrasenaActual = document.getElementById('currentPassword').value;
    const nuevaContrasena = document.getElementById('newPassword').value;
    const confirmacionContrasena = document.getElementById('confirmPassword').value;

    if (nuevaContrasena !== confirmacionContrasena) {
        mostrarMensaje('passwordMessage', 'Las contraseñas no coinciden', 'error');
        return;
    }

    if (nuevaContrasena.length < 6) {
        mostrarMensaje('passwordMessage', 'La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }

    const botonCambio = document.getElementById('changePasswordBtn');
    botonCambio.disabled = true;
    botonCambio.textContent = 'Cambiando...';

    try {
        const response = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ currentPassword: contrasenaActual, newPassword: nuevaContrasena })
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensaje('passwordMessage', 'Contraseña cambiada exitosamente', 'success');
            document.getElementById('changePasswordForm').reset();

            setTimeout(() => {
                if (confirm('Contraseña cambiada exitosamente. ¿Deseas cerrar sesión para usar la nueva contraseña?')) {
                    cerrarSesion();
                }
            }, 2000);
        } else {
            mostrarMensaje('passwordMessage', data.error, 'error');
        }
    } catch (error) {
        mostrarMensaje('passwordMessage', 'Error de conexión', 'error');
    } finally {
        botonCambio.disabled = false;
        botonCambio.textContent = 'Cambiar Contraseña';
    }
}

// ================================
// MANEJADOR DE RESTRICCIONES
// ================================

async function manejarEnvioRestricciones(evento) {
    evento.preventDefault();

    const botonGuardar = document.getElementById('saveRestrictionsBtn');
    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando...';

    try {
        const formData = new FormData(document.getElementById('restrictionsForm'));
        const configuracion = {};

        configuracion.location_restriction_enabled = document.getElementById('locationRestrictionEnabled').checked ? 'true' : 'false';
        configuracion.device_restriction_enabled = document.getElementById('deviceRestrictionEnabled').checked ? 'true' : 'false';
        configuracion.admin_key_bypass_enabled = document.getElementById('adminKeyBypassEnabled').checked ? 'true' : 'false';

        configuracion.location_name = formData.get('location_name') || '';
        configuracion.location_latitude = formData.get('location_latitude') || '';
        configuracion.location_longitude = formData.get('location_longitude') || '';
        configuracion.location_radius_km = formData.get('location_radius_km') || '1';

        const response = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(configuracion)
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensaje('restrictionsMessage', 'Configuración guardada exitosamente', 'success');
            configuracionSistema = configuracion;
            llenarFormularioRestricciones();
        } else {
            mostrarMensaje('restrictionsMessage', data.error, 'error');
        }
    } catch (error) {
        mostrarMensaje('restrictionsMessage', 'Error de conexión', 'error');
    } finally {
        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar Configuración';
    }
}

// ================================
// MANEJADORES DE CLAVES ADMINISTRATIVAS
// ================================

function mostrarFormularioCrearClave() {
    document.getElementById('createKeyForm').classList.remove('hidden');
    document.getElementById('newAdminKey').focus();
}

function ocultarFormularioCrearClave() {
    document.getElementById('createKeyForm').classList.add('hidden');
    document.getElementById('newAdminKey').value = '';
    document.getElementById('keyDescription').value = '';
}

async function crearClaveAdministrativa() {
    const clave = document.getElementById('newAdminKey').value.trim().toUpperCase();
    const descripcion = document.getElementById('keyDescription').value.trim();

    if (!clave || !descripcion) {
        alert('Por favor, completa todos los campos');
        return;
    }

    if (clave.length < 4) {
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
            body: JSON.stringify({ key: clave, description: descripcion })
        });

        const data = await response.json();

        if (response.ok) {
            ocultarFormularioCrearClave();
            await cargarClavesAdministrativas();
            alert('Clave administrativa creada exitosamente');
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Error de conexión');
    }
}

async function desactivarClaveAdministrativa(clave) {
    if (!confirm(`¿Estás seguro de desactivar la clave "${clave}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/admin-keys/${clave}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (response.ok) {
            await cargarClavesAdministrativas();
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

async function previsualizarCSV() {
    const entradaArchivo = document.getElementById('csvFile');
    const archivo = entradaArchivo.files[0];

    if (!archivo) return;

    let contenidoTexto = '';

    try {
        contenidoTexto = typeof leerArchivoComoTextoConCodificacion === 'function'
            ? await leerArchivoComoTextoConCodificacion(archivo)
            : await archivo.text();
    } catch (error) {
        console.error('❌ Error leyendo archivo CSV:', error);
        mostrarMensaje('uploadMessage', 'No se pudo leer el archivo seleccionado', 'error');
        return;
    }

    const textoNormalizado = contenidoTexto.replace(/\uFEFF/g, '');
    const lineas = textoNormalizado
        .split(/\r?\n/)
        .map(linea => linea.trim())
        .filter(linea => linea.length > 0);

    if (lineas.length === 0) {
        mostrarMensaje('uploadMessage', 'El archivo está vacío', 'error');
        return;
    }

    const filas = lineas.map(linea => {
        const columnas = linea.split(',').map(columna => columna.trim().replace(/"/g, ''));
        return columnas;
    });

    const encabezados = filas[0];
    const datos = filas.slice(1);

    const encabezadosEsperados = ['matricula', 'nombre', 'grupo'];
    const tieneEncabezadosRequeridos = encabezadosEsperados.every(encabezado =>
        encabezados.some(h => h.toLowerCase() === encabezado)
    );

    if (!tieneEncabezadosRequeridos) {
        mostrarMensaje('uploadMessage',
            'Encabezados obligatorios faltantes. Se requieren: matricula, nombre, grupo. Se encontraron: ' + encabezados.join(', '),
            'error');
        return;
    }

    estudiantesActuales = datos.map(fila => {
        const estudiante = {};
        encabezados.forEach((encabezado, indice) => {
            const encabezadoLimpio = (encabezado || '').toString().toLowerCase().trim();
            const valorOriginal = (fila[indice] || '').toString().trim();
            const valorLimpio = decodificarCaracteresEspeciales(valorOriginal);
            estudiante[encabezadoLimpio] = valorLimpio;
        });
        return estudiante;
    }).filter(estudiante =>
        estudiante.matricula &&
        estudiante.matricula.trim() !== '' &&
        estudiante.nombre &&
        estudiante.nombre.trim() !== ''
    );

    const vistaPrevia = document.getElementById('csvPreview');
    let html = '<div style="margin: 20px 0;">';
    html += '<h3>Vista Previa (' + estudiantesActuales.length + ' registros válidos)</h3>';
    html += '<div class="table-container" style="max-height: 300px;">';
    html += '<table><thead><tr><th>Matrícula</th><th>Nombre</th><th>Grupo</th></tr></thead><tbody>';

    estudiantesActuales.slice(0, 10).forEach(estudiante => {
        html += '<tr>';
        html += '<td>' + estudiante.matricula + '</td>';
        html += '<td>' + decodificarCaracteresEspeciales(estudiante.nombre) + '</td>';
        html += '<td>' + decodificarCaracteresEspeciales(estudiante.grupo || '-').toUpperCase() + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    if (estudiantesActuales.length > 10) {
        html += '<p style="color: #666; font-size: 14px;">Mostrando los primeros 10 de ' + estudiantesActuales.length + ' registros</p>';
    }
    html += '</div>';

    vistaPrevia.innerHTML = html;
    document.getElementById('uploadBtn').disabled = false;
}

async function subirEstudiantes() {
    if (estudiantesActuales.length === 0) {
        mostrarMensaje('uploadMessage', 'No hay estudiantes para subir', 'error');
        return;
    }

    const botonSubir = document.getElementById('uploadBtn');
    botonSubir.disabled = true;
    botonSubir.textContent = 'Subiendo...';

    try {
        const response = await fetch('/api/admin/upload-students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({ students: estudiantesActuales })
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensaje('uploadMessage', data.message, 'success');
            document.getElementById('csvFile').value = '';
            document.getElementById('csvPreview').innerHTML = '';
            estudiantesActuales = [];

            await cargarEstadisticas();

            if (configuracionSistema.device_restriction_enabled === 'true') {
                setTimeout(() => {
                    mostrarMensaje('uploadMessage', '⚠️ Los dispositivos registrados han sido reiniciados debido a la nueva lista de personal', 'warning');
                }, 3000);
            }
        } else {
            mostrarMensaje('uploadMessage', data.error, 'error');
        }
    } catch (error) {
        mostrarMensaje('uploadMessage', 'Error de conexión', 'error');
    } finally {
        botonSubir.disabled = false;
        botonSubir.textContent = 'Subir Lista de Personal';
    }
}

async function limpiarBaseEstudiantes() {
    if (!authToken) {
        mostrarMensaje('uploadMessage', 'Debes iniciar sesión para realizar esta acción', 'error');
        return;
    }

    const confirmacion = confirm('¿Estás seguro de que deseas eliminar todos los registros de personal? Esta acción no se puede deshacer.');
    if (!confirmacion) {
        return;
    }

    const botonLimpiar = document.getElementById('clearStudentsBtn');
    if (botonLimpiar) {
        botonLimpiar.disabled = true;
        botonLimpiar.textContent = 'Limpiando...';
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
            mostrarMensaje('uploadMessage', data.message || 'Base de datos limpiada correctamente', 'success');
            document.getElementById('csvFile').value = '';
            document.getElementById('csvPreview').innerHTML = '';
            estudiantesActuales = [];

            await Promise.all([
                cargarEstadisticas(),
                cargarListaDetallada(),
                cargarDispositivos()
            ]);
        } else {
            mostrarMensaje('uploadMessage', data.error || 'No se pudo limpiar la base de datos', 'error');
        }
    } catch (error) {
        mostrarMensaje('uploadMessage', 'Error de conexión al limpiar la base de datos', 'error');
    } finally {
        if (botonLimpiar) {
            botonLimpiar.disabled = false;
            botonLimpiar.textContent = 'Limpiar Base de Datos de Personal';
        }
    }
}

// ================================
// EXPONER FUNCIONES NECESARIAS
// ================================
window.manejarInicioSesion = manejarInicioSesion;
window.manejarCambioContrasena = manejarCambioContrasena;
window.manejarEnvioRestricciones = manejarEnvioRestricciones;
window.mostrarFormularioCrearClave = mostrarFormularioCrearClave;
window.ocultarFormularioCrearClave = ocultarFormularioCrearClave;
window.crearClaveAdministrativa = crearClaveAdministrativa;
window.desactivarClaveAdministrativa = desactivarClaveAdministrativa;
window.previsualizarCSV = previsualizarCSV;
window.subirEstudiantes = subirEstudiantes;
window.limpiarBaseEstudiantes = limpiarBaseEstudiantes;
window.handleLogin = manejarInicioSesion;
window.handleChangePassword = manejarCambioContrasena;
window.handleRestrictionsSubmit = manejarEnvioRestricciones;
window.showCreateKeyForm = mostrarFormularioCrearClave;
window.hideCreateKeyForm = ocultarFormularioCrearClave;
window.createAdminKey = crearClaveAdministrativa;
window.deactivateAdminKey = desactivarClaveAdministrativa;
window.previewCSV = previsualizarCSV;
window.uploadStudents = subirEstudiantes;
window.clearStudentsDatabase = limpiarBaseEstudiantes;
