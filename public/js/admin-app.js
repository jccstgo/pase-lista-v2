// ================================
// INICIALIZACIÓN DE LA INTERFAZ
// ================================
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const restrictionsForm = document.getElementById('restrictionsForm');
    const locationCheckbox = document.getElementById('locationRestrictionEnabled');
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const tabGroups = new Map();

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
        const group = tab.dataset.group || 'default';

        if (!tabGroups.has(group)) {
            tabGroups.set(group, []);
        }

        tabGroups.get(group).push(tab);

        tab.addEventListener('click', () => {
            showTab(tab.dataset.tab, tab, group);
        });
    });

    handleLocationRestrictionChange();

    const initializeTabs = () => {
        tabGroups.forEach(groupTabs => {
            const initialTab = groupTabs.find(tab => tab.classList.contains('active')) || groupTabs[0];
            if (initialTab) {
                const group = initialTab.dataset.group || 'default';
                showTab(initialTab.dataset.tab, initialTab, group);
            }
        });
    };

    if (authToken) {
        showAdminSection();
        initializeTabs();
        loadDashboard();
        updateSystemInfo();
    } else {
        initializeTabs();
    }
});
