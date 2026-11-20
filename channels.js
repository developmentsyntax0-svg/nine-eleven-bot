import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { buildOverwrites } from '../lib/permissions.js';
import { FORUM_TAGS, LAYOUT } from '../config/layout.js';

const TYPE = {
  text: ChannelType.GuildText,
  forum: ChannelType.GuildForum,
  voice: ChannelType.GuildVoice,
};

const CATS = LAYOUT.map((cat) => ({ key: cat.key, name: cat.name, preset: cat.preset }));

const CHANNELS = LAYOUT.flatMap((cat) =>
  (cat.channels ?? []).map((ch) => ({
    key: ch.key,
    name: ch.name,
    type: TYPE[ch.type] ?? ChannelType.GuildText,
    preset: ch.preset,
    cat: cat.key,
    forum: ch.type === 'forum',
  })),
);

const LOG_ALIASES = {
  join_logs: 'logs',
  leave_logs: 'logs',
  message_logs: 'logs',
  role_logs: 'logs',
  voice_logs: 'logs',
  mod_logs: 'logs',
  server_logs: 'logs',
  ticket_logs: 'logs',
};

function serializeOverwrites(rows, guild) {
  return rows.map(({ id, allow, deny }) => ({
    id: id === '@everyone' ? guild.roles.everyone.id : id,
    allow: allow.map((name) => PermissionFlagsBits[name]),
    deny: deny.map((name) => PermissionFlagsBits[name]),
  }));
}

async function upsertChannel(guild, def, parent, overwrites, logger) {
  const existing = guild.channels.cache.find(
    (ch) => ch.name === def.name && ch.parentId === parent.id,
  );
  const payload = {
    name: def.name,
    parent: parent.id,
    lockPermissions: false,
    permissionOverwrites: overwrites,
    reason: 'nine-eleven-store channels',
  };

  if (def.type === ChannelType.GuildForum) {
    payload.defaultForumLayout = 1;
    payload.defaultThreadRateLimitPerUser = 300;
    payload.availableTags = FORUM_TAGS.map((name) => ({ name }));
  } else if (def.type === ChannelType.GuildText) {
    payload.rateLimitPerUser = 3;
    payload.defaultThreadRateLimitPerUser = 300;
  }

  if (existing) {
    try {
      return await existing.edit(payload);
    } catch (err) {
      logger.warn(`تعذر تحديث القناة ${def.name}: ${err.message}`);
      return existing;
    }
  }

  try {
    return await guild.channels.create({ ...payload, type: def.type });
  } catch (err) {
    logger.warn(`تعذر إنشاء القناة ${def.name}: ${err.message}`);
    return null;
  }
}

export async function buildChannels(guild, roles, logger) {
  const ctx = { guild, roles, botId: guild.members.me.id };
  const map = new Map();

  for (const cat of CATS) {
    const overwrites = serializeOverwrites(buildOverwrites(cat.preset, ctx), guild);
    const existing = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name === cat.name,
    );
    const payload = {
      name: cat.name,
      type: ChannelType.GuildCategory,
      reason: 'nine-eleven-store categories',
    };
    if (overwrites.length > 0) payload.permissionOverwrites = overwrites;

    let category = existing;
    if (existing) {
      try {
        category = await existing.edit(payload);
      } catch (err) {
        logger.warn(`تعذر تحديث التصنيف ${cat.name}: ${err.message}`);
      }
    } else {
      try {
        category = await guild.channels.create(payload);
      } catch (err) {
        logger.warn(`تعذر إنشاء التصنيف ${cat.name}: ${err.message}`);
      }
    }
    if (category) map.set(cat.key, category);
  }

  for (const def of CHANNELS) {
    const parent = map.get(def.cat);
    if (!parent) {
      logger.warn(`تصنيف ${def.cat} مفقود، تم تخطي قناة ${def.name}`);
      continue;
    }
    const overwrites = serializeOverwrites(buildOverwrites(def.preset, ctx), guild);
    const channel = await upsertChannel(guild, def, parent, overwrites, logger);
    if (!channel) continue;
    map.set(def.key, channel);
    if (def.key === 'logs') {
      for (const alias of Object.keys(LOG_ALIASES)) map.set(alias, channel);
    }
  }

  const positions = [];
  CATS.forEach((cat, catIndex) => {
    const category = map.get(cat.key);
    if (!category) return;
    positions.push({ channel: category.id, position: catIndex });
    let childIndex = 0;
    for (const def of CHANNELS.filter((item) => item.cat === cat.key)) {
      const channel = map.get(def.key);
      if (!channel) continue;
      positions.push({ channel: channel.id, position: childIndex++ });
    }
  });

  if (positions.length > 1) {
    try {
      await guild.channels.setPositions(positions);
    } catch (err) {
      logger.warn(`تعذر ترتيب القنوات: ${err.message}`);
    }
  }

  return map;
}
