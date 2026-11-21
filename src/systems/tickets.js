import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { theme } from '../config/theme.js';
import { logger } from '../lib/logger.js';
import { readJson, writeJson } from '../lib/store.js';
import { runSequential, sleep, withRetry } from '../lib/queue.js';

const P = PermissionFlagsBits;
const STAFF_KEYS = ['founder'];
const CLOSER_ROLE_ID = '1573428236845584566';
const TICKETS_FALLBACK = { counter: 0, open: {} };

const CATEGORIES = {
  purchase: {
    label: 'شراء منتج',
    emoji: '🛒',
    description: 'استفسار عن سكربت أو نظام جاهز',
    title: 'طلب شراء منتج',
    questions: [
      { id: 'server', label: 'اسم السيرفر وعدد اللاعبين', placeholder: 'مثال: FiveM Solutions RP — 120 لاعب' },
      { id: 'framework', label: 'النظام (ESX / QBCore / CFX)', placeholder: 'ESX / QBCore / CFX' },
      { id: 'product', label: 'المنتج المطلوب', placeholder: 'مثال: MDT الشرطة' },
      { id: 'budget', label: 'الميزانية والوقت المتوقع', placeholder: 'الميزانية المتاحة والموعد المطلوب للتسليم' },
    ],
  },
  support: {
    label: 'دعم فني',
    emoji: '🛠',
    description: 'مشكلة أو خطأ في تركيب سكربت',
    title: 'طلب دعم فني',
    questions: [
      { id: 'server', label: 'اسم السيرفر', placeholder: 'اسم السيرفر' },
      { id: 'framework', label: 'النظام المستخدم', placeholder: 'ESX / QBCore / CFX' },
      { id: 'problem', label: 'وصف المشكلة', placeholder: 'ماذا يحدث بالضبط ومتى بدأت المشكلة؟' },
      { id: 'errors', label: 'الأخطاء أو ملاحظات إضافية', placeholder: 'الصق نص الخطأ إن وجد واذكر أي تحديثات حديثة' },
    ],
  },
  partnership: {
    label: 'شراكة',
    emoji: '🤝',
    description: 'تعاون بين مجتمعك و FiveM Solutions',
    title: 'طلب شراكة',
    questions: [
      { id: 'brand', label: 'اسم العلامة أو المجتمع', placeholder: 'اسم المجتمع أو العلامة التجارية' },
      { id: 'audience', label: 'حجم الجمهور', placeholder: 'عدد الأعضاء والتفاعل اليومي' },
      { id: 'proposal', label: 'تفاصيل العرض / الشراكة', placeholder: 'اشرح فكرة الشراكة والمقابل المتوقع' },
    ],
  },
  question: {
    label: 'استفسار عام',
    emoji: '❓',
    description: 'أي سؤال آخر عن خدماتنا',
    title: 'استفسار عام',
    questions: [{ id: 'question', label: 'سؤالك', placeholder: 'اكتب سؤالك بالتفصيل' }],
  },
};

function padNumber(number) {
  return String(number).padStart(4, '0');
}

