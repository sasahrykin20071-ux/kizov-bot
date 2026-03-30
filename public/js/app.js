document.addEventListener('DOMContentLoaded', () => {
    const topRecruitersWrap = document.getElementById('topRecruitersWrap');
    const refreshTopBtn = document.getElementById('refreshTopBtn');
    const discordInviteBtn = document.getElementById('discordInviteBtn');

    const escapeHtml = (value) => {
        const div = document.createElement('div');
        div.textContent = String(value || '');
        return div.innerHTML;
    };

    const renderTop = (list) => {
        if (!list || list.length === 0) {
            topRecruitersWrap.innerHTML = '<p class="muted">Данные рейтинга пока не накоплены.</p>';
            return;
        }

        topRecruitersWrap.innerHTML = list.map((item, index) => `
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

    const loadOverview = async () => {
        try {
            const response = await fetch('/api/public/overview');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'overview failed');

            if (data.inviteUrl) {
                discordInviteBtn.href = data.inviteUrl;
            }
        } catch (error) {
            discordInviteBtn.href = '#';
        }
    };

    const loadTop = async () => {
        topRecruitersWrap.innerHTML = '<p class="muted">Загрузка рейтинга...</p>';
        try {
            const response = await fetch('/api/recruiters-top?limit=12');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'top failed');
            renderTop(data.recruiters || []);
        } catch (error) {
            topRecruitersWrap.innerHTML = '<p class="muted">Не удалось загрузить рейтинг.</p>';
        }
    };

    refreshTopBtn.addEventListener('click', loadTop);
    loadOverview();
    loadTop();
});
