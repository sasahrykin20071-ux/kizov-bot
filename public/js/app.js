document.addEventListener('DOMContentLoaded', () => {
    const navTabs = Array.from(document.querySelectorAll('.nav-tab'));
    const viewLinks = Array.from(document.querySelectorAll('[data-view-link]'));
    const discordInviteBtn = document.getElementById('discordInviteBtn');

    const viewMap = {
        home: document.getElementById('view-home'),
        info: document.getElementById('view-info'),
        enlist: document.getElementById('view-enlist')
    };

    const setActiveView = (viewName) => {
        const target = viewMap[viewName] ? viewName : 'home';
        Object.values(viewMap).forEach((panel) => panel.classList.remove('active'));
        viewMap[target].classList.add('active');

        navTabs.forEach((button) => {
            button.classList.toggle('active', button.dataset.view === target);
        });

        history.replaceState({}, '', `#${target}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    navTabs.forEach((button) => {
        button.addEventListener('click', () => setActiveView(button.dataset.view));
    });

    viewLinks.forEach((button) => {
        button.addEventListener('click', () => setActiveView(button.dataset.viewLink));
    });

    const loadOverview = async () => {
        try {
            const response = await fetch('/api/public/overview');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'overview failed');
            if (discordInviteBtn && data.inviteUrl) {
                discordInviteBtn.href = data.inviteUrl;
            }
        } catch (error) {
            if (discordInviteBtn) discordInviteBtn.href = '#';
        }
    };

    const initialView = window.location.hash.replace('#', '');
    setActiveView(initialView || 'home');
    loadOverview();
});
