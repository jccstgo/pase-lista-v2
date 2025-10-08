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

function showDashboardSection(sectionId, triggerElement = null) {
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
        loadStats();
        loadDetailedList();
    } else if (sectionId === 'managementSection') {
        loadSystemConfig();
        updateSystemInfo();
    }
}

function showTab(tabName, tabElement, group = 'default') {
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
            .then(payload => {
                const stats = payload?.data ?? payload ?? {};
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

function hasEncodingArtifacts(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    return text.includes('\uFFFD') || /Ã.|Â./.test(text);
}

function decodeText(bytes, encoding) {
    try {
        return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch (error) {
        return null;
    }
}

function decodeSpecialChars(text) {
    if (!text || typeof text !== 'string') {
        return text;
    }

    if (!/Ã.|Â./.test(text)) {
        return text;
    }

    const bytes = new Uint8Array(Array.from(text, char => char.charCodeAt(0)));
    const preferredEncodings = ['utf-8', 'windows-1252', 'iso-8859-1'];

    for (const encoding of preferredEncodings) {
        const decoded = decodeText(bytes, encoding);
        if (decoded && !hasEncodingArtifacts(decoded)) {
            return decoded;
        }
    }

    return text;
}

async function readFileAsTextWithEncoding(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const encodingsToTry = ['utf-8', 'windows-1252', 'iso-8859-1'];

    for (let index = 0; index < encodingsToTry.length; index++) {
        const encoding = encodingsToTry[index];
        const decoded = decodeText(bytes, encoding);

        if (!decoded) {
            continue;
        }

        if (!hasEncodingArtifacts(decoded) || index === encodingsToTry.length - 1) {
            return decoded;
        }
    }

    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
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
        const adminSection = document.getElementById('adminSection');
        if (authToken && adminSection && !adminSection.classList.contains('hidden')) {
            loadStats();
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection && !resultsSection.classList.contains('hidden')) {
                loadDetailedList();
            }
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
window.readFileAsTextWithEncoding = readFileAsTextWithEncoding;
window.populateRestrictionsForm = populateRestrictionsForm;
window.handleLocationRestrictionChange = handleLocationRestrictionChange;
window.getCurrentLocation = getCurrentLocation;
window.ensureStatsPolling = ensureStatsPolling;
window.showDashboardSection = showDashboardSection;
