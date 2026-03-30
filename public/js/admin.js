document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('loginSection');
    const adminPanel = document.getElementById('adminPanel');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');
    const applicationsList = document.getElementById('applicationsList');
    const adminTopWrap = document.getElementById('adminTopWrap');
    const refreshAdminTopBtn = document.getElementById('refreshAdminTopBtn');

    const statTotal = document.getElementById('statTotal');
    const statPending = document.getElementById('statPending');
    const statApproved = document.getElementById('statApproved');
    const statRejected = document.getElementById('statRejected');

    let currentFilter = 'all';
    let applications = [];

    const statusMap = {
        pending: 'Ожидает',
        in_review: 'На рассмотрении',
        called: 'Обзвон',
        approved: 'Одобрена',
        rejected: 'Отклонена'
    };

    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
    };

    const formatDate = (dateValue) => {
        if (!dateValue) return '-';
        const date = new Date(dateValue);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const showLogin = () => {
        loginSection.classList.remove('hidden');
        adminPanel.classList.add('hidden');
    };

    const showAdmin = () => {
        loginSection.classList.add('hidden');
        adminPanel.classList.remove('hidden');
    };

    const renderApplications = () => {
        const list = currentFilter === 'all'
            ? applications
            : applications.filter((item) => item.status === currentFilter);

        if (list.length === 0) {
            applicationsList.innerHTML = '<p class="muted">Заявок по выбранному фильтру нет.</p>';
            return;
        }

        applicationsList.innerHTML = list.map((app) => `
            <article class="application-item">
                <div class="application-head">
                    <div>
                        <h3>${escapeHtml(app.discord_tag)}</h3>
                        <p class="muted">${formatDate(app.created_at)}</p>
                    </div>
                    <span class="status-chip status-${app.status}">${statusMap[app.status] || app.status}</span>
                </div>
                <dl class="app-fields">
                    <div><dt>Сервер</dt><dd>${escapeHtml(app.city || '-')}</dd></div>
                    <div><dt>Ник</dt><dd>${escapeHtml(app.game_nick || '-')}</dd></div>
                    <div><dt>Статик</dt><dd>${escapeHtml(app.static_number || '-')}</dd></div>
                    <div><dt>Возраст OOC</dt><dd>${escapeHtml(app.ooc_age || '-')}</dd></div>
                    <div><dt>Цель</dt><dd>${escapeHtml(app.join_goal || '-')}</dd></div>
                    <div><dt>Как узнал</dt><dd>${escapeHtml(app.heard_about || '-')}</dd></div>
                </dl>
                ${app.status === 'pending' ? `
                    <div class="actions-row">
                        <button class="btn btn-success" onclick="window.__approve(${app.id})">Одобрить</button>
                        <button class="btn btn-danger" onclick="window.__reject(${app.id})">Отклонить</button>
                    </div>
                ` : `
                    <p class="muted">Обработал: ${escapeHtml(app.processed_by || '-')} • ${formatDate(app.processed_at)}</p>
                `}
            </article>
        `).join('');
    };

    const renderTopRecruiters = (recruiters) => {
        if (!recruiters || recruiters.length === 0) {
            adminTopWrap.innerHTML = '<p class="muted">Пока нет данных.</p>';
            return;
        }

        const rows = recruiters.map((item, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(item.recruiter)}</td>
                <td>${item.approved || 0}</td>
                <td>${item.total_processed || 0}</td>
                <td>${item.rejected || 0}</td>
            </tr>
        `).join('');

        adminTopWrap.innerHTML = `
            <table class="leaderboard">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Рекрутер</th>
                        <th>Одобрено</th>
                        <th>Обработано</th>
                        <th>Отклонено</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    };

    const loadRecruitersTop = async () => {
        adminTopWrap.innerHTML = '<p class="muted">Загрузка...</p>';
        try {
            const response = await fetch('/api/recruiters-top?limit=10');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Не удалось загрузить рейтинг');
            renderTopRecruiters(data.recruiters || []);
        } catch (error) {
            adminTopWrap.innerHTML = '<p class="muted">Ошибка загрузки топа.</p>';
        }
    };

    const loadApplications = async () => {
        try {
            const response = await fetch('/api/applications');
            if (!response.ok) throw new Error('Требуется авторизация');
            const data = await response.json();
            applications = data.applications || [];

            const stats = data.stats || {};
            statTotal.textContent = stats.total || 0;
            statPending.textContent = stats.pending || 0;
            statApproved.textContent = stats.approved || 0;
            statRejected.textContent = stats.rejected || 0;

            renderApplications();
            loadRecruitersTop();
        } catch (error) {
            showLogin();
        }
    };

    const checkAuth = async () => {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            if (data.isAdmin) {
                showAdmin();
                loadApplications();
                return;
            }
            showLogin();
        } catch (error) {
            showLogin();
        }
    };

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        loginError.classList.add('hidden');

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) throw new Error('Неверные данные');
            showAdmin();
            loadApplications();
        } catch (error) {
            loginError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        showLogin();
        loginForm.reset();
    });

    document.querySelectorAll('.filter-btn').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
            button.classList.add('active');
            currentFilter = button.dataset.filter;
            renderApplications();
        });
    });

    refreshAdminTopBtn.addEventListener('click', loadRecruitersTop);

    window.__approve = async (id) => {
        if (!confirm('Одобрить заявку?')) return;
        const response = await fetch(`/api/applications/${id}/approve`, { method: 'PUT' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Ошибка');
            return;
        }
        loadApplications();
    };

    window.__reject = async (id) => {
        if (!confirm('Отклонить заявку?')) return;
        const response = await fetch(`/api/applications/${id}/reject`, { method: 'PUT' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Ошибка');
            return;
        }
        loadApplications();
    };

    checkAuth();
});
