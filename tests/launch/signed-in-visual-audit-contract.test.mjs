import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('signed-in visual audit is read-only, main-only and saves screenshots', async () => {
  const [wf, spec] = await Promise.all([
    readFile('.github/workflows/signed-in-visual-audit.yml', 'utf8'),
    readFile('tests/e2e/signed-in-visual-audit.spec.ts', 'utf8'),
  ]);
  assert.match(wf, /on:\n  workflow_dispatch:/);
  assert.match(wf, /permissions:\n  contents: read/);
  assert.match(wf, /refs\/heads\/main/);
  assert.doesNotMatch(wf, /seed-e2e|e2e-admin-lifecycle/);
  for (const w of ['375', '390']) assert.ok(spec.includes(w));
  assert.match(spec, /page\.screenshot\(/);
  assert.match(spec, /ratio < 1\.5/);
  assert.match(spec, /floating Back overlaps the header/);
  for (const r of ['owner', 'tenant', 'technician', 'broker']) assert.ok(spec.includes(`role: '${r}'`), r);
});
