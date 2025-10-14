// ================================
// VARIABLES GLOBALES
// ================================
let authToken = null;
let estudiantesActuales = [];
let matriculasDuplicadas = [];
let configuracionSistema = {};
let idIntervaloEstadisticas = null;
let techAccessGranted = false;

// ================================
// GESTIÓN DE TOKEN Y ACCESO TÉCNICO
// ================================
function decodificarToken(token) {
    if (!token || typeof token !== 'string') {
        return null;
    }

    const partes = token.split('.');
    if (partes.length < 2) {
        return null;
    }

    try {
        const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
        const payload = atob(padded);
        return JSON.parse(payload);
    } catch (error) {
        return null;
    }
}

function actualizarEstadoAccesoTecnicoDesdePayload(payload) {
    const scopes = Array.isArray(payload?.scopes) ? payload.scopes : [];
    techAccessGranted = payload?.technicalAccess === true || scopes.includes('technical');
    return techAccessGranted;
}

function actualizarTokenAdmin(nuevoToken) {
    if (nuevoToken) {
        authToken = nuevoToken;
        localStorage.setItem('adminToken', nuevoToken);
        const payload = decodificarToken(nuevoToken);
        actualizarEstadoAccesoTecnicoDesdePayload(payload || {});
        return payload;
    }

    authToken = null;
    techAccessGranted = false;
    localStorage.removeItem('adminToken');
    return null;
}

function tieneAccesoTecnico() {
    return techAccessGranted === true;
}

const tokenInicial = localStorage.getItem('adminToken');
if (tokenInicial) {
    actualizarTokenAdmin(tokenInicial);
}

// ================================
// UTILIDADES GENERALES
// ================================
function mostrarSeccionAdministracion() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('adminSection').classList.remove('hidden');
}

function cerrarSesion() {
    actualizarTokenAdmin(null);
    if (idIntervaloEstadisticas) {
        clearInterval(idIntervaloEstadisticas);
        idIntervaloEstadisticas = null;
    }
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('adminSection').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';

    const techMessage = document.getElementById('techAccessMessage');
    if (techMessage) {
        techMessage.style.display = 'none';
        techMessage.textContent = '';
    }
}

async function mostrarSeccionTablero(sectionId, triggerElement = null) {
    const techMessage = document.getElementById('techAccessMessage');
    const managementSection = document.getElementById('managementSection');

    if (sectionId !== 'managementSection' && techMessage) {
        techMessage.style.display = 'none';
        techMessage.textContent = '';
    }

    if (sectionId === 'managementSection' && !tieneAccesoTecnico()) {
        if (typeof solicitarAccesoTecnico === 'function') {
            const accesoOtorgado = await solicitarAccesoTecnico();
            if (!accesoOtorgado) {
                if (triggerElement) {
                    triggerElement.classList.remove('active');
                }
                const resultadosTab = document.querySelector('.dashboard-tab[data-target="resultsSection"]');
                if (resultadosTab) {
                    resultadosTab.classList.add('active');
                }
                const resultadosSeccion = document.getElementById('resultsSection');
                if (resultadosSeccion) {
                    resultadosSeccion.classList.remove('hidden');
                }
                return;
            }
        } else {
            mostrarMensaje('techAccessMessage', 'Se requiere contraseña técnica para acceder a este panel.', 'error');
            return;
        }
    }

    const sections = document.querySelectorAll('.dashboard-content');
    sections.forEach(section => section.classList.add('hidden'));

    const tabs = document.querySelectorAll('.dashboard-tab');
    tabs.forEach(tab => tab.classList.remove('active'));

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    if (triggerElement) {
        triggerElement.classList.add('active');
    } else {
        const fallbackTab = document.querySelector(`.dashboard-tab[data-target="${sectionId}"]`);
        fallbackTab?.classList.add('active');
    }

    if (sectionId === 'resultsSection') {
        cargarEstadisticas();
        cargarListaDetallada();
    } else if (sectionId === 'managementSection') {
        if (tieneAccesoTecnico()) {
            if (techMessage) {
                techMessage.style.display = 'none';
                techMessage.textContent = '';
            }
            cargarConfiguracionSistema();
            actualizarInformacionSistema();
            const pestanaAdminActiva = document.querySelector('.tab[data-group="admin"].active') || document.querySelector('.tab[data-group="admin"]');
            if (pestanaAdminActiva) {
                mostrarPestana(pestanaAdminActiva.dataset.tab, pestanaAdminActiva, 'admin');
            }
        }
    }
}

