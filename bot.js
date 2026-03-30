const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');
const config = require('./config');
const db = require('./database');
const server = require('./server');

// Создаём клиент Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// Привязываем бота к серверу
server.setBot(client);

const STATUS_TEXT = {
    pending: 'Ожидает',
    in_review: 'На рассмотрении',
    called: 'Вызван на обзвон',
    approved: 'Одобрена',
    rejected: 'Отклонена'
};

const STATUS_COLOR = {
    pending: 0xFEE75C,
    in_review: 0x5865F2,
    called: 0x3BA55C,
    approved: 0x3BA55C,
    rejected: 0xED4245
};

const getUserDisplay = (user) => {
    if (!user) return 'Неизвестно';
    return user.tag || user.username || user.id;
};

const hasStaffRole = (member) => {
    const staffRoles = config.discord.staffRoleIds || [];
    if (!member || !member.roles) return false;
    return staffRoles.some(roleId => member.roles.cache.has(roleId));
};

const buildApplyMessage = () => {
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

    return { embeds: [embed], components: [row] };
};

const buildApplicationEmbed = (application, user) => {
    const embed = new EmbedBuilder()
        .setTitle('Заявление')
        .setColor(STATUS_COLOR[application.status] || 0x5865F2)
        .addFields(
            { name: 'Сервер', value: application.city || '-', inline: true },
            { name: 'Ваш ник в игре', value: application.game_nick || '-', inline: true },
            { name: 'Статик #', value: application.static_number || '-', inline: true },
            { name: 'Возраст OOC', value: application.ooc_age || '-', inline: true },
            { name: 'Цель вступления', value: application.join_goal || '-', inline: false },
            { name: 'Как узнали о семье', value: application.heard_about || '-', inline: false },
            { name: 'Пользователь', value: user ? `<@${user.id}>` : '-', inline: true },
            { name: 'Username', value: user ? (user.username || '-') : '-', inline: true },
            { name: 'ID', value: user ? user.id : '-', inline: true }
        )
        .setFooter({ text: `Статус: ${STATUS_TEXT[application.status] || application.status}` })
        .setTimestamp(new Date(application.created_at || Date.now()));

    if (application.processed_by) {
        embed.addFields({ name: 'Кем обработано', value: application.processed_by, inline: true });
    }

    return embed;
};

