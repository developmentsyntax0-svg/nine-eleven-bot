const RULES_TEXT = [
  '# القوانين',
  '**FiveM Solutions** — سارية على كل الأعضاء بدون استثناء',
  '',
  '## 01 · الاحترام',
  'ممنوع السب أو التنمر أو أي إساءة لأي عضو أو للإدارة.',
  '',
  '## 02 · السبام والمنشن',
  'ممنوع تكرار الرسائل أو المنشن الجماعي أو الإعلانات الذاتية.',
  '',
  '## 03 · الروابط',
  'ممنوع نشر أي رابط خارجي — الموقع أو يوتيوب أو ديسكورد — بدون موافقة الإدارة.',
  '',
  '## 04 · الملكية الفكرية',
  'ممنوع نشر أو بيع أو تسريب أي ملفات أو سكربتات مش من حقك.',
  '',
  '## 05 · التذاكر',
  'تذكرة واحدة لكل موضوع. ممنوع منشن الإدارة، وفريقنا بيرد خلال ساعتين.',
  '',
  '## 06 · الاسترجاع',
  'الاسترجاع متاح خلال **48 ساعة** من الشراء، وفقط لو المنتج مش شغال وإحنا مش قادرين نحله.',
  'بعد 48 ساعة، أو لو المشكلة بسبب تعديل منك — مفيش استرجاع.',
  '',
  '## 07 · الدفع والتسليم',
  'التسليم بعد تأكيد الدفع مباشرة. ممنوع طلب أي ملف قبل الدفع.',
  '',
  '## 08 · العقوبات',
  'تحذير ← كتم ← حظر مؤقت ← حظر نهائي، حسب المخالفة وتقدير الإدارة.',
  '',
  '-# المخالفة المتكررة = حظر نهائي بدون إنذار.',
].join('\n');

export async function buildContent(guild, map, roles, logger) {
  logger?.step('تجهيز لوحة القوانين');

  const rulesChannel = map.get('rules');
  if (rulesChannel) {
    try {
      const old = await rulesChannel.messages.fetch({ limit: 50 });
      if (old.size) await rulesChannel.bulkDelete(old, true).catch(() => null);
      await rulesChannel.send({ content: RULES_TEXT, allowedMentions: { parse: [] } });
      logger?.success('لوحة القوانين جاهزة');
    } catch (err) {
      logger?.error('تعذر إرسال لوحة القوانين', err);
    }
  }

  logger?.step('تجهيز لوحة التذاكر');
  const channel = map.get('tickets_panel');
  if (!channel) {
    logger?.warn('قناة التذاكر غير متاحة');
    return;
  }

  try {
    const { buildTicketPanel } = await import('../systems/tickets.js');
    await buildTicketPanel(channel, guild, map, roles);
    logger?.success('لوحة التذاكر جاهزة');
  } catch (err) {
    logger?.error('تعذر بناء لوحة التذاكر', err);
  }
}