function slugName(name) {
  const slug = String(name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return slug || 'user';
}

async function safeReply(interaction, content, ephemeral = true) {
  try {
    const payload = { content, ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (err) {
    logger.debug(`ticket reply skipped: ${err.message}`);
  }
}

function isStaff(interaction, roles) {
  return STAFF_KEYS.some((key) => {
    const role = roles?.get?.(key);
    return Boolean(role && interaction.member?.roles?.cache?.has(role.id));
  });
}

const CLOSER_ROLE_IDS = new Set([
  CLOSER_ROLE_ID,
  '1573477789783302214',
]);

function canClose(interaction) {
  const member = interaction.member;
  if (!member) return false;
  if (member.permissions?.has?.(P.Administrator)) return true;
  if (member.permissions?.has?.(P.ManageChannels)) return true;
  if (member.id === interaction.guild?.ownerId) return true;
  return [...CLOSER_ROLE_IDS].some((id) => member.roles?.cache?.has(id));
}

function buildModal(categoryKey) {
  const category = CATEGORIES[categoryKey];
  const modal = new ModalBuilder().setCustomId(`ticket:modal:${categoryKey}`).setTitle(category.title);
  category.questions.forEach((question, index) => {
    const isLast = index === category.questions.length - 1;
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel(question.label)
      .setStyle(isLast ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(1000);
    if (question.placeholder) input.setPlaceholder(question.placeholder);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });
  return modal;
}

function introButtons(claimDisabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setLabel('الادعاء')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimDisabled),
    new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket:close').setLabel('إغلاق').setStyle(ButtonStyle.Danger),
  );
}

function ratingRow() {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((value) =>
      new ButtonBuilder()
        .setCustomId(`ticket:rate:${value}`)
        .setLabel(String(value))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

function introText(userId, padded, category, answers) {
  const lines = [
    `# تذكرة #${padded}`,
    `**${category.label}** — صاحب التذكرة <@${userId}>`,
    '',
    '## تفاصيل الطلب',
    ...answers.map((answer) => `**${answer.label}**\n${answer.value.slice(0, 1000)}`),
    '',
    `-# ${theme.brand.name} • بانتظار الادعاء`,
  ];
  return lines.join('\n');
}

export async function buildTicketPanel(channel, guild, map, roles) {
  const content = [
    '# مركز الدعم',
    `**${theme.brand.name}** — اختر نوع التذكرة من القائمة بالأسفل.`,
    '',
    '## الأنواع المتاحة',
    ...Object.values(CATEGORIES).map((category) => `**${category.label}** — ${category.description}`),
    '',
    'أجب على أسئلة النموذج بدقة حتى يصل فريقنا جاهزاً للحل من أول رسالة.',
    '',
    '-# تذكرة واحدة لكل موضوع • الرد خلال ساعتين',
  ].join('\n');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:select')
    .setPlaceholder('اختر نوع التذكرة')
    .addOptions(
      Object.entries(CATEGORIES).map(([key, category]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(category.label)
          .setValue(key)
          .setEmoji(category.emoji)
          .setDescription(category.description),
      ),
    );

  await withRetry(
    () => channel.send({ content, components: [new ActionRowBuilder().addComponents(menu)] }),
    'ticket panel',
  );
}

export async function handleTicketSelect(interaction, ctx) {
  try {
    const categoryKey = interaction.values?.[0];
    if (!CATEGORIES[categoryKey]) return await safeReply(interaction, 'نوع التذكرة غير معروف.', true);

    const data = readJson('tickets', TICKETS_FALLBACK);
    data.pending = { ...(data.pending || {}), [interaction.user.id]: { category: categoryKey, at: Date.now() } };
    writeJson('tickets', data);

    await interaction.showModal(buildModal(categoryKey));
  } catch (err) {
    logger.error('ticket select failed', err);
    await safeReply(interaction, 'تعذر فتح نموذج التذكرة، حاول مرة أخرى.', true);
  }
}

export async function handleTicketModal(interaction, ctx) {
  const categoryKey = interaction.customId.split(':')[2];
  const category = CATEGORIES[categoryKey];
  if (!category) return await safeReply(interaction, 'نوع التذكرة غير معروف.', true);

  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    logger.debug(`ticket modal defer skipped: ${err.message}`);
    return;
  }

  try {
    const { guild, roles, map } = ctx;
    const answers = category.questions.map((question) => ({
      label: question.label,
      value: (interaction.fields.getTextInputValue(question.id) || '').trim() || '—',
    }));

    const ticketsCategory = map.get('tickets');
    if (!ticketsCategory) throw new Error('tickets category missing from map');

    let number = 0;
    await runSequential(
      [1],
      () => {
        const data = readJson('tickets', TICKETS_FALLBACK);
        number = (Number(data.counter) || 0) + 1;
        data.counter = number;
        writeJson('tickets', data);
      },
      0,
    );

    const padded = padNumber(number);
    const channelName = `ticket-${padded}-${slugName(interaction.user.username)}`;
    const everyone = guild.roles.everyone;
    const staffOverwrites = STAFF_KEYS.map((key) => roles.get(key))
      .filter(Boolean)
      .map((role) => ({
        id: role.id,
        allow: [
          P.ViewChannel,
          P.SendMessages,
          P.ReadMessageHistory,
          P.AttachFiles,
          P.EmbedLinks,
          P.ManageMessages,
          P.ManageThreads,
        ],
      }));

    const channel = await withRetry(
      () =>
        guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: ticketsCategory.id,
          topic: `تذكرة #${padded} • ${category.label} • ${interaction.user.tag}`,
          permissionOverwrites: [
            { id: everyone.id, deny: [P.ViewChannel] },
            {
              id: interaction.user.id,
              allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks],
            },
            ...staffOverwrites,
            {
              id: guild.members.me.id,
              allow: [
                P.ViewChannel,
                P.SendMessages,
                P.ReadMessageHistory,
                P.AttachFiles,
                P.EmbedLinks,
                P.ManageChannels,
                P.ManageMessages,
              ],
            },
          ],
        }),
      'ticket channel',
    );

    await withRetry(
      () =>
        channel.send({
          content: introText(interaction.user.id, padded, category, answers),
          components: [introButtons()],
        }),
      'ticket intro',
    );

    const data = readJson('tickets', TICKETS_FALLBACK);
    data.open = data.open || {};
    data.open[channel.id] = {
      number,
      userId: interaction.user.id,
      category: categoryKey,
      claimedBy: null,
      createdAt: Date.now(),
    };
    if (data.pending) delete data.pending[interaction.user.id];
    writeJson('tickets', data);

    await logTicketEvent(
      guild,
      map,
      `**تذكرة جديدة #${padded}**\n<#${channel.id}>\n**الفئة:** ${category.label}\n**المستخدم:** <@${interaction.user.id}>`,
    );

    await safeReply(interaction, `تم إنشاء تذكرتك: <#${channel.id}>`, true);
  } catch (err) {
    logger.error('ticket creation failed', err);
    await safeReply(interaction, 'تعذر إنشاء التذكرة حالياً، حاول مرة أخرى بعد قليل.', true);
  }
}

export async function handleTicketButton(interaction, ctx) {
  const [prefix, action, extra] = interaction.customId.split(':');
  if (prefix !== 'ticket') return;

  try {
    if (action === 'claim') return await claimTicket(interaction, ctx);
    if (action === 'close') return await requestClose(interaction);
    if (action === 'close_cancel') return await cancelClose(interaction);
    if (action === 'close_confirm') return await closeTicket(interaction, ctx);
    if (action === 'transcript') return await sendTranscript(interaction, ctx);
    if (action === 'rate') return await rateTicket(interaction, extra);
  } catch (err) {
    logger.error(`ticket button "${action}" failed`, err);
    await safeReply(interaction, 'حدث خطأ غير متوقع أثناء تنفيذ العملية.', true);
  }
}

async function claimTicket(interaction, ctx) {
  if (!isStaff(interaction, ctx.roles)) {
    return await safeReply(interaction, 'الادعاء متاح لفريق الدعم والإدارة فقط.', true);
  }

  const data = readJson('tickets', TICKETS_FALLBACK);
  const ticket = data.open?.[interaction.channelId];
  if (!ticket) return await safeReply(interaction, 'هذه القناة ليست تذكرة مسجلة.', true);
  if (ticket.claimedBy) return await safeReply(interaction, `التذكرة مدعومة بالفعل بواسطة <@${ticket.claimedBy}>.`, true);

  ticket.claimedBy = interaction.user.id;
  writeJson('tickets', data);

  await interaction.update({ components: [introButtons(true)] });

  await logTicketEvent(
    ctx.guild,
    ctx.map,
    `**تذكرة #${padNumber(ticket.number)} تم ادعاؤها**\n<#${interaction.channelId}>\n**المسؤول:** <@${interaction.user.id}>`,
  );
}

async function requestClose(interaction) {
  if (!canClose(interaction)) {
    return await safeReply(interaction, 'إغلاق التذاكر متاح للإدارة فقط.', true);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close_confirm').setLabel('تأكيد الإغلاق').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:close_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    content: 'هل أنت متأكد من إغلاق التذكرة؟ سيتم إنشاء Transcript قبل الحذف.',
    components: [row],
    ephemeral: true,
  });
}

