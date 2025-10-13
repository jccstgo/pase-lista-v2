// ================================
// INICIALIZACIÓN DE LA INTERFAZ
// ================================
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const technicalAccessForm = document.getElementById('technicalAccessForm');
    const restrictionsForm = document.getElementById('restrictionsForm');
    const locationCheckbox = document.getElementById('locationRestrictionEnabled');
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const dashboardTabs = Array.from(document.querySelectorAll('.dashboard-tab'));
    const tabGroups = new Map();

    if (loginForm) {
        loginForm.addEventListener('submit', manejarInicioSesion);
    }

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', manejarCambioContrasena);
    }

    if (technicalAccessForm) {
        technicalAccessForm.addEventListener('submit', manejarCambioAccesoTecnico);
    }

    if (restrictionsForm) {
        restrictionsForm.addEventListener('submit', manejarEnvioRestricciones);
    }

    if (locationCheckbox) {
        locationCheckbox.addEventListener('change', manejarCambioRestriccionUbicacion);
    }

    tabs.forEach(tab => {
        const group = tab.dataset.group || 'default';

        if (!tabGroups.has(group)) {
            tabGroups.set(group, []);
        }

        tabGroups.get(group).push(tab);

        tab.addEventListener('click', () => {
            mostrarPestana(tab.dataset.tab, tab, group);
        });
    });

    const initializeDashboardTabs = () => {
        dashboardTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                mostrarSeccionTablero(tab.dataset.target, tab);
            });
        });

        const initialDashboardTab = dashboardTabs.find(tab => tab.classList.contains('active')) || dashboardTabs[0];
        if (initialDashboardTab) {
            mostrarSeccionTablero(initialDashboardTab.dataset.target, initialDashboardTab);
        }
    };

    manejarCambioRestriccionUbicacion();

    const initializeTabs = () => {
        tabGroups.forEach(groupTabs => {
            const initialTab = groupTabs.find(tab => tab.classList.contains('active')) || groupTabs[0];
            if (initialTab) {
                const group = initialTab.dataset.group || 'default';
                mostrarPestana(initialTab.dataset.tab, initialTab, group);
            }
        });
    };

    initializeDashboardTabs();

    if (authToken) {
        mostrarSeccionAdministracion();
        initializeTabs();
        cargarPanelAdministrativo();
        actualizarInformacionSistema();
    } else {
        initializeTabs();
    }
});
