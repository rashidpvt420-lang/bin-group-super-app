import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const ticketBindingScript = path.join(root, 'scripts/apply-ticket-rule-binding.mjs');
const rulesVerifier = path.join(root, 'scripts/verify-firestore-launch-hardening.mjs');
const scheduledVerifier = path.join(root, 'scripts/verify-scheduled-services-completeness.mjs');

const actorSpecificTicketRules = [
  'allow update: if isAdmin() && isNotSuspended();',
  'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
  'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
  'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
];

function runNode(script, cwd = root) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

test('checked-in rules become server-authoritative under the final prepare:rules transform', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'bin-ticket-rules-'));
  try {
    const sourceRules = readFileSync(path.join(root, 'firestore.rules'), 'utf8');
    writeFileSync(path.join(directory, 'firestore.rules'), sourceRules);

    const first = runNode(ticketBindingScript, directory);
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const preparedRules = readFileSync(path.join(directory, 'firestore.rules'), 'utf8');
    assert.doesNotMatch(preparedRules, /function\s+safeOpenMissionClaim\s*\(/);
    assert.doesNotMatch(preparedRules, /function\s+missionClaimFieldsLookValid\s*\(/);
    assert.doesNotMatch(preparedRules, /\|\|\s*safeOpenMissionClaim\(\)/);
    assert.doesNotMatch(preparedRules, /function\s+openMissionPoolRead\s*\(/);
    assert.doesNotMatch(preparedRules, /function\s+openMissionAvailable\s*\(/);
    assert.doesNotMatch(
      preparedRules,
      /allow update: if isAdmin\(\) \|\| safeDispatcherTicketUpdate\(\) \|\| safeTenantEvidenceUpdate\(\) \|\| safeTechnicianTicketUpdate\(\);/,
    );
    for (const rule of actorSpecificTicketRules) {
      assert.equal(
        preparedRules.split(rule).length - 1,
        2,
        `actor-specific ticket rule must exist once in tickets and once in maintenanceTickets: ${rule}`,
      );
    }

    const verification = runNode(rulesVerifier, directory);
    assert.equal(verification.status, 0, verification.stderr || verification.stdout);

    const beforeSecondRun = readFileSync(path.join(directory, 'firestore.rules'));
    const second = runNode(ticketBindingScript, directory);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const afterSecondRun = readFileSync(path.join(directory, 'firestore.rules'));
    assert.deepEqual(afterSecondRun, beforeSecondRun, 'ticket rule transform must be idempotent');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('scheduled-service verifier follows the centralized protected production lifecycle', () => {
  const result = runNode(scheduledVerifier);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const retiredWorkflow = readFileSync(
    path.join(root, '.github/workflows/scheduled-services-production.yml'),
    'utf8',
  );
  const protectedWorkflow = readFileSync(
    path.join(root, '.github/workflows/firebase-production-deploy.yml'),
    'utf8',
  );
  const deployRunner = readFileSync(path.join(root, 'scripts/deploy-firebase-production.mjs'), 'utf8');

  assert.match(retiredWorkflow, /Scheduled Services Production \(Retired\)/);
  assert.match(retiredWorkflow, /Refuse parallel production deployment/);
  assert.doesNotMatch(retiredWorkflow, /firebase deploy/);
  assert.match(protectedWorkflow, /environment: production/);
  assert.match(protectedWorkflow, /node scripts\/deploy-firebase-production\.mjs/);
  assert.match(deployRunner, /'functions,hosting,firestore:rules,firestore:indexes,storage'/);
});

test('launch-hardening verifier explicitly rejects direct technician assignment authority', () => {
  const verifierSource = readFileSync(rulesVerifier, 'utf8');
  assert.match(verifierSource, /direct client-side technician mission claim helper/);
  assert.match(verifierSource, /tickets update rule still permits direct technician claiming/);
  assert.match(verifierSource, /monolithic ticket update authorization/);
  assert.match(verifierSource, /Actor-specific ticket update rule must exist exactly twice/);
  assert.match(verifierSource, /Technician helper must rely on the outer actor\/assignment gate/);
});
