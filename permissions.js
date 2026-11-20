import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';

const EVERYONE = '@everyone';
const STAFF = ['founder'];
const LEADERSHIP = ['founder'];

function roleId(ctx, key) {
  const role = ctx?.roles instanceof Map ? ctx.roles.get(key) : ctx?.roles?.[key];
  return role?.id ?? null;
}

function roleEntries(ctx, keys, allow, deny = []) {
  const entries = [];
  for (const key of keys) {
    const id = roleId(ctx, key);
    if (!id) {
      logger.debug(`permissions: role "${key}" is missing from context, skipping overwrite`);
      continue;
    }
    entries.push({ id, allow: [...allow], deny: [...deny] });
  }
  return entries;
}

function botEntry(ctx, allow) {
  if (!ctx?.botId) {
    logger.debug('permissions: ctx.botId is missing, bot overwrite skipped');
    return [];
  }
  return [{ id: ctx.botId, allow: [...allow], deny: [] }];
}

function preset(entries) {
  return (ctx) => {
    const list = [{ id: EVERYONE, ...entries.everyone }];
    for (const item of entries.roles ?? []) {
      list.push(...roleEntries(ctx, item.keys, item.allow, item.deny ?? []));
    }
    list.push(...botEntry(ctx, entries.bot));
    return list;
  };
}

export const PRESETS = {
  public: preset({
    everyone: {
      allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'AttachFiles', 'EmbedLinks', 'UseExternalEmojis'],
      deny: [],
    },
    bot: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks', 'ManageMessages'],
  }),

  readOnly: preset({
    everyone: {
      allow: ['ViewChannel', 'ReadMessageHistory', 'AddReactions'],
      deny: ['SendMessages', 'CreatePublicThreads', 'CreatePrivateThreads', 'SendMessagesInThreads'],
    },
    roles: [{ keys: STAFF, allow: ['SendMessages', 'ManageMessages', 'EmbedLinks', 'AttachFiles'] }],
    bot: ['SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'ManageMessages'],
  }),

  staffOnly: preset({
    everyone: { allow: [], deny: ['ViewChannel'] },
    roles: [{ keys: STAFF, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles'] }],
    bot: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory'],
  }),

  logsOnly: preset({
    everyone: { allow: [], deny: ['ViewChannel'] },
    roles: [{ keys: LEADERSHIP, allow: ['ViewChannel', 'ReadMessageHistory'] }],
    bot: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'ManageMessages'],
  }),

  ticketPanel: preset({
    everyone: {
      allow: ['ViewChannel', 'ReadMessageHistory'],
      deny: ['SendMessages', 'CreatePublicThreads', 'CreatePrivateThreads', 'SendMessagesInThreads'],
    },
    roles: [{ keys: STAFF, allow: ['SendMessages', 'ManageMessages'] }],
    bot: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'ManageMessages', 'ManageChannels'],
  }),

  transcripts: preset({
    everyone: { allow: [], deny: ['ViewChannel'] },
    roles: [{ keys: STAFF, allow: ['ViewChannel', 'ReadMessageHistory'] }],
    bot: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory'],
  }),

  archive: preset({
    everyone: { allow: [], deny: ['ViewChannel'] },
    roles: [{ keys: STAFF, allow: ['ViewChannel', 'ReadMessageHistory'] }],
    bot: ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory'],
  }),

  voicePublic: preset({
    everyone: { allow: ['ViewChannel', 'Connect', 'Speak', 'Stream', 'UseVAD'], deny: [] },
    roles: [{ keys: STAFF, allow: ['MoveMembers', 'MuteMembers', 'DeafenMembers'] }],
    bot: ['ViewChannel', 'Connect', 'Speak', 'MoveMembers', 'MuteMembers'],
  }),

  voiceStaff: preset({
    everyone: { allow: [], deny: ['ViewChannel'] },
    roles: [{ keys: STAFF, allow: ['ViewChannel', 'Connect', 'Speak', 'MoveMembers', 'MuteMembers'] }],
    bot: ['ViewChannel', 'Connect', 'Speak', 'MoveMembers', 'MuteMembers'],
  }),

  forum: preset({
    everyone: {
      allow: ['ViewChannel', 'ReadMessageHistory', 'SendMessagesInThreads', 'CreatePublicThreads', 'AddReactions', 'AttachFiles', 'EmbedLinks', 'UseExternalEmojis'],
      deny: ['SendMessages'],
    },
    roles: [{ keys: STAFF, allow: ['SendMessages', 'ManageMessages', 'ManageThreads'] }],
    bot: ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'ManageThreads', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'ManageMessages'],
  }),

  ticketsCategory: preset({
    everyone: { allow: [], deny: ['ViewChannel'] },
    roles: [{ keys: STAFF, allow: ['ViewChannel'] }],
    bot: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'ManageMessages'],
  }),
};

export function toBits(names) {
  let bits = 0n;
  for (const name of names ?? []) {
    const bit = PermissionFlagsBits[name];
    if (typeof bit !== 'bigint') {
      logger.debug(`permissions: unknown PermissionFlagsBits entry "${name}", skipped`);
      continue;
    }
    bits |= bit;
  }
  return bits;
}

export function buildOverwrites(presetName, ctx) {
  const factory = PRESETS[presetName];
  if (typeof factory !== 'function') {
    throw new Error(`Unknown permission preset: "${presetName}"`);
  }

  const raw = factory(ctx);
  const merged = new Map();

  for (const item of raw) {
    const existing = merged.get(item.id);
    if (existing) {
      for (const name of item.allow) if (!existing.allow.includes(name)) existing.allow.push(name);
      for (const name of item.deny) if (!existing.deny.includes(name)) existing.deny.push(name);
      continue;
    }
    merged.set(item.id, { id: item.id, allow: [...item.allow], deny: [...item.deny] });
  }

  return Array.from(merged.values());
}