function mostrarPestana(tabName, tabElement, group = 'default') {
    if (group === 'admin' && !tieneAccesoTecnico()) {
        const managementSection = document.getElementById('managementSection');
        const adminVisible = managementSection && !managementSection.classList.contains('hidden');
        if (adminVisible) {
            mostrarMensaje('techAccessMessage', 'Debes ingresar la contraseña técnica para utilizar estas herramientas.', 'error');
        }
        return;
    }

    const groupSelector = `.tab-content[data-group="${group}"]`;
    const groupTabsSelector = `.tab[data-group="${group}"]`;

    const contents = document.querySelectorAll(groupSelector);
    if (contents.length > 0) {
        contents.forEach(content => content.classList.add('hidden'));
    } else {
        document.querySelectorAll('[id$="Tab"]').forEach(tab => tab.classList.add('hidden'));
    }

    const tabsInGroup = document.querySelectorAll(groupTabsSelector);
    if (tabsInGroup.length > 0) {
        tabsInGroup.forEach(tab => tab.classList.remove('active'));
    } else {
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    }

    const target = document.querySelector(`.tab-content[data-group="${group}"][data-tab="${tabName}"]`) || document.getElementById(`${tabName}Tab`);
    if (target) {
        target.classList.remove('hidden');
    }

    if (tabElement) {
        tabElement.classList.add('active');
    } else {
        const fallback = document.querySelector(`.tab[data-group="${group}"][data-tab="${tabName}"]`) || document.querySelector(`.tab[data-tab="${tabName}"]`);
        fallback?.classList.add('active');
    }

    switch (tabName) {
        case 'overview':
            cargarEstadisticas();
            break;
        case 'detailed':
            cargarListaDetallada();
            break;
        case 'restrictions':
            if (tieneAccesoTecnico()) {
                cargarConfiguracionSistema();
                cargarClavesAdministrativas();
            }
            break;
        case 'devices':
            if (tieneAccesoTecnico()) {
                cargarDispositivos();
            }
            break;
        case 'settings':
            if (tieneAccesoTecnico()) {
                actualizarInformacionSistema();
            }
            break;
        default:
            break;
    }
}

function actualizarInformacionSistema() {
    document.getElementById('currentUser').textContent = 'admin';
    document.getElementById('sessionTime').textContent = new Date().toLocaleString('es-MX');
    document.getElementById('lastUpdate').textContent = new Date().toLocaleString('es-MX');

    if (authToken) {
        fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        })
            .then(response => response.json())
            .then(payload => {
                const stats = payload?.data ?? payload ?? {};
                const totalEstudiantes = stats.totalEstudiantes ?? stats.totalStudents ?? '-';
                const totalPresentes = stats.totalPresentes ?? stats.totalPresent ?? '-';
                document.getElementById('systemTotalStudents').textContent = totalEstudiantes;
                document.getElementById('systemTodayRecords').textContent = totalPresentes;
            })
            .catch(() => {
                document.getElementById('systemTotalStudents').textContent = 'Error';
                document.getElementById('systemTodayRecords').textContent = 'Error';
            });
    }
}

