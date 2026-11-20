import { AuditLogEvent, Events } from 'discord.js';
import { logger } from '../lib/logger.js';

const MESSAGE_CACHE_LIMIT = 200;
const AUDIT_TOLERANCE_MS = 1500;

const messageCache = new Map();

function cacheFor(guildId) {
  if (!messageCache.has(guildId)) messageCache.set(guildId, new Map());
  return messageCache.get(guildId);
}

function rememberMessage(message) {
  if (!message.guild || message.author?.bot) return;
  const cache = cacheFor(message.guild.id);
  cache.set(message.id, {
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content ?? '',
    channelId: message.channelId,
    attachments: message.attachments?.size ?? 0,
    createdTimestamp: message.createdTimestamp,
  });
  while (cache.size > MESSAGE_CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
}

function snip(text, max = 1000) {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function resolveExecutor(guild, type, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const entry = logs.entries.find(
      (item) => item.targetId === String(targetId) && Date.now() - item.createdTimestamp < AUDIT_TOLERANCE_MS,
    );
    return entry?.executor ?? null;
  } catch (err) {
    logger.debug(`audit log fetch failed (${type}): ${err.message}`);
    return null;
  }
}

export function registerAuditLogs(client, guildId, resolveChannel) {
  const sendLog = (key, lines) => {
    const channel = resolveChannel(key) ?? resolveChannel('logs');
    if (!channel || typeof channel.send !== 'function') return;
    const content = lines.filter((line) => line && line !== '—').join('\n');
    channel.send({ content, allowedMentions: { parse: [] } }).catch((err) => {
      logger.warn(`audit log send failed (${key}): ${err.message}`);
    });
  };

  const executorLine = (executor) => (executor ? `**المنفذ:** ${executor.tag}` : null);

  const isTargetGuild = (guild) => guild?.id === guildId;
  const isBot = (user) => Boolean(user?.bot && user?.id === client.user?.id);

  client.on(Events.MessageCreate, (message) => rememberMessage(message));

  client.on(Events.MessageUpdate, (_old, newMessage) => rememberMessage(newMessage));

  client.on(Events.GuildMemberAdd, async (member) => {
    if (!isTargetGuild(member.guild) || isBot(member.user)) return;
    const executor = await resolveExecutor(member.guild, AuditLogEvent.MemberAdd, member.id);
    saveMemberName(member);
    const welcome =
      resolveChannel('welcome') ??
      member.guild.channels.cache.find((c) => c.name.includes('الترحيب')) ??
      member.guild.systemChannel ??
      null;
    const rulesChannel =
      resolveChannel('rules') ??
      member.guild.channels.cache.find((c) => c.name === 'قوانين') ??
      null;

    if (welcome && typeof welcome.send === 'function') {
      try {
        await welcome.send(welcomePanel(member, rulesChannel));
      } catch (err) {
        logger.warn(`welcome send failed (${welcome.name}): ${err.message}`);
      }
    } else {
      logger.warn(`قناة الترحيب غير موجودة — لم يتم إرسال ترحيب ${member.user.tag}`);
    }
    sendLog('join_logs', [
      '**[JOIN] عضو جديد**',
      `<@${member.id}> انضم إلى السيرفر`,
      `**الحساب:** ${member.user.tag}`,
      `**عمر الحساب:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      `**عدد الأعضاء:** ${member.guild.memberCount}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (!isTargetGuild(member.guild) || isBot(member.user)) return;
    const executor = await resolveExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    const name = knownTag(member.id) ?? member.user?.tag ?? 'غير معروف';
    sendLog('leave_logs', [
      '**[LEAVE] عضو غادر**',
      `<@${member.id}> غادر السيرفر`,
      `**الحساب:** ${name}`,
      `**انضم:** ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'غير معروف'}`,
      `**عدد الأعضاء:** ${member.guild.memberCount}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (!isTargetGuild(newMember.guild) || isBot(newMember.user)) return;

    const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    const nickChanged = oldMember.nickname !== newMember.nickname;
    const timeoutChanged =
      oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp;

    if (added.size || removed.size) {
      const executor = await resolveExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
      sendLog('role_logs', [
        '**[ROLES] تعديل رتب**',
        `<@${newMember.id}>`,
        `**رتب أُضيفت:** ${added.size ? added.map((r) => `<@&${r.id}>`).join(' ') : '—'}`,
        `**رتب أُزيلت:** ${removed.size ? removed.map((r) => `<@&${r.id}>`).join(' ') : '—'}`,
        executorLine(executor),
      ]);
    }

    if (nickChanged) {
      const executor = await resolveExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
      sendLog('role_logs', [
        '**[NICK] تغيير الاسم المستعار**',
        `<@${newMember.id}>`,
        `**قبل:** ${oldMember.nickname ?? 'بدون'}`,
        `**بعد:** ${newMember.nickname ?? 'بدون'}`,
        executorLine(executor),
      ]);
    }

    if (timeoutChanged) {
      const executor = await resolveExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
      const until = newMember.communicationDisabledUntilTimestamp;
      sendLog('mod_logs', [
        '**[TIMEOUT] تايم أوت**',
        `<@${newMember.id}>`,
        until ? `**ينتهي في:** <t:${Math.floor(until / 1000)}:F>` : '**الحالة:** تم رفع التايم أوت',
        executorLine(executor),
      ]);
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild || !isTargetGuild(message.guild) || isBot(message.author)) return;
    const cached = cacheFor(message.guild.id).get(message.id);
    const executor = await resolveExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
    sendLog('message_logs', [
      '**[MSG-DELETE] رسالة محذوفة**',
      `<#${message.channelId}> — <@${message.author?.id}>`,
      `**الكاتب:** ${cached?.authorTag ?? message.author?.tag ?? 'غير معروف'}`,
      `**المحتوى:** ${snip(cached?.content || message.content || '(غير متاح)')}`,
      executorLine(executor),
    ]);
    cacheFor(message.guild.id).delete(message.id);
  });

  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guild || !isTargetGuild(newMessage.guild) || isBot(newMessage.author)) return;
    const before = oldMessage.content ?? cacheFor(newMessage.guild.id).get(newMessage.id)?.content ?? '';
    const after = newMessage.content ?? '';
    if (before === after) return;
    const executor = await resolveExecutor(newMessage.guild, AuditLogEvent.MessageEdit, newMessage.author?.id);
    sendLog('message_logs', [
      '**[MSG-EDIT] رسالة معدّلة**',
      `<#${newMessage.channelId}> — <@${newMessage.author?.id}>`,
      `**قبل:** ${snip(before || '(غير متاح)')}`,
      `**بعد:** ${snip(after || '(غير متاح)')}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    if (!channel.guild || !isTargetGuild(channel.guild)) return;
    const executor = await resolveExecutor(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id);
    sendLog('message_logs', [
      '**[MSG-PURGE] حذف جماعي للرسائل**',
      `<#${channel.id}>`,
      `**عدد الرسائل:** ${messages.size}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.RoleCreate, async (role) => {
    if (!isTargetGuild(role.guild)) return;
    const executor = await resolveExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    sendLog('role_logs', [
      '**[ROLE-CREATE] رتبة جديدة**',
      `<@&${role.id}>`,
      `**الاسم:** ${role.name}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.RoleUpdate, async (oldRole, newRole) => {
    if (!isTargetGuild(newRole.guild)) return;
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`**الاسم:** ${oldRole.name} ← ${newRole.name}`);
    if (oldRole.hexColor !== newRole.hexColor) changes.push(`**اللون:** ${oldRole.hexColor} ← ${newRole.hexColor}`);
    if (oldRole.hoist !== newRole.hoist) changes.push(`**عرض منفصل:** ${oldRole.hoist} ← ${newRole.hoist}`);
    if (!changes.length) return;
    const executor = await resolveExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    sendLog('role_logs', [
      '**[ROLE-EDIT] تعديل رتبة**',
      `<@&${newRole.id}>`,
      ...changes,
      executorLine(executor),
    ]);
  });

  client.on(Events.RoleDelete, async (role) => {
    if (!isTargetGuild(role.guild)) return;
    const executor = await resolveExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    sendLog('role_logs', [
      '**[ROLE-DELETE] حذف رتبة**',
      `**${role.name}**`,
      executorLine(executor),
    ]);
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const guild = newState.guild ?? oldState.guild;
    if (!isTargetGuild(guild)) return;
    const member = newState.member ?? oldState.member;
    if (!member || isBot(member.user)) return;

    const lines = [`<@${member.id}>`];
    if (!oldState.channelId && newState.channelId) lines.push(`**دخل:** <#${newState.channelId}>`);
    else if (oldState.channelId && !newState.channelId) lines.push(`**خرج من:** <#${oldState.channelId}>`);
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      lines.push(`**تحويل:** <#${oldState.channelId}> ← <#${newState.channelId}>`);
    }
    if (oldState.serverMute !== newState.serverMute) lines.push(`**كتم إداري:** ${newState.serverMute ? 'مفعّل' : 'مرفوع'}`);
    if (oldState.selfMute !== newState.selfMute) lines.push(`**كتم ذاتي:** ${newState.selfMute ? 'مفعّل' : 'مرفوع'}`);
    if (oldState.serverDeaf !== newState.serverDeaf) lines.push(`**طرش إداري:** ${newState.serverDeaf ? 'مفعّل' : 'مرفوع'}`);
    if (oldState.selfDeaf !== newState.selfDeaf) lines.push(`**طرش ذاتي:** ${newState.selfDeaf ? 'مفعّل' : 'مرفوع'}`);
    if (oldState.streaming !== newState.streaming) lines.push(`**بث:** ${newState.streaming ? 'بدأ' : 'انتهى'}`);
    if (oldState.selfVideo !== newState.selfVideo) lines.push(`**كاميرا:** ${newState.selfVideo ? 'مفعّلة' : 'مغلقة'}`);

    const executor = await resolveExecutor(guild, AuditLogEvent.MemberMove, member.id);
    const kind = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId ? '[VOICE] تحويل' : '[VOICE] نشاط صوتي';
    sendLog('voice_logs', [kind, ...lines, executorLine(executor)]);
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    if (!isTargetGuild(ban.guild)) return;
    const executor = await resolveExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    sendLog('mod_logs', [
      '**[BAN] حظر عضو**',
      `<@${ban.user.id}>`,
      `**السبب:** ${snip(ban.reason || 'غير مذكور')}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.GuildBanRemove, async (ban) => {
    if (!isTargetGuild(ban.guild)) return;
    const executor = await resolveExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    sendLog('mod_logs', [
      '**[UNBAN] رفع حظر**',
      `<@${ban.user.id}>`,
      executorLine(executor),
    ]);
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!isTargetGuild(channel.guild)) return;
    const executor = await resolveExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    sendLog('server_logs', [
      '**[CHANNEL-CREATE] قناة جديدة**',
      `<#${channel.id}>`,
      `**النوع:** ${channel.type}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
    if (!isTargetGuild(newChannel.guild)) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`**الاسم:** ${oldChannel.name} ← ${newChannel.name}`);
    if (oldChannel.parentId !== newChannel.parentId) changes.push(`**التصنيف:** ${oldChannel.parentId ?? 'بدون'} ← ${newChannel.parentId ?? 'بدون'}`);
    if (oldChannel.topic !== newChannel.topic) changes.push(`**الوصف:** ${snip(`${oldChannel.topic ?? '—'} ← ${newChannel.topic ?? '—'}`)}`);
    if (!changes.length) return;
    const executor = await resolveExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    sendLog('server_logs', [
      '**[CHANNEL-EDIT] تعديل قناة**',
      `<#${newChannel.id}>`,
      ...changes,
      executorLine(executor),
    ]);
  });

  client.on(Events.ChannelDelete, async (channel) => {
    if (!isTargetGuild(channel.guild)) return;
    const executor = await resolveExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    sendLog('server_logs', [
      '**[CHANNEL-DELETE] حذف قناة**',
      `**${channel.name}**`,
      `**النوع:** ${channel.type}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.ThreadCreate, async (thread) => {
    if (!isTargetGuild(thread.guild)) return;
    const executor = await resolveExecutor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
    sendLog('server_logs', [
      '**[THREAD] ثريد جديد**',
      `<#${thread.id}>`,
      `**القناة:** <#${thread.parentId}>`,
      executorLine(executor),
    ]);
  });

  client.on(Events.ThreadDelete, async (thread) => {
    if (!isTargetGuild(thread.guild)) return;
    const executor = await resolveExecutor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
    sendLog('server_logs', ['**[THREAD-DELETE] حذف ثريد**', `**${thread.name}**`, executorLine(executor)]);
  });

  client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    if (!isTargetGuild(newGuild)) return;
    const changes = [];
    if (oldGuild.name !== newGuild.name) changes.push(`**الاسم:** ${oldGuild.name} ← ${newGuild.name}`);
    if (oldGuild.icon !== newGuild.icon) changes.push('**الأيقونة:** تم التعديل');
    if (!changes.length) return;
    const executor = await resolveExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
    sendLog('server_logs', ['**[GUILD] تعديل السيرفر**', ...changes, executorLine(executor)]);
  });

  client.on(Events.EmojiCreate, async (emoji) => {
    if (!isTargetGuild(emoji.guild)) return;
    const executor = await resolveExecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
    sendLog('server_logs', ['**[EMOJI] إيموجي جديد**', `${emoji} \`${emoji.name}\``, executorLine(executor)]);
  });

  client.on(Events.EmojiDelete, async (emoji) => {
    if (!isTargetGuild(emoji.guild)) return;
    const executor = await resolveExecutor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
    sendLog('server_logs', ['**[EMOJI-DELETE] حذف إيموجي**', `\`${emoji.name}\``, executorLine(executor)]);
  });

  client.on(Events.WebhookUpdate, async (channel) => {
    if (!isTargetGuild(channel.guild)) return;
    const executor = await resolveExecutor(channel.guild, AuditLogEvent.WebhookUpdate, channel.id);
    sendLog('server_logs', ['**[WEBHOOK] تحديث Webhook**', `<#${channel.id}>`, executorLine(executor)]);
  });

  client.on(Events.InviteCreate, async (invite) => {
    if (!isTargetGuild(invite.guild)) return;
    const executor = await resolveExecutor(invite.guild, AuditLogEvent.InviteCreate, invite.channel?.id);
    sendLog('server_logs', [
      '**[INVITE] دعوة جديدة**',
      `**الكود:** ${invite.code}`,
      `**القناة:** ${invite.channel ? `<#${invite.channel.id}>` : 'غير معروف'}`,
      `**الحد الأقصى:** ${invite.maxUses ?? 0}`,
      executorLine(executor),
    ]);
  });

  client.on(Events.InviteDelete, async (invite) => {
    if (!isTargetGuild(invite.guild)) return;
    const executor = await resolveExecutor(invite.guild, AuditLogEvent.InviteDelete, invite.channel?.id);
    sendLog('server_logs', ['**[INVITE-DELETE] حذف دعوة**', `**الكود:** ${invite.code}`, executorLine(executor)]);
  });

  logger.success(`Audit logs registered for guild ${guildId}`);
}

