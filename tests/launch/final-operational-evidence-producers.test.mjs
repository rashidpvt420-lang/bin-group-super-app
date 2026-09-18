import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateOperationalProofDocument } from '../../scripts/lib/operational-proof-schema.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('technician physical evidence is protected, canonical and requires real mobile, GPS, geofence and Storage proof', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/technician-physical-evidence.yml'),
    read('scripts/verify-technician-physical-evidence.mjs'),
    read('scripts/publish-direct-operational-proof.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Technician Physical Evidence/m);
  assert.match(workflow, /^\s{2}verify-physical-evidence:/m);
  assert.match(workflow, /environment:\s*hard-launch-operations/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{ secrets\.AUTHORIZED_FOUNDER_ACTORS \}\}/);
  assert.match(workflow, /allowed_actors/);
  assert.match(workflow, /VERIFY_TECHNICIAN_PHYSICAL_EVIDENCE/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /verify-technician-physical-evidence\.mjs/);
  assert.match(workflow, /Publish canonical technician operational evidence/);
  assert.match(workflow, /publish-direct-operational-proof\.mjs/);
  assert.match(workflow, /path:\s*release\/launch_package\/operational-proof\.json/);
  assert.match(workflow, /--arg operation verify/);
  assert.match(workflow, /confirmation:"VERIFY_PRODUCTION_FOUNDER_TOTP"/);

  assert.match(verifier, /gateKey:\s*'technicianPhysicalGpsEvidence'/);
  assert.match(verifier, /evidenceType:\s*'physical-device-report'/);
  assert.match(verifier, /sourceSystem:\s*'Firebase technician physical device GPS lifecycle and Cloud Storage'/);
  assert.match(verifier, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.doesNotMatch(verifier, /GITHUB_ACTOR !== 'rashidpvt420-lang'/);
  assert.match(verifier, /EXPECTED_STORAGE_BUCKET = 'bin-group-57c60\.firebasestorage\.app'/);
  assert.match(verifier, /admin\.storage\(\)\.bucket\(storageBucket\)/);
  assert.doesNotMatch(verifier, /admin\.storage\(\)\.bucket\(\s*\)/);
  assert.match(verifier, /unexpected Firebase Storage bucket/);
  assert.match(verifier, /physicalDeviceBound === true/);
  assert.match(verifier, /arrivalInstallationHash/);
  assert.match(verifier, /registeredInstallationHash/);
  assert.match(verifier, /deviceRegistered !== true/);
  assert.match(verifier, /gpsVerified === true/);
  assert.match(verifier, /onSiteVerification\)\.toUpperCase\(\) === 'GPS_VERIFIED'/);
  assert.match(verifier, /MAX_GPS_ACCURACY_METERS = 100/);
  assert.match(verifier, /accuracy <= MAX_GPS_ACCURACY_METERS/);
  assert.match(verifier, /MAX_PROPERTY_DISTANCE_METERS = 500/);
  assert.match(verifier, /propertyDistanceMeters > MAX_PROPERTY_DISTANCE_METERS/);
  assert.match(verifier, /haversineMeters/);
  assert.match(verifier, /millis\(data\.arrivedAt\) > 0/);
  assert.match(verifier, /millis\(data\.startedAt\) >= millis\(data\.arrivedAt\)/);
  assert.match(verifier, /millis\(data\.completedAt\) >= millis\(data\.startedAt\)/);
  assert.match(verifier, /bucket\.getFiles\(\{ prefix: 'maintenanceTickets\/'/);
  assert.match(verifier, /storedObjectNames\.has\(objectPath\)/);
  assert.doesNotMatch(verifier, /bucket\.file\(objectPath\)/);
  assert.match(verifier, /beforePhotoStored:\s*true/);
  assert.match(verifier, /afterPhotoStored:\s*true/);
  assert.match(verifier, /before-photo evidence does not resolve to an existing production Storage object/);
  assert.match(verifier, /after-photo evidence does not resolve to an existing production Storage object/);
  assert.match(verifier, /completion notes are missing/);
  assert.match(publisher, /'Technician Physical Evidence'/);
  assert.match(publisher, /gateKey:\s*'technicianPhysicalGpsEvidence'/);
  assert.match(publisher, /evidenceType:\s*'physical-device-report'/);
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /ticket_id:|technician_id:|founder_attested|manual pass|waiv/i);
});

