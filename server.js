const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const config = require('./config');
const db = require('./database');

const app = express();
const PORT = config.server.port;

// Путь к боту (для отправки сообщений)
let botInstance = null;
const setBot = (bot) => { botInstance = bot; };
module.exports.setBot = setBot;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Сессии
app.use(session({
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 часа
}));

// Хелпер для проверки авторизации
const isAuthenticated = (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.status(401).json({ error: 'Не авторизован' });
};

// ============ API ENDPOINTS ============

// Вход администратора
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const isValidUser = username === config.admin.username;
        const rawPassword = String(password || '');

        let isValidPassword = false;
        if (config.admin.password) {
            // Основной способ: пароль в переменной окружения
            isValidPassword = rawPassword === config.admin.password;
        } else if (config.admin.passwordHash) {
            // Альтернативный способ: bcrypt hash
            isValidPassword = await bcrypt.compare(rawPassword, config.admin.passwordHash);
        }

        if (isValidUser && isValidPassword) {
            req.session.isAdmin = true;
            req.session.username = username;
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Неверные учётные данные' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Проверка статуса авторизации
app.get('/api/auth/status', (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
});

// Подача заявки
app.post('/api/apply', (req, res) => {
    try {
        const {
            discord_tag,
            game_nick,
            static_number,
            ooc_age,
            join_goal,
            heard_about,
            city
        } = req.body;
        
        // Валидация
        if (!discord_tag || !game_nick || !static_number || !ooc_age || !join_goal || !heard_about) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        
        // Проверка формата Discord тега
        const tagRegex = /^.+#\d{4}$/;
        if (!tagRegex.test(discord_tag)) {
            return res.status(400).json({ error: 'Неверный формат Discord тега (пример: Name#1234)' });
        }
        
        // Проверка на существующую заявку
        const existing = db.getPendingApplicationByDiscordTag(discord_tag);
        if (existing) {
            return res.status(400).json({ error: 'Заявка от этого пользователя уже подана' });
        }
        
        // Создаём заявку
        const result = db.createApplication({
            discord_tag,
            discord_id: null,
            game_nick,
            static_number,
            ooc_age,
            join_goal,
            heard_about,
            city: city || null,
            private_channel_id: null,
            review_channel_id: null,
            review_message_id: null,
            log_channel_id: null,
            log_message_id: null
        });
        
        console.log(`[ЗАЯВКА] Новая заявка от ${discord_tag}`);
        
        res.json({ 
            success: true, 
            message: 'Заявка успешно подана! Ожидайте решения администратора.' 
        });
    } catch (error) {
        console.error('Apply error:', error);
        res.status(500).json({ error: 'Ошибка при подаче заявки' });
    }
});

// Получить все заявки (только админ)
app.get('/api/applications', isAuthenticated, (req, res) => {
    try {
        const applications = db.getApplications();
        const stats = db.getStats();
        res.json({ applications, stats });
    } catch (error) {
        console.error('Get applications error:', error);
        res.status(500).json({ error: 'Ошибка при получении заявок' });
    }
});

// Одобрить заявку
app.put('/api/applications/:id/approve', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const application = db.getApplicationById(id);
        
        if (!application) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        if (application.status !== 'pending') {
            return res.status(400).json({ error: 'Заявка уже обработана' });
        }
        
        // Обновляем статус
        db.updateApplicationStatus(id, 'approved', req.session.username || 'admin');
        
        // Отправляем Discord уведомление через бота
        if (botInstance && application.discord_id) {
            try {
                const user = await botInstance.users.fetch(application.discord_id);
                await user.send(`🎉 **Поздравляем!** Ваша заявка на вступление в семью **${config.family.name}** одобрена!`);
            } catch (e) {
                console.log(`Не удалось отправить DM пользователю ${application.discord_tag}`);
            }
        }
        
        console.log(`[ЗАЯВКА] Одобрена: ${application.discord_tag}`);
        
        res.json({ success: true, message: 'Заявка одобрена' });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Ошибка при одобрении заявки' });
    }
});

// Отклонить заявку
app.put('/api/applications/:id/reject', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const application = db.getApplicationById(id);
        
        if (!application) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        if (application.status !== 'pending') {
            return res.status(400).json({ error: 'Заявка уже обработана' });
        }
        
        // Обновляем статус
        db.updateApplicationStatus(id, 'rejected', req.session.username || 'admin');
        
        // Отправляем Discord уведомление
        if (botInstance && application.discord_id) {
            try {
                const user = await botInstance.users.fetch(application.discord_id);
                await user.send(`❌ К сожалению, ваша заявка на вступление в семью **${config.family.name}** отклонена.`);
            } catch (e) {
                console.log(`Не удалось отправить DM пользователю ${application.discord_tag}`);
            }
        }
        
        console.log(`[ЗАЯВКА] Отклонена: ${application.discord_tag}`);
        
        res.json({ success: true, message: 'Заявка отклонена' });
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ error: 'Ошибка при отклонении заявки' });
    }
});

// Получить статистику
app.get('/api/stats', isAuthenticated, (req, res) => {
    res.json(db.getStats());
});

// Публичная статистика для главной страницы
app.get('/api/public/overview', (req, res) => {
    try {
        const stats = db.getStats();
        const topRecruiters = db.getRecruitersTop(5);
        res.json({
            familyName: config.family.name,
            stats,
            topRecruiters
        });
    } catch (error) {
        console.error('Public overview error:', error);
        res.status(500).json({ error: 'Ошибка получения публичной статистики' });
    }
});

// Публичный топ рекрутеров
app.get('/api/recruiters-top', (req, res) => {
    try {
        const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
        const list = db.getRecruitersTop(limit);
        res.json({ recruiters: list });
    } catch (error) {
        console.error('Recruiters top error:', error);
        res.status(500).json({ error: 'Ошибка получения топа рекрутеров' });
    }
});

// ============ ROUTES ============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🌐 Веб-сервер запущен: http://localhost:${PORT}`);
    console.log(`📋 Панель администратора: http://localhost:${PORT}/admin`);
});
