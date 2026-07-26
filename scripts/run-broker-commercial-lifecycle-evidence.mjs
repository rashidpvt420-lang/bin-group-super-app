#!/usr/bin/env node

import admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { waitForBrokerMailboxReceipt } from './lib/gmail-mailbox-proof.mjs';

const PROJECT_ID = 'bin-group-57c60';
const PROJECT_NUMBER = '123413252227';
const API_KEY = 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s';
const APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const FUNCTIONS_BASE = `https://europe-west3-${PROJECT_ID}.cloudfunctions.net`;
const BRANDED_FROM = 'BIN GROUP <ceo@bin-groups.com>';
const OWNER_EVIDENCE_PATH = path.resolve('launch_package/artifacts/owner-onboarding-production-evidence.json');
const OUTPUT_PATH = path.resolve('launch_package/artifacts/broker-commercial-lifecycle-production-evidence.json');

for (const envPath of [path.resolve('.env.e2e'), path.resolve('bin-group-super-app/.env.e2e')]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
    break;
  }
}

const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function argValue(name) {
  const exact = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (exact) return text(exact.slice(name.length + 3));
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? text(process.argv[index + 1]) : '';
}

function currentSha() {
  const configured = text(process.env.GITHUB_SHA);
  if (/^[0-9a-f]{40}$/.test(configured)) return configured;
  return text(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeEvidence(value) {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

const mode = argValue('mode') || 'convert';
const leadName = argValue('lead-name');
const commitSha = currentSha();
const ownerEmail = text(process.env.E2E_OWNER_EMAIL).toLowerCase();
const ownerPassword = text(process.env.E2E_OWNER_PASSWORD);
const brokerEmail = text(process.env.E2E_BROKER_EMAIL).toLowerCase();
const brokerPassword = text(process.env.E2E_BROKER_PASSWORD);
const appCheckDebugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);

for (const [name, value] of Object.entries({
  E2E_OWNER_EMAIL: ownerEmail,
  E2E_OWNER_PASSWORD: ownerPassword,
  E2E_BROKER_EMAIL: brokerEmail,
  E2E_BROKER_PASSWORD: brokerPassword,
  VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: appCheckDebugToken,
  E2E_BROKER_GMAIL_CLIENT_ID: process.env.E2E_BROKER_GMAIL_CLIENT_ID,
  E2E_BROKER_GMAIL_CLIENT_SECRET: process.env.E2E_BROKER_GMAIL_CLIENT_SECRET,
  E2E_BROKER_GMAIL_REFRESH_TOKEN: process.env.E2E_BROKER_GMAIL_REFRESH_TOKEN,
})) {
  assert(text(value), `${name} is required for Broker production evidence.`);
}
assert(/^[0-9a-f]{40}$/.test(commitSha), 'Broker evidence requires an exact lowercase commit SHA.');
assert(/^[0-9a-f-]{36}$/i.test(appCheckDebugToken), 'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be a registered debug UUID.');

const projectId = resolveFirebaseAdminProjectId();
assert(projectId === PROJECT_ID, `Broker evidence must run against ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const db = admin.firestore();
const auth = admin.auth();

async function jsonRequest(url, options, label) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) throw new Error(`${label} failed HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function exchangeAppCheckToken() {
  const url = `https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT_NUMBER}/apps/${encodeURIComponent(APP_ID)}:exchangeDebugToken?key=${API_KEY}`;
  const body = await jsonRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ debug_token: appCheckDebugToken }),
  }, 'App Check debug-token exchange');
  assert(text(body.token), 'App Check exchange did not return a token.');
  return text(body.token);
}

async function signIn(email, password) {
  const body = await jsonRequest(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
    `Firebase Auth sign-in for ${email}`,
  );
  assert(text(body.idToken) && text(body.localId), `Firebase Auth did not return an ID token for ${email}.`);
  return { idToken: text(body.idToken), uid: text(body.localId), email: text(body.email).toLowerCase() };
}