function mostrarMensaje(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = decodeSpecialChars(message);
    element.className = `message ${type}`;
    element.style.display = 'block';

    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function tieneArtefactosCodificacion(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    return text.includes('\uFFFD') || /Ã.|Â./.test(text);
}

function decodificarTexto(bytes, encoding) {
    try {
        return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch (error) {
        return null;
    }
}

function decodificarCaracteresEspeciales(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    if (!/Ã.|Â./.test(text)) {
        return text;
    }

    const bytes = new Uint8Array(Array.from(text, char => char.charCodeAt(0)));
    const preferredEncodings = ['utf-8', 'windows-1252', 'iso-8859-1'];

    for (const encoding of preferredEncodings) {
        const decoded = decodificarTexto(bytes, encoding);
        if (decoded && !tieneArtefactosCodificacion(decoded)) {
            return decoded;
        }
    }

    return text;
}

async function leerArchivoComoTextoConCodificacion(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const encodingsToTry = ['utf-8', 'windows-1252', 'iso-8859-1'];

    for (let index = 0; index < encodingsToTry.length; index++) {
        const encoding = encodingsToTry[index];
        const decoded = decodificarTexto(bytes, encoding);

        if (!decoded) {
            continue;
        }

        if (!tieneArtefactosCodificacion(decoded) || index === encodingsToTry.length - 1) {
            return decoded;
        }
    }

    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function llenarFormularioRestricciones() {
    document.getElementById('locationRestrictionEnabled').checked = configuracionSistema.location_restriction_enabled === 'true';
    document.getElementById('deviceRestrictionEnabled').checked = configuracionSistema.device_restriction_enabled === 'true';
    document.getElementById('adminKeyBypassEnabled').checked = configuracionSistema.admin_key_bypass_enabled === 'true';

    document.getElementById('locationName').value = configuracionSistema.location_name || '';
    document.getElementById('locationLatitude').value = configuracionSistema.location_latitude || '';
    document.getElementById('locationLongitude').value = configuracionSistema.location_longitude || '';
    document.getElementById('locationRadius').value = configuracionSistema.location_radius_km || '1';

    manejarCambioRestriccionUbicacion();
}

function manejarCambioRestriccionUbicacion() {
    const locationSettings = document.getElementById('locationSettings');
    const checkbox = document.getElementById('locationRestrictionEnabled');

    if (!locationSettings || !checkbox) return;

    const inputs = locationSettings.querySelectorAll('input');
    const enabled = checkbox.checked;

    locationSettings.style.opacity = enabled ? '1' : '0.5';
    inputs.forEach(input => {
        input.disabled = !enabled;
    });
}

function obtenerUbicacionActual() {
    if (!navigator.geolocation) {
        alert('La geolocalización no está disponible en este navegador');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => {
            document.getElementById('locationLatitude').value = position.coords.latitude.toFixed(6);
            document.getElementById('locationLongitude').value = position.coords.longitude.toFixed(6);
            alert('Ubicación obtenida exitosamente');
        },
        error => {
            alert('Error obteniendo ubicación: ' + error.message);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}

function asegurarActualizacionEstadisticas() {
    if (idIntervaloEstadisticas) {
        clearInterval(idIntervaloEstadisticas);
    }

    idIntervaloEstadisticas = setInterval(() => {
        const adminSection = document.getElementById('adminSection');
        if (authToken && adminSection && !adminSection.classList.contains('hidden')) {
            cargarEstadisticas();
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection && !resultsSection.classList.contains('hidden')) {
                cargarListaDetallada();
            }
        }
    }, 30000);
}

// ================================
// EXPONER FUNCIONES GLOBALES
// ================================
window.cerrarSesion = cerrarSesion;
window.mostrarPestana = mostrarPestana;
window.mostrarSeccionAdministracion = mostrarSeccionAdministracion;
window.actualizarInformacionSistema = actualizarInformacionSistema;
window.mostrarMensaje = mostrarMensaje;
window.decodificarCaracteresEspeciales = decodificarCaracteresEspeciales;
window.leerArchivoComoTextoConCodificacion = leerArchivoComoTextoConCodificacion;
window.llenarFormularioRestricciones = llenarFormularioRestricciones;
window.manejarCambioRestriccionUbicacion = manejarCambioRestriccionUbicacion;
window.obtenerUbicacionActual = obtenerUbicacionActual;
window.asegurarActualizacionEstadisticas = asegurarActualizacionEstadisticas;
window.mostrarSeccionTablero = mostrarSeccionTablero;
window.logout = cerrarSesion;
window.showTab = mostrarPestana;
window.showAdminSection = mostrarSeccionAdministracion;
window.updateSystemInfo = actualizarInformacionSistema;
window.showMessage = mostrarMensaje;
window.decodeSpecialChars = decodificarCaracteresEspeciales;
window.readFileAsTextWithEncoding = leerArchivoComoTextoConCodificacion;
window.populateRestrictionsForm = llenarFormularioRestricciones;
window.handleLocationRestrictionChange = manejarCambioRestriccionUbicacion;
window.getCurrentLocation = obtenerUbicacionActual;
window.ensureStatsPolling = asegurarActualizacionEstadisticas;
window.showDashboardSection = mostrarSeccionTablero;
window.actualizarTokenAdmin = actualizarTokenAdmin;
window.obtenerTokenPayload = decodificarToken;
window.tieneAccesoTecnico = tieneAccesoTecnico;
window.hasTechnicalAccess = tieneAccesoTecnico;

Object.defineProperty(window, 'estudiantesActuales', {
    get: () => estudiantesActuales,
    set: (valor) => {
        estudiantesActuales = Array.isArray(valor) ? valor : [];
    }
});

Object.defineProperty(window, 'matriculasDuplicadas', {
    get: () => matriculasDuplicadas,
    set: (valor) => {
        matriculasDuplicadas = Array.isArray(valor) ? valor : [];
    }
});

Object.defineProperty(window, 'configuracionSistema', {
    get: () => configuracionSistema,
    set: (valor) => {
        configuracionSistema = valor || {};
    }
});

Object.defineProperty(window, 'idIntervaloEstadisticas', {
    get: () => idIntervaloEstadisticas,
    set: (valor) => {
        idIntervaloEstadisticas = valor;
    }
});

Object.defineProperty(window, 'currentStudents', {
    get: () => estudiantesActuales,
    set: (valor) => {
        estudiantesActuales = Array.isArray(valor) ? valor : [];
    }
});

Object.defineProperty(window, 'systemConfig', {
    get: () => configuracionSistema,
    set: (valor) => {
        configuracionSistema = valor || {};
    }
});

Object.defineProperty(window, 'statsIntervalId', {
    get: () => idIntervaloEstadisticas,
    set: (valor) => {
        idIntervaloEstadisticas = valor;
    }
});
