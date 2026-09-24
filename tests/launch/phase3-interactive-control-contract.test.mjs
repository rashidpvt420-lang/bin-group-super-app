import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 3 interactive-control audit is mandatory in PR validation', async () => {
  const [pkg, workflow, inventory] = await Promise.all([
    read('package.json'),
    read('.github/workflows/pr-validation.yml'),
    read('scripts/verify-interactive-control-inventory.mjs'),
  ]);

  assert.match(pkg, /"test:interactive-controls": "node scripts\/verify-interactive-control-inventory\.mjs"/);
  assert.match(workflow, /Phase 3 interactive control inventory guard/);
  assert.match(workflow, /npm run test:interactive-controls/);
  assert.match(workflow, /phase-3-interactive-control-inventory-\$\{\{ github\.sha \}\}/);
  assert.match(inventory, /apps\/admin-panel\/src/);
  assert.match(inventory, /apps\/owner-app\/src/);
  assert.match(inventory, /mutation-missing-busy-guard/);
  assert.match(inventory, /mutation-missing-error-path/);
  assert.match(inventory, /mutation-missing-success-path/);
  assert.match(inventory, /mutation-missing-e2e-anchor/);
  assert.match(inventory, /privileged-direct-client-write/);
});

test('Phase 3 runtime route audit checks every visible interactive control', async () => {
  const source = await read('tests/e2e/hard-launch-routes.spec.ts');

  assert.match(source, /async function assertInteractiveControls/);
  assert.match(source, /visible interactive control/);
  assert.match(source, /must expose a meaningful label/);
  assert.match(source, /must be non-interactable/);
  assert.match(source, /must be interactable/);
  assert.match(source, /mobile Arabic/);
  assert.match(source, /for \(const route of role\.routes\) await assertExactRoute/);
  assert.match(source, /for \(const route of role\.routes\) await assertMobileArabicRoute/);
});
