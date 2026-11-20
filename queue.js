import { logger } from './logger.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(err) {
  const seconds = err?.retryAfter ?? err?.rawError?.retry_after;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000) + 250;
  }
  return null;
}

export async function withRetry(fn, label, { retries = 3, baseDelay = 800 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === retries) break;

      const rateLimited = err?.status === 429;
      const wait = rateLimited
        ? retryAfterMs(err) ?? baseDelay * 2 ** attempt
        : baseDelay * 2 ** attempt;

      logger.debug(
        `${label}: attempt ${attempt + 1}/${retries + 1} failed (${err?.message ?? err}), retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }

  const reason = lastError?.message ?? String(lastError);
  throw new Error(`[${label}] failed after ${retries + 1} attempts: ${reason}`, {
    cause: lastError,
  });
}

export async function runSequential(items, fn, delayMs = 300) {
  const results = [];
  const list = Array.from(items ?? []);

  for (let i = 0; i < list.length; i += 1) {
    results.push(await fn(list[i], i));
    if (delayMs > 0 && i < list.length - 1) await sleep(delayMs);
  }

  return results;
}

export async function runParallel(items, fn, concurrency = 4) {
  const list = Array.from(items ?? []);
  const results = new Array(list.length);
  const size = Math.max(1, Math.floor(concurrency) || 1);
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(list[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(size, list.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
