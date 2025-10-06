// ================================
// VARIABLES GLOBALES
// ================================
let authToken = localStorage.getItem('adminToken');
let currentStudents = [];
let systemConfig = {};
let statsIntervalId = null;

// ================================
// UTILIDADES GENERALES
// ================================
function showAdminSection() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('adminSection').classList.remove('hidden');
}

function logout() {
    localStorage.removeItem('adminToken');
    authToken = null;
    if (statsIntervalId) {
        clearInterval(statsIntervalId);
        statsIntervalId = null;
    }
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('adminSection').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

function showTab(tabName, tabElement) {
    document.querySelectorAll('[id$="Tab"]').forEach(tab => {
        tab.classList.add('hidden');
    });

    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    const target = document.getElementById(`${tabName}Tab`);
    if (target) {
        target.classList.remove('hidden');
    }

    if (tabElement) {
        tabElement.classList.add('active');
    } else {
        const fallback = document.querySelector(`.tab[data-tab="${tabName}"]`);
        fallback?.classList.add('active');
    }

    switch (tabName) {
        case 'overview':
            loadStats();
            break;
        case 'detailed':
            loadDetailedList();
            break;
        case 'restrictions':
            loadSystemConfig();
            loadAdminKeys();
            break;
        case 'devices':
            loadDevices();
            break;
        case 'settings':
            updateSystemInfo();
            break;
        default:
            break;
    }
}

function updateSystemInfo() {
    document.getElementById('currentUser').textContent = 'admin';
    document.getElementById('sessionTime').textContent = new Date().toLocaleString('es-MX');
    document.getElementById('lastUpdate').textContent = new Date().toLocaleString('es-MX');

    if (authToken) {
        fetch('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        })
            .then(response => response.json())
            .then(stats => {
                document.getElementById('systemTotalStudents').textContent = stats.totalStudents ?? '-';
                document.getElementById('systemTodayRecords').textContent = stats.totalPresent ?? '-';
            })
            .catch(() => {
                document.getElementById('systemTotalStudents').textContent = 'Error';
                document.getElementById('systemTodayRecords').textContent = 'Error';
            });
    }
}

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.innerHTML = decodeSpecialChars(message);
    element.className = `message ${type}`;
    element.style.display = 'block';

    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function decodeSpecialChars(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    try {
        const bytes = new Uint8Array(Array.from(text, char => char.charCodeAt(0)));
        const decoder = new TextDecoder('utf-8', { fatal: false });
        return decoder.decode(bytes);
    } catch (error) {
        return text;
    }
}

function populateRestrictionsForm() {
    document.getElementById('locationRestrictionEnabled').checked = systemConfig.location_restriction_enabled === 'true';
    document.getElementById('deviceRestrictionEnabled').checked = systemConfig.device_restriction_enabled === 'true';
    document.getElementById('adminKeyBypassEnabled').checked = systemConfig.admin_key_bypass_enabled === 'true';

    document.getElementById('locationName').value = systemConfig.location_name || '';
    document.getElementById('locationLatitude').value = systemConfig.location_latitude || '';
    document.getElementById('locationLongitude').value = systemConfig.location_longitude || '';
    document.getElementById('locationRadius').value = systemConfig.location_radius_km || '1';

    handleLocationRestrictionChange();
}

function handleLocationRestrictionChange() {
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

function getCurrentLocation() {
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

function ensureStatsPolling() {
    if (statsIntervalId) {
        clearInterval(statsIntervalId);
    }

    statsIntervalId = setInterval(() => {
        if (authToken && !document.getElementById('adminSection').classList.contains('hidden')) {
            loadStats();
        }
    }, 30000);
}

// ================================
// EXPONER FUNCIONES GLOBALES
// ================================
window.logout = logout;
window.showTab = showTab;
window.showAdminSection = showAdminSection;
window.updateSystemInfo = updateSystemInfo;
window.showMessage = showMessage;
window.decodeSpecialChars = decodeSpecialChars;
window.populateRestrictionsForm = populateRestrictionsForm;
window.handleLocationRestrictionChange = handleLocationRestrictionChange;
window.getCurrentLocation = getCurrentLocation;
window.ensureStatsPolling = ensureStatsPolling;
