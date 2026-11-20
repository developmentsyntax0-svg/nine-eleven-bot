import { Events, MessageFlags } from 'discord.js';
import { theme } from '../config/theme.js';
import {
  handleTicketButton,
  handleTicketModal,
  handleTicketSelect,
} from './tickets.js';

const ROLE_KEYS = {
  server_owner: 'server_owner',
};

const SPECIALTY_KEYS = ['server_owner'];

async function safeReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch {
    // interaction may have expired; nothing to recover
  }
}

async function handleRolesSelect(interaction, ctx) {
  const value = interaction.values?.[0];
  const roleKey = ROLE_KEYS[value];
  const role = roleKey ? ctx.roles.get(roleKey) : null;

  if (!role) {
    return safeReply(interaction, `${theme.emojis.warn} التخصص ده غير متاح حالياً.`);
  }

  const member = interaction.member;
  if (!member) return safeReply(interaction, `${theme.emojis.warn} مش قادر أوصل لعضويتك.`);

  try {
    const previous = SPECIALTY_KEYS.map((key) => ctx.roles.get(key))
      .filter((r) => r && r.id !== role.id && member.roles.cache.has(r.id));
    if (previous.length) await member.roles.remove(previous, 'تغيير التخصص');
    await member.roles.add(role, 'اختيار التخصص');
    await safeReply(interaction, `${theme.emojis.check} تم تسجيل تخصصك: **${role.name}**`);
  } catch (err) {
    ctx.client.logger?.error('فشل تعيين رتبة التخصص', err);
    await safeReply(interaction, `${theme.emojis.cross} مش قادر أعدّل رتبك — تأكد إن رتبة البوت أعلى من الرتبة المطلوبة.`);
  }
}

async function handleVerify(interaction, ctx) {
  const member = interaction.member;
  const role = ctx.roles.get('member');
  if (!member || !role) return safeReply(interaction, `${theme.emojis.warn} التحقق غير متاح حالياً.`);

  try {
    await member.roles.add(role, 'قبول القوانين');
    await safeReply(interaction, `${theme.emojis.check} أهلاً بيك! تم تفعيل عضويتك — استمتع بالمجتمع.`);
  } catch (err) {
    ctx.client.logger?.error('فشل منح رتبة العضو', err);
    await safeReply(interaction, `${theme.emojis.cross} حصلت مشكلة أثناء التحقق، جرّب تاني أو كلم الإدارة.`);
  }
}

async function dispatch(interaction, ctx) {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('ticket:')) return handleTicketSelect(interaction, ctx);
    if (interaction.customId === 'roles:select') return handleRolesSelect(interaction, ctx);
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('ticket:modal:')) return handleTicketModal(interaction, ctx);
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('ticket:')) return handleTicketButton(interaction, ctx);
    if (interaction.customId === 'verify:accept') return handleVerify(interaction, ctx);
  }
}

export async function routeInteraction(interaction, ctx) {
  try {
    await dispatch(interaction, ctx);
  } catch (err) {
    ctx.client.logger?.error(`خطأ في معالجة التفاعل ${interaction.customId ?? interaction.commandName ?? ''}`, err);
    if (interaction.isRepliable()) {
      await safeReply(interaction, `${theme.emojis.cross} حصل خطأ غير متوقع، جرّب تاني.`);
    }
  }
}

export function registerInteractions(client, getCtx) {
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.inGuild()) return;
    routeInteraction(interaction, getCtx());
  });
}
