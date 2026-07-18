import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('retired pass-all-gates script refuses to manufacture launch evidence', async () => {
  const source = await read('scripts/pass-all-gates.mjs');
  assert.match(source, /REFUSED/);
  assert.match(source, /execution-generated workflows bound to the exact commit SHA/);
  assert.match(source, /process\.exit\(1\)/);
  assert.doesNotMatch(source, /status:\s*['"]passed['"]/);
  assert.doesNotMatch(source, /writeFileSync|fs\.writeFile|launch-proof-gates\.json/);
  assert.doesNotMatch(source, /Tested FCM|Verified live GPS|Completed Arabic locale sweep|every form submit/i);
});

test('npm launch commands use guarded evidence and decision workflows, not pass-all-gates', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const scripts = packageJson.scripts || {};
  assert.equal(Object.values(scripts).some((command) => String(command).includes('pass-all-gates.mjs')), false);
  assert.match(String(scripts['launch:evidence:run']), /run-critical-evidence\.mjs/);
  assert.match(String(scripts['hard-launch:decision']), /hard-launch-decision-gate\.mjs/);
  assert.match(String(scripts['hard-launch:predeploy']), /hard-launch-predeploy-gate\.mjs/);
});
