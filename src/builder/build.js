import { ChannelType } from 'discord.js';
import { wipeGuild } from './wipe.js';
import { buildRoles } from './roles.js';
import { buildChannels } from './channels.js';
import { buildContent } from './content.js';

async function runStage(label, fn) {
  try {
    return await fn();
  } catch (err) {
    throw new Error(`فشلت مرحلة "${label}" أثناء بناء السيرفر: ${err?.message ?? err}`);
  }
}

export async function buildServer(client, guildId) {
  const startedAt = performance.now();
  const logger = client.logger;

  const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
  if (!guild) throw new Error(`لم يتم العثور على السيرفر بالآيدي: ${guildId}`);

  await guild.members.fetchMe().catch(() => null);

  logger.info('بدء بناء السيرفر من الصفر...');

  logger.step('1/4 مسح القنوات القديمة');
  await runStage('المسح', () => wipeGuild(guild, logger));
  await guild.channels.fetch().catch(() => null);
  await guild.roles.fetch().catch(() => null);

  logger.step('2/4 إنشاء الرتب');
  const roles = await runStage('الرتب', () => buildRoles(guild, logger));

  logger.step('3/4 إنشاء الفئات والقنوات');
  const channels = await runStage('القنوات', () => buildChannels(guild, roles, logger));

  const announcements = channels.get('announcements');
  const welcome = channels.get('welcome');
  if (announcements) await guild.setPublicUpdatesChannel(announcements, 'fivem-solutions updates').catch(() => null);
  if (welcome) await guild.setSystemChannel(welcome, 'fivem-solutions system').catch(() => null);

  logger.step('4/4 تجهيز القنوات');
  await runStage('المحتوى', () => buildContent(guild, channels, roles, logger));

  const logChannel = channels.get('logs');
  if (logChannel) {
    try {
      const messages = await logChannel.messages.fetch({ limit: 50 });
      await logChannel.bulkDelete(messages, true);
    } catch {
      // build-time noise stays only if bulk delete is unavailable
    }
  }

  const rules = channels.get('rules');
  if (rules) await guild.setRulesChannel(rules, 'fivem-solutions rules').catch(() => null);

  try {
    await client.rest.patch(`/guilds/${guildId}/welcome-screen`, {
      body: { enabled: false, description: '', welcome_channels: [] },
    });
  } catch {
    // welcome screen may be unavailable on non-community guilds
  }

  try {
    await client.rest.put(`/guilds/${guildId}/onboarding`, {
      body: { prompts: [], default_channel_ids: [], enabled: false, mode: 1 },
    });
  } catch {
    // onboarding may be unavailable on non-community guilds
  }

  const all = [...channels.values()].filter(Boolean);
  const seconds = Math.round((performance.now() - startedAt) / 10) / 100;
  const stats = {
    channels: all.filter((c) => c.type !== ChannelType.GuildCategory).length,
    categories: all.filter((c) => c.type === ChannelType.GuildCategory).length,
    roles: roles.size,
    seconds,
  };

  logger.success(`تم بناء السيرفر في ${seconds} ثانية`);
  return { roles, channels, stats };
}
