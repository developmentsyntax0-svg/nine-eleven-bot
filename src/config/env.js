import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, '../..');
const dataDir = path.join(rootDir, 'data');


export const env = {
  token: process.env.DISCORD_TOKEN || process.env.TOKEN || '',
  guildId: process.env.GUILD_ID || '',
  buildOnStart: process.env.BUILD_ON_START === 'true',
  ownerId: process.env.OWNER_ID || null,
  rootDir,
  dataDir,
};


export function assertEnv() {
  const missing = [];


  if (!env.token) missing.push('DISCORD_TOKEN (توكن البوت)');
  if (!env.guildId) missing.push('GUILD_ID (آيدي السيرفر)');


  if (missing.length > 0) {
    throw new Error(
      `متغيرات البيئة المفقودة: ${missing.join('، ')}. أضفها في ملف .env ثم أعد التشغيل.`,
    );
  }


  if (!/^\d{17,20}$/.test(env.guildId)) {
    throw new Error(
      `قيمة GUILD_ID غير صالحة: "${env.guildId}". يجب أن تكون أرقاماً فقط بطول 17 إلى 20 رقماً.`,
    );
  }


  if (env.ownerId && !/^\d{17,20}$/.test(env.ownerId)) {
