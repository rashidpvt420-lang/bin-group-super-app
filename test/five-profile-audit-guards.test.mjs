import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function preparedTicketRules() {
  const directory = mkdtempSync(join(tmpdir(), 'bin-five-profile-rules-'));
  try {
    copyFileSync(join(root, 'firestore.rules'), join(directory, 'firestore.rules'));
    execFileSync(process.execPath, [resolve(root, 'scripts/apply-ticket-rule-binding.mjs')], {
      cwd: directory,
      stdio: 'pipe',
    });
    return readFileSync(join(directory, 'firestore.rules'), 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('legacy ownerToken REST clients are fail-closed stubs', () => {
  for (const rel of ['src/services/api.ts', 'apps/owner-app/src/services/api.ts']) {
    const source = readFileSync(join(root, rel), 'utf8');
    assert.match(source, /Fail-closed|disabled/i);
    assert.doesNotMatch(source, /localhost:5000/);
    assert.doesNotMatch(source, /localStorage\.getItem\(['"]ownerToken['"]\)/);
  }
});

test('ticket updates are actor-discriminated and cannot authorize technician self-claims', () => {
  const rules = preparedTicketRules();
  assert.doesNotMatch(rules, /\|\| safeOpenMissionClaim\(\)/);
  assert.match(rules, /function safeTicketUpdateByActor\(\)/);
  assert.equal(rules.split('allow update: if safeTicketUpdateByActor();').length - 1, 1);
  assert.match(rules, /let authenticated = signedIn\(\);/);
  assert.match(rules, /let role = authenticated/);
  assert.match(rules, /let admin = authenticated && \(/);
  assert.match(rules, /let dispatcher = authenticated && \(/);
  assert.match(rules, /\(admin && isNotSuspended\(\)\)/);
  assert.match(rules, /\(!admin && dispatcher && safeDispatcherTicketUpdate\(\)\)/);
  assert.match(rules, /\(!admin && !dispatcher && role in \['', 'tenant'\] && tenantOwns\(resource\.data\) && safeTenantEvidenceUpdate\(\)\)/);
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
  assert.match(page, /import \{ isOwnerProfileActivated \} from '\.\.\/activationPolicy';/);
  assert.match(page, /const activated = isOwnerProfileActivated\(profile\);/);
  assert.doesNotMatch(page, /mobilization > 0\s*&&\s*adminApproved/);
});

test('five-profile coverage is runtime-backed and checked before live readiness', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-profile-evidence-coverage.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /owner: 1 mapped gate\(s\), 1 protected-runtime gate\(s\)/);
  assert.match(output, /tenant: 1 mapped gate\(s\), 1 protected-runtime gate\(s\)/);
  assert.match(output, /technician: 1 mapped gate\(s\), 1 protected-runtime gate\(s\)/);
  assert.match(output, /broker: 1 mapped gate\(s\), 1 protected-runtime gate\(s\)/);
  assert.match(output, /admin: 1 mapped gate\(s\), 1 protected-runtime gate\(s\)/);

  const coverageScript = readFileSync(join(root, 'scripts/verify-profile-evidence-coverage.mjs'), 'utf8');
  assert.match(coverageScript, /Static readiness scores are prohibited/);
  assert.doesNotMatch(coverageScript, /missing a numeric verified score/);

  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(
    packageJson.scripts['test:hard-launch-readiness'],
    /verify-profile-evidence-coverage\.mjs && node scripts\/verify-hard-launch-readiness\.mjs/,
  );
});
