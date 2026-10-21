import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else if (p.endsWith('.tsx')) yield p;
  }
}

function tagEnd(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i += 1) {
    if (s[i] === '{') depth += 1; else if (s[i] === '}') depth -= 1;
    else if (s[i] === '>' && depth === 0 && i > start + 3) return i;
  }
  return s.length;
}

test('every <img> and Box component="img" in src has an alt attribute (axe image-alt)', async () => {
  const missing = [];
  for await (const f of walk('src')) {
    const s = await readFile(f, 'utf8');
    for (const m of s.matchAll(/<(Box\s[^>]*?component="img"|img\b)/g)) {
      const tag = s.slice(m.index, tagEnd(s, m.index) + 1);
      if (!/\balt=/.test(tag)) missing.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(missing, []);
});
