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
    assert.match(rules, /let authenticated = signedIn\(\);/);
    assert.match(rules, /let role = authenticated/);
    assert.match(rules, /let admin = authenticated && \(/);
    assert.match(rules, /let dispatcher = authenticated && \(/);
    assert.match(rules, /\(admin && isNotSuspended\(\)\)/);
    assert.match(rules, /\(!admin && dispatcher && safeDispatcherTicketUpdate\(\)\)/);
    assert.match(rules, /\(!admin && !dispatcher && role in \['', 'tenant'\] && tenantOwns\(resource\.data\) && safeTenantEvidenceUpdate\(\)\)/);
    assert.match(rules, /\(!admin && !dispatcher && role in \['technician', 'tech'\] && techOwns\(resource\.data\) && safeTechnicianTicketUpdate\(\)\)/);
    assert.match(rules, /match \/fcmTokens\/\{tokenId\} \{/);
    assert.match(rules, /match \/deviceReadiness\/\{readinessId\} \{/);
    assert.match(rules, /match \/\{subcollection\}\/\{document=\*\*\} \{\n\s*allow read, write: if false;/);

    assert.match(
      rules,
      /allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !\(collection in \['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions', 'private_hr_profiles'\]\) && hasAdminClaim\(\);/,
    );
    assert.match(rules, /allow create: if collection != 'tickets' && collection != 'maintenanceTickets' && !\(/);
    assert.match(rules, /allow update, delete: if collection != 'tickets' && collection != 'maintenanceTickets' && !\(/);
    assert.doesNotMatch(rules, /'users',\n\s*'tickets',\n\s*'maintenanceTickets',\n\s*'audit_logs'/);
    assert.match(rules, /match \/broker_kyc_profiles\/\{brokerId\} \{/);
    assert.match(rules, /match \/broker_kyc_submission_limits\/\{brokerId\} \{\n\s*allow read, write: if false;/);
    assert.match(rules, /match \/admin_security_sessions\/\{sessionId\} \{\n\s*allow read, write: if false;/);
    assert.match(rules, /match \/private_hr_profiles\/\{profileId\} \{\n\s*allow read, write: if false;/);
    assert.match(rules, /'system_secrets',\n\s*'users',\n\s*'audit_logs',\n\s*'admin_security_sessions',\n\s*'private_hr_profiles'/);
    assert.match(rules, /'broker_kyc_profiles',\n\s*'broker_kyc_submission_limits',\n\s*'ai_usage'/);
    for (const legacy of [
      'allow update: if isAdmin() && isNotSuspended();',
      'allow update: if hasNonAdminDispatchClaimOnly() && safeDispatcherTicketUpdate();',
      'allow update: if tenantOwns(resource.data) && safeTenantEvidenceUpdate();',
      'allow update: if hasTechnicianClaim() && techOwns(resource.data) && safeTechnicianTicketUpdate();',
      "allow read: if !(collection in ['system_secrets', 'users', 'tickets', 'maintenanceTickets', 'broker_kyc_submission_limits']) && hasAdminClaim();",
      "allow read: if collection != 'tickets' && collection != 'maintenanceTickets' && !(collection in ['system_secrets', 'users', 'broker_kyc_submission_limits', 'admin_security_sessions']) && hasAdminClaim();",
    ]) assert.equal(rules.includes(legacy), false);

    const routerStart = rules.indexOf('    function safeTicketUpdateByActor() {');
    const routerEnd = rules.indexOf('\n    }', routerStart) + '\n    }'.length;
    const router = rules.slice(routerStart, routerEnd);
    for (const repeatedHelper of ['hasAdminClaim()', 'hasNonAdminDispatchClaimOnly()', 'claimedRole()']) {
      assert.equal(router.includes(repeatedHelper), false, `router must not re-evaluate ${repeatedHelper}`);
    }

    const beforeSecond = readFileSync(target);
    const second = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual(readFileSync(target), beforeSecond);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
