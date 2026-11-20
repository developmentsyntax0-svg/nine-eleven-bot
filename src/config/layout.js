export const MAIN_CATEGORY = 'start';
export const MAIN_CHANNEL = 'welcome';

export const LAYOUT = [
  {
    key: 'start',
    name: '▍ البداية',
    preset: 'readOnly',
    channels: [
      { key: 'rules', name: 'قوانين', type: 'text', preset: 'readOnly' },
      { key: 'welcome', name: 'الترحيب', type: 'text', preset: 'readOnly' },
      { key: 'announcements', name: 'الإعلانات', type: 'text', preset: 'readOnly' },
      { key: 'free', name: 'المكتبة-المجانية', type: 'text', preset: 'readOnly' },
      { key: 'links', name: 'روابط-مهمة', type: 'text', preset: 'readOnly' },
    ],
  },
  {
    key: 'store',
    name: '▍ المتجر',
    preset: 'readOnly',
    channels: [
      { key: 'reviews', name: 'آراء-العملاء', type: 'text', preset: 'public' },
      { key: 'showcase', name: 'غرفة-العرض', type: 'forum', preset: 'forum' },
    ],
  },
  {
    key: 'support',
    name: '▍ الدعم',
    preset: 'readOnly',
    channels: [
      { key: 'tickets_panel', name: 'افتح-تذكرة', type: 'text', preset: 'ticketPanel' },
    ],
  },
  {
    key: 'community',
    name: '▍ المجتمع',
    preset: 'readOnly',
    channels: [
      { key: 'general', name: 'الدردشة-العامة', type: 'text', preset: 'public' },
      { key: 'voice_lounge', name: 'غرفة-الصوت', type: 'voice', preset: 'voicePublic' },
      { key: 'voice_support', name: 'غرفة-الدعم-الصوتي', type: 'voice', preset: 'voicePublic' },
    ],
  },
  {
    key: 'staff',
    name: '▍ الإدارة',
    preset: 'staffOnly',
    channels: [
      { key: 'transcripts', name: 'أرشيف-التذاكر', type: 'text', preset: 'transcripts' },
    ],
  },
  {
    key: 'logs',
    name: '▍ السجلات',
    preset: 'logsOnly',
    channels: [
      { key: 'logs', name: 'سجل-الإدارة', type: 'text', preset: 'logsOnly' },
    ],
  },
  {
    key: 'tickets',
    name: '▍ التذاكر',
    preset: 'ticketsCategory',
    hidden: true,
    channels: [],
  },
];

export const FORUM_TAGS = ['شرطة', 'اقتصاد', 'واجهات', 'أداء', 'أخرى'];

export const TICKET_CATEGORIES = {
  purchase: { emoji: '🛒', label: 'شراء منتج', description: 'اطلب منتج أو باقة من المتجر' },
  support: { emoji: '🛠', label: 'دعم فني', description: 'مشكلة في سكربت أو سيرفر' },
  partnership: { emoji: '🤝', label: 'شراكة', description: 'شراكة أو تعاون بين مجتمعات' },
  question: { emoji: '❓', label: 'استفسار عام', description: 'أي سؤال قبل الشراء' },
};
