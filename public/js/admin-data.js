// ================================
// FUNCIONES DE DATOS Y RENDERIZADO
// ================================
async function loadDashboard() {
    await loadSystemConfig();
    await loadStats();
    await loadDetailedList();
    ensureStatsPolling();
}

async function loadSystemConfig() {
    if (!authToken) return;

    try {
        const response = await fetch('/api/admin/config', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            systemConfig = await response.json();
            populateRestrictionsForm();
        } else if (response.status === 401 || response.status === 403) {
            logout();
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
}

async function loadStats() {
    if (!authToken) return;

    const overviewLoading = document.getElementById('overviewLoading');
    if (overviewLoading) {
        overviewLoading.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar estadísticas');
        }

        const payload = await response.json();
        const stats = payload?.data ?? payload ?? {};
        const totalStudents = stats.totalStudents ?? 0;
        const presentRegistered = stats.presentRegistered ?? 0;
        const totalPresent = stats.totalPresent ?? presentRegistered;
        const notInList = stats.notInList ?? 0;

        document.getElementById('totalStudents').textContent = totalStudents;
        document.getElementById('presentRegistered').textContent = presentRegistered;
        const attendanceRate = totalStudents > 0
            ? ((presentRegistered / totalStudents) * 100).toFixed(1)
            : '0.0';
        document.getElementById('attendanceRate').textContent = `${attendanceRate}%`;
        document.getElementById('absent').textContent = stats.absent ?? '-';

        const overviewContent = document.getElementById('overviewContent');
        if (overviewContent) {
            overviewContent.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px;">
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #2ecc71; margin-bottom: 10px;">✅ Asistencia Total</h3>
                        <p style="font-size: 24px; font-weight: bold;">${totalPresent}</p>
                        <p style="color: #666; font-size: 14px;">${((totalPresent / Math.max(totalStudents || 1, 1)) * 100).toFixed(1)}% del total</p>
                    </div>
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #f39c12; margin-bottom: 10px;">📍 Registros Fuera de Lista</h3>
                        <p style="font-size: 24px; font-weight: bold;">${notInList}</p>
                        <p style="color: #666; font-size: 14px;">Registros de personal no listado</p>
                    </div>
                    <div style="padding: 20px; background: #f8f9fa; border-radius: 10px;">
                        <h3 style="color: #3498db; margin-bottom: 10px;">🛡️ Restricciones Activas</h3>
                        <p style="font-size: 16px;">
                            ${systemConfig.location_restriction_enabled === 'true' ? '📍 Ubicación ' : ''}
                            ${systemConfig.device_restriction_enabled === 'true' ? '📱 Dispositivo ' : ''}
                            ${systemConfig.admin_key_bypass_enabled === 'true' ? '🔑 Claves de supervisor ' : ''}
                            ${systemConfig.location_restriction_enabled !== 'true' && systemConfig.device_restriction_enabled !== 'true' && systemConfig.admin_key_bypass_enabled !== 'true' ? 'Ninguna' : ''}
                        </p>
                        <p style="color: #666; font-size: 12px;">Estado actual</p>
                    </div>
                    <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 10px;">
                        <p style="margin: 0;"><strong>Fecha:</strong> ${new Date(stats.date).toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })}</p>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            logout();
        }
    } finally {
        if (overviewLoading) {
            overviewLoading.style.display = 'none';
        }
    }
}

async function loadDetailedList() {
    if (!authToken) return;

    const detailedLoading = document.getElementById('detailedLoading');
    if (detailedLoading) {
        detailedLoading.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/detailed-list', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar lista detallada');
        }

        const payload = await response.json();
        const detailedData = payload?.data ?? payload ?? {};
        displayDetailedList(detailedData);
    } catch (error) {
        console.error('Error loading detailed list:', error);
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            logout();
        }
    } finally {
        if (detailedLoading) {
            detailedLoading.style.display = 'none';
        }
    }
}

function displayDetailedList(data) {
    const content = document.getElementById('detailedContent');
    if (!content) return;

    let html = '<div style="margin-bottom: 20px;">';
    html += `<h3>Fecha: ${new Date(data.date).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</h3>`;
    html += '</div>';

    if (Array.isArray(data.presentRegistered) && data.presentRegistered.length > 0) {
        html += '<h3 style="color: #2ecc71; margin: 20px 0 10px 0;">✅ Presentes (En Lista)</h3>';
        html += createDetailedTable(data.presentRegistered);
    }

    if (Array.isArray(data.absent) && data.absent.length > 0) {
        html += '<h3 style="color: #e74c3c; margin: 20px 0 10px 0;">❌ Faltistas</h3>';
        html += createDetailedTable(data.absent);
    }

    if ((!Array.isArray(data.presentRegistered) || data.presentRegistered.length === 0) &&
        (!Array.isArray(data.absent) || data.absent.length === 0)) {
        html += '<p>No hay registros disponibles para la fecha seleccionada.</p>';
    }

    content.innerHTML = html;
}

