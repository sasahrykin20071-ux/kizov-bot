module.exports = {
    // Discord настройки
    discord: {
        token: process.env.DISCORD_BOT_TOKEN || 'YOUR_DISCORD_BOT_TOKEN',
        guildId: process.env.DISCORD_GUILD_ID || 'YOUR_GUILD_ID',
        clientId: process.env.DISCORD_CLIENT_ID || 'YOUR_DISCORD_CLIENT_ID',
        clientSecret: process.env.DISCORD_CLIENT_SECRET || 'YOUR_DISCORD_CLIENT_SECRET',
        redirectUri: process.env.DISCORD_REDIRECT_URI || 'https://your-domain.up.railway.app/api/auth/discord/callback',
        inviteUrl: process.env.DISCORD_INVITE_URL || 'https://discord.gg/your-invite',
        familyRoleId: process.env.FAMILY_ROLE_ID || 'YOUR_FAMILY_ROLE_ID',
        logChannelId: process.env.LOG_CHANNEL_ID || 'YOUR_LOG_CHANNEL_ID',
        applicationChannelId: '1455982436323168286',
        applicationReviewChannelId: '',
        applicationCategoryId: '',
        applicationLogCategoryId: '1467906915370532914',
        applicationLogArchiveCategoryId: '1467906915370532914',
        staffRoleIds: [
            '1455967192226201704',
            '1455967233799880859',
            '1455967689007697930'
        ],
        logAutoDeleteHours: 0,
        logAutoDeleteSeconds: 8
    },
    
    // Веб-сервер
    server: {
        port: Number(process.env.PORT || 3000),
        sessionSecret: process.env.SESSION_SECRET || 'change-this-to-random-secret-string'
    },
    
    // Администратор
    admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        // Рекомендуется задавать ADMIN_PASSWORD в переменных Railway
        password: process.env.ADMIN_PASSWORD || '',
        // Альтернатива: bcrypt hash в ADMIN_PASSWORD_HASH
        passwordHash: process.env.ADMIN_PASSWORD_HASH || ''
    },
    
    // Семья (название)
    family: {
        name: 'Kizov FAMQ'
    }
};
