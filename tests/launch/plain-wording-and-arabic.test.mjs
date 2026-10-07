import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(name) ? [p] : [];
});

test('users never see "Check Firestore rules" in broker or notification screens', () => {
  for (const f of ['src/pages/NotificationInboxPage.tsx', 'src/broker/pages/BrokerDashboardPage.tsx', 'src/broker/pages/BrokerAttributionProofPage.tsx']) {
    assert.doesNotMatch(read(f), /Check Firestore rules/, f);
  }
});

test('one Arabic brand form: مجموعة بن (no بن جروب)', () => {
  const offenders = walk(join(root, 'src')).filter((f) => readFileSync(f, 'utf8').includes('بن جروب'));
  assert.deepEqual(offenders.map((f) => f.slice(root.length)), []);
});

const dict = (src, langKey) => {
  const start = src.indexOf(`    ${langKey}: {`);
  const next = langKey === 'en' ? src.indexOf('    ar: {', start) : src.length;
  return src.slice(start, next);
};

// Plain string lookup (no dynamic RegExp): returns the quoted value after 'key': or null.
const valueOf = (block, key) => {
  const at = block.indexOf(`'${key}':`);
  if (at < 0) return null;
  const m = /^\s*'([^']*)'/.exec(block.slice(at + key.length + 3));
  return m ? m[1] : null;
};

test('tenant headings that showed key names now have EN and AR strings', () => {
  const src = read('src/context/LanguageContext.tsx');
  for (const key of ['tenant.amenities.title', 'tenant.gatePasses.title', 'tenant.gatePasses.noPassesHint', 'dash.tenant.emergencySos', 'common.continue']) {
    assert.ok(valueOf(dict(src, 'en'), key), `en ${key}`);
    assert.match(valueOf(dict(src, 'ar'), key) || '', /[\u0600-\u06FF]/, `ar ${key}`);
  }
});

test('admin sidebar items and CEO buttons are translated in Arabic', () => {
  const shared = read('packages/shared/src/context/LanguageContext.tsx');
  assert.match(dict(shared, 'ar'), /'nav\.orphans': 'تذاكر غير مسندة'/);
  assert.match(dict(shared, 'ar'), /'nav\.audit_log': 'سجل التدقيق'/);
  const ceo = read('apps/admin-panel/src/components/CeoContactButtons.tsx');
  assert.match(ceo, /tx\('admin\.ceo_whatsapp'/);
  assert.match(ceo, /tx\('admin\.ceo_email'/);
});
