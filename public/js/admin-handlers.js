// ================================
// MANEJADORES DE EVENTOS - PANEL ADMINISTRATIVO
// ================================

let solicitandoAccesoTecnico = false;
let modalAccesoTecnicoAbierto = false;

async function mostrarDialogoContrasenaTecnica() {
    const modal = document.getElementById('techAccessModal');
    const form = document.getElementById('techAccessModalForm');
    const input = document.getElementById('techAccessModalPassword');
    const cancelButton = document.getElementById('techAccessModalCancel');
    const errorMessage = document.getElementById('techAccessModalError');

    if (!modal || !form || !input || !cancelButton) {
        console.error('⚠️ No se encontraron los elementos del modal de acceso técnico.');
        return { password: null, reason: 'unavailable' };
    }

    if (modalAccesoTecnicoAbierto) {
        return { password: null, reason: 'in-progress' };
    }

    modalAccesoTecnicoAbierto = true;

    return new Promise(resolve => {
        const mostrarError = (mensaje) => {
            if (!errorMessage) {
                return;
            }

            errorMessage.textContent = mensaje || '';
            errorMessage.style.display = mensaje ? 'block' : 'none';
        };

        const finalizar = (valor, reason) => {
            modal.classList.add('hidden');
            form.removeEventListener('submit', onSubmit);
            cancelButton.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeyDown);
            mostrarError('');
            input.value = '';
            modalAccesoTecnicoAbierto = false;
            resolve({ password: valor, reason });
        };

        const onSubmit = (evento) => {
            evento.preventDefault();
            const valor = input.value.trim();

            if (!valor) {
                mostrarError('Debes ingresar la contraseña técnica.');
                input.focus();
                return;
            }

            finalizar(valor, 'submitted');
        };

        const onCancel = () => finalizar(null, 'cancelled');

        const onOverlayClick = (evento) => {
            if (evento.target === modal) {
                finalizar(null, 'cancelled');
            }
        };

        const onKeyDown = (evento) => {
            if (evento.key === 'Escape') {
                evento.preventDefault();
                finalizar(null, 'cancelled');
            }
        };

        mostrarError('');
        modal.classList.remove('hidden');
        requestAnimationFrame(() => input.focus());

        form.addEventListener('submit', onSubmit);
        cancelButton.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeyDown);
    });
}

