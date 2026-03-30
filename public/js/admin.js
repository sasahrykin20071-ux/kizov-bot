// Админ-панель
document.addEventListener('DOMContentLoaded', async () => {
    const loginSection = document.getElementById('loginSection');
    const adminPanel = document.getElementById('adminPanel');
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const applicationsList = document.getElementById('applicationsList');
    const loginError = document.getElementById('loginError');

    // Элементы статистики
    const statTotal = document.getElementById('statTotal');
    const statPending = document.getElementById('statPending');
    const statApproved = document.getElementById('statApproved');
    const statRejected = document.getElementById('statRejected');

    let currentFilter = 'all';
    let applications = [];

    // Проверяем статус авторизации
    async function checkAuth() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            
            if (data.isAdmin) {
                showAdminPanel();
                loadApplications();
            } else {
                showLoginForm();
            }
        } catch (error) {
            console.error('Auth check error:', error);
            showLoginForm();
        }
    }

    // Показать форму входа
    function showLoginForm() {
        loginSection.style.display = 'block';
        adminPanel.style.display = 'none';
    }

    // Показать админ-панель
    function showAdminPanel() {
        loginSection.style.display = 'none';
        adminPanel.style.display = 'block';
    }

    // Загрузка заявок
    async function loadApplications() {
        try {
            const response = await fetch('/api/applications');
            
            if (!response.ok) {
                throw new Error('Ошибка загрузки');
            }
            
            const data = await response.json();
            applications = data.applications;
            
            updateStats(data.stats);
            renderApplications();
        } catch (error) {
            console.error('Load error:', error);
            showToast('Ошибка загрузки заявок', 'error');
        }
    }

    // Обновление статистики
    function updateStats(stats) {
        statTotal.textContent = stats.total || 0;
        statPending.textContent = stats.pending || 0;
        statApproved.textContent = stats.approved || 0;
        statRejected.textContent = stats.rejected || 0;
    }

    // Рендер списка заявок
    function renderApplications() {
        const filtered = currentFilter === 'all' 
            ? applications 
            : applications.filter(app => app.status === currentFilter);

        if (filtered.length === 0) {
            applicationsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>Заявки не найдены</p>
                </div>
            `;
            return;
        }

        applicationsList.innerHTML = filtered.map(app => `
            <div class="application-card" data-id="${app.id}">
                <div class="application-header">
                    <div>
                        <div class="application-discord">${escapeHtml(app.discord_tag)}</div>
                        <div class="application-date">${formatDate(app.created_at)}</div>
                    </div>
                    <span class="application-status status-${app.status}">
                        ${getStatusText(app.status)}
                    </span>
                </div>
                
                <div class="application-content">
                    <div class="application-field">
                        <div class="application-field-label">Сервер</div>
                        <div class="application-field-value">${escapeHtml(app.city || '-') }</div>
                    </div>
                    <div class="application-field">
                        <div class="application-field-label">Ник в игре</div>
                        <div class="application-field-value">${escapeHtml(app.game_nick || '-')}</div>
                    </div>
                    <div class="application-field">
                        <div class="application-field-label">Статик #</div>
                        <div class="application-field-value">${escapeHtml(app.static_number || '-')}</div>
                    </div>
                    <div class="application-field">
                        <div class="application-field-label">Возраст OOC</div>
                        <div class="application-field-value">${escapeHtml(app.ooc_age || '-')}</div>
                    </div>
                    <div class="application-field" style="grid-column: 1 / -1;">
                        <div class="application-field-label">Цель вступления</div>
                        <div class="application-field-value">${escapeHtml(truncate(app.join_goal || '', 150))}</div>
                    </div>
                    <div class="application-field" style="grid-column: 1 / -1;">
                        <div class="application-field-label">Как узнали о семье</div>
                        <div class="application-field-value">${escapeHtml(truncate(app.heard_about || '', 150))}</div>
                    </div>
                </div>
                
                ${app.status === 'pending' ? `
                    <div class="application-actions">
                        <button class="btn btn-success" onclick="approveApplication(${app.id})">
                            ✅ Одобрить
                        </button>
                        <button class="btn btn-danger" onclick="rejectApplication(${app.id})">
                            ❌ Отклонить
                        </button>
                    </div>
                ` : `
                    <div class="application-actions" style="color: var(--color-text-dim); font-size: 13px;">
                        Обработано: ${app.processed_by || 'admin'} • ${formatDate(app.processed_at)}
                    </div>
                `}
            </div>
        `).join('');
    }

    // Одобрение заявки
    window.approveApplication = async (id) => {
        if (!confirm('Одобрить эту заявку?')) return;

        try {
            const response = await fetch(`/api/applications/${id}/approve`, {
                method: 'PUT'
            });

            if (response.ok) {
                showToast('Заявка одобрена', 'success');
                loadApplications();
            } else {
                const data = await response.json();
                showToast(data.error || 'Ошибка', 'error');
            }
        } catch (error) {
            console.error('Approve error:', error);
            showToast('Ошибка одобрения заявки', 'error');
        }
    };

    // Отклонение заявки
    window.rejectApplication = async (id) => {
        if (!confirm('Отклонить эту заявку?')) return;

        try {
            const response = await fetch(`/api/applications/${id}/reject`, {
                method: 'PUT'
            });

            if (response.ok) {
                showToast('Заявка отклонена', 'success');
                loadApplications();
            } else {
                const data = await response.json();
                showToast(data.error || 'Ошибка', 'error');
            }
        } catch (error) {
            console.error('Reject error:', error);
            showToast('Ошибка отклонения заявки', 'error');
        }
    };

    // Вход
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                showAdminPanel();
                loadApplications();
            } else {
                loginError.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginError.style.display = 'block';
        }
    });

    // Выход
    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
            showLoginForm();
            loginForm.reset();
        } catch (error) {
            console.error('Logout error:', error);
        }
    });

    // Фильтры
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderApplications();
        });
    });

    // Утилиты
    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getStatusText(status) {
        const texts = {
            pending: 'Ожидает',
            in_review: 'На рассмотрении',
            called: 'Вызван на обзвон',
            approved: 'Одобрена',
            rejected: 'Отклонена'
        };
        return texts[status] || status;
    }

    function truncate(str, length) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, type = 'success') {
        const container = document.querySelector('.toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✅' : '❌'}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    // Инициализация
    checkAuth();
});
