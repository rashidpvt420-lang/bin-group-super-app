import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// LanguageContext.t() never returns '' for a missing key: it humanises the last key segment
// ('tenant.amenities.title' -> 'Title', 'dash.tenant.emergencySos' -> 'EmergencySos').
// So `t('missing.key') || 'Fallback'` always shows the humanised key, never the fallback.
// Use tx('key', 'Fallback') instead.
const root = new URL('../../', import.meta.url).pathname;
const lang = readFileSync(join(root, 'src/context/LanguageContext.tsx'), 'utf8');
const keys = new Set([...lang.matchAll(/^\s*'([\w.\-]+)':/gm)].map((m) => m[1]));
// Files with open draft PR #1573 edits; tracked there to avoid merge conflicts.
const deferred = new Set(['src/owner/pages/OwnerContractsResolvedPage.tsx', 'src/technician/pages/TechnicianDashboardPage.tsx']);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(name) ? [p] : [];
});

test('no t(missingKey) || fallback patterns outside deferred files', () => {
  const offenders = [];
  for (const file of walk(join(root, 'src'))) {
    const rel = file.slice(root.length);
    if (deferred.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([\w.\-]+)'\s*\)\s*\|\|/g)) {
      if (!keys.has(m[1])) offenders.push(`${rel}: ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, []);
});
