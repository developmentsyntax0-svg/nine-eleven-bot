import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { logger } from './logger.js';

function filePath(name) {
  const safe = String(name).replace(/\.json$/i, '');
  return path.join(env.dataDir, `${safe}.json`);
}

export function ensureDataDir() {
  try {
    fs.mkdirSync(env.dataDir, { recursive: true });
    return env.dataDir;
  } catch (err) {
    logger.error(`تعذر إنشاء مجلد البيانات: ${env.dataDir}`, err);
    throw err;
  }
}

export function readJson(name, fallback) {
  const target = filePath(name);

  try {
    if (!fs.existsSync(target)) return fallback;
    const raw = fs.readFileSync(target, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`تعذر قراءة ${path.basename(target)}، سيتم استخدام القيمة الافتراضية (${err.message})`);
    return fallback;
  }
}

export function writeJson(name, data) {
  const target = filePath(name);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;

  try {
    ensureDataDir();
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, target);
    return true;
  } catch (err) {
    logger.error(`تعذر كتابة ${path.basename(target)}`, err);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // tmp cleanup is best-effort
    }
    return false;
  }
}
