import { PermissionFlagsBits } from 'discord.js';
import { runSequential } from '../lib/queue.js';

const P = PermissionFlagsBits;

const EVERYONE_PERMS = [
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.AddReactions,
  P.UseExternalEmojis,
  P.EmbedLinks,
  P.AttachFiles,
  P.Connect,
  P.Speak,
  P.UseApplicationCommands,
  P.ChangeNickname,
];

const ROLE_DEFS = [
  { key: 'friend', name: '💙 صديق', color: 0x5dade2, hoist: false, perms: [P.Connect, P.Speak] },
  { key: 'server_owner', name: '🎮 صاحب سيرفر', color: 0xe67e22, hoist: false, perms: [] },
  { key: 'member', name: '🟢 عضو', color: 0x2ecc71, hoist: false, perms: [P.ChangeNickname] },
  { key: 'customer', name: '⭐ عميل موثّق', color: 0xf1c40f, hoist: true, perms: [P.ChangeNickname, P.AttachFiles] },
  { key: 'partner', name: '🤝 شريك', color: 0x9b59b6, hoist: true, perms: [P.ChangeNickname] },
  { key: 'founder', name: 'Developer', color: 0xc9a227, hoist: true, perms: [P.Administrator] },
];

function botCeiling(guild) {
  return guild.members.me?.roles?.highest?.position ?? 0;
}

async function liftBotRole(guild, logger) {
  const me = guild.members.me;
  if (!me) return;
  const botRole = me.roles.highest;
  const highest = Math.max(0, ...[...guild.roles.cache.values()].map((r) => r.position));
  if (botRole.position >= highest) return;

  for (let target = highest; target > botRole.position; target -= 1) {
    try {
      await botRole.setPosition(target, 'fivem-solutions lift bot role for full wipe');
      await guild.roles.fetch();
      logger.info(`تم رفع رتبة البوت إلى ${target}`);
      return;
    } catch (err) {
      logger.debug(`رفع رتبة البوت إلى ${target} فشل: ${err.message}`);
    }
  }
  logger.warn('تعذر رفع رتبة البوت تلقائياً — اسحبها لأعلى القائمة يدوياً لحذف الرتب الأعلى.');
}

async function purgeRoles(guild, logger) {
  const ceiling = botCeiling(guild);
  const botRoleId = guild.members.me?.roles?.highest?.id;
  const doomed = [...guild.roles.cache.values()].filter(
    (role) => role.id !== guild.id && !role.managed && role.id !== botRoleId && role.position < ceiling,
  );

  let removed = 0;
  await runSequential(
    doomed,
    async (role) => {
      try {
        await role.delete('fivem-solutions full role wipe');
        removed += 1;
      } catch (err) {
        logger.warn(`تعذر حذف الرتبة ${role.name}: ${err.message}`);
      }
    },
    300,
  );

  const skipped = [...guild.roles.cache.values()].filter(
    (role) => role.id !== guild.id && !role.managed && role.position >= ceiling,
  );
  for (const role of skipped) {
    logger.warn(`الرتبة ${role.name} أعلى من رتبة البوت — اسحب رتبة البوت فوقها لحذفها.`);
  }

  logger.info(`تم حذف ${removed} رتبة قديمة`);
  await guild.roles.fetch().catch(() => null);
  return removed;
}

async function createRole(guild, def, logger) {
  try {
    return await guild.roles.create({
      name: def.name,
      colors: { primaryColor: def.color },
      hoist: def.hoist,
      permissions: def.perms,
      reason: 'fivem-solutions roles',
    });
  } catch (err) {
    logger.warn(`تعذر إنشاء الرتبة ${def.name}: ${err.message}`);
    return null;
  }
}

export async function buildRoles(guild, logger) {
  const roles = new Map();

  await liftBotRole(guild, logger);
  await purgeRoles(guild, logger);

  try {
    await guild.roles.everyone.setPermissions(EVERYONE_PERMS, 'fivem-solutions everyone');
  } catch (err) {
    logger.warn(`تعذر تحديث صلاحيات @everyone: ${err.message}`);
  }

  for (const def of ROLE_DEFS) {
    const role = await createRole(guild, def, logger);
    if (role) roles.set(def.key, role);
  }

  const ordered = ROLE_DEFS.map((def) => roles.get(def.key)).filter(Boolean);
  const ceiling = botCeiling(guild);
  const top = Math.max(1, ceiling - 1);
  const positions = ordered
    .map((role, index) => ({ role, position: top - (ordered.length - 1 - index) }))
    .filter((item) => item.position >= 1)
    .sort((a, b) => a.position - b.position);

  if (positions.length > 0) {
    try {
      await guild.roles.setPositions(positions);
    } catch (err) {
      logger.warn(`تعذر ترتيب الرتب: ${err.message}`);
    }
  }

  return roles;
}
