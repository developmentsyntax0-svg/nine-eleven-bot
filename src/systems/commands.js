import { Events, PermissionFlagsBits } from 'discord.js';
import { logger } from '../lib/logger.js';
import { sleep } from '../lib/queue.js';

const PREFIX = '!';
const MEMBER_ROLE_ID = '1573477786071605399';

const COMMANDS = {
  عضو: 'member',
  member: 'member',
  رتبة: 'member',
  توزيع: 'member',
  roles: 'member',
};

function resolveMemberRole(guild, ctx) {
  return (
    guild.roles.cache.get(MEMBER_ROLE_ID) ??
    ctx?.roles?.get?.('member') ??
    guild.roles.cache.find((role) => role.name === '🟢 عضو') ??
    null
  );
}

function isAuthorized(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageRoles)
  );
}

async function grantAll(message, ctx) {
  const guild = message.guild;
  const role = resolveMemberRole(guild, ctx);
  if (!role) {
    await message.reply('مش لاقي رتبة العضو. تأكد إن البناء اشتغل صح.');
    return;
  }

  const me = guild.members.me;
  if (role.position >= me.roles.highest.position) {
    await message.reply(`رتبتي (${me.roles.highest.name}) أقل من رتبة ${role.name} — ارفع رتبة البوت فوقها.`);
    return;
  }

  const status = await message.reply(`بدء توزيع **${role.name}** على كل الأعضاء...`);
  await guild.members.fetch();

  const targets = guild.members.cache.filter((member) => !member.user.bot && !member.roles.cache.has(role.id));
  let added = 0;
  let failed = 0;
  let index = 0;
  let lastEdit = Date.now();

  for (const member of targets.values()) {
    index += 1;
    try {
      await member.roles.add(role, 'manual bulk member role');
      added += 1;
    } catch (err) {
      failed += 1;
      logger.debug(`member role failed (${member.user.tag}): ${err.message}`);
    }
    if (Date.now() - lastEdit > 5000) {
      lastEdit = Date.now();
      await status.edit(`جاري التوزيع... ${index}/${targets.size} — نجح ${added}، فشل ${failed}`).catch(() => null);
    }
    await sleep(60);
  }

  await status
    .edit(`تم. **${added}** عضو خدوا **${role.name}**${failed ? ` — فشل ${failed}` : ''}.`)
    .catch(() => null);
  logger.success(`manual member role: added=${added} failed=${failed}`);
}

export function registerCommands(client, getCtx) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!message.content.startsWith(PREFIX)) return;

      const [raw] = message.content.slice(PREFIX.length).trim().split(/\s+/);
      const command = COMMANDS[raw?.toLowerCase()] ?? COMMANDS[raw];
      if (!command) return;
      if (!isAuthorized(message.member)) return;

      if (command === 'member') await grantAll(message, getCtx());
    } catch (err) {
      logger.error('command failed', err);
    }
  });
}
