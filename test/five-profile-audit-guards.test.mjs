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

test('ticket updates are actor-discriminated and cannot authorize technician self-claims', () => {
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  assert.doesNotMatch(rules, /\|\| safeOpenMissionClaim\(\)/);
  assert.match(rules, /function safeTicketUpdateByActor\(\)/);
  assert.equal(rules.split('allow update: if safeTicketUpdateByActor();').length - 1, 2);
  assert.match(rules, /let authenticated = signedIn\(\);/);
  assert.match(rules, /let role = authenticated/);
  assert.match(rules, /let admin = authenticated && \(/);
  assert.match(rules, /let dispatcher = authenticated && \(/);
  assert.match(rules, /\(admin && isNotSuspended\(\)\)/);
  assert.match(rules, /\(!admin && dispatcher && safeDispatcherTicketUpdate\(\)\)/);
  assert.match(rules, /\(!admin && !dispatcher && role == 'tenant' && tenantOwns\(resource\.data\) && safeTenantEvidenceUpdate\(\)\)/);
  assert.match(rules, /\(!admin && !dispatcher && role in \['technician', 'tech'\] && techOwns\(resource\.data\) && safeTechnicianTicketUpdate\(\)\)/);
  assert.match(rules, /allow read: if collection != 'tickets' && collection != 'maintenanceTickets'/);
  assert.match(rules, /allow update, delete: if collection != 'tickets' && collection != 'maintenanceTickets'/);
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
