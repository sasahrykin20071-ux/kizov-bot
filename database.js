const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const defaultDbPath = path.join(__dirname, 'data', 'database.sqlite');
const dbPath = process.env.DB_PATH || defaultDbPath;
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Инициализация таблиц
db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_tag TEXT NOT NULL,
        discord_id TEXT,
        game_nick TEXT,
        static_number TEXT,
        ooc_age TEXT,
        join_goal TEXT,
        heard_about TEXT,
        city TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        processed_by TEXT,
        private_channel_id TEXT,
        review_channel_id TEXT,
        review_message_id TEXT,
        log_channel_id TEXT,
        log_message_id TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
`);

// Миграции: добавляем недостающие колонки (если база уже создана)
const existingColumns = db.prepare(`PRAGMA table_info(applications)`).all().map(c => c.name);
const ensureColumn = (name, type) => {
    if (!existingColumns.includes(name)) {
        db.exec(`ALTER TABLE applications ADD COLUMN ${name} ${type}`);
    }
};
ensureColumn('game_nick', 'TEXT');
ensureColumn('static_number', 'TEXT');
ensureColumn('ooc_age', 'TEXT');
ensureColumn('join_goal', 'TEXT');
ensureColumn('heard_about', 'TEXT');
ensureColumn('city', 'TEXT');
ensureColumn('private_channel_id', 'TEXT');
ensureColumn('review_channel_id', 'TEXT');
ensureColumn('review_message_id', 'TEXT');
ensureColumn('log_channel_id', 'TEXT');
ensureColumn('log_message_id', 'TEXT');

// Подготовленные запросы для производительности
const queries = {
    // Заявки
    createApplication: db.prepare(`
        INSERT INTO applications (
            discord_tag,
            discord_id,
            game_nick,
            static_number,
            ooc_age,
            join_goal,
            heard_about,
            city,
            private_channel_id,
            review_channel_id,
            review_message_id,
            log_channel_id,
            log_message_id
        )
        VALUES (
            @discord_tag,
            @discord_id,
            @game_nick,
            @static_number,
            @ooc_age,
            @join_goal,
            @heard_about,
            @city,
            @private_channel_id,
            @review_channel_id,
            @review_message_id,
            @log_channel_id,
            @log_message_id
        )
    `),
    
    getApplications: db.prepare(`
        SELECT * FROM applications ORDER BY created_at DESC
    `),
    
    getApplicationById: db.prepare(`
        SELECT * FROM applications WHERE id = ?
    `),
    
    getApplicationByDiscordTag: db.prepare(`
        SELECT * FROM applications WHERE discord_tag = ? AND status = 'pending'
    `),

    getOpenApplicationByDiscordId: db.prepare(`
        SELECT * FROM applications
        WHERE discord_id = ? AND status IN ('pending', 'in_review', 'called')
        ORDER BY created_at DESC
        LIMIT 1
    `),
    
    updateApplicationStatus: db.prepare(`
        UPDATE applications 
        SET status = ?, processed_at = CURRENT_TIMESTAMP, processed_by = ?
        WHERE id = ?
    `),
    
    updateApplicationDiscordId: db.prepare(`
        UPDATE applications SET discord_id = ? WHERE id = ?
    `),

    updateApplicationChannels: db.prepare(`
        UPDATE applications
        SET
            private_channel_id = COALESCE(@private_channel_id, private_channel_id),
            review_channel_id = COALESCE(@review_channel_id, review_channel_id),
            review_message_id = COALESCE(@review_message_id, review_message_id),
            log_channel_id = COALESCE(@log_channel_id, log_channel_id),
            log_message_id = COALESCE(@log_message_id, log_message_id)
        WHERE id = @id
    `),
    
    // Статистика
    getStats: db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('pending', 'in_review', 'called') THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM applications
    `),

    // Настройки
    getSetting: db.prepare(`
        SELECT value FROM settings WHERE key = ?
    `),

    setSetting: db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)
};

module.exports = {
    db,
    
    // Создать заявку
    createApplication(data) {
        return queries.createApplication.run(data);
    },
    
    // Получить все заявки
    getApplications() {
        return queries.getApplications.all();
    },
    
    // Получить заявку по ID
    getApplicationById(id) {
        return queries.getApplicationById.get(id);
    },
    
    // Проверить существующую заявку
    getPendingApplicationByDiscordTag(discordTag) {
        return queries.getApplicationByDiscordTag.get(discordTag);
    },

    // Проверить открытую заявку по Discord ID
    getOpenApplicationByDiscordId(discordId) {
        return queries.getOpenApplicationByDiscordId.get(discordId);
    },
    
    // Обновить статус заявки
    updateApplicationStatus(id, status, processedBy) {
        return queries.updateApplicationStatus.run(status, processedBy, id);
    },
    
    // Сохранить Discord ID заявки
    updateApplicationDiscordId(id, discordId) {
        return queries.updateApplicationDiscordId.run(discordId, id);
    },

    // Сохранить ID каналов/сообщений
    updateApplicationChannels(data) {
        return queries.updateApplicationChannels.run(data);
    },
    
    // Получить статистику
    getStats() {
        return queries.getStats.get();
    },

    // Получить настройку
    getSetting(key) {
        const row = queries.getSetting.get(key);
        return row ? row.value : null;
    },

    // Сохранить настройку
    setSetting(key, value) {
        return queries.setSetting.run({ key, value: String(value) });
    }
};