async function cancelClose(interaction) {
  await interaction.update({ content: 'تم إلغاء الإغلاق، التذكرة ما زالت مفتوحة.', components: [] });
}

async function closeTicket(interaction, ctx) {
  if (!canClose(interaction)) {
    return await safeReply(interaction, 'إغلاق التذاكر متاح للإدارة فقط.', true);
  }

  try {
    await interaction.update({ content: 'جاري إنشاء الـTranscript وإغلاق التذكرة...', components: [] });
  } catch (err) {
    logger.debug(`close confirm update skipped: ${err.message}`);
  }

  const channel = interaction.channel;
  const data = readJson('tickets', TICKETS_FALLBACK);
  const ticket = data.open?.[channel.id] ?? { number: 0, userId: null, category: null, claimedBy: null };

  const { attachment, fileName } = await generateTranscript(channel, ticket);
  const transcripts = ctx.map.get('transcripts');
  if (transcripts) {
    await withRetry(
      () =>
        transcripts.send({
          content: transcriptText(channel, ticket, fileName, interaction.user),
          components: [ratingRow()],
          files: [attachment],
        }),
      'ticket transcript',
    );
  }

  if (data.open) delete data.open[channel.id];
  writeJson('tickets', data);

  await logTicketEvent(
    ctx.guild,
    ctx.map,
    `**تذكرة #${padNumber(ticket.number)} تم إغلاقها**\n**القناة:** ${channel.name}\n**المستخدم:** ${ticket.userId ? `<@${ticket.userId}>` : 'غير معروف'}`,
  );

  await sleep(3000);
  try {
    await channel.delete('Ticket closed');
  } catch (err) {
    logger.warn(`ticket channel delete failed: ${err.message}`);
  }
}