async function solicitarAccesoTecnico() {
    if (typeof tieneAccesoTecnico === 'function' && tieneAccesoTecnico()) {
        return true;
    }

    if (!authToken) {
        mostrarMensaje('techAccessMessage', 'Debes iniciar sesión antes de solicitar acceso técnico.', 'error');
        return false;
    }

    if (solicitandoAccesoTecnico) {
        return false;
    }

    solicitandoAccesoTecnico = true;

    try {
        const resultadoDialogo = await mostrarDialogoContrasenaTecnica();

        if (!resultadoDialogo || resultadoDialogo.reason !== 'submitted' || !resultadoDialogo.password) {
            if (resultadoDialogo?.reason === 'cancelled') {
                mostrarMensaje('techAccessMessage', 'Solicitud de acceso técnico cancelada.', 'warning');
            } else if (resultadoDialogo?.reason === 'unavailable') {
                mostrarMensaje('techAccessMessage', 'No se pudo mostrar el formulario de acceso técnico.', 'error');
            }
            return false;
        }

        const contrasenaTecnica = resultadoDialogo.password.trim();

        const response = await fetch('/api/auth/tech-access', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ technicalPassword: contrasenaTecnica })
        });

        const data = await response.json();

        if (response.ok && data.success && data.data?.token) {
            actualizarTokenAdmin(data.data.token);
            mostrarMensaje('techAccessMessage', 'Acceso técnico habilitado correctamente.', 'success');
            if (typeof cargarConfiguracionSistema === 'function') {
                await cargarConfiguracionSistema();
            }
            return true;
        }

        mostrarMensaje('techAccessMessage', data.error || data.message || 'Contraseña técnica inválida', 'error');
        return false;
    } catch (error) {
        mostrarMensaje('techAccessMessage', 'Error verificando la contraseña técnica', 'error');
        return false;
    } finally {
        solicitandoAccesoTecnico = false;
    }
}

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
            actualizarTokenAdmin(data.data.token);
            mostrarSeccionAdministracion();
            const pestanaResultados = document.querySelector('.dashboard-tab[data-target="resultsSection"]');
            if (pestanaResultados) {
                await mostrarSeccionTablero('resultsSection', pestanaResultados);
            } else {
                await mostrarSeccionTablero('resultsSection');
            }
            await cargarPanelAdministrativo();
            actualizarInformacionSistema();
            const pestanaDetalle = document.querySelector('.tab[data-group="results"][data-tab="detailed"]');
            if (pestanaDetalle) {
                mostrarPestana('detailed', pestanaDetalle, 'results');
            }
            const pestanaAdminActiva = document.querySelector('.tab[data-group="admin"].active') || document.querySelector('.tab[data-group="admin"]');
            if (pestanaAdminActiva) {
                const grupo = pestanaAdminActiva.dataset.group || 'admin';
                mostrarPestana(pestanaAdminActiva.dataset.tab, pestanaAdminActiva, grupo);
            }
            if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
                const managementSection = document.getElementById('managementSection');
                const adminVisible = managementSection && !managementSection.classList.contains('hidden');
                if (adminVisible) {
                    mostrarMensaje('techAccessMessage', 'Para administrar restricciones y cargar información ingresa la contraseña técnica desde la pestaña Administración.', 'info');
                }
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

    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Debes habilitar el acceso técnico para cambiar la contraseña del administrador.', 'error');
        await solicitarAccesoTecnico();
        return;
    }

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
        } else if (response.status === 403) {
            mostrarMensaje('passwordMessage', data.error || 'Acceso técnico requerido', 'error');
            mostrarMensaje('techAccessMessage', 'Ingresa la contraseña técnica para continuar con esta acción.', 'error');
            await solicitarAccesoTecnico();
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

async function manejarCambioAccesoTecnico(evento) {
    evento.preventDefault();

    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('technicalAccessMessage', 'Debes habilitar el acceso técnico para modificar esta configuración.', 'error');
        await solicitarAccesoTecnico();
        return;
    }

    const contrasenaActual = document.getElementById('currentTechPassword').value.trim();
    const nuevaContrasena = document.getElementById('newTechPassword').value.trim();
    const confirmacionContrasena = document.getElementById('confirmTechPassword').value.trim();

    if (!contrasenaActual) {
        mostrarMensaje('technicalAccessMessage', 'Debes ingresar la contraseña técnica actual', 'error');
        return;
    }

    if (!nuevaContrasena) {
        mostrarMensaje('technicalAccessMessage', 'Debes ingresar una nueva contraseña técnica', 'error');
        return;
    }

    if (contrasenaActual === nuevaContrasena) {
        mostrarMensaje('technicalAccessMessage', 'La nueva contraseña técnica debe ser diferente a la actual', 'error');
        return;
    }

    if (nuevaContrasena !== confirmacionContrasena) {
        mostrarMensaje('technicalAccessMessage', 'Las contraseñas técnicas no coinciden', 'error');
        return;
    }

    if (nuevaContrasena.length < 6) {
        mostrarMensaje('technicalAccessMessage', 'La contraseña técnica debe tener al menos 6 caracteres', 'error');
        return;
    }

    const botonActualizacion = document.getElementById('updateTechnicalAccessBtn');
    if (botonActualizacion) {
        botonActualizacion.disabled = true;
        botonActualizacion.textContent = 'Actualizando...';
    }

    try {
        const response = await fetch('/api/admin/technical-access/password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ currentPassword: contrasenaActual, newPassword: nuevaContrasena })
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensaje('technicalAccessMessage', data.message || 'Contraseña técnica actualizada correctamente', 'success');
            document.getElementById('technicalAccessForm').reset();
        } else if (response.status === 403) {
            mostrarMensaje('technicalAccessMessage', data.error || 'Acceso técnico requerido', 'error');
            mostrarMensaje('techAccessMessage', 'Ingresa la contraseña técnica para continuar con esta acción.', 'error');
            await solicitarAccesoTecnico();
        } else {
            mostrarMensaje('technicalAccessMessage', data.error || data.message || 'No se pudo actualizar la contraseña técnica', 'error');
        }
    } catch (error) {
        mostrarMensaje('technicalAccessMessage', 'Error de conexión al actualizar la contraseña técnica', 'error');
    } finally {
        if (botonActualizacion) {
            botonActualizacion.disabled = false;
            botonActualizacion.textContent = 'Actualizar Acceso Técnico';
        }
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

    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Debes habilitar el acceso técnico para modificar las restricciones del sistema.', 'error');
        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar Configuración';
        await solicitarAccesoTecnico();
        return;
    }

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
        } else if (response.status === 403) {
            mostrarMensaje('restrictionsMessage', data.error || 'Acceso técnico requerido', 'error');
            mostrarMensaje('techAccessMessage', 'La contraseña técnica es necesaria para guardar la configuración.', 'error');
            await solicitarAccesoTecnico();
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
    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Debes habilitar el acceso técnico para crear nuevas claves administrativas.', 'error');
        await solicitarAccesoTecnico();
        return;
    }

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
        } else if (response.status === 403) {
            mostrarMensaje('techAccessMessage', data.error || 'Acceso técnico requerido para crear claves.', 'error');
            await solicitarAccesoTecnico();
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

    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Debes habilitar el acceso técnico para modificar las claves administrativas.', 'error');
        await solicitarAccesoTecnico();
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
        } else if (response.status === 403) {
            mostrarMensaje('techAccessMessage', data.error || 'Acceso técnico requerido para modificar claves.', 'error');
            await solicitarAccesoTecnico();
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
    const vistaPrevia = document.getElementById('csvPreview');
    const botonSubir = document.getElementById('uploadBtn');

    if (vistaPrevia) {
        vistaPrevia.innerHTML = '';
    }

    if (botonSubir) {
        botonSubir.disabled = true;
        botonSubir.textContent = 'Subir Lista de Personal';
    }

    matriculasDuplicadas = [];

    if (!archivo) {
        estudiantesActuales = [];
        return;
    }

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

    const totalRegistrosLeidos = datos.length;

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

    const registrosInvalidos = totalRegistrosLeidos - estudiantesActuales.length;

    const conteoMatriculas = new Map();
    estudiantesActuales.forEach(estudiante => {
        const matriculaNormalizada = (estudiante.matricula || '').toString().trim().toLowerCase();
        if (!matriculaNormalizada) {
            return;
        }

        if (!conteoMatriculas.has(matriculaNormalizada)) {
            conteoMatriculas.set(matriculaNormalizada, []);
        }

        conteoMatriculas.get(matriculaNormalizada).push(estudiante);
    });

    matriculasDuplicadas = Array.from(conteoMatriculas.entries())
        .filter(([, registros]) => registros.length > 1)
        .map(([, registros]) => ({
            matricula: registros[0]?.matricula || '',
            registros
        }));

    if (!vistaPrevia) {
        return;
    }

    let html = '<div style="margin: 20px 0;">';
    html += '<h3>Vista Previa (' + estudiantesActuales.length + ' registros válidos)</h3>';
    html += '<p style="color: #555; margin: 8px 0 4px;">Registros leídos: <strong>' + totalRegistrosLeidos + '</strong></p>';
    if (registrosInvalidos > 0) {
        html += '<p style="color: #a35f00; margin: 4px 0;">Registros descartados por información incompleta: <strong>' + registrosInvalidos + '</strong></p>';
    }

    html += '<div class="table-container" style="max-height: 300px;">';
    html += '<table><thead><tr><th>Matrícula</th><th>Nombre</th><th>Grupo</th></tr></thead><tbody>';

    estudiantesActuales.slice(0, 10).forEach(estudiante => {
        html += '<tr>';
        html += '<td>' + decodificarCaracteresEspeciales(estudiante.matricula) + '</td>';
        html += '<td>' + decodificarCaracteresEspeciales(estudiante.nombre) + '</td>';
        html += '<td>' + decodificarCaracteresEspeciales(estudiante.grupo || '-').toUpperCase() + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    if (estudiantesActuales.length > 10) {
        html += '<p style="color: #666; font-size: 14px;">Mostrando los primeros 10 de ' + estudiantesActuales.length + ' registros</p>';
    }

    if (matriculasDuplicadas.length > 0) {
        html += '<div style="margin-top: 20px; padding: 15px; border-radius: 8px; background: #fff4e5; border-left: 4px solid #f39c12;">';
        html += '<h4 style="margin-bottom: 10px; color: #d35400;">⚠️ Matrículas duplicadas detectadas (' + matriculasDuplicadas.length + ')</h4>';
        html += '<p style="margin-bottom: 10px; color: #a35f00;">Corrige las matrículas repetidas en el archivo antes de subir la lista de personal.</p>';
        html += '<div class="table-container" style="max-height: 240px;">';
        html += '<table><thead><tr><th>Matrícula</th><th>Nombre</th><th>Grupo</th><th># repetición</th></tr></thead><tbody>';

        const maxFilasDuplicadas = 50;
        let filasMostradas = 0;
        matriculasDuplicadas.forEach(entrada => {
            entrada.registros.forEach((registro, indice) => {
                if (filasMostradas >= maxFilasDuplicadas) {
                    return;
                }

                html += '<tr>';
                html += '<td>' + decodificarCaracteresEspeciales(registro.matricula || '') + '</td>';
                html += '<td>' + decodificarCaracteresEspeciales(registro.nombre || '') + '</td>';
                html += '<td>' + decodificarCaracteresEspeciales((registro.grupo || '-').toString().toUpperCase()) + '</td>';
                html += '<td style="text-align: center;">' + (indice + 1) + '</td>';
                html += '</tr>';
                filasMostradas += 1;
            });
        });

        html += '</tbody></table></div>';
        if (matriculasDuplicadas.some(entrada => entrada.registros.length > 2) || filasMostradas >= maxFilasDuplicadas) {
            html += '<p style="color: #a35f00; font-size: 13px; margin-top: 10px;">Se muestran hasta ' + maxFilasDuplicadas + ' coincidencias duplicadas.</p>';
        }
        html += '</div>';
    }

    html += '</div>';

    vistaPrevia.innerHTML = html;

    if (matriculasDuplicadas.length > 0) {
        if (botonSubir) {
            botonSubir.disabled = true;
        }
        mostrarMensaje('uploadMessage', 'Se detectaron ' + matriculasDuplicadas.length + ' matrículas duplicadas. Corrige el archivo antes de continuar.', 'error');
    } else if (estudiantesActuales.length > 0) {
        if (botonSubir) {
            botonSubir.disabled = false;
        }

        const tipoMensaje = registrosInvalidos > 0 ? 'warning' : 'success';
        let mensaje = 'Se leyeron ' + totalRegistrosLeidos + ' registros.';
        mensaje += ' ' + estudiantesActuales.length + ' registros válidos listos para subir.';
        if (registrosInvalidos > 0) {
            mensaje += ' ' + registrosInvalidos + ' registros fueron descartados por información incompleta.';
        }
        mostrarMensaje('uploadMessage', mensaje, tipoMensaje);
    } else {
        mostrarMensaje('uploadMessage', 'No se encontraron registros válidos en el archivo seleccionado.', 'error');
    }
}

async function subirEstudiantes() {
    if (estudiantesActuales.length === 0) {
        mostrarMensaje('uploadMessage', 'No hay estudiantes para subir', 'error');
        return;
    }

    if (Array.isArray(matriculasDuplicadas) && matriculasDuplicadas.length > 0) {
        mostrarMensaje('uploadMessage', 'No se puede subir la lista mientras existan matrículas duplicadas. Corrige el archivo e intenta nuevamente.', 'error');
        return;
    }

    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Debes habilitar el acceso técnico para cargar una nueva lista de personal.', 'error');
        await solicitarAccesoTecnico();
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
            
            // LIMPIAR TODO después de subir exitosamente
            document.getElementById('csvFile').value = '';
            document.getElementById('csvPreview').innerHTML = '';
            estudiantesActuales = [];
            matriculasDuplicadas = [];
            botonSubir.disabled = true; // ✅ Desactivar el botón después de subir

            await cargarEstadisticas();

            if (configuracionSistema.device_restriction_enabled === 'true') {
                setTimeout(() => {
                    mostrarMensaje('uploadMessage', '⚠️ Los dispositivos registrados han sido reiniciados debido a la nueva lista de personal', 'warning');
                }, 3000);
            }
        } else if (response.status === 403) {
            mostrarMensaje('uploadMessage', data.error || 'Acceso técnico requerido para subir la lista de personal', 'error');
            mostrarMensaje('techAccessMessage', 'Ingresa la contraseña técnica antes de actualizar la base de datos.', 'error');
            await solicitarAccesoTecnico();
        } else {
            mostrarMensaje('uploadMessage', data.error, 'error');
        }
    } catch (error) {
        mostrarMensaje('uploadMessage', 'Error de conexión', 'error');
    } finally {
        // Solo reactivar si hay archivos válidos sin duplicados
        if (Array.isArray(matriculasDuplicadas) && matriculasDuplicadas.length > 0) {
            botonSubir.disabled = true;
        } else if (estudiantesActuales.length > 0) {
            botonSubir.disabled = false;
        } else {
            botonSubir.disabled = true;
        }
        botonSubir.textContent = 'Subir Lista de Personal';
    }
}