const WELCOME_RULES = [
  'احترم كل الأعضاء — بدون سب أو تنمر.',
  'ممنوع السبام أو المنشن الجماعي.',
  'الروابط الخارجية تحتاج موافقة الإدارة.',
  'ممنوع نشر أو بيع أي ملفات مسروقة.',
];

function welcomeMessage(member) {
  const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
  const joined = member.guild.memberCount;
  const accountTag = ageDays < 7 ? 'حساب جديد' : `منذ ${ageDays} يوم`;

  return [
    '```',
    '          NINE ELEVEN STORE',
    '```',
    `# مرحباً ${member.user.username}`,
    `> أنت العضو رقم **${joined}** في المتجر.`,
    '',
    '**ابدأ من هنا**',
    '`01` اقرأ الإعلانات في قناة الإعلانات.',
    '`02` استكشف المنتجات من خلال قناة افتح تذكرة.',
    '`03` عرّفنا بنفسك في الدردشة العامة.',
    '',
    '**القواعد السريعة**',
    ...WELCOME_RULES.map((rule, index) => `\`${String(index + 1).padStart(2, '0')}\` ${rule}`),
    '',
    `-# ${accountTag} • ${new Date(member.joinedTimestamp ?? Date.now()).toLocaleDateString('ar-EG')}`,
  ].join('\n');
}

