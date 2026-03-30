document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('loginSection');
    const adminPanel = document.getElementById('adminPanel');
    const oauthErrorText = document.getElementById('oauthErrorText');
    const adminName = document.getElementById('adminName');
    const adminAvatar = document.getElementById('adminAvatar');
    const logoutBtn = document.getElementById('logoutBtn');

    const applicationsList = document.getElementById('applicationsList');
    const rosterList = document.getElementById('rosterList');
    const adminTopWrap = document.getElementById('adminTopWrap');
    const refreshAdminTopBtn = document.getElementById('refreshAdminTopBtn');
    const searchInput = document.getElementById('searchInput');

    let applications = [];
    let currentStatus = 'all';
    let currentCity = 'all';
    let searchQuery = '';

    const statusMap = {
        pending: 'ОЖИДАЕТ',
        in_review: 'РАССМОТРЕНИЕ',
        called: 'ОБЗВОН',
        approved: 'ПРИНЯТ',
        rejected: 'ОТКЛОНЁН'
    };

    const formatDate = (value) => {
        if (!value) return '-';
        return new Date(value).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
    };

    const getFilteredApplications = () => {
        return applications.filter((item) => {
            const byStatus = currentStatus === 'all' ? true : item.status === currentStatus;
            const byCity = currentCity === 'all' ? true : item.city === currentCity;
            const q = searchQuery.trim().toLowerCase();
            const bySearch = !q
                ? true
                : String(item.discord_tag || '').toLowerCase().includes(q)
                    || String(item.game_nick || '').toLowerCase().includes(q)
                    || String(item.static_number || '').toLowerCase().includes(q);
            return byStatus && byCity && bySearch;
        });
    };

    const renderApplications = () => {
        const list = getFilteredApplications();
        if (list.length === 0) {
            applicationsList.innerHTML = '<div class="empty-box">Заявок не найдено.</div>';
            return;
        }

        const rows = list.map((app) => `
            <tr>
                <td>${escapeHtml(app.discord_tag)}</td>
                <td>${escapeHtml(app.city || '-')}</td>
                <td>${escapeHtml(app.game_nick || '-')} | ${escapeHtml(app.static_number || '-')}</td>
                <td>${escapeHtml(app.ooc_age || '-')}</td>
                <td><span class="chip ${app.status}">${statusMap[app.status] || app.status}</span></td>
                <td>${formatDate(app.created_at)}</td>
                <td>
                    ${app.status === 'pending' ? `
                        <div class="table-actions">
                            <button class="small-btn ok" onclick="window.__approve(${app.id})">Принять</button>
                            <button class="small-btn bad" onclick="window.__reject(${app.id})">Отклонить</button>
                        </div>
                    ` : `<span class="muted">${escapeHtml(app.processed_by || '-')}</span>`}
                </td>
            </tr>
        `).join('');

        applicationsList.innerHTML = `
            <table class="command-table">
                <thead>
                    <tr>
                        <th>ИГРОК</th>
                        <th>СЕМЬЯ</th>
                        <th>НИК | СТАТИК</th>
                        <th>ВОЗРАСТ</th>
                        <th>СТАТУС</th>
                        <th>ДАТА</th>
                        <th>ДЕЙСТВИЕ</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    };

    const renderRoster = (roster) => {
        if (!roster || roster.length === 0) {
            rosterList.innerHTML = '<p class="muted">Состав недоступен.</p>';
            return;
        }

        rosterList.innerHTML = roster.map((member) => `
            <div class="roster-item">
                <img src="${escapeHtml(member.avatar || '')}" alt="${escapeHtml(member.displayName)}">
                <div>
                    <strong>${escapeHtml(member.displayName)}</strong>
                    <span>${escapeHtml(member.id)}</span>
                </div>
            </div>
        `).join('');
    };

    const renderTop = (list) => {
        if (!list || list.length === 0) {
            adminTopWrap.innerHTML = '<p class="muted">Данных по рейтингу нет.</p>';
            return;
        }
        adminTopWrap.innerHTML = list.map((item, index) => `
            <article class="rating-item ${index === 0 ? 'first' : ''}">
                <div class="rating-left">
                    <div class="place">${index + 1}</div>
                    <div>
                        <h3>${escapeHtml(item.recruiter)}</h3>
                        <div class="rating-meta">
                            <span class="ok">${item.approved || 0} принято</span>
                            <span class="reject">${item.rejected || 0} отклонено</span>
                            <span class="all">${item.total_processed || 0} решений</span>
                        </div>
                    </div>
                </div>
            </article>
        `).join('');
    };

    const loadTop = async () => {
        adminTopWrap.innerHTML = '<p class="muted">Загрузка...</p>';
        const response = await fetch('/api/recruiters-top?limit=20');
        const data = await response.json();
        if (!response.ok) {
            adminTopWrap.innerHTML = '<p class="muted">Ошибка загрузки рейтинга.</p>';
            return;
        }
        renderTop(data.recruiters || []);
    };

    const loadData = async () => {
        const [appsRes, overviewRes] = await Promise.all([
            fetch('/api/applications'),
            fetch('/api/public/overview')
        ]);

        if (!appsRes.ok) throw new Error('auth');
        const appsData = await appsRes.json();
        applications = appsData.applications || [];
        renderApplications();

        if (overviewRes.ok) {
            const overviewData = await overviewRes.json();
            renderRoster(overviewData.roster || []);
        }
    };

    const showOAuthError = () => {
        const params = new URLSearchParams(window.location.search);
        const error = params.get('error');
        if (!error) return;
        oauthErrorText.classList.remove('hidden');
        if (error === 'oauth_not_configured') {
            oauthErrorText.textContent = 'OAuth не настроен: проверь DISCORD_CLIENT_ID и DISCORD_CLIENT_SECRET в Railway Variables.';
        } else if (error === 'no_recruiter_role') {
            oauthErrorText.textContent = 'Нет доступа: требуется роль рекрутера на Discord сервере.';
        } else if (error === 'oauth_failed') {
            oauthErrorText.textContent = 'Ошибка Discord OAuth. Попробуйте снова.';
        } else {
            oauthErrorText.textContent = 'Не удалось выполнить вход через Discord.';
        }
    };

    const checkAuth = async () => {
        const response = await fetch('/api/auth/status');
        const data = await response.json();

        if (!data.isAdmin) {
            loginSection.classList.remove('hidden');
            adminPanel.classList.add('hidden');
            showOAuthError();
            return;
        }

        loginSection.classList.add('hidden');
        adminPanel.classList.remove('hidden');

        const user = data.user || {};
        adminName.textContent = user.globalName || user.username || 'Recruiter';
        if (user.avatar) adminAvatar.src = user.avatar;

        await loadData();
        await loadTop();
    };

    window.__approve = async (id) => {
        if (!confirm('Принять заявку?')) return;
        const response = await fetch(`/api/applications/${id}/approve`, { method: 'PUT' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Ошибка');
            return;
        }
        await loadData();
        await loadTop();
    };

    window.__reject = async (id) => {
        if (!confirm('Отклонить заявку?')) return;
        const response = await fetch(`/api/applications/${id}/reject`, { method: 'PUT' });
        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Ошибка');
            return;
        }
        await loadData();
        await loadTop();
    };

    document.querySelectorAll('.tab-btn').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');

            document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
            const target = document.getElementById(button.dataset.tab);
            if (target) target.classList.remove('hidden');
        });
    });

    document.querySelectorAll('.status-btn').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.status-btn').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            currentStatus = button.dataset.status;
            renderApplications();
        });
    });

    document.querySelectorAll('.city-btn').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.city-btn').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
            currentCity = button.dataset.city;
            renderApplications();
        });
    });

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        renderApplications();
    });

    refreshAdminTopBtn.addEventListener('click', loadTop);

    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/admin';
    });

    checkAuth();
});
