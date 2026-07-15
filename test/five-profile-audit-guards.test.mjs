import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('legacy ownerToken REST clients are fail-closed stubs', () => {
  for (const rel of ['src/services/api.ts', 'apps/owner-app/src/services/api.ts']) {
    const source = readFileSync(join(root, rel), 'utf8');
    assert.match(source, /Fail-closed|disabled/i);
    assert.doesNotMatch(source, /localhost:5000/);
    assert.doesNotMatch(source, /localStorage\.getItem\(['"]ownerToken['"]\)/);
  }
});

test('safeOpenMissionClaim cannot authorize technician self-claims', () => {
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  assert.doesNotMatch(rules, /\|\| safeOpenMissionClaim\(\)/);
  assert.match(
    rules,
    /match \/tickets\/\{ticketId\}[\s\S]{0,400}allow update: if canDispatchJobs\(\) \|\| safeTenantEvidenceUpdate\(\) \|\| safeTechnicianTicketUpdate\(\);/,
  );
});

test('owner activation requires paymentVerified + adminApproved + activeContractId', () => {
  const guard = readFileSync(join(root, 'src/components/owner/OwnerActivationGuard.tsx'), 'utf8');
  assert.match(guard, /adminApproved &&/);
  assert.match(guard, /paymentVerified &&/);
  assert.match(guard, /hasActiveContract/);
  const page = readFileSync(join(root, 'src/owner/pages/OwnerActivationPage.tsx'), 'utf8');
  assert.match(page, /profile\?\.adminApproved === true/);
  assert.doesNotMatch(page, /mobilization > 0/);
  assert.match(page, /paymentVerified && adminApproved/);
});