test('privileged rotation evidence performs a real run-scoped E2E Admin rotation and preserves Phase 1 provider truth', async () => {
  const [workflow, verifier, publisher] = await Promise.all([
    read('.github/workflows/privileged-access-rotation-evidence.yml'),
    read('scripts/verify-privileged-access-rotation.mjs'),
    read('scripts/publish-direct-operational-proof.mjs'),
  ]);

  assert.match(workflow, /^name:\s*Privileged Access Rotation Evidence/m);
  assert.match(workflow, /^\s{2}verify-rotation:/m);
  assert.match(workflow, /environment:\s*hard-launch-operations/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS:\s*\$\{\{ secrets\.AUTHORIZED_FOUNDER_ACTORS \}\}/);
  assert.match(workflow, /allowed_actors/);
  assert.match(workflow, /VERIFY_PRIVILEGED_ACCESS_ROTATION/);
  assert.match(workflow, /expected_commit_sha.*GITHUB_SHA/s);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /verify-privileged-access-rotation\.mjs/);
  assert.match(workflow, /Publish canonical privileged-rotation evidence/);
  assert.match(workflow, /publish-direct-operational-proof\.mjs/);
  assert.match(workflow, /cp control-plane\/scripts\/lib\/operational-proof-schema\.mjs release\/scripts\/lib\/operational-proof-schema\.mjs/);
  assert.match(workflow, /path:\s*release\/launch_package\/operational-proof\.json/);

  assert.doesNotMatch(workflow, /E2E_ADMIN_BOOTSTRAP_PASSWORD|secrets\.E2E_ADMIN_PASSWORD/);
  assert.doesNotMatch(workflow, /^\s+E2E_ADMIN_PASSWORD:\s*\$\{\{ secrets\.E2E_ADMIN_PASSWORD \}\}/m);
  assert.doesNotMatch(workflow, /E2E_ADMIN_EMAIL:\s*\$\{\{ secrets\.E2E_FOUNDER_EMAIL \}\}/);
  assert.match(workflow, /Provision and rotate the ephemeral Admin for this evidence run/);
  assert.match(workflow, /Canonical Founder protection refused privileged rotation provisioning/);
  assert.match(workflow, /refusing to rotate an existing account without exact E2E Admin Auth and Firestore markers/);
  assert.match(workflow, /randomBytes\(36\)/);
  assert.match(workflow, /const provisionalPassword = randomPassword\(\)/);
  assert.match(workflow, /password:\s*provisionalPassword/);
  assert.match(workflow, /::add-mask::\$\{provisionalPassword\}/);
  assert.match(workflow, /disabled:\s*true/);
  assert.match(workflow, /rotationEvidenceRunId:\s*runId/);
  assert.match(workflow, /auth\.setCustomUserClaims\(user\.uid, evidenceClaims\)/);
  assert.match(workflow, /auth\.updateUser\(user\.uid,[\s\S]{0,180}password:\s*rotatedPassword/);
  assert.match(workflow, /auth\.revokeRefreshTokens\(user\.uid\)/);
  assert.match(workflow, /security_rotation_records/);
  assert.match(workflow, /passwordRotated:\s*true/);
  assert.match(workflow, /refreshTokensRevoked:\s*true/);
  assert.match(workflow, /adminUidHash:\s*hash\(user\.uid\)/);
  assert.match(workflow, /::add-mask::\$\{rotatedPassword\}/);
  assert.match(workflow, /E2E_ADMIN_PASSWORD=\$\{rotatedPassword\}/);
  assert.match(workflow, /Retire only this run's ephemeral Admin/);
  assert.match(workflow, /if:\s*\$\{\{\s*always\(\)\s*&&\s*hashFiles\('release\/package\.json'\)\s*!=\s*''\s*\}\}/);
  assert.match(workflow, /cleanup refused to delete an Admin not owned by this exact evidence run/);
  assert.match(workflow, /auth\.deleteUser\(user\.uid\)/);
  assert.match(workflow, /PRIVILEGED_ROTATION_E2E_ADMIN_RETIRED/);

  assert.match(verifier, /gateKey:\s*'privilegedAccessRotation'/);
  assert.match(verifier, /evidenceType:\s*'secret-rotation-record'/);
  assert.match(verifier, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.doesNotMatch(verifier, /GITHUB_ACTOR !== 'rashidpvt420-lang'/);
  assert.match(verifier, /secrets\/SMTP_PASS\/versions\?pageSize=100/);
  assert.doesNotMatch(verifier, /secrets\/STRIPE_SECRET_KEY\/versions\?pageSize=100/);
  assert.doesNotMatch(verifier, /secrets\/STRIPE_WEBHOOK_SECRET\/versions\?pageSize=100/);
  assert.match(verifier, /PHASE1_CASH_CHEQUE_V1/);
  assert.match(verifier, /disabledProvidersExcluded:\s*\['STRIPE', 'BANK_TRANSFER'\]/);
  assert.doesNotMatch(verifier, /request\(\{ url: secret\.url/);
  assert.match(verifier, /\['DISABLED', 'DESTROYED'\]/);
  assert.match(verifier, /tokensValidAfterTime/);
  assert.match(verifier, /security_rotation_records/);
  assert.match(verifier, /passwordRotated !== true/);
  assert.match(verifier, /refreshTokensRevoked !== true/);
  assert.match(verifier, /previousCredentialsRevoked:\s*true/);
  assert.match(publisher, /'Privileged Access Rotation Evidence'/);
  assert.match(publisher, /gateKey:\s*'privilegedAccessRotation'/);
  assert.match(publisher, /evidenceType:\s*'secret-rotation-record'/);
  assert.doesNotMatch(`${workflow}\n${verifier}\n${publisher}`, /secret_name:|admin_uid:|founder_attested|manual pass|waiv/i);
});

test('privileged rotation schema models Phase 1 SMTP plus an independently verified Admin credential', () => {
  const now = Date.UTC(2026, 8, 15, 4, 0, 0);
  const commitSha = 'a'.repeat(40);
  const adminUidHash = 'b'.repeat(64);
  const observedAt = new Date(now - 60_000).toISOString();
  const proof = {
    schemaVersion: 1,
    status: 'passed',
    generatedByWorkflow: true,
    gateKey: 'privilegedAccessRotation',
    evidenceType: 'secret-rotation-record',
    commitSha,
    projectId: 'bin-group-57c60',
    sourceRunId: '123456',
    sourceSystem: 'Google Secret Manager and Firebase Authentication',
    observedAt,
    phase1PaymentPolicy: 'PHASE1_CASH_CHEQUE_V1',
    disabledProvidersExcluded: ['STRIPE', 'BANK_TRANSFER'],
    previousCredentialsRevoked: true,
    rotationRecordId: 'rotation-record-123',
    rotatedSecrets: [{
      name: 'SMTP_PASS',
      latestVersionId: '8',
      rotatedAt: new Date(now - 120_000).toISOString(),
      previousRevokedCount: 2,
    }],
    adminUidHash,
    adminTokensValidAfterTime: new Date(now - 90_000).toISOString(),
    adminCredentialLogin: {
      status: 'passed',
      adminUidHash,
      adminEmailHash: 'c'.repeat(64),
      role: 'admin',
      authOutcome: 'password-accepted-authenticated',
      directAuthentication: true,
      mfaChallengeIssued: false,
      enrolledMfaFactorCount: 0,
      observedAt,
    },
    checks: [{ name: 'Phase 1 credentials rotated', status: 'passed', reference: 'secretmanager://SMTP_PASS' }],
  };
  const validate = (candidate) => validateOperationalProofDocument(candidate, {
    gateKey: 'privilegedAccessRotation',
    evidenceType: 'secret-rotation-record',
    commitSha,
    sourceRunId: '123456',
    now,
  });

  assert.deepEqual(validate(proof), []);
  assert.match(validate({ ...proof, rotatedSecrets: [...proof.rotatedSecrets, { name: 'STRIPE_SECRET_KEY' }] }).join('\n'), /exactly the active SMTP_PASS/);
  assert.match(validate({ ...proof, adminCredentialLogin: undefined }).join('\n'), /passed live Firebase Auth result/);
  assert.match(validate({ ...proof, adminCredentialLogin: { ...proof.adminCredentialLogin, adminUidHash: 'd'.repeat(64) } }).join('\n'), /must match the rotated Admin/);
});

test('direct operational publisher validates semantics and writes the complete canonical readiness record', async () => {
  const publisher = await read('scripts/publish-direct-operational-proof.mjs');

  assert.match(publisher, /requireAuthorizedApprover\(process\.env\.GITHUB_ACTOR\)/);
  assert.match(publisher, /validateOperationalProofDocument\(proof/);
  assert.match(publisher, /sha256File\(PROOF_PATH\)/);
  assert.match(publisher, /sourceProofHash/);
  assert.match(publisher, /evidenceReference = `https:\/\/github\.com\/\$\{EXPECTED_REPOSITORY\}\/actions\/runs\/\$\{runId\}#\$\{context\.gateKey\}`/);
  assert.match(publisher, /githubRepository:\s*EXPECTED_REPOSITORY/);
  assert.match(publisher, /verifiedBy:\s*'workflow'/);
  assert.match(publisher, /verifiedAt:\s*admin\.firestore\.FieldValue\.serverTimestamp\(\)/);
  assert.match(publisher, /operationalEvidence/);
  assert.match(publisher, /operationalEvidenceCommitSha/);
  assert.match(publisher, /canonical Firestore read-back verification failed/);
  assert.doesNotMatch(publisher, /Operational Proof Intake|founder_attested|waiv|manual pass/i);
});

// Exercise the actual credential-only workflow program with local dependencies.
// No credentials, Firebase requests or GitHub writes are used by these tests.
const credentialProgram = async () => {
  const workflow = await read('.github/workflows/operational-application-evidence.yml');
  const match = workflow.match(/node --input-type=module <<'FOUNDER_TOTP_REPAIR'\r?\n([\s\S]*?)\r?\n\s+FOUNDER_TOTP_REPAIR/m);
  assert.ok(match, 'the reviewed inline credential program must exist');
  const source = match[1].replace(/^ {10}/gm, '').replace(/\r\n/g, '\n');
  const library = source.split('// BEGIN PROTECTED EXECUTION')[0];
  return { workflow, source, api: await import(`data:text/javascript;base64,${Buffer.from(library).toString('base64')}`) };
};

function credentialFixture(mode = 'verify') {
  const now = Date.UTC(2026, 8, 13, 12);
  const env = {
    GITHUB_ACTIONS: 'true', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY_ID: '1173943093',
    GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
    FOUNDER_REPAIR_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_WORKFLOW: 'Operational Application Evidence', GITHUB_JOB: 'verify-and-sync-founder-totp',
    REPAIR_SOURCE_ENVIRONMENT: 'production', REPAIR_TARGET_ENVIRONMENT: 'hard-public-launch',
    GCP_PROJECT_ID: 'bin-group-57c60',
    PRODUCTION_RELEASE_SHA: '26b3609457fa80a70db56767db7c85be01d7b015', PRODUCTION_DEPLOY_RUN_ID: '35236281371',
    GITHUB_SHA: 'a'.repeat(40), TARGET_SHA: 'a'.repeat(40),
    AUTHORIZED_FOUNDER_ACTORS: ' fixture-owner, fixture-reviewer ', GITHUB_ACTOR: 'fixture-owner', GITHUB_TRIGGERING_ACTOR: 'fixture-owner',
    FOUNDER_TOTP_OPERATION: mode,
    CONFIRMATION: mode === 'sync' ? 'SYNC_PRODUCTION_FOUNDER_TOTP_AND_VERIFY_PAYMENT'
      : mode === 'repair-and-sync' ? 'REPAIR_PRODUCTION_FOUNDER_PASSWORD_VERIFY_TOTP_AND_SYNC_DESTINATION'
        : 'VERIFY_PRODUCTION_FOUNDER_TOTP',
    E2E_FOUNDER_EMAIL: 'ceo@bin-groups.com', E2E_FOUNDER_PASSWORD: 'local-only-fixture-password',
    E2E_FOUNDER_TOTP_SECRET: 'JBSWY3DPEHPK3PXP', VITE_FIREBASE_API_KEY: 'local-only-api-key',
    FOUNDER_TOTP_SYNC_TOKEN: 'local-only-permission-token', RUNNER_TEMP: '/tmp/local-only', PATH: '/usr/bin',
  };
  const deployment = {
    status: 'passed', projectId: env.GCP_PROJECT_ID, repository: env.GITHUB_REPOSITORY,
    workflowRef: 'refs/heads/main', deployedCommitSha: env.PRODUCTION_RELEASE_SHA,
    workflowRunId: env.PRODUCTION_DEPLOY_RUN_ID, validatedArtifactDigest: `sha256:${'b'.repeat(64)}`,
    deployedAt: new Date(now - 86400000).toISOString(),
  };
  const session = { uid: 'local-only-uid', secondFactorType: 'totp', secondFactorIdentifier: 'local-only-factor' };
  return { env, deployment, now, session };
}

test('[founder-credential] refuses context, actor, replay, debug and confirmation drift before any sign-in or write', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture();
  for (const override of [
    { GITHUB_ACTIONS: 'false' }, { GITHUB_SERVER_URL: 'https://other.invalid' }, { GITHUB_REPOSITORY_ID: '999' },
    { GITHUB_REPOSITORY: 'another/repository' }, { GITHUB_REF: 'refs/heads/pr' }, { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_WORKFLOW: 'Other Workflow' }, { GITHUB_JOB: 'verify-and-publish' }, { GITHUB_SHA: 'b'.repeat(40) },
    { REPAIR_SOURCE_ENVIRONMENT: 'staging' }, { REPAIR_TARGET_ENVIRONMENT: 'production' }, { GCP_PROJECT_ID: 'other' },
    { PRODUCTION_RELEASE_SHA: 'c'.repeat(40) }, { PRODUCTION_DEPLOY_RUN_ID: '987' },
    { GITHUB_ACTOR: 'outsider' }, { GITHUB_TRIGGERING_ACTOR: 'outsider' }, { AUTHORIZED_FOUNDER_ACTORS: '' },
    { CONFIRMATION: 'PUBLISH_OPERATIONAL_APPLICATION_EVIDENCE' }, { FOUNDER_TOTP_OPERATION: 'none' },
    { FOUNDER_TOTP_OPERATION: '__proto__' }, { RUNNER_DEBUG: '1' }, { ACTIONS_STEP_DEBUG: 'true' },
  ]) {
    let calls = 0;
    await assert.rejects(api.repairFounderTotp({ ...f, env: { ...f.env, ...override },
      signIn: async () => { calls++; return f.session; }, writeSecrets: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
});

test('[founder-credential] format validation rejects URLs, assignments, OTPs and passwords without leaking values', async () => {
  const { api } = await credentialProgram();
  assert.equal(api.normalizeFounderSeed('jbsw y3dp-ehpk3pxp='), 'JBSWY3DPEHPK3PXP');
  for (const value of ['', '234567', 'not_a_seed!', 'otpauth://totp/BIN?secret=JBSWY3DPEHPK3PXP',
    'E2E_FOUNDER_TOTP_SECRET=JBSWY3DPEHPK3PXP', '"JBSWY3DPEHPK3PXP"', 'JBSWY3DP\u200bEHPK3PXP', 'A'.repeat(257)]) {
    assert.throws(() => api.normalizeFounderSeed(value), (error) => {
      assert.match(error.message, /not valid Base32/);
      if (value) assert.ok(!error.message.includes(value));
      return true;
    });
  }
});

test('[founder-credential] frozen deployment identity, digest and seven-day freshness are mandatory', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture();
  for (const override of [
    { status: 'failed' }, { projectId: 'other' }, { repository: 'other/repo' }, { workflowRef: 'refs/heads/pr' },
    { deployedCommitSha: 'f'.repeat(40) }, { workflowRunId: '123' }, { validatedArtifactDigest: 'invalid' },
    { deployedAt: 'invalid' }, { deployedAt: new Date(f.now - 8 * 86400000).toISOString() },
    { deployedAt: new Date(f.now + 3600000).toISOString() },
  ]) assert.throws(() => api.checkRepairDeployment({ ...f.deployment, ...override }, f.env, f.now));
  assert.doesNotThrow(() => api.checkRepairDeployment(f.deployment, f.env, f.now));
});

test('[founder-credential] verify-only signs in but never invokes the writer or returns credentials', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture();
  delete f.env.FOUNDER_TOTP_SYNC_TOKEN;
  let signIns = 0;
  const report = await api.repairFounderTotp({ ...f,
    signIn: async (bindings) => {
      signIns++;
      assert.equal(bindings.email, 'ceo@bin-groups.com');
      assert.equal(bindings.referer, 'https://admin.bin-groups.com/');
      assert.equal(bindings.totpSecret, f.env.E2E_FOUNDER_TOTP_SECRET);
      return f.session;
    }, writeSecrets: async () => assert.fail('verify-only must not write'),
  });
  assert.equal(signIns, 1);
  assert.deepEqual(report, { sourceVerified: true, targetUpdated: false, passwordSynchronized: false });
});

test('[founder-credential] sync requires permission first, then a verified TOTP factor before exactly one write', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('sync');
  const order = [];
  const signIn = async () => { order.push('signin'); return f.session; };
  const writeSecrets = async ({ totpSecret, password }) => {
    assert.equal(totpSecret, f.env.E2E_FOUNDER_TOTP_SECRET);
    assert.equal(password, f.env.E2E_FOUNDER_PASSWORD);
    order.push('write');
  };
  await assert.rejects(api.repairFounderTotp({ ...f, env: { ...f.env, FOUNDER_TOTP_SYNC_TOKEN: '' }, signIn, writeSecrets }), /Environments write/);
  assert.deepEqual(order, []);
  const report = await api.repairFounderTotp({ ...f, signIn, writeSecrets });
  assert.deepEqual(order, ['signin', 'write']);
  assert.deepEqual(report, { sourceVerified: true, targetUpdated: true, passwordSynchronized: false });
});

test('[founder-credential] explicit repair synchronizes only the eligible canonical Founder, then requires existing TOTP before one destination write', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('repair-and-sync');
  const founder = {
    uid: 'canonical-founder-uid', email: 'ceo@bin-groups.com', disabled: false, emailVerified: true,
    customClaims: { role: 'ceo', admin: true },
    multiFactor: { enrolledFactors: [{ factorId: 'totp', uid: 'canonical-totp-factor' }] },
  };
  const order = [];
  let attempts = 0;
  const report = await api.repairFounderTotp({ ...f,
    signIn: async () => {
      order.push('signin');
      if (attempts++ === 0) throw new Error('Firebase first-factor sign-in failed: INVALID_LOGIN_CREDENTIALS');
      return f.session;
    },
    loadFounder: async (email) => { assert.equal(email, founder.email); order.push('load'); return founder; },
    updatePassword: async (uid, password) => {
      assert.equal(uid, founder.uid); assert.equal(password, f.env.E2E_FOUNDER_PASSWORD); order.push('password');
    },
    claimsGrantAdminPortal: (claims) => claims.admin === true,
    recoveryApproverRole: (claims) => claims.role,
    writeSecrets: async ({ totpSecret, password }) => {
      assert.equal(totpSecret, f.env.E2E_FOUNDER_TOTP_SECRET);
      assert.equal(password, f.env.E2E_FOUNDER_PASSWORD);
      order.push('write');
    },
  });
  assert.deepEqual(order, ['signin', 'load', 'password', 'signin', 'write']);
  assert.deepEqual(report, { sourceVerified: true, targetUpdated: true, passwordSynchronized: true });
});

test('[founder-credential] repair refuses account, claims and TOTP drift before a password or destination write', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('repair-and-sync');
  const valid = {
    uid: 'canonical-founder-uid', email: 'ceo@bin-groups.com', disabled: false, emailVerified: true,
    customClaims: { role: 'ceo', admin: true },
    multiFactor: { enrolledFactors: [{ factorId: 'totp', uid: 'canonical-totp-factor' }] },
  };
  const variants = [
    { uid: '' }, { email: 'other@example.com' }, { disabled: true }, { emailVerified: false },
    { customClaims: { role: 'member', admin: false } }, { multiFactor: { enrolledFactors: [] } },
    { multiFactor: { enrolledFactors: [{ factorId: 'phone', uid: 'phone-factor' }] } },
    { multiFactor: { enrolledFactors: [{ factorId: 'totp', uid: 'one' }, { factorId: 'totp', uid: 'two' }] } },
  ];
  for (const override of variants) {
    let writes = 0;
    await assert.rejects(api.repairFounderTotp({ ...f,
      signIn: async () => { throw new Error('Firebase first-factor sign-in failed: INVALID_LOGIN_CREDENTIALS'); },
      loadFounder: async () => ({ ...valid, ...override }),
      updatePassword: async () => { writes++; }, writeSecrets: async () => { writes++; },
      claimsGrantAdminPortal: (claims) => claims.admin === true,
      recoveryApproverRole: (claims) => claims.role,
    }), /not eligible/);
    assert.equal(writes, 0);
  }
});

test('[founder-credential] repair never mutates for non-password failures and never copies after a failed post-repair TOTP check', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('repair-and-sync');
  let updates = 0;
  await assert.rejects(api.repairFounderTotp({ ...f,
    signIn: async () => { throw new Error('Firebase TOTP sign-in failed: INVALID_VERIFICATION_CODE'); },
    loadFounder: async () => assert.fail('account must not be loaded'), updatePassword: async () => { updates++; },
    writeSecrets: async () => { updates++; },
  }), /TOTP_CODE_REJECTED/);
  assert.equal(updates, 0);

  const founder = { uid: 'canonical-founder-uid', email: 'ceo@bin-groups.com', disabled: false, emailVerified: true,
    customClaims: { role: 'super_admin', admin: true },
    multiFactor: { enrolledFactors: [{ factorId: 'totp', uid: 'canonical-totp-factor' }] } };
  await assert.rejects(api.repairFounderTotp({ ...f,
    signIn: async () => { throw new Error(updates++ === 0
      ? 'Firebase first-factor sign-in failed: INVALID_LOGIN_CREDENTIALS'
      : 'Firebase TOTP sign-in failed: INVALID_VERIFICATION_CODE'); },
    loadFounder: async () => founder, updatePassword: async () => { updates++; },
    claimsGrantAdminPortal: () => true, recoveryApproverRole: () => 'super_admin',
    writeSecrets: async () => assert.fail('failed TOTP must not reach destination'),
  }), /password synchronized but TOTP sign-in failed \(TOTP_CODE_REJECTED\)/);
});

test('[founder-credential] failed source sign-in, wrong factor or missing identity never changes the target', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('sync');
  for (const session of [null, {}, { ...f.session, uid: '' }, { ...f.session, secondFactorType: 'phone' }, { ...f.session, secondFactorIdentifier: '' }]) {
    await assert.rejects(api.repairFounderTotp({ ...f, signIn: async () => session,
      writeSecrets: async () => assert.fail('unverified source must not be copied') }), /did not verify/);
  }
  await assert.rejects(api.repairFounderTotp({ ...f,
    signIn: async () => { throw new Error(f.env.E2E_FOUNDER_TOTP_SECRET); },
    writeSecrets: async () => assert.fail('failed source must not be copied'),
  }), (error) => error.message.includes('sign-in failed') && !error.message.includes(f.env.E2E_FOUNDER_TOTP_SECRET));
});

test('[founder-credential] reports only allowlisted redacted sign-in failure categories', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('sync');
  const cases = [
    ['Firebase first-factor sign-in failed: INVALID_LOGIN_CREDENTIALS', 'FIRST_FACTOR_CREDENTIAL_REJECTED'],
    ['Firebase first-factor sign-in failed: USER_DISABLED', 'FOUNDER_ACCOUNT_REJECTED'],
    ['Firebase first-factor sign-in failed: API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_OR_PROJECT_REJECTED'],
    ['Firebase first-factor sign-in failed: TOO_MANY_ATTEMPTS_TRY_LATER', 'PROVIDER_THROTTLED'],
    ['Firebase did not return an enrolled TOTP challenge for the Founder account.', 'TOTP_CHALLENGE_MISSING'],
    ['Firebase TOTP sign-in failed after two consecutive TOTP windows: INVALID_VERIFICATION_CODE', 'TOTP_CODE_REJECTED'],
    ['Firebase TOTP sign-in failed: INTERNAL_ERROR', 'TOTP_FINALIZE_REJECTED'],
    ['Firebase Admin SDK rejected the Founder MFA ID token.', 'SIGNED_TOKEN_REJECTED'],
    ['Firebase MFA ID token has no authenticated user identifier.', 'VERIFIED_SESSION_REJECTED'],
    [`unexpected ${f.env.E2E_FOUNDER_PASSWORD} ${f.env.E2E_FOUNDER_TOTP_SECRET}`, 'UNKNOWN_REDACTED_FAILURE'],
  ];
  for (const [providerMessage, category] of cases) {
    assert.equal(api.classifyFounderSignInFailure(new Error(providerMessage)), category);
    await assert.rejects(api.repairFounderTotp({ ...f,
      signIn: async () => { throw new Error(providerMessage); },
      writeSecrets: async () => assert.fail('failed source must never be copied'),
    }), (error) => {
      assert.equal(error.message, `Production Founder TOTP sign-in failed (${category}); destination unchanged.`);
      assert.ok(!error.message.includes(f.env.E2E_FOUNDER_PASSWORD));
      assert.ok(!error.message.includes(f.env.E2E_FOUNDER_TOTP_SECRET));
      assert.ok(!error.message.includes(providerMessage));
      return true;
    });
  }
});

