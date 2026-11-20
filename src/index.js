import {
  ChannelType,
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { env, assertEnv } from './config/env.js';
import { theme } from './config/theme.js';
import { logger } from './lib/logger.js';
import { buildServer } from './builder/build.js';
import { registerAuditLogs } from './systems/audit.js';
import { registerInteractions } from './systems/interactions.js';
import { registerCommands } from './systems/commands.js';

const lockFile = path.join(env.dataDir, 'builder.lock');

function acquireLock() {
  if (process.env.SKIP_LOCK === 'true') return;
  fs.mkdirSync(env.dataDir, { recursive: true });
  try {
    const existing = Number(fs.readFileSync(lockFile, 'utf8'));
    if (existing && existing !== process.pid) {
      try {
        process.kill(existing, 0);
        throw new Error(`نسخة أخرى من البوت شغالة بالفعل (PID ${existing}). اقفلها الأول.`);
      } catch (err) {
        if (err.code !== 'ESRCH') throw err;
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  fs.writeFileSync(lockFile, String(process.pid));
}

function releaseLock() {
  if (process.env.SKIP_LOCK === 'true') return;
  try {
    if (fs.readFileSync(lockFile, 'utf8').trim() === String(process.pid)) fs.unlinkSync(lockFile);
  } catch {
    // lock already gone
  }
}

const LOG_CHANNEL_NAME = 'سجل-الإدارة';
const WELCOME_CHANNEL_NAME = 'الترحيب';
const CHANNEL_BY_NAME = {
  rules: 'قوانين',
  welcome: WELCOME_CHANNEL_NAME,
  logs: LOG_CHANNEL_NAME,
  join_logs: LOG_CHANNEL_NAME,
  leave_logs: LOG_CHANNEL_NAME,
  message_logs: LOG_CHANNEL_NAME,
  role_logs: LOG_CHANNEL_NAME,
  voice_logs: LOG_CHANNEL_NAME,
  mod_logs: LOG_CHANNEL_NAME,
  server_logs: LOG_CHANNEL_NAME,
  ticket_logs: LOG_CHANNEL_NAME,
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
    Partials.Reaction,
  ],
});

client.logger = logger;

let ctx = { client, guild: null, map: new Map(), roles: new Map() };

function resolveByChannelName(guild, key) {
  const name = CHANNEL_BY_NAME[key];
  if (!name) return null;
  return (
    guild.channels.cache.find((c) => c.name === name) ??
    guild.channels.cache.find((c) => c.name.includes(name.replace(/[^ء-ي]/g, ''))) ??
    null
  );
}

function logStats(stats) {
  const rows = [
    `القنوات: ${stats.channels}`,
    `الفئات: ${stats.categories}`,
    `الرتب: ${stats.roles}`,
    `المدة: ${stats.seconds} ثانية`,
  ];
  logger.banner('نتيجة البناء');
  for (const row of rows) logger.info(row);
}

client.once(Events.ClientReady, async () => {
  logger.banner(`${theme.brand.name} — ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(env.guildId).catch(() => null);
    if (!guild) throw new Error(`البوت مش موجود في السيرفر ${env.guildId} — تأكد من الآيدي والصلاحيات.`);

    await guild.members.fetchMe().catch(() => null);
    await guild.channels.fetch().catch(() => null);
    await guild.roles.fetch().catch(() => null);

    ctx.guild = guild;

    if (env.buildOnStart) {
      const result = await buildServer(client, env.guildId);
      ctx.map = result.channels;
      ctx.roles = result.roles;
      logStats(result.stats);
    } else {
      for (const role of guild.roles.cache.values()) {
        if (role.name === 'Developer') ctx.roles.set('founder', role);
        if (role.name === '🟢 عضو') ctx.roles.set('member', role);
        if (role.name === '⭐ عميل موثّق') ctx.roles.set('customer', role);
        if (role.name === '🤝 شريك') ctx.roles.set('partner', role);
        if (role.name === '🎮 صاحب سيرفر') ctx.roles.set('server_owner', role);
        if (role.name === '💙 صديق') ctx.roles.set('friend', role);
      }
      const { LAYOUT } = await import('./config/layout.js');
      for (const cat of LAYOUT) {
        const category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === cat.name);
        if (category) ctx.map.set(cat.key, category);
        for (const def of cat.channels ?? []) {
          const channel = guild.channels.cache.find((c) => c.name === def.name && c.parentId === category?.id);
          if (channel) ctx.map.set(def.key, channel);
        }
      }
      if (ctx.map.get('logs')) {
        for (const alias of ['join_logs', 'leave_logs', 'message_logs', 'role_logs', 'voice_logs', 'mod_logs', 'server_logs', 'ticket_logs']) {
          ctx.map.set(alias, ctx.map.get('logs'));
        }
      }
    }

    const resolveChannel = (key) => ctx.map.get(key) ?? resolveByChannelName(guild, key);
    registerAuditLogs(client, env.guildId, resolveChannel);

    client.on(Events.GuildMemberAdd, async (member) => {
      if (member.guild.id !== env.guildId || member.user.bot) return;
      const role = ctx.roles.get('member') ?? member.guild.roles.cache.get(process.env.MEMBER_ROLE_ID ?? '');
      if (!role) {
        logger.warn(`رتبة العضو مش موجودة — لم يتم منحها لـ ${member.user.tag}`);
        return;
      }
      try {
        await member.roles.add(role, 'auto member role');
      } catch (err) {
        logger.warn(`تعذر منح رتبة العضو الجديد ${member.user.tag}: ${err.message}`);
      }
    });
    logger.info(`رتبة العضو التلقائية مفعّلة: ${ctx.roles.get('member')?.id ?? process.env.MEMBER_ROLE_ID ?? 'غير محددة'}`);

    client.user.setPresence({
      activities: [{ name: theme.brand.name, type: ActivityType.Watching }],
      status: 'online',
    });

    logger.success('البوت جاهز وشغال');
  } catch (err) {
    logger.error('فشل تشغيل البوت', err);
  }
});

registerInteractions(client, () => ctx);
registerCommands(client, () => ctx);

client.on(Events.Error, (err) => logger.error('خطأ في العميل', err));
client.on(Events.Warn, (msg) => logger.warn(msg));

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));
process.on('uncaughtException', (err) => logger.error('Uncaught exception', err));

function shutdown(signal) {
  logger.warn(`استلام ${signal} — إيقاف البوت...`);
  try {
    client.destroy();
  } finally {
    releaseLock();
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  assertEnv();
  acquireLock();
} catch (err) {
  logger.error('تعذر بدء التشغيل', err);
  process.exit(1);
}

client.login(env.token).catch((err) => {
  logger.error('فشل تسجيل الدخول — تأكد من صحة التوكن', err);
  process.exit(1);
});