function welcomePanel(member, rulesChannel) {
  const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
  const accountTag = ageDays < 7 ? 'حساب جديد' : `منذ ${ageDays} يوم`;
  const joined = member.guild.memberCount;
  const date = new Date(member.joinedTimestamp ?? Date.now()).toLocaleDateString('ar-EG');

  const content = [
    `# أهلاً ${member.user.username}`,
    'Nine Eleven Store — متجر سكربتات وأنظمة FiveM',
    '',
    `> <@${member.id}> نورت المتجر، إنت العضو رقم **${joined}**.`,
    '',
    '## بيانات الحساب',
    `**العضوية** — ${joined}`,
    `**عمر الحساب** — ${accountTag}`,
    `**تاريخ الانضمام** — ${date}`,
    '',
    '## ابدأ من هنا',
    rulesChannel ? `**1** — اقرأ <#${rulesChannel.id}> قبل أي حاجة` : '**1** — اقرأ قناة القوانين قبل أي حاجة',
    '**2** — تابع الإعلانات والجديد',
    '**3** — افتح تذكرة لو محتاج منتج أو دعم',
    '**4** — شارك في الدردشة العامة',
    '',
    '## القواعد السريعة',
    '**1** — احترام متبادل، ممنوع السب',
    '**2** — ممنوع السبام والروابط الخارجية',
    '**3** — ممنوع نشر أو بيع أي ملفات مسروقة',
    '',
    '-# Nine Eleven Store • بالتوفيق',
  ].join('\n');

  return { content, allowedMentions: { parse: [], users: [member.id] } };
}

const knownNames = new Map();

function saveMemberName(member) {
  knownNames.set(member.id, member.user?.tag ?? member.user?.username ?? 'غير معروف');
}

function knownTag(id) {
  return knownNames.get(id) ?? null;
}