async function sendTranscript(interaction, ctx) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;
  const data = readJson('tickets', TICKETS_FALLBACK);
  const ticket = data.open?.[channel.id] ?? { number: 0, userId: null, category: null, claimedBy: null };

  const { attachment, fileName } = await generateTranscript(channel, ticket);
  const transcripts = ctx.map.get('transcripts');
  if (!transcripts) throw new Error('transcripts channel missing from map');

  await withRetry(
    () => transcripts.send({ content: transcriptText(channel, ticket, fileName, interaction.user), files: [attachment] }),
    'ticket transcript',
  );

  await logTicketEvent(
    ctx.guild,
    ctx.map,
    `**Transcript تذكرة #${padNumber(ticket.number)}**\nتم إنشاء Transcript يدوياً في <#${transcripts.id}>.`,
  );

  await interaction.editReply(`تم إنشاء الـTranscript: <#${transcripts.id}>`);
}

async function rateTicket(interaction, value) {
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return await safeReply(interaction, 'تقييم غير صالح.', true);
  }

  const ratings = readJson('ratings', []);
  const list = Array.isArray(ratings) ? ratings : [];
  list.push({
    userId: interaction.user.id,
    rating,
    channelId: interaction.channelId,
    messageId: interaction.message?.id ?? null,
    at: new Date().toISOString(),
  });
  writeJson('ratings', list);

  await safeReply(interaction, `شكراً لتقييمك: ${rating}/5`, true);
}

