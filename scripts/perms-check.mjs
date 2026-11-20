import { PermissionFlagsBits } from 'discord.js';

const names = [
  'ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'AttachFiles',
  'EmbedLinks', 'UseExternalEmojis', 'CreatePublicThreads', 'CreatePrivateThreads',
  'SendMessagesInThreads', 'ManageMessages', 'ManageThreads', 'Connect', 'Speak',
  'Stream', 'UseVAD', 'MoveMembers', 'MuteMembers', 'DeafenMembers', 'ManageChannels',
  'ManageRoles', 'KickMembers', 'ModerateMembers', 'ViewAuditLog', 'ManageWebhooks',
  'MentionEveryone', 'Administrator', 'ChangeNickname', 'UseApplicationCommands',
];

const missing = names.filter((name) => PermissionFlagsBits[name] === undefined);
console.log(missing.length ? `MISSING: ${missing.join(', ')}` : 'ALL_PERMS_OK');
