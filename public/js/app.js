// Главная страница - подача заявки
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('applyForm');
    const submitBtn = document.getElementById('submitBtn');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');

    // Валидация Discord тега
    const discordTagInput = document.getElementById('discord_tag');
    discordTagInput.addEventListener('input', (e) => {
        const value = e.target.value;
        // Автоматически добавляем # если пользователь вводит только имя
        if (value && !value.includes('#') && value.length >= 2) {
            // Не менять, пусть пользователь вводит сам
        }
    });

    // Отправка формы
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Валидация Discord тега
        const discordTag = discordTagInput.value.trim();
        const tagRegex = /^.+#\d{4}$/;
        
        if (!tagRegex.test(discordTag)) {
            showError('Неверный формат Discord тега. Пример: Имя#1234');
            return;
        }

        // Собираем данные
        const data = {
            discord_tag: discordTag,
            game_nick: document.getElementById('game_nick').value.trim(),
            static_number: document.getElementById('static_number').value.trim(),
            ooc_age: document.getElementById('ooc_age').value,
            join_goal: document.getElementById('join_goal').value.trim(),
            heard_about: document.getElementById('heard_about').value.trim(),
            city: document.getElementById('city').value
        };

        // Валидация обязательных полей
        if (!data.game_nick || !data.static_number || !data.ooc_age || !data.join_goal || !data.heard_about) {
            showError('Пожалуйста, заполните все поля');
            return;
        }

        // Блокируем кнопку и показываем загрузку
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправка...';
        hideMessages();

        try {
            const response = await fetch('/api/apply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showSuccess();
                form.reset();
            } else {
                showError(result.error || 'Произошла ошибка при отправке заявки');
            }
        } catch (error) {
            console.error('Error:', error);
            showError('Ошибка соединения с сервером');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Отправить заявку';
        }
    });

    function showSuccess() {
        form.style.display = 'none';
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }

    function showError(message) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }

    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }
});