async function fetchChannelMessages(channel, limit = 500) {
  const collected = [];
  let before;
  while (collected.length < limit) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, limit - collected.length), before });
    if (!batch.size) break;
    collected.push(...batch.values());
    before = batch.last().id;
  }
  return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTranscriptHtml(channel, ticket, messages) {
  const rows = messages
    .map((message) => {
      const author = escapeHtml(message.author?.tag ?? message.author?.username ?? 'Unknown');
      const time = new Date(message.createdTimestamp).toLocaleString('en-GB', { hour12: false });
      const avatar = message.author?.displayAvatarURL?.({ size: 64 }) ?? '';
      let body = message.content || '';
      if (!body && message.attachments?.size) body = `[attachment] ${[...message.attachments.values()].map((a) => a.url).join(' ')}`;
      if (!body && message.embeds?.length) body = '[embed]';
      const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
      return `<div class="msg"><img class="avatar" src="${escapeHtml(avatar)}" alt=""><div class="col"><div class="head"><span class="author">${author}</span><span class="time">${time}</span></div><div class="body">${safeBody}</div></div></div>`;
    })
    .join('\n');

  const title = `Transcript — #${escapeHtml(channel.name)}`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px; font-family: "Segoe UI", Tahoma, sans-serif; background: #f4f4f6; color: #1d1d22; }
.wrap { max-width: 860px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; }
h1 { font-size: 20px; margin: 0 0 4px; }
.meta { font-size: 13px; color: #6b6b76; margin-bottom: 20px; }
.msg { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid #e6e6ea; }
.avatar { width: 36px; height: 36px; border-radius: 50%; background: #ddd; flex: none; }
.col { flex: 1; min-width: 0; }
.head { display: flex; gap: 8px; align-items: baseline; }
.author { font-weight: 600; font-size: 14px; }
.time { font-size: 11px; color: #8a8a94; }
.body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
@media (prefers-color-scheme: dark) {
  body { background: #0f0f13; color: #e8e8ee; }
  .wrap { background: #17171d; }
  .meta, .time { color: #9a9aa6; }
  .msg { border-top-color: #2a2a33; }
}
</style>
</head>
<body>
<div class="wrap">
<h1>${title}</h1>
<div class="meta">Ticket #${padNumber(ticket.number)} • ${escapeHtml(messages.length)} messages • ${new Date().toISOString()}</div>
${rows || '<p class="meta">No messages.</p>'}
</div>
</body>
</html>`;
}

async function generateTranscript(channel, ticket) {
  const messages = await fetchChannelMessages(channel, 500);
  const html = renderTranscriptHtml(channel, ticket, messages);
  const dir = path.join(env.dataDir, 'transcripts');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${channel.name}-${Date.now()}.html`;
  fs.writeFileSync(path.join(dir, fileName), html, 'utf8');
  return { attachment: new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: fileName }), fileName };
}

function transcriptText(channel, ticket, fileName, closedBy) {
  const categoryLabel = CATEGORIES[ticket.category]?.label ?? 'غير محدد';
  return [
    `**Transcript — ${channel.name}**`,
    `رقم التذكرة: #${padNumber(ticket.number)}`,
    `صاحب التذكرة: ${ticket.userId ? `<@${ticket.userId}>` : 'غير معروف'}`,
    `الفئة: ${categoryLabel}`,
    `المسؤول: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'لم يتم الادعاء'}`,
    `أُغلقت بواسطة: ${closedBy ? `<@${closedBy.id}>` : 'غير معروف'}`,
    `الملف: ${fileName}`,
    '',
    `-# قيّم تجربتك بالأسفل • ${theme.brand.name}`,
  ].join('\n');
}

export async function logTicketEvent(guild, map, content) {
  const channel = map?.get?.('ticket_logs') ?? map?.get?.('logs');
  if (!channel || typeof channel.send !== 'function') return;
  try {
    await channel.send({ content, allowedMentions: { parse: [] } });
  } catch (err) {
    logger.warn(`ticket log send failed: ${err.message}`);
  }
}