test('[founder-credential] missing credentials and ambiguous write failures stop without retries or leaked payloads', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('sync');
  for (const key of ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'VITE_FIREBASE_API_KEY', 'E2E_FOUNDER_TOTP_SECRET']) {
    await assert.rejects(api.repairFounderTotp({ ...f, env: { ...f.env, [key]: '' },
      signIn: async () => assert.fail('incomplete bindings must stop before sign-in'),
      writeSecrets: async () => assert.fail('incomplete bindings must not write'),
    }));
  }
  let writes = 0;
  await assert.rejects(api.repairFounderTotp({ ...f, signIn: async () => f.session,
    writeSecrets: async () => { writes++; throw new Error(f.env.FOUNDER_TOTP_SYNC_TOKEN); },
  }), (error) => error.message.includes('not confirmed') && !error.message.includes(f.env.FOUNDER_TOTP_SYNC_TOKEN));
  assert.equal(writes, 1);
});

test('[founder-credential] the writer pins repo/environment, writes password and TOTP by stdin, and keeps child env minimal', async () => {
  const { api } = await credentialProgram();
  const f = credentialFixture('sync');
  const writes = [];
  api.writeFounderEvidenceSecrets({
    password: f.env.E2E_FOUNDER_PASSWORD,
    totpSecret: f.env.E2E_FOUNDER_TOTP_SECRET,
  }, f.env, (command, args, options) => {
    assert.equal(command, 'gh');
    const name = args[2];
    writes.push({ name, value: options.input });
    assert.deepEqual(args.slice(0, 2), ['secret', 'set']);
    assert.deepEqual(args.slice(3), ['--repo', f.env.GITHUB_REPOSITORY, '--env', 'hard-public-launch', '--app', 'actions']);
    assert.ok(!args.join(' ').includes(options.input));
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
    assert.equal(options.env.GH_HOST, 'github.com');
    assert.equal(options.env.GH_TOKEN, f.env.FOUNDER_TOTP_SYNC_TOKEN);
    assert.ok(!Object.hasOwn(options.env, 'E2E_FOUNDER_PASSWORD'));
    assert.ok(!Object.hasOwn(options.env, 'E2E_FOUNDER_TOTP_SECRET'));
    assert.ok(!Object.hasOwn(options.env, 'GOOGLE_APPLICATION_CREDENTIALS'));
    assert.equal(options.timeout, 30000);
  });
  assert.deepEqual(writes, [
    { name: 'E2E_FOUNDER_PASSWORD', value: f.env.E2E_FOUNDER_PASSWORD },
    { name: 'E2E_FOUNDER_TOTP_SECRET', value: f.env.E2E_FOUNDER_TOTP_SECRET },
  ]);
});

