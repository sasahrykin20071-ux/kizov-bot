document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('applyForm');
    const submitBtn = document.getElementById('submitBtn');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const topRecruitersWrap = document.getElementById('topRecruitersWrap');
    const refreshTopBtn = document.getElementById('refreshTopBtn');

    const showError = (message) => {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
    };

    const showSuccess = () => {
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    };

    const validateDiscordTag = (value) => /^.+#\d{4}$/.test(value);

    const renderTopRecruiters = (recruiters) => {
        if (!recruiters || recruiters.length === 0) {
            topRecruitersWrap.innerHTML = '<p class="muted">Пока нет данных по рекрутерам.</p>';
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

        topRecruitersWrap.innerHTML = `
            <table class="leaderboard">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Рекрутер</th>
                        <th>Одобрено</th>
                        <th>Всего обработано</th>
                        <th>Отклонено</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    };

    const loadTopRecruiters = async () => {
        topRecruitersWrap.innerHTML = '<p class="muted">Загрузка рейтинга...</p>';
        try {
            const response = await fetch('/api/recruiters-top?limit=15');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Ошибка загрузки');
            renderTopRecruiters(data.recruiters || []);
        } catch (error) {
            topRecruitersWrap.innerHTML = '<p class="muted">Не удалось загрузить рейтинг.</p>';
        }
    };

    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = {
            discord_tag: document.getElementById('discord_tag').value.trim(),
            game_nick: document.getElementById('game_nick').value.trim(),
            static_number: document.getElementById('static_number').value.trim(),
            ooc_age: document.getElementById('ooc_age').value.trim(),
            join_goal: document.getElementById('join_goal').value.trim(),
            heard_about: document.getElementById('heard_about').value.trim(),
            city: document.getElementById('city').value
        };

        if (!validateDiscordTag(payload.discord_tag)) {
            showError('Неверный Discord тег. Пример: Name#1234');
            return;
        }

        if (!payload.game_nick || !payload.static_number || !payload.ooc_age || !payload.join_goal || !payload.heard_about) {
            showError('Заполните все обязательные поля.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправка...';

        try {
            const response = await fetch('/api/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Не удалось отправить заявку');
            }

            form.reset();
            showSuccess();
            loadTopRecruiters();
        } catch (error) {
            showError(error.message || 'Ошибка соединения с сервером');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Отправить заявку';
        }
    });

    refreshTopBtn.addEventListener('click', loadTopRecruiters);
    loadTopRecruiters();
});
