import { describe, it, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;

const RELEASE_SHA = 'a'.repeat(40);
const EVIDENCE_HASH = 'b'.repeat(64);

function launchRecord(uid, email, overrides = {}) {
  return {
    schemaVersion: 2,
    source: 'admin-command-center',
    gateId: 'ownerOnboardingFullPath',
    gateTitle: 'Owner onboarding to dashboard unlock',
    gateGroup: 'Owner',
    status: 'passed',
    testerName: 'Launch QA',
    role: 'owner',
    device: 'Desktop Chrome',
    productionUrl: 'https://bin-group-57c60.web.app/owner',
    releaseSha: RELEASE_SHA,
    workflowRunId: '32389868389',
    proofRef: 'github-actions://run/32389868389/artifact/owner-proof',
    notes: 'Execution-backed test evidence.',
    evidenceHash: EVIDENCE_HASH,
    recordedBy: uid,
    recordedByEmail: email,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

function smokeRecord(uid, email, overrides = {}) {
  return {
    schemaVersion: 2,
    source: 'admin-command-center',
    role: 'owner',
    status: 'passed',
    accountEmail: 'owner.e2e@bin-groups.com',
    route: '/owner',
    requiredRoute: '/owner',
    checkpoints: 'Fresh login, owner-scoped dashboard, active contract and property visible.',
    proofRef: 'github-actions://run/32389868389/artifact/owner-smoke',
    notes: 'Execution-backed signed-in smoke evidence.',
    releaseSha: RELEASE_SHA,
    workflowRunId: '32389868389',
    evidenceHash: EVIDENCE_HASH,
    recordedBy: uid,
    recordedByEmail: email,
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

describe('Public Launch Evidence Firestore Authority', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('high-trust Admin can append validated launch and smoke evidence', async () => {
    const email = 'launch-admin@bin-groups.com';
    const adminDb = testEnv.authenticatedContext('launch_admin', {
      role: 'admin',
      email,
      email_verified: true,
    }).firestore();

    await assertSucceeds(setDoc(doc(adminDb, 'launch_evidence/admin_launch'), launchRecord('launch_admin', email)));
    await assertSucceeds(setDoc(doc(adminDb, 'signed_in_smoke_checks/admin_smoke'), smokeRecord('launch_admin', email)));
  });

  it('authorized Admin-panel role can read evidence but cannot write it without the explicit permission', async () => {
    const adminEmail = 'launch-admin@bin-groups.com';
    const adminDb = testEnv.authenticatedContext('launch_admin', {
      role: 'admin',
      email: adminEmail,
      email_verified: true,
    }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'launch_evidence/readable'), launchRecord('launch_admin', adminEmail)));

    const operationsEmail = 'ops-admin@bin-groups.com';
    const operationsDb = testEnv.authenticatedContext('ops_admin', {
      role: 'operations_admin',
      email: operationsEmail,
      email_verified: true,
    }).firestore();

    await assertSucceeds(getDoc(doc(operationsDb, 'launch_evidence/readable')));
    await assertFails(setDoc(doc(operationsDb, 'launch_evidence/forbidden_write'), launchRecord('ops_admin', operationsEmail)));
  });

  it('ordinary signed-in roles cannot read or create launch evidence through the generic fallback', async () => {
    const ownerEmail = 'owner@bin-groups.com';
    const ownerDb = testEnv.authenticatedContext('owner_user', {
      role: 'owner',
      email: ownerEmail,
      email_verified: true,
    }).firestore();

    await assertFails(getDoc(doc(ownerDb, 'launch_evidence/anything')));
    await assertFails(setDoc(doc(ownerDb, 'launch_evidence/forged'), launchRecord('owner_user', ownerEmail)));
    await assertFails(setDoc(doc(ownerDb, 'signed_in_smoke_checks/forged'), smokeRecord('owner_user', ownerEmail)));
  });

  it('explicit canManageLaunchEvidence permission grants append authority without widening global Admin', async () => {
    const email = 'launch-operator@bin-groups.com';
    const operatorDb = testEnv.authenticatedContext('launch_operator', {
      role: 'support_staff',
      email,
      email_verified: true,
      permissions: { canManageLaunchEvidence: true },
    }).firestore();

    await assertSucceeds(setDoc(doc(operatorDb, 'launch_evidence/operator_launch'), launchRecord('launch_operator', email)));
    await assertSucceeds(getDoc(doc(operatorDb, 'launch_evidence/operator_launch')));
  });

  it('evidence is append-only even for Admin and cannot be rewritten or deleted', async () => {
    const email = 'launch-admin@bin-groups.com';
    const adminDb = testEnv.authenticatedContext('launch_admin', {
      role: 'admin',
      email,
      email_verified: true,
    }).firestore();
    const ref = doc(adminDb, 'launch_evidence/immutable');

    await assertSucceeds(setDoc(ref, launchRecord('launch_admin', email)));
    await assertFails(updateDoc(ref, { notes: 'rewritten after the fact' }));
    await assertFails(deleteDoc(ref));
  });

  it('create rejects unbound, malformed or non-production evidence', async () => {
    const email = 'launch-admin@bin-groups.com';
    const adminDb = testEnv.authenticatedContext('launch_admin', {
      role: 'admin',
      email,
      email_verified: true,
    }).firestore();

    await assertFails(setDoc(
      doc(adminDb, 'launch_evidence/bad_hash'),
      launchRecord('launch_admin', email, { evidenceHash: 'not-a-sha256' }),
    ));
    await assertFails(setDoc(
      doc(adminDb, 'launch_evidence/wrong_recorder'),
      launchRecord('someone_else', email),
    ));
    await assertFails(setDoc(
      doc(adminDb, 'launch_evidence/staging_url'),
      launchRecord('launch_admin', email, { productionUrl: 'https://example.com' }),
    ));
  });
});
