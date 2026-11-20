import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const skip = new Set(['src/index.js']);
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
})(path.join(root, 'src'));

let failed = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (skip.has(rel)) continue;
  try {
    await import(new URL(`file://${file.replace(/\\/g, '/')}`).href);
    console.log('OK  ', rel);
  } catch (err) {
    failed += 1;
    console.log('FAIL', rel, '->', err.message);
  }
}
process.exit(failed ? 1 : 0);
