import { ChannelType } from 'discord.js';
import { runSequential } from '../lib/queue.js';

async function safeDelete(item, label, logger) {
  try {
    await item.delete(`${label} wipe`);
    return true;
  } catch (err) {
    logger.warn(`تعذر حذف ${label} (${item.id}): ${err.message}`);
    return false;
  }
}

export async function wipeGuild(guild, logger) {
  const me = guild.members.me;
  if (!me) throw new Error('البوت غير موجود داخل السيرفر، تعذر تحديد صلاحياته.');

  let channels = 0;
  let categories = 0;
  let roles = 0;
  let invites = 0;

  const unlink = [
    ['systemChannel', 'setSystemChannel'],
    ['rulesChannel', 'setRulesChannel'],
    ['publicUpdatesChannel', 'setPublicUpdatesChannel'],
    ['safetyAlertsChannel', 'setSafetyAlertsChannel'],
    ['afkChannel', 'setAFKChannel'],
  ];
  for (const [getter, setter] of unlink) {
    if (!guild[getter]) continue;
    try {
      await guild[setter](null, 'community channel unlink before wipe');
    } catch (err) {
      logger.warn(`تعذر فصل قناة ${getter}: ${err.message}`);
    }
  }

  const channelList = [...guild.channels.cache.values()].filter(
    (ch) => ch.type !== ChannelType.GuildCategory,
  );
  await runSequential(
    channelList,
    async (ch) => {
      if (await safeDelete(ch, 'channel', logger)) channels += 1;
    },
    250,
  );

  const categoryList = [...guild.channels.cache.values()].filter(
    (ch) => ch.type === ChannelType.GuildCategory,
  );
  await runSequential(
    categoryList,
    async (ch) => {
      if (await safeDelete(ch, 'category', logger)) categories += 1;
    },
    250,
  );

  try {
    const inviteList = await guild.invites.fetch();
    await runSequential(
      [...inviteList.values()],
      async (invite) => {
        try {
          await invite.delete('invite wipe');
          invites += 1;
        } catch (err) {
          logger.warn(`تعذر حذف دعوة (${invite.code}): ${err.message}`);
        }
      },
      250,
    );
  } catch (err) {
    logger.warn(`تعذر جلب الدعوات: ${err.message}`);
  }

  return { channels, categories, roles, invites };
}
