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

test('ticket updates are actor-specific and cannot authorize technician self-claims', () => {
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  assert.doesNotMatch(rules, /\|\| safeOpenMissionClaim\(\)/);
  assert.doesNotMatch(
    rules,
    /allow update: if isAdmin\(\) \|\| safeDispatcherTicketUpdate\(\) \|\| safeTenantEvidenceUpdate\(\) \|\| safeTechnicianTicketUpdate\(\);/,
  );

  const requiredRules = [
    'allow update: if isAdmin() && isNotSuspended();',
    'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
    'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
    'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
  ];

  for (const rule of requiredRules) {
    assert.equal(
      rules.split(rule).length - 1,
      2,
      `Expected the actor-specific rule once for tickets and once for maintenanceTickets: ${rule}`,
    );
  }
});

test('owner activation delegates to the complete server-confirmed policy', () => {
  const guard = readFileSync(join(root, 'src/components/owner/OwnerActivationGuard.tsx'), 'utf8');
  const policy = readFileSync(join(root, 'src/owner/activationPolicy.ts'), 'utf8');
  assert.match(guard, /isOwnerProfileActivated\(profile\)/);
  assert.match(policy, /normalized\(profile\.status\) === 'active'/);
  assert.match(policy, /profile\.adminApproved === true/);
  assert.match(policy, /profile\.paymentVerified === true/);
  assert.match(policy, /profile\.dashboardUnlocked === true/);
  assert.match(policy, /profile\.dashboardLocked !== true/);
  assert.match(policy, /profile\.activeContractId/);
  const page = readFileSync(join(root, 'src/owner/pages/OwnerActivationPage.tsx'), 'utf8');
  assert.match(page, /profile\?\.adminApproved === true/);
  assert.doesNotMatch(page, /mobilization > 0/);
  assert.match(page, /paymentVerified && adminApproved/);
});