test('[founder-credential] both environments authorize and only successful explicit sync enables payment replay', async () => {
  const { workflow, source } = await credentialProgram();
  assert.match(workflow, /founder_totp_operation:[\s\S]*?default: none/);
  const target = workflow.slice(workflow.indexOf('  authorize-founder-totp-repair:'), workflow.indexOf('  verify-and-sync-founder-totp:'));
  const production = workflow.slice(workflow.indexOf('  verify-and-sync-founder-totp:'));
  assert.match(target, /environment: hard-public-launch/);
  assert.match(target, /GITHUB_TRIGGERING_ACTOR/);
  assert.match(target, /verify\/all\|verify\/paymentUnlockExactlyOnce\|verify\/brokerCommissionLockExactlyOnce/);
  assert.match(target, /sync\/paymentUnlockExactlyOnce\|repair-and-sync\/paymentUnlockExactlyOnce/);
  assert.match(production, /needs: authorize-founder-totp-repair/);
  assert.match(production, /environment: production/);
  assert.match(production, /group: founder-totp-credential-sync/);
  assert.match(production, /FOUNDER_TOTP_SYNC_TOKEN: \$\{\{ \(inputs\.founder_totp_operation == 'sync' \|\| inputs\.founder_totp_operation == 'repair-and-sync'\)/);
  assert.match(workflow, /needs: \[authorize-founder-totp-repair, verify-and-sync-founder-totp\]/);
  assert.match(workflow, /!cancelled\(\).*inputs\.founder_totp_operation == 'repair-and-sync'.*needs\.verify-and-sync-founder-totp\.result == 'success'/);
  assert.match(source, /await import\('\.\/scripts\/lib\/firebase-mfa-sign-in\.mjs'\)/);
  assert.match(source, /await import\('\.\/scripts\/verify-admin-mfa-production\.mjs'\)/);
  assert.match(source, /initializeFirebaseAdmin\(admin, process\.env\.GCP_PROJECT_ID\)/);
  assert.match(source, /auth\.updateUser\(uid, \{ password \}\)/);
  assert.match(source, /writeFounderEvidenceSecrets/);
  assert.match(source, /\['E2E_FOUNDER_PASSWORD', password\]/);
  assert.match(source, /\['E2E_FOUNDER_TOTP_SECRET', totpSecret\]/);
  assert.match(source, /input: value/);
  assert.match(source, /category !== 'FIRST_FACTOR_CREDENTIAL_REJECTED'/);
  assert.match(source, /totpFactors\.length !== 1/);
  assert.doesNotMatch(source, /verify-founder-totp-signin\.mjs|deleteUser\(|unenroll\(|setCustomUserClaims\(|revokeRefreshTokens\(/);
  assert.doesNotMatch(production, /upload-artifact|GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|firebase deploy|deploy-firebase-production\.mjs/);
  assert.doesNotMatch(workflow, /GITHUB_ACTOR.*rashidpvt420-lang/s);
});
