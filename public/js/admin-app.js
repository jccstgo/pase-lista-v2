// ================================
// INICIALIZACIÓN DE LA INTERFAZ
// ================================
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const restrictionsForm = document.getElementById('restrictionsForm');
    const locationCheckbox = document.getElementById('locationRestrictionEnabled');
    const tabs = Array.from(document.querySelectorAll('.tab'));

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', handleChangePassword);
    }

    if (restrictionsForm) {
        restrictionsForm.addEventListener('submit', handleRestrictionsSubmit);
    }

    if (locationCheckbox) {
        locationCheckbox.addEventListener('change', handleLocationRestrictionChange);
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            showTab(tab.dataset.tab, tab);
        });
    });

    handleLocationRestrictionChange();

    if (authToken) {
        showAdminSection();
        const activeTab = document.querySelector('.tab.active') || tabs[0];
        if (activeTab) {
            showTab(activeTab.dataset.tab, activeTab);
        }
        loadDashboard();
        updateSystemInfo();
    }
});