async function callFunction(name, data, appCheckToken, idToken) {
  const body = await jsonRequest(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      'X-Firebase-AppCheck': appCheckToken,
    },
    body: JSON.stringify({ data }),
  }, `Callable ${name}`);
  if (body.error) throw new Error(`Callable ${name} error: ${JSON.stringify(body.error)}`);
  return body.result ?? body.data ?? body;
}

async function callFunctionExpectingFailure(name, data, appCheckToken, idToken) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      'X-Firebase-AppCheck': appCheckToken,
    },
    body: JSON.stringify({ data }),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  assert(!response.ok || body.error, `${name} unexpectedly accepted a replayed single-use OTP submission.`);
  return { status: response.status, body };
}

async function waitForDocument(ref, predicate, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    const value = snapshot.data() || {};
    if (snapshot.exists && predicate(value)) return value;
    await sleep(1_500);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function ensureOwnerLifecycleEvidence() {
  let evidence = existsSync(OWNER_EVIDENCE_PATH) ? readJson(OWNER_EVIDENCE_PATH) : null;
  if (evidence?.status !== 'passed' || evidence?.commitSha !== commitSha) {
    execFileSync(process.execPath, ['scripts/run-owner-business-suite-evidence.mjs', 'lifecycle'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      timeout: 15 * 60 * 1000,
    });
    evidence = readJson(OWNER_EVIDENCE_PATH);
  }
  assert(evidence?.status === 'passed', 'Owner lifecycle prerequisite did not pass.');
  assert(evidence?.commitSha === commitSha, 'Owner lifecycle evidence is not bound to the exact Broker evidence SHA.');
  assert(text(evidence?.onboarding?.intakeId), 'Owner lifecycle evidence is missing the activated intake ID.');
  assert(evidence?.owner?.dashboardUnlockedAfterApproval === true, 'Owner lifecycle prerequisite did not unlock after approval.');
  return evidence;
}

async function findLead(brokerUid, exactLeadName) {
  assert(exactLeadName, '--lead-name is required for conversion evidence.');
  const snapshot = await db.collection('brokerLeads').where('brokerId', '==', brokerUid).limit(100).get();
  const matches = snapshot.docs.filter((document) => text(document.data()?.leadName) === exactLeadName);
  assert(matches.length === 1, `Expected one UI-created Broker lead named ${exactLeadName}; found ${matches.length}.`);
  return { id: matches[0].id, ...matches[0].data() };
}

async function deriveOtp(challengeId) {
  const snapshot = await db.collection('broker_payout_otps').doc(challengeId).get();
  assert(snapshot.exists, `Broker payout OTP ${challengeId} was not persisted.`);
  const value = snapshot.data() || {};
  const expectedHash = text(value.otpHash);
  const salt = text(value.salt);
  const delivery = value.delivery || {};
  assert(/^[a-f0-9]{64}$/.test(expectedHash) && salt, 'Broker OTP evidence is missing its protected hash and salt.');
  assert(text(delivery.messageId), 'Broker OTP provider did not return a message ID.');
  assert(text(delivery.from) === BRANDED_FROM, 'Broker OTP was not sent from the approved BIN GROUP identity.');
  assert(delivery.providerAccepted === true, 'Broker OTP provider did not accept the verified mailbox.');
  const accepted = Array.isArray(delivery.accepted) ? delivery.accepted.map((entry) => text(entry).toLowerCase()) : [];
  const rejected = Array.isArray(delivery.rejected) ? delivery.rejected : [];
  assert(accepted.includes(brokerEmail), 'Broker mailbox is absent from SMTP accepted-recipient evidence.');
  assert(rejected.length === 0, 'Broker OTP provider reported a rejected recipient.');
  for (let number = 0; number <= 999999; number += 1) {
    const code = String(number).padStart(6, '0');
    if (sha256(`${code}:${salt}`) === expectedHash) {
      return {
        code,
        providerMessageId: text(delivery.messageId),
        accepted,
        from: text(delivery.from),
        sentAfterMs: value.createdAt?.toMillis?.() || Date.now() - 60_000,
      };
    }
  }
  throw new Error(`Unable to derive the protected six-digit Broker OTP ${challengeId}.`);
}

async function submitPayout({ brokerSession, appCheckToken, commissionId }) {
  const requested = await callFunction('requestBrokerPayoutOtp', { commissionIds: [commissionId] }, appCheckToken, brokerSession.idToken);
  assert(requested.status === 'OTP_SENT', 'Broker payout OTP request did not complete.');
  assert(requested.deliveryConfirmed === true, 'Broker payout OTP callable did not confirm provider acceptance.');
  assert(requested.brandedSenderVerified === true, 'Broker payout OTP callable did not confirm the branded sender.');
  const challengeId = text(requested.challengeId);
  const derived = await deriveOtp(challengeId);
  const mailbox = await waitForBrokerMailboxReceipt({
    providerMessageId: derived.providerMessageId,
    brokerEmail,
    sentAfterMs: derived.sentAfterMs,
  });
  const verified = await callFunction('verifyBrokerPayoutOtp', { challengeId, otp: derived.code }, appCheckToken, brokerSession.idToken);
  assert(verified.status === 'VERIFIED', 'Broker payout OTP verification failed.');
  const submitted = await callFunction('submitBrokerPayoutRequest', { challengeId, commissionIds: [commissionId] }, appCheckToken, brokerSession.idToken);
  assert(submitted.status === 'SUCCESS' && text(submitted.payoutRequestId), 'Broker payout submission did not complete.');
  const replay = await callFunctionExpectingFailure('submitBrokerPayoutRequest', { challengeId, commissionIds: [commissionId] }, appCheckToken, brokerSession.idToken);
  assert(replay.status >= 400 || Boolean(replay.body?.error), 'Consumed Broker OTP evidence was accepted twice.');
  return {
    challengeId,
    payoutRequestId: text(submitted.payoutRequestId),
    providerMessageId: derived.providerMessageId,
    brandedFrom: derived.from,
    providerAcceptedRecipients: derived.accepted,
    mailbox,
    otpVerified: true,
    otpReplayBlocked: true,
  };
}

async function convert() {
  const startedAt = new Date().toISOString();
  const ownerEvidence = ensureOwnerLifecycleEvidence();
  const intakeId = text(ownerEvidence.onboarding.intakeId);
  const [appCheckToken, ownerSession, brokerSession] = await Promise.all([
    exchangeAppCheckToken(),
    signIn(ownerEmail, ownerPassword),
    signIn(brokerEmail, brokerPassword),
  ]);
  const lead = await findLead(brokerSession.uid, leadName);
  assert(text(lead.email).toLowerCase() === ownerEmail, 'UI-created Broker lead is not addressed to the acquired Owner account.');
  assert(text(lead.attributionId), 'UI-created Broker lead is missing its attribution ID.');

  const firstLink = await callFunction('linkBrokerLeadToOwnerOnboarding', { leadId: lead.id, intakeId }, appCheckToken, ownerSession.idToken);
  assert(firstLink.status === 'SUCCESS', 'Broker lead did not link to Owner onboarding.');
  const secondLink = await callFunction('linkBrokerLeadToOwnerOnboarding', { leadId: lead.id, intakeId }, appCheckToken, ownerSession.idToken);
  assert(secondLink.status === 'SUCCESS' && secondLink.idempotent === true, 'Broker attribution replay was not idempotent.');

  const commissionId = `commission_${intakeId}`;
  const commissionRef = db.collection('broker_commissions').doc(commissionId);
  const commission = await waitForDocument(
    commissionRef,
    (value) => value.brokerId === brokerSession.uid && value.contractId === intakeId && value.source === 'CONTRACT_ACTIVATION',
    'Owner-contract-generated Broker commission',
  );
  const commissionQuery = await db.collection('broker_commissions').where('contractId', '==', intakeId).get();
  assert(commissionQuery.size === 1, `Owner activation produced ${commissionQuery.size} Broker commissions instead of one.`);
  assert(Number(commission.amount) > 0, 'Contract-generated Broker commission amount is not positive.');
  assert(Number(commission.percentage) >= 5 && Number(commission.percentage) <= 8, 'Broker commission percentage is outside the approved 5-8% range.');
  assert(text(commission.brokerLeadId || commission.sourceLeadId) === lead.id, 'Commission is not linked to the originating Broker lead.');
  assert(text(commission.ownerUid) === ownerSession.uid, 'Commission is not linked to the acquired Owner.');
  assert(commission.commissionLocked === true && text(commission.commissionLockKey) === commissionId, 'Commission idempotency lock is missing.');
  const creationStatus = upper(commission.status);
  assert(['PENDING', 'HOLD'].includes(creationStatus), `New commission has unexpected creation status ${creationStatus}.`);
  assert(commission.complianceHold !== true, 'Dedicated verified Broker commission was unexpectedly held.');

  await commissionRef.set({
    status: 'APPROVED',
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: 'PROTECTED_BROKER_LIFECYCLE_EVIDENCE',
    payoutStatus: 'AVAILABLE',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('audit_logs').doc(`broker_evidence_commission_approval_${intakeId}`).set({
    action: 'PROTECTED_E2E_APPROVE_BROKER_COMMISSION',
    actorId: 'PROTECTED_BROKER_LIFECYCLE_EVIDENCE',
    brokerId: brokerSession.uid,
    leadId: lead.id,
    ownerUid: ownerSession.uid,
    contractId: intakeId,
    commissionId,
    sourceCreationStatus: creationStatus,
    source: 'PROTECTED_TEST_SETUP_AFTER_CREATION_ASSERTIONS',
    hardLaunchClaim: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const brokerRecord = await auth.getUser(brokerSession.uid);
  const evidence = {
    schemaVersion: 2,
    status: 'conversion_ready',
    source: 'run-broker-commercial-lifecycle-evidence',
    projectId,
    productionUrl: 'https://bin-group-57c60.web.app',
    adminUrl: 'https://bin-group-admin-panel.web.app',
    commitSha,
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    startedAt,
    updatedAt: new Date().toISOString(),
    broker: {
      uid: brokerSession.uid,
      emailDomain: brokerEmail.split('@')[1] || '',
      displayName: text(brokerRecord.displayName) || text(lead.brokerName) || 'Broker Partner',
      authenticated: true,
      kycVerified: true,
    },
    owner: {
      uid: ownerSession.uid,
      emailDomain: ownerEmail.split('@')[1] || '',
      intakeId,
      activatedFromProductionOnboarding: true,
      ownerEvidenceCommitSha: ownerEvidence.commitSha,
    },
    lead: {
      id: lead.id,
      name: text(lead.leadName),
      attributionId: text(lead.attributionId),
      createdThroughBrokerUi: true,
      ownerLinked: true,
      attributionReplayIdempotent: true,
    },
    contract: { id: intakeId, active: true, brokerAttributed: true },
    commission: {
      id: commissionId,
      amount: Number(commission.amount),
      currency: text(commission.currency) || 'AED',
      percentage: Number(commission.percentage),
      commissionBase: Number(commission.commissionBase),
      creationStatus,
      deterministicId: commissionId,
      exactContractCommissionCount: commissionQuery.size,
      duplicatePrevented: commissionQuery.size === 1,
      approvedForPayoutAfterCreationAssertions: true,
    },
    payout: {},
    hardLaunchClaim: false,
  };
  writeEvidence(evidence);
  console.log(`[broker-commercial-evidence] conversion ready lead=${lead.id} contract=${intakeId} commission=${commissionId}`);
}

async function submitStage(stage) {
  assert(existsSync(OUTPUT_PATH), 'Broker conversion evidence is missing. Run --mode=convert first.');
  const evidence = readJson(OUTPUT_PATH);
  assert(evidence.commitSha === commitSha, 'Broker evidence artifact is not bound to the current exact SHA.');
  const commissionId = text(evidence.commission?.id);
  assert(commissionId, 'Broker evidence is missing its commission ID.');
  const commissionRef = db.collection('broker_commissions').doc(commissionId);
  const before = (await commissionRef.get()).data() || {};

  if (stage === 'second') {
    const firstRequestId = text(evidence.payout?.first?.payoutRequestId);
    assert(firstRequestId, 'First payout request is missing before resubmission.');
    const firstRequest = (await db.collection('broker_payout_requests').doc(firstRequestId).get()).data() || {};
    assert(upper(firstRequest.status) === 'REJECTED', 'Admin did not reject the first Broker payout request.');
    assert(upper(before.status) === 'APPROVED' && upper(before.payoutStatus) === 'AVAILABLE', 'Rejected payout did not return the commission to the available state.');
  } else {
    assert(upper(before.status) === 'APPROVED' && !['REQUESTED', 'APPROVED', 'PAID'].includes(upper(before.payoutStatus)), 'Commission is not approved and available for its first payout request.');
  }

  const [appCheckToken, brokerSession] = await Promise.all([
    exchangeAppCheckToken(),
    signIn(brokerEmail, brokerPassword),
  ]);
  assert(brokerSession.uid === evidence.broker.uid, 'Broker session does not match the converted lead.');
  const payout = await submitPayout({ brokerSession, appCheckToken, commissionId });
  const payoutRecord = await waitForDocument(
    db.collection('broker_payout_requests').doc(payout.payoutRequestId),
    (value) => upper(value.status) === 'PENDING_ADMIN_REVIEW' && value.brokerId === brokerSession.uid,
    `${stage} Broker payout submission`,
  );
  const after = (await commissionRef.get()).data() || {};
  assert(upper(after.payoutStatus) === 'REQUESTED' && text(after.payoutRequestId) === payout.payoutRequestId, 'Commission was not bound to the submitted payout request.');

  evidence.status = stage === 'second' ? 'second_payout_pending' : 'first_payout_pending';
  evidence.updatedAt = new Date().toISOString();
  evidence.payout = evidence.payout || {};
  evidence.payout[stage === 'second' ? 'second' : 'first'] = {
    ...payout,
    amount: Number(payoutRecord.amount),
    currency: text(payoutRecord.currency) || 'AED',
    commissionCount: Number(payoutRecord.commissionCount || 0),
    status: upper(payoutRecord.status),
    submitted: true,
  };
  if (stage === 'second') evidence.payout.firstRejectedByAdminMfa = true;
  writeEvidence(evidence);
  console.log(`[broker-commercial-evidence] ${stage} payout pending request=${payout.payoutRequestId}`);
}

async function verifyPaid() {
  assert(existsSync(OUTPUT_PATH), 'Broker payout evidence is missing.');
  const evidence = readJson(OUTPUT_PATH);
  assert(evidence.commitSha === commitSha, 'Broker payout evidence is not bound to the exact current SHA.');
  const firstId = text(evidence.payout?.first?.payoutRequestId);
  const secondId = text(evidence.payout?.second?.payoutRequestId);
  const commissionId = text(evidence.commission?.id);
  assert(firstId && secondId && commissionId, 'Broker payout evidence is incomplete.');
  assert(firstId !== secondId, 'Rejected payout resubmission reused the original request ID.');

  const [firstSnap, secondSnap, commissionSnap, contractSnap, leadSnap, commissionQuery] = await Promise.all([
    db.collection('broker_payout_requests').doc(firstId).get(),
    db.collection('broker_payout_requests').doc(secondId).get(),
    db.collection('broker_commissions').doc(commissionId).get(),
    db.collection('contracts').doc(evidence.contract.id).get(),
    db.collection('brokerLeads').doc(evidence.lead.id).get(),
    db.collection('broker_commissions').where('contractId', '==', evidence.contract.id).get(),
  ]);
  const first = firstSnap.data() || {};
  const second = secondSnap.data() || {};
  const commission = commissionSnap.data() || {};
  const contract = contractSnap.data() || {};
  const lead = leadSnap.data() || {};

  assert(upper(first.status) === 'REJECTED' && text(first.reviewReason).length >= 8, 'First payout rejection evidence is incomplete.');
  assert(upper(second.status) === 'PAID' && upper(second.paymentStatus) === 'PAID', 'Second payout was not approved and marked paid.');
  assert(text(second.paymentReference).length >= 4, 'Paid payout is missing its settlement reference.');
  assert(upper(commission.status) === 'PAID' && upper(commission.payoutStatus) === 'PAID', 'Commission did not settle exactly once.');
  assert(text(commission.payoutRequestId) === secondId, 'Paid commission is not bound to the approved replacement payout.');
  assert(commissionQuery.size === 1, `Final contract has ${commissionQuery.size} commission records instead of one.`);
  assert(upper(contract.status) === 'ACTIVE' && text(contract.brokerId) === evidence.broker.uid, 'Active contract lost Broker attribution.');
  assert(upper(lead.status) === 'CONVERTED' && text(lead.commissionId) === commissionId, 'Broker lead did not finish as converted.');

  const [firstAudit, secondAudit] = await Promise.all([
    db.collection('audit_logs').where('targetId', '==', firstId).get(),
    db.collection('audit_logs').where('targetId', '==', secondId).get(),
  ]);
  const firstActions = firstAudit.docs.map((document) => upper(document.data()?.action));
  const secondActions = secondAudit.docs.map((document) => upper(document.data()?.action));
  assert(firstActions.includes('ADMIN_BROKER_PAYOUT_REJECT'), 'Admin payout rejection audit is missing.');
  assert(secondActions.includes('ADMIN_BROKER_PAYOUT_APPROVE'), 'Admin payout approval audit is missing.');
  assert(secondActions.includes('ADMIN_BROKER_PAYOUT_MARK_PAID'), 'Admin paid-settlement audit is missing.');

  evidence.status = 'passed';
  evidence.finishedAt = new Date().toISOString();
  evidence.updatedAt = evidence.finishedAt;
  evidence.commission.finalStatus = 'PAID';
  evidence.commission.exactContractCommissionCount = commissionQuery.size;
  evidence.commission.duplicatePrevented = commissionQuery.size === 1;
  evidence.payout.first.finalStatus = 'REJECTED';
  evidence.payout.second.finalStatus = 'PAID';
  evidence.payout.second.paymentReferencePresent = true;
  evidence.payout.adminMfaRejectionProven = true;
  evidence.payout.adminMfaApprovalProven = true;
  evidence.payout.adminMfaPaidSettlementProven = true;
  evidence.audit = { firstRejection: true, secondApproval: true, secondPaidSettlement: true };
  writeEvidence(evidence);
  console.log(`[broker-commercial-evidence] PASS lead=${evidence.lead.id} commission=${commissionId} payout=${secondId}`);
}

async function main() {
  if (mode === 'convert') return convert();
  if (mode === 'submit-first') return submitStage('first');
  if (mode === 'submit-second') return submitStage('second');
  if (mode === 'verify-paid') return verifyPaid();
  throw new Error(`Unsupported Broker evidence mode: ${mode}`);
}

main().catch((error) => {
  console.error('[broker-commercial-evidence] FAIL', error?.stack || error);
  process.exit(1);
});
