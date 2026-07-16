import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const hardener = path.join(root, 'scripts/harden-final-firestore-authority.mjs');

test('final Firestore authority hardener is status-aware, explicit, bounded and idempotent', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'bin-final-firestore-authority-'));
  try {
    const target = path.join(directory, 'firestore.rules');
    writeFileSync(target, readFileSync(path.join(root, 'firestore.rules')));

    const first = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const rules = readFileSync(target, 'utf8');
    assert.match(rules, /function profileAllowsAccess\(data\)/);
    assert.match(rules, /data\.get\('status', ''\) in \[/);
    assert.match(rules, /function hasDispatchAuthorityClaimOnly\(\)/);
    assert.match(rules, /function hasNonAdminDispatchClaimOnly\(\)/);
    assert.match(rules, /return hasDispatchAuthorityClaimOnly\(\) && isNotSuspended\(\);/);
    assert.match(rules, /function safeTicketUpdateByActor\(\)/);
    assert.equal(rules.split('allow update: if safeTicketUpdateByActor();').length - 1, 2);
    assert.match(rules, /claimedRole\(\) in \['technician', 'tech'\] && techOwns\(resource\.data\) && safeTechnicianTicketUpdate\(\)/);
    assert.match(rules, /tenantOwns\(resource\.data\) && safeTenantEvidenceUpdate\(\)/);
    assert.match(rules, /let changed = request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\);/);
    assert.match(rules, /!changed\.hasAny\(\['afterPhotos'\]\)/);
    assert.match(rules, /match \/fcmTokens\/\{tokenId\} \{/);
    assert.match(rules, /match \/deviceReadiness\/\{readinessId\} \{/);
    assert.match(rules, /match \/\{subcollection\}\/\{document=\*\*\} \{\n\s*allow read, write: if false;/);

    assert.match(
      rules,
      /!\(collection in \['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits'\]\) && hasAdminClaim\(\)/,
    );
    assert.match(rules, /match \/broker_kyc_profiles\/\{brokerId\} \{/);
    assert.match(rules, /match \/broker_kyc_submission_limits\/\{brokerId\} \{\n\s*allow read, write: if false;/);
    assert.match(rules, /'broker_kyc_profiles',\n\s*'broker_kyc_submission_limits',\n\s*'ai_usage'/);
    for (const legacy of [
      'allow update: if isAdmin() && isNotSuspended();',
      'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
      'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
      'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
    ]) assert.equal(rules.includes(legacy), false);

    const beforeSecond = readFileSync(target);
    const second = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual(readFileSync(target), beforeSecond);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
