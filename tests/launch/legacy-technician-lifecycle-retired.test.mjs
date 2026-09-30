// N-01 CI guard: the five legacy technician lifecycle callables must stay fail-closed stubs.
// Any lifecycle status writer must go through the guarded path (secureTechnicianOperations).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const LEGACY = ['acceptTechnicianJob', 'startTechnicianWork', 'pauseTechnicianWork', 'finishTechnicianWork', 'closeTechnicianJob'];

test('legacy technician lifecycle callables are retired stubs that cannot write ticket state', async () => {
  const source = await readFile(new URL('../../functions/index.ts', import.meta.url), 'utf8');
  for (const name of LEGACY) {
    assert.ok(
      source.includes(`export const ${name} = retiredTechnicianLifecycleCallable("${name}");`),
      `${name} must be a retired fail-closed stub`,
    );
    assert.ok(!source.includes(`export const ${name} = onCall(`), `${name} must not have a live handler`);
  }
  const stubStart = source.indexOf('function retiredTechnicianLifecycleCallable(');
  assert.ok(stubStart > 0, 'retired stub factory must exist');
  const stubBody = source.slice(stubStart, source.indexOf('\n}\n', stubStart));
  assert.match(stubBody, /throw new HttpsError\(\s*"failed-precondition"/);
  assert.doesNotMatch(stubBody, /maintenanceTickets|\.update\(|\.set\(|runTransaction/);
});