async function limpiarBaseEstudiantes() {
    if (!authToken) {
        mostrarMensaje('uploadMessage', 'Debes iniciar sesión para realizar esta acción', 'error');
        return;
    }

    if (typeof tieneAccesoTecnico === 'function' && !tieneAccesoTecnico()) {
        mostrarMensaje('techAccessMessage', 'Debes habilitar el acceso técnico para limpiar la base de datos de personal.', 'error');
        await solicitarAccesoTecnico();
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
            
            // LIMPIAR TODO después de limpiar la base de datos
            document.getElementById('csvFile').value = '';
            document.getElementById('csvPreview').innerHTML = '';
            estudiantesActuales = [];
            matriculasDuplicadas = [];
            const botonSubir = document.getElementById('uploadBtn');
            if (botonSubir) {
                botonSubir.disabled = true; // ✅ Desactivar el botón
            }

            await Promise.all([
                cargarEstadisticas(),
                cargarListaDetallada(),
                cargarDispositivos()
            ]);
        } else if (response.status === 403) {
            mostrarMensaje('uploadMessage', data.error || 'Acceso técnico requerido para limpiar la base de datos', 'error');
            mostrarMensaje('techAccessMessage', 'Ingresa la contraseña técnica para realizar acciones críticas.', 'error');
            await solicitarAccesoTecnico();
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
window.manejarCambioAccesoTecnico = manejarCambioAccesoTecnico;
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
window.solicitarAccesoTecnico = solicitarAccesoTecnico;