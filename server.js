const express = require('express');
const session = require('express-session');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ChannelType
} = require('discord.js');
const config = require('./config');
const db = require('./database');

const app = express();
const PORT = config.server.port;

let botInstance = null;
const setBot = (bot) => { botInstance = bot; };
module.exports.setBot = setBot;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

const recruiterRoleIds = config.discord.staffRoleIds || [];

const isAuthenticated = (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.status(401).json({ error: 'Не авторизован' });
};

const buildDiscordAuthUrl = () => {
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.set('client_id', config.discord.clientId);
    url.searchParams.set('redirect_uri', config.discord.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    return url.toString();
};

const exchangeCodeForToken = async (code) => {
    const body = new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.discord.redirectUri
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    if (!response.ok) {
        throw new Error(`Discord token error: ${response.status}`);
    }
    return response.json();
};

const fetchDiscordUser = async (accessToken) => {
    const response = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`Discord user error: ${response.status}`);
    }
    return response.json();
};

const hasRecruiterRole = async (discordUserId) => {
    if (!botInstance || !config.discord.guildId) return false;
    const guild = await botInstance.guilds.fetch(config.discord.guildId);
    const member = await guild.members.fetch(discordUserId);
    return recruiterRoleIds.some((roleId) => member.roles.cache.has(roleId));
};

const getRecruiterRoster = async () => {
    try {
        if (!botInstance || !config.discord.guildId) return [];
        const guild = await botInstance.guilds.fetch(config.discord.guildId);
        const members = await guild.members.fetch();
        return members
            .filter((member) => recruiterRoleIds.some((roleId) => member.roles.cache.has(roleId)))
            .map((member) => ({
                id: member.user.id,
                username: member.user.username,
                displayName: member.displayName || member.user.username,
                avatar: member.user.displayAvatarURL({ size: 64 }),
                joinedAt: member.joinedAt
            }))
            .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'ru'));
    } catch (error) {
        return [];
    }
};

app.get('/api/auth/discord', (req, res) => {
    const clientId = String(config.discord.clientId || '');
    const clientSecret = String(config.discord.clientSecret || '');
    const isClientIdInvalid = !/^\d{17,22}$/.test(clientId) || clientId.includes('YOUR_DISCORD_CLIENT_ID');
    const isClientSecretInvalid = !clientSecret || clientSecret.includes('YOUR_DISCORD_CLIENT_SECRET');

    if (isClientIdInvalid || isClientSecretInvalid) {
        return res.redirect('/admin?error=oauth_not_configured');
    }
    res.redirect(buildDiscordAuthUrl());
});

app.get('/api/auth/discord/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) {
            return res.redirect('/admin?error=oauth_code_missing');
        }

        const tokenData = await exchangeCodeForToken(code);
        const discordUser = await fetchDiscordUser(tokenData.access_token);
        const allowed = await hasRecruiterRole(discordUser.id);

        if (!allowed) {
            return res.redirect('/admin?error=no_recruiter_role');
        }

        req.session.isAdmin = true;
        req.session.username = discordUser.username;
        req.session.discordUser = {
            id: discordUser.id,
            username: discordUser.username,
            globalName: discordUser.global_name || null,
            avatar: discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                : null
        };

        return res.redirect('/admin');
    } catch (error) {
        console.error('Discord OAuth callback error:', error);
        return res.redirect('/admin?error=oauth_failed');
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
    res.json({
        isAdmin: !!req.session.isAdmin,
        user: req.session.discordUser || null
    });
});

app.post('/api/login', (req, res) => {
    res.status(410).json({ error: 'Логин через пароль отключён. Используйте Discord OAuth.' });
});

// Подача заявок только через Discord
app.post('/api/apply', (req, res) => {
    res.status(403).json({
        error: 'Подача заявок через сайт отключена. Используйте Discord канал #подача-заявки.'
    });
});

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

app.put('/api/applications/:id/approve', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const application = db.getApplicationById(id);
        if (!application) return res.status(404).json({ error: 'Заявка не найдена' });
        if (['approved', 'rejected'].includes(application.status)) {
            return res.status(400).json({ error: 'Заявка уже обработана' });
        }

        db.updateApplicationStatus(id, 'approved', req.session.username || 'recruiter');
        const updatedApplication = db.getApplicationById(id);

        if (botInstance && updatedApplication.discord_id) {
            try {
                const user = await botInstance.users.fetch(updatedApplication.discord_id);
                await user.send(`🎉 Ваша заявка в ${config.family.name} одобрена.`);
            } catch (e) {
                console.log(`Не удалось отправить DM пользователю ${updatedApplication.discord_tag}`);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Ошибка при одобрении заявки' });
    }
});

app.put('/api/applications/:id/reject', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const application = db.getApplicationById(id);
        if (!application) return res.status(404).json({ error: 'Заявка не найдена' });
        if (['approved', 'rejected'].includes(application.status)) {
            return res.status(400).json({ error: 'Заявка уже обработана' });
        }

        db.updateApplicationStatus(id, 'rejected', req.session.username || 'recruiter');
        const updatedApplication = db.getApplicationById(id);

        if (botInstance && updatedApplication.discord_id) {
            try {
                const user = await botInstance.users.fetch(updatedApplication.discord_id);
                await user.send(`❌ Ваша заявка в ${config.family.name} отклонена.`);
            } catch (e) {
                console.log(`Не удалось отправить DM пользователю ${updatedApplication.discord_tag}`);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ error: 'Ошибка при отклонении заявки' });
    }
});

// Отправить стартовое сообщение "Подать заявку" в Discord из админки
app.post('/api/admin/publish-application-message', isAuthenticated, async (req, res) => {
    try {
        if (!botInstance) {
            return res.status(503).json({ error: 'Discord бот ещё не готов.' });
        }

        const channelId = String(config.discord.applicationChannelId || '');
        if (!channelId || channelId.includes('YOUR_APPLICATION_CHANNEL_ID')) {
            return res.status(400).json({ error: 'Не настроен applicationChannelId.' });
        }

        const channel = await botInstance.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) {
            return res.status(404).json({ error: 'Канал для публикации не найден.' });
        }

        const embed = new EmbedBuilder()
            .setTitle('Подать заявку')
            .setDescription(`Выберите сервер и заполните форму для вступления в ${config.family.name}.`)
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('apply_seattle')
                .setLabel('Подать заявку Seattle')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('apply_orlando')
                .setLabel('Подать заявку Orlando')
                .setStyle(ButtonStyle.Secondary)
        );

        const message = await channel.send({
            embeds: [embed],
            components: [row]
        });

        db.setSetting('application_message_id', message.id);
        res.json({ success: true, messageId: message.id });
    } catch (error) {
        console.error('Publish application message error:', error);
        res.status(500).json({ error: 'Не удалось отправить сообщение в Discord.' });
    }
});

app.get('/api/stats', isAuthenticated, (req, res) => {
    res.json(db.getStats());
});

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

app.get('/api/public/overview', async (req, res) => {
    try {
        const stats = db.getStats();
        const topRecruiters = db.getRecruitersTop(5);
        const roster = await getRecruiterRoster();
        res.json({
            familyName: config.family.name,
            inviteUrl: config.discord.inviteUrl,
            stats,
            topRecruiters,
            roster
        });
    } catch (error) {
        console.error('Public overview error:', error);
        res.status(500).json({ error: 'Ошибка получения публичной статистики' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`🌐 Веб-сервер запущен: http://localhost:${PORT}`);
    console.log(`📋 Панель администратора: http://localhost:${PORT}/admin`);
});