const buildActionButtons = (applicationId, disabled = false) => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_accept_${applicationId}`)
            .setLabel('Принять')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`app_review_${applicationId}`)
            .setLabel('Взять на рассмотрение')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`app_call_${applicationId}`)
            .setLabel('Вызвать на обзвон')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`app_reject_${applicationId}`)
            .setLabel('Отклонить')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
};

const buildLogEmbed = (application, user, actionLabel) => {
    return new EmbedBuilder()
        .setTitle('Логи заявки')
        .setColor(STATUS_COLOR[application.status] || 0x5865F2)
        .addFields(
            { name: 'Сервер', value: application.city || '-', inline: true },
            { name: 'Ваш ник в игре', value: application.game_nick || '-', inline: true },
            { name: 'Статик #', value: application.static_number || '-', inline: true },
            { name: 'Возраст OOC', value: application.ooc_age || '-', inline: true },
            { name: 'Цель вступления', value: application.join_goal || '-', inline: false },
            { name: 'Как узнали о семье', value: application.heard_about || '-', inline: false },
            { name: 'Пользователь', value: user ? `<@${user.id}>` : '-', inline: true },
            { name: 'Username', value: user ? (user.username || '-') : '-', inline: true },
            { name: 'ID', value: user ? user.id : '-', inline: true }
        )
        .addFields(
            { name: 'Событие', value: actionLabel, inline: true },
            { name: 'Кто', value: application.processed_by || '-', inline: true }
        )
        .setTimestamp(new Date());
};

const ensureApplicationMessage = async () => {
    if (!config.discord.applicationChannelId) return;
    try {
        const channel = await client.channels.fetch(config.discord.applicationChannelId);
        if (!channel || channel.type !== ChannelType.GuildText) return;

        const existingId = db.getSetting('application_message_id');
        if (existingId) {
            try {
                const existingMessage = await channel.messages.fetch(existingId);
                if (existingMessage) return;
            } catch (e) {
                // Сообщение не найдено, создаём новое
            }
        }

        const message = await channel.send(buildApplyMessage());
        db.setSetting('application_message_id', message.id);
    } catch (error) {
        console.error('Ошибка отправки сообщения для заявок:', error);
    }
};

const createApplicationChannels = async (guild, user, applicationId) => {
    const overwrites = [
        {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel]
        }
    ];

    const staffRoles = config.discord.staffRoleIds || [];
    staffRoles.forEach(roleId => {
        overwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages
            ]
        });
    });

    const reviewChannel = await guild.channels.create({
        name: `заявка-${applicationId}-${user.username}`.toLowerCase().replace(/[^a-z0-9\-]+/gi, '-').slice(0, 90),
        type: ChannelType.GuildText,
        parent: config.discord.applicationCategoryId || null,
        permissionOverwrites: overwrites
    });

    let logChannel = null;
    if (config.discord.applicationLogCategoryId) {
        logChannel = await guild.channels.create({
            name: `log-${applicationId}-${user.username}`.toLowerCase().replace(/[^a-z0-9\-]+/gi, '-').slice(0, 90),
            type: ChannelType.GuildText,
            parent: config.discord.applicationLogCategoryId,
            permissionOverwrites: overwrites
        });
    }

    return { reviewChannel, logChannel };
};

const updateApplicationMessages = async (application, user) => {
    const embed = buildApplicationEmbed(application, user);
    const disableButtons = ['approved', 'rejected'].includes(application.status);
    const components = [buildActionButtons(application.id, disableButtons)];

    if (application.private_channel_id) {
        try {
            const channel = await client.channels.fetch(application.private_channel_id);
            if (channel && channel.isTextBased()) {
                const messages = await channel.messages.fetch({ limit: 10 });
                const target = messages.find(msg => msg.author.id === client.user.id);
                if (target) {
                    await target.edit({ embeds: [embed], components });
                }
            }
        } catch (e) {
            console.error('Ошибка обновления приватного канала:', e);
        }
    }

    if (application.review_channel_id && application.review_message_id) {
        try {
            const channel = await client.channels.fetch(application.review_channel_id);
            if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(application.review_message_id);
                if (message) {
                    await message.edit({ embeds: [embed], components });
                }
            }
        } catch (e) {
            console.error('Ошибка обновления сообщения в канале заявок:', e);
        }
    }
};

const sendLogUpdate = async (application, user, actionLabel) => {
    if (!application.log_channel_id) return;
    try {
        const channel = await client.channels.fetch(application.log_channel_id);
        if (!channel || !channel.isTextBased()) return;
        const embed = buildLogEmbed(application, user, actionLabel);
        const message = await channel.send({ embeds: [embed] });
        db.updateApplicationChannels({ id: application.id, log_message_id: message.id });

        if (['approved', 'rejected'].includes(application.status)) {
            if (config.discord.applicationLogArchiveCategoryId) {
                await channel.setParent(config.discord.applicationLogArchiveCategoryId);
            }
            const seconds = Number(config.discord.logAutoDeleteSeconds || 0);
            const hours = Number(config.discord.logAutoDeleteHours || 0);
            const deleteAfterMs = seconds > 0 ? seconds * 1000 : (hours > 0 ? hours * 60 * 60 * 1000 : 0);
            if (deleteAfterMs > 0) {
                setTimeout(() => {
                    channel.delete('Автоудаление логов заявки').catch(() => null);
                }, deleteAfterMs);
            }
        }
    } catch (e) {
        console.error('Ошибка логирования заявки:', e);
    }
};

client.on('ready', async () => {
    console.log(`🤖 Discord бот запущен: ${client.user.tag}`);
    await ensureApplicationMessage();
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            if (interaction.customId === 'apply_seattle' || interaction.customId === 'apply_orlando') {
                const city = interaction.customId === 'apply_seattle' ? 'Seattle' : 'Orlando';
                const modal = new ModalBuilder()
                    .setCustomId(`apply_modal_${city.toLowerCase()}`)
                    .setTitle('Подать заявку');

                const gameNick = new TextInputBuilder()
                    .setCustomId('game_nick')
                    .setLabel('Ваш ник в игре')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const staticNumber = new TextInputBuilder()
                    .setCustomId('static_number')
                    .setLabel('Статик #')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const oocAge = new TextInputBuilder()
                    .setCustomId('ooc_age')
                    .setLabel('Возраст OOC')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const joinGoal = new TextInputBuilder()
                    .setCustomId('join_goal')
                    .setLabel('Цель вступления')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const heardAbout = new TextInputBuilder()
                    .setCustomId('heard_about')
                    .setLabel('Как узнали о семье')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(gameNick),
                    new ActionRowBuilder().addComponents(staticNumber),
                    new ActionRowBuilder().addComponents(oocAge),
                    new ActionRowBuilder().addComponents(joinGoal),
                    new ActionRowBuilder().addComponents(heardAbout)
                );

                await interaction.showModal(modal);
                return;
            }

            if (interaction.customId.startsWith('app_')) {
                if (!interaction.member || !hasStaffRole(interaction.member)) {
                    await interaction.reply({ content: 'Недостаточно прав для этого действия.', ephemeral: true });
                    return;
                }

                const [_, action, appIdRaw] = interaction.customId.split('_');
                const applicationId = Number(appIdRaw);
                if (!applicationId) {
                    await interaction.reply({ content: 'Не удалось определить заявку.', ephemeral: true });
                    return;
                }

                const application = db.getApplicationById(applicationId);
                if (!application) {
                    await interaction.reply({ content: 'Заявка не найдена.', ephemeral: true });
                    return;
                }

                let newStatus = null;
                let actionLabel = '';
                if (action === 'accept') {
                    newStatus = 'approved';
                    actionLabel = 'Одобрена';
                } else if (action === 'review') {
                    newStatus = 'in_review';
                    actionLabel = 'Взята на рассмотрение';
                } else if (action === 'call') {
                    newStatus = 'called';
                    actionLabel = 'Вызван на обзвон';
                } else if (action === 'reject') {
                    newStatus = 'rejected';
                    actionLabel = 'Отклонена';
                }

                if (!newStatus) {
                    await interaction.reply({ content: 'Неизвестное действие.', ephemeral: true });
                    return;
                }

                if (application.status === newStatus) {
                    await interaction.reply({ content: 'Статус уже установлен.', ephemeral: true });
                    return;
                }

                const processedBy = getUserDisplay(interaction.user);
                db.updateApplicationStatus(applicationId, newStatus, processedBy);
                const updated = db.getApplicationById(applicationId);
                await updateApplicationMessages(updated, interaction.user);
                await sendLogUpdate(updated, interaction.user, actionLabel);

                await interaction.reply({ content: `Статус обновлён: ${STATUS_TEXT[newStatus]}`, ephemeral: true });
                return;
            }
        }

        if (interaction.isModalSubmit()) {
            if (!interaction.customId.startsWith('apply_modal_')) return;

            const city = interaction.customId.replace('apply_modal_', '');
            if (!interaction.guild) {
                await interaction.reply({ content: 'Заявки можно подавать только на сервере.', ephemeral: true });
                return;
            }

            const existing = db.getOpenApplicationByDiscordId(interaction.user.id);
            if (existing) {
                await interaction.reply({ content: 'У вас уже есть активная заявка.', ephemeral: true });
                return;
            }

            const applicationData = {
                discord_tag: getUserDisplay(interaction.user),
                discord_id: interaction.user.id,
                game_nick: interaction.fields.getTextInputValue('game_nick'),
                static_number: interaction.fields.getTextInputValue('static_number'),
                ooc_age: interaction.fields.getTextInputValue('ooc_age'),
                join_goal: interaction.fields.getTextInputValue('join_goal'),
                heard_about: interaction.fields.getTextInputValue('heard_about'),
                city: city.charAt(0).toUpperCase() + city.slice(1),
                private_channel_id: null,
                review_channel_id: null,
                review_message_id: null,
                log_channel_id: null,
                log_message_id: null
            };

            const insert = db.createApplication(applicationData);
            const applicationId = insert.lastInsertRowid;

            const { reviewChannel, logChannel } = await createApplicationChannels(
                interaction.guild,
                interaction.user,
                applicationId
            );

            const application = db.getApplicationById(applicationId);
            const embed = buildApplicationEmbed(application, interaction.user);
            const components = [buildActionButtons(applicationId)];

            const reviewMessage = await reviewChannel.send({ embeds: [embed], components });

            db.updateApplicationChannels({
                id: applicationId,
                private_channel_id: reviewChannel.id,
                review_channel_id: reviewChannel.id,
                review_message_id: reviewMessage.id,
                log_channel_id: logChannel ? logChannel.id : null,
                log_message_id: null
            });

            await sendLogUpdate(
                db.getApplicationById(applicationId),
                interaction.user,
                'Создана новая заявка'
            );

            await interaction.reply({ content: 'Заявка принята. Ожидайте решения администрации.', ephemeral: true });
        }
    } catch (error) {
        console.error('Interaction error:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Произошла ошибка при обработке.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Произошла ошибка при обработке.', ephemeral: true });
        }
    }
});

// Событие: новый участник присоединился
client.on('guildMemberAdd', async (member) => {
    console.log(`[УЧАСТНИК] Присоединился: ${member.user.tag}`);
    if (config.discord.logChannelId) {
        const channel = member.guild.channels.cache.get(config.discord.logChannelId);
        if (channel) {
            channel.send({
                embeds: [{
                    title: '👋 Новый участник',
                    description: `${member.user} (${member.user.tag}) присоединился к серверу`,
                    color: 0x3BA55C,
                    timestamp: new Date()
                }]
            });
        }
    }
});

// Событие: участник ушёл
client.on('guildMemberRemove', async (member) => {
    console.log(`[УЧАСТНИК] Покинул: ${member.user.tag}`);
    if (config.discord.logChannelId) {
        const channel = member.guild.channels.cache.get(config.discord.logChannelId);
        if (channel) {
            channel.send({
                embeds: [{
                    title: '👋 Участник ушёл',
                    description: `${member.user} (${member.user.tag}) покинул сервер`,
                    color: 0xED4245,
                    timestamp: new Date()
                }]
            });
        }
    }
});

// Авторизация и запуск
client.login(config.discord.token).catch(error => {
    console.error('❌ Ошибка авторизации Discord бота:');
    console.error('   Проверьте токен в config.js');
    process.exit(1);
});

// Обработка ошибок
process.on('unhandledRejection', (error) => {
    console.error('Необработанная ошибка:', error);
});
