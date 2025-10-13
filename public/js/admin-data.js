// ================================
// FUNCIONES DE DATOS Y RENDERIZADO
// ================================
async function cargarPanelAdministrativo() {
    await cargarConfiguracionSistema();
    await cargarEstadisticas();
    await cargarListaDetallada();
    asegurarActualizacionEstadisticas();
}

async function cargarConfiguracionSistema() {
    if (!authToken) return;

    try {
        const response = await fetch('/api/admin/config', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            configuracionSistema = await response.json();
            llenarFormularioRestricciones();
        } else if (response.status === 401 || response.status === 403) {
            cerrarSesion();
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

async function cargarEstadisticas() {
    if (!authToken) return;

    const indicadorCargaResumen = document.getElementById('cargaResumen');
    if (indicadorCargaResumen) {
        indicadorCargaResumen.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar estadísticas');
        }

        const payload = await response.json();
        const estadisticas = payload?.data ?? payload ?? {};
        const totalEstudiantes = estadisticas.totalEstudiantes ?? estadisticas.totalStudents ?? 0;
        const presentesRegistrados = estadisticas.presentesRegistrados ?? estadisticas.presentRegistered ?? 0;
        const totalPresentes = estadisticas.totalPresentes ?? estadisticas.totalPresent ?? presentesRegistrados;
        const registrosFueraDeLista = estadisticas.fueraDeLista ?? estadisticas.notInList ?? 0;

        document.getElementById('totalEstudiantes').textContent = totalEstudiantes;
        document.getElementById('presentesRegistrados').textContent = presentesRegistrados;
        const porcentajeAsistencia = totalEstudiantes > 0
            ? ((presentesRegistrados / totalEstudiantes) * 100).toFixed(1)
            : '0.0';
        document.getElementById('porcentajeAsistencia').textContent = `${porcentajeAsistencia}%`;
        document.getElementById('faltistas').textContent = estadisticas.faltistas ?? estadisticas.absent ?? '-';

        const contenedorResumen = document.getElementById('contenidoResumen');
        if (contenedorResumen) {
            contenedorResumen.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #2ecc71; margin-bottom: 10px;">✅ Asistencia Total</h3>
                        <p style="font-size: 24px; font-weight: bold;">${totalPresentes}</p>
                        <p style="color: #666; font-size: 14px;">${((totalPresentes / Math.max(totalEstudiantes || 1, 1)) * 100).toFixed(1)}% del total</p>
                    </div>
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #f39c12; margin-bottom: 10px;">📍 Registros Fuera de Lista</h3>
                        <p style="font-size: 24px; font-weight: bold;">${registrosFueraDeLista}</p>
                        <p style="color: #666; font-size: 14px;">Registros de personal no listado</p>
                    </div>
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #3498db; margin-bottom: 10px;">🛡️ Restricciones Activas</h3>
                        <p style="font-size: 16px;">
                            ${configuracionSistema.location_restriction_enabled === 'true' ? '📍 Ubicación ' : ''}
                            ${configuracionSistema.device_restriction_enabled === 'true' ? '📱 Dispositivo ' : ''}
                            ${configuracionSistema.admin_key_bypass_enabled === 'true' ? '🔑 Claves de supervisor ' : ''}
                            ${configuracionSistema.location_restriction_enabled !== 'true' && configuracionSistema.device_restriction_enabled !== 'true' && configuracionSistema.admin_key_bypass_enabled !== 'true' ? 'Ninguna' : ''}
                        </p>
                        <p style="color: #666; font-size: 12px;">Estado actual</p>
                    </div>
                    <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 10px;">
                        <p style="margin: 0;"><strong>Fecha:</strong> ${new Date(estadisticas.fecha ?? estadisticas.date).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}</p>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    } finally {
        if (indicadorCargaResumen) {
            indicadorCargaResumen.style.display = 'none';
        }
    }
}

async function cargarListaDetallada() {
    if (!authToken) return;

    const indicadorCargaDetalle = document.getElementById('cargaDetalle');
    if (indicadorCargaDetalle) {
        indicadorCargaDetalle.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/detailed-list', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar lista detallada');
        }

        const payload = await response.json();
        const informacionDetallada = payload?.data ?? payload ?? {};
        mostrarListaDetallada(informacionDetallada);
    } catch (error) {
        console.error('Error al cargar la lista detallada:', error);
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    } finally {
        if (indicadorCargaDetalle) {
            indicadorCargaDetalle.style.display = 'none';
        }
    }
}

function mostrarListaDetallada(datos) {
    const contenedor = document.getElementById('contenidoDetalle');
    if (!contenedor) return;

    let html = '<div style="margin-bottom: 20px;">';
    html += `<h3>Fecha: ${new Date(datos.fecha ?? datos.date).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</h3>`;
    html += '</div>';

    const registrosPresentes = datos.presentesRegistrados ?? datos.presentRegistered;
    if (Array.isArray(registrosPresentes) && registrosPresentes.length > 0) {
        html += '<h3 style="color: #2ecc71; margin: 20px 0 10px 0;">✅ Presentes (En Lista)</h3>';
        html += crearTablaDetallada(registrosPresentes);
    }

    const registrosFaltantes = datos.faltistas ?? datos.absent;
    if (Array.isArray(registrosFaltantes) && registrosFaltantes.length > 0) {
        html += '<h3 style="color: #e74c3c; margin: 20px 0 10px 0;">❌ Faltistas</h3>';
        html += crearTablaDetallada(registrosFaltantes);
    }

    if ((!Array.isArray(registrosPresentes) || registrosPresentes.length === 0) &&
        (!Array.isArray(registrosFaltantes) || registrosFaltantes.length === 0)) {
        html += '<p>No hay registros disponibles para la fecha seleccionada.</p>';
    }

    contenedor.innerHTML = html;
}

function crearTablaDetallada(registros) {
    if (!registros || registros.length === 0) {
        return '<p>No hay registros</p>';
    }

    let html = '<div class="table-container"><table><thead><tr>';
    html += '<th>Matrícula</th><th>Nombre</th><th>Grupo</th><th>Estado</th><th>Hora</th><th>Ubicación</th><th>Dispositivo</th>';
    html += '</tr></thead><tbody>';

    registros.forEach(registro => {
        const claseEstado = registro.status?.includes('Presente') ? 'status-present' : 'status-absent';
        const horaFormateada = registro.timestamp
            ? new Date(registro.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : '-';

        html += `
            <tr>
                <td>${registro.matricula || '-'}</td>
                <td>${decodificarCaracteresEspeciales(registro.nombre || '-')}</td>
                <td>${decodificarCaracteresEspeciales((registro.grupo || '-')).toUpperCase()}</td>
                <td><span class="status-badge ${claseEstado}">${registro.status || '-'}</span></td>
                <td>${horaFormateada}</td>
                <td style="font-size: 12px;">${registro.location || 'N/D'}</td>
                <td style="font-size: 12px; font-family: monospace;">${registro.device || 'N/D'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    return html;
}

async function cargarDispositivos() {
    if (!authToken) return;

    const indicadorDispositivos = document.getElementById('cargaDispositivos');
    if (indicadorDispositivos) {
        indicadorDispositivos.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/devices', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar dispositivos');
        }

        const dispositivos = await response.json();
        mostrarDispositivos(dispositivos);
    } catch (error) {
        console.error('Error al cargar dispositivos:', error);
        const contenedor = document.getElementById('devicesContent');
        if (contenedor) {
            contenedor.innerHTML = '<p style="color: #e74c3c;">Error cargando dispositivos</p>';
        }
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    } finally {
        if (indicadorDispositivos) {
            indicadorDispositivos.style.display = 'none';
        }
    }
}

function mostrarDispositivos(dispositivos) {
    const contenedor = document.getElementById('devicesContent');
    if (!contenedor) return;

    if (!dispositivos || dispositivos.length === 0) {
        contenedor.innerHTML = '<p>No hay dispositivos registrados</p>';
        return;
    }

    let html = '<div class="table-container"><table><thead><tr>';
    html += '<th>Huella Digital</th><th>Matrícula</th><th>Primer Registro</th><th>Último Uso</th><th>Navegador</th>';
    html += '</tr></thead><tbody>';

    dispositivos.forEach(dispositivo => {
        const primerRegistro = dispositivo.first_registration ? new Date(dispositivo.first_registration).toLocaleString('es-MX') : '-';
        const ultimoUso = dispositivo.last_used ? new Date(dispositivo.last_used).toLocaleString('es-MX') : '-';

        html += `
            <tr>
                <td style="font-family: monospace; font-size: 12px;">${dispositivo.device_fingerprint}</td>
                <td><strong>${dispositivo.matricula}</strong></td>
                <td>${primerRegistro}</td>
                <td>${ultimoUso}</td>
                <td style="font-size: 12px;">${dispositivo.user_agent || 'Desconocido'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    contenedor.innerHTML = html;
}

async function cargarClavesAdministrativas() {
    if (!authToken) return;

    const contenedor = document.getElementById('adminKeysList');
    if (contenedor) {
        contenedor.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Cargando claves administrativas...</p>
            </div>
        `;
    }

    try {
        const response = await fetch('/api/admin/admin-keys', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar claves administrativas');
        }

        const claves = await response.json();
        mostrarClavesAdministrativas(claves);
    } catch (error) {
        console.error('Error al cargar claves administrativas:', error);
        if (contenedor) {
            contenedor.innerHTML = '<p style="color: #e74c3c;">Error cargando claves administrativas</p>';
        }
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            cerrarSesion();
        }
    }
}

function mostrarClavesAdministrativas(claves) {
    const contenedor = document.getElementById('adminKeysList');
    if (!contenedor) return;

    if (!claves || claves.length === 0) {
        contenedor.innerHTML = '<p>No hay claves administrativas configuradas</p>';
        return;
    }

    let html = '';
    claves.forEach(clave => {
        const activa = clave.is_active === 'true';
        const fechaCreacion = clave.created_at ? new Date(clave.created_at).toLocaleDateString('es-MX') : '-';

        html += `
            <div class="admin-key-item ${activa ? '' : 'inactive'}">
                <div class="admin-key-info">
                    <div style="font-weight: bold; font-family: monospace;">${clave.key}</div>
                    <div style="color: #666; font-size: 14px;">${decodificarCaracteresEspeciales(clave.description || '')}</div>
                    <div style="color: #999; font-size: 12px;">Creada: ${fechaCreacion} | Estado: ${activa ? '✅ Activa' : '❌ Inactiva'}</div>
                </div>
                <div class="admin-key-actions">
                    ${activa
                        ? `<button class="btn btn-danger btn-small" onclick="desactivarClaveAdministrativa('${clave.key}')">Desactivar</button>`
                        : '<span style="color: #999;">Inactiva</span>'}
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

// Exponer funciones necesarias globalmente
window.cargarPanelAdministrativo = cargarPanelAdministrativo;
window.cargarConfiguracionSistema = cargarConfiguracionSistema;
window.cargarEstadisticas = cargarEstadisticas;
window.cargarListaDetallada = cargarListaDetallada;
window.cargarDispositivos = cargarDispositivos;
window.cargarClavesAdministrativas = cargarClavesAdministrativas;
window.mostrarClavesAdministrativas = mostrarClavesAdministrativas;
window.loadDashboard = cargarPanelAdministrativo;
window.loadSystemConfig = cargarConfiguracionSistema;
window.loadStats = cargarEstadisticas;
window.loadDetailedList = cargarListaDetallada;
window.loadDevices = cargarDispositivos;
window.loadAdminKeys = cargarClavesAdministrativas;
window.displayAdminKeys = mostrarClavesAdministrativas;