function createDetailedTable(students) {
    if (!students || students.length === 0) {
        return '<p>No hay registros</p>';
    }

    let html = '<div class="table-container"><table><thead><tr>';
    html += '<th>Matrícula</th><th>Nombre</th><th>Grupo</th><th>Estado</th><th>Hora</th><th>Ubicación</th><th>Dispositivo</th>';
    html += '</tr></thead><tbody>';

    students.forEach(student => {
        const statusClass = student.status?.includes('Presente') ? 'status-present' : 'status-absent';
        const timeString = student.timestamp
            ? new Date(student.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
            : '-';

        html += `
            <tr>
                <td>${student.matricula || '-'}</td>
                <td>${decodeSpecialChars(student.nombre || '-')}</td>
                <td>${decodeSpecialChars((student.grupo || '-')).toUpperCase()}</td>
                <td><span class="status-badge ${statusClass}">${student.status || '-'}</span></td>
                <td>${timeString}</td>
                <td style="font-size: 12px;">${student.location || 'N/A'}</td>
                <td style="font-size: 12px; font-family: monospace;">${student.device || 'N/A'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    return html;
}

async function loadDevices() {
    if (!authToken) return;

    const loading = document.getElementById('devicesLoading');
    if (loading) {
        loading.style.display = 'block';
    }

    try {
        const response = await fetch('/api/admin/devices', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            throw new Error('Error al cargar dispositivos');
        }

        const devices = await response.json();
        displayDevices(devices);
    } catch (error) {
        console.error('Error loading devices:', error);
        document.getElementById('devicesContent').innerHTML = '<p style="color: #e74c3c;">Error cargando dispositivos</p>';
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            logout();
        }
    } finally {
        if (loading) {
            loading.style.display = 'none';
        }
    }
}

function displayDevices(devices) {
    const content = document.getElementById('devicesContent');
    if (!content) return;

    if (!devices || devices.length === 0) {
        content.innerHTML = '<p>No hay dispositivos registrados</p>';
        return;
    }

    let html = '<div class="table-container"><table><thead><tr>';
    html += '<th>Huella Digital</th><th>Matrícula</th><th>Primer Registro</th><th>Último Uso</th><th>Navegador</th>';
    html += '</tr></thead><tbody>';

    devices.forEach(device => {
        const firstRegistration = device.first_registration ? new Date(device.first_registration).toLocaleString('es-MX') : '-';
        const lastUsed = device.last_used ? new Date(device.last_used).toLocaleString('es-MX') : '-';

        html += `
            <tr>
                <td style="font-family: monospace; font-size: 12px;">${device.device_fingerprint}</td>
                <td><strong>${device.matricula}</strong></td>
                <td>${firstRegistration}</td>
                <td>${lastUsed}</td>
                <td style="font-size: 12px;">${device.user_agent || 'Desconocido'}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

async function loadAdminKeys() {
    if (!authToken) return;

    const container = document.getElementById('adminKeysList');
    if (container) {
        container.innerHTML = `
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

        const adminKeys = await response.json();
        displayAdminKeys(adminKeys);
    } catch (error) {
        console.error('Error loading admin keys:', error);
        if (container) {
            container.innerHTML = '<p style="color: #e74c3c;">Error cargando claves administrativas</p>';
        }
        if (String(error.message).includes('401') || String(error.message).includes('403')) {
            logout();
        }
    }
}

function displayAdminKeys(adminKeys) {
    const content = document.getElementById('adminKeysList');
    if (!content) return;

    if (!adminKeys || adminKeys.length === 0) {
        content.innerHTML = '<p>No hay claves administrativas configuradas</p>';
        return;
    }

    let html = '';
    adminKeys.forEach(key => {
        const isActive = key.is_active === 'true';
        const createdDate = key.created_at ? new Date(key.created_at).toLocaleDateString('es-MX') : '-';

        html += `
            <div class="admin-key-item ${isActive ? '' : 'inactive'}">
                <div class="admin-key-info">
                    <div style="font-weight: bold; font-family: monospace;">${key.key}</div>
                    <div style="color: #666; font-size: 14px;">${decodeSpecialChars(key.description || '')}</div>
                    <div style="color: #999; font-size: 12px;">Creada: ${createdDate} | Estado: ${isActive ? '✅ Activa' : '❌ Inactiva'}</div>
                </div>
                <div class="admin-key-actions">
                    ${isActive
                        ? `<button class="btn btn-danger btn-small" onclick="deactivateAdminKey('${key.key}')">Desactivar</button>`
                        : '<span style="color: #999;">Inactiva</span>'}
                </div>
            </div>
        `;
    });

    content.innerHTML = html;
}

// Exponer funciones necesarias globalmente
window.loadDashboard = loadDashboard;
window.loadSystemConfig = loadSystemConfig;
window.loadStats = loadStats;
window.loadDetailedList = loadDetailedList;
window.loadDevices = loadDevices;
window.loadAdminKeys = loadAdminKeys;
window.displayAdminKeys = displayAdminKeys;
