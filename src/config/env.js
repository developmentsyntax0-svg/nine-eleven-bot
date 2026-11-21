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

  if (!env.token) missing.push('DISCORD_TOKEN');
  if (!env.guildId) missing.push('GUILD_ID');

  if (missing.length > 0) {
    throw new Error('Missing env vars: ' + missing.join(', '));
  }

  if (!/^\d{17,20}$/.test(env.guildId)) {
    throw new Error('Invalid GUILD_ID: ' + env.guildId);
  }

  if (env.ownerId && !/^\d{17,20}$/.test(env.ownerId)) {
    throw new Error('Invalid OWNER_ID: ' + env.ownerId);
  }
}
