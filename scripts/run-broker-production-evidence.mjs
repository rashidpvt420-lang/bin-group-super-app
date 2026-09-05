#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { config as loadDotenv } from 'dotenv';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { exchangeGmailAccessToken, readGmailOtp } from './lib/gmail-otp-reader.mjs';
import { createBusinessEvidenceRunScope } from './lib/business-evidence-run-scope.mjs';
import { BROKER_EVIDENCE_TYPE as EVIDENCE_TYPE } from './lib/broker-e2e-fixture-isolation.mjs';

const PROJECT_ID = 'bin-group-57c60';
const API_KEY = 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s';
const APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const FUNCTIONS_BASE = `https://europe-west3-${PROJECT_ID}.cloudfunctions.net`;
const WEB_REFERER = 'https://bin-group-57c60.web.app/';
const OUTPUT_PATH = path.resolve('launch_package/artifacts/broker-production-evidence.json');
const OTP_HASH_VERSION = 'HMAC_SHA256_V1';

for (const envPath of [
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
    break;
  }
}

const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const safeId = (value, fallback = 'evidence') => text(value)
  .replace(/[^A-Za-z0-9_-]/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 150) || fallback;

const brokerEmail = text(process.env.E2E_BROKER_EMAIL).toLowerCase();
const brokerMailboxEmail = text(process.env.E2E_BROKER_MAILBOX_EMAIL).toLowerCase();
const brokerPassword = text(process.env.E2E_BROKER_PASSWORD);
function resolveBrokerMailboxSecret(name) {
  const configured = text(process.env[name]);
  if (configured) return configured;
  try {
    return text(execFileSync(
      'npx',
      ['firebase', 'functions:secrets:access', name, '--project', PROJECT_ID],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ));
  } catch {
    throw new Error(`${name} is required as an environment value or Firebase Secret Manager secret for verified Broker mailbox evidence.`);
  }
}

const mailboxClientId = resolveBrokerMailboxSecret('E2E_BROKER_MAILBOX_CLIENT_ID');
const mailboxClientSecret = resolveBrokerMailboxSecret('E2E_BROKER_MAILBOX_CLIENT_SECRET');
const mailboxRefreshToken = resolveBrokerMailboxSecret('E2E_BROKER_MAILBOX_REFRESH_TOKEN');
const leadName = text(process.env.E2E_BROKER_LEAD_NAME);
const appCheckDebugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
const commitSha = text(process.env.GITHUB_SHA) || (() => {
  try {
    return text(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }));
  } catch {
    return '';
  }
})();

for (const [name, value] of Object.entries({
  E2E_BROKER_EMAIL: brokerEmail,
  E2E_BROKER_MAILBOX_EMAIL: brokerMailboxEmail,
  E2E_BROKER_PASSWORD: brokerPassword,
  E2E_BROKER_MAILBOX_CLIENT_ID: mailboxClientId,
  E2E_BROKER_MAILBOX_CLIENT_SECRET: mailboxClientSecret,
  E2E_BROKER_MAILBOX_REFRESH_TOKEN: mailboxRefreshToken,
  E2E_BROKER_LEAD_NAME: leadName,
  VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: appCheckDebugToken,
  GITHUB_SHA: commitSha,
})) {
  assert(value, `${name} is required for Broker production evidence.`);
}
assert(/^[0-9a-f-]{36}$/i.test(appCheckDebugToken), 'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be a registered debug UUID.');
assert(/^[a-f0-9]{40}$/.test(commitSha), 'Broker production evidence must be bound to an exact lowercase 40-character commit SHA.');

const projectId = resolveFirebaseAdminProjectId();
assert(projectId === PROJECT_ID, `Broker evidence must run against ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const db = admin.firestore();
const auth = admin.auth();
const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
const brokerAuthEmail = brokerMailboxEmail;

async function jsonRequest(url, options, label) {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { parseError: true };
  }
  if (!response.ok) {
    throw new Error(`${label} failed HTTP ${response.status}.`);
  }
  return body;
}

const normalizeMessageId = (value) => text(value).replace(/^<|>$/g, '').toLowerCase();
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

async function mailboxAccessToken() {
  return exchangeGmailAccessToken({
    clientId: mailboxClientId,
    clientSecret: mailboxClientSecret,
    refreshToken: mailboxRefreshToken,
    label: 'Broker mailbox',
  });
}

async function waitForMailboxOtp({
  providerMessageId,
  requestedAt,
  correlationId,
  timeoutMs = 120000,
}) {
  const accessToken = await mailboxAccessToken();
  const receipt = await readGmailOtp({
    accessToken,
    expectedMailboxEmail: brokerMailboxEmail,
    sender: 'ceo@bin-groups.com',
    recipient: brokerAuthEmail,
    subject: 'BIN GROUP payout verification code',
    correlationId,
    providerMessageId,
    requestedAtMs: requestedAt,
    otpPattern: /payout code is\s+(\d{6})/i,
    timeoutMs,
    label: 'Broker payout OTP',
  });
  return {
    code: receipt.otp,
    receivedAt: receipt.receivedAt,
    messageIdHash: receipt.messageIdHash,
  };
}

async function exchangeAppCheckToken() {
  const url = new URL(`https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(APP_ID)}:exchangeDebugToken`);
  url.searchParams.set('key', API_KEY);
  const body = await jsonRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: WEB_REFERER },
    body: JSON.stringify({ debugToken: appCheckDebugToken }),
  }, 'App Check debug-token exchange');
  assert(text(body.token), 'App Check exchange did not return a token.');
  return text(body.token);
}

async function signIn(email, password) {
  const body = await jsonRequest(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: WEB_REFERER },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
    'Firebase Auth sign-in',
  );
  assert(text(body.idToken) && text(body.localId), 'Firebase Auth did not return an ID token for the protected Broker.');
  return { idToken: text(body.idToken), uid: text(body.localId), email: text(body.email).toLowerCase() };
}

async function callFunction(name, data, appCheckToken, idToken) {
  const body = await jsonRequest(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-AppCheck': appCheckToken,
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  }, `Callable ${name}`);
  if (body.error) throw new Error(`Callable ${name} returned an application error.`);
  return body.result ?? body.data ?? body;
}

async function callFunctionExpectingFailure(name, data, appCheckToken, idToken) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-AppCheck': appCheckToken,
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const bodyText = await response.text();
  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { parseError: true };
  }
  assert(!response.ok || body.error, `${name} unexpectedly accepted replayed single-use OTP evidence.`);
  return { status: response.status, body };
}

async function waitForDocument(ref, predicate, label, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    const value = snapshot.data() || {};
    if (snapshot.exists && predicate(value)) return value;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function deleteQuery(query, predicate = () => true) {
  const snapshot = await query.limit(500).get();
  const candidates = snapshot.docs.filter((document) => predicate(document.data() || {}, document.id));
  if (!candidates.length) return 0;
  const batch = db.batch();
  candidates.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return candidates.length;
}

async function cleanupPreviousEvidence(brokerUid) {
  const contracts = await db.collection('contracts').where('brokerId', '==', brokerUid).limit(500).get();
  const priorContracts = contracts.docs.filter((document) => document.data()?.e2eEvidenceType === EVIDENCE_TYPE);
  const batch = db.batch();
  for (const contract of priorContracts) {
    batch.delete(db.collection('broker_commissions').doc(`commission_${contract.id}`));
    batch.delete(contract.ref);
  }

  const safeBrokerId = String(brokerUid).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  batch.delete(db.collection('broker_commissions').doc(`e2e-live-broker-commission-${safeBrokerId}`));
  batch.delete(db.collection('broker_payout_otp_rate_limits').doc(brokerUid));
  await batch.commit();

  await deleteQuery(
    db.collection('broker_payout_requests').where('brokerId', '==', brokerUid),
    (value) => value.e2eEvidenceType === EVIDENCE_TYPE ||
      (Array.isArray(value.commissionIds) && value.commissionIds.some((id) => text(id).startsWith('commission_e2e_broker_contract_'))),
  );
  await deleteQuery(
    db.collection('broker_payout_otps').where('uid', '==', brokerUid),
    (value) => ['PENDING', 'VERIFIED', 'CONSUMED', 'EXPIRED'].includes(upper(value.status)),
  );
}

async function inspectOtpDelivery(challengeId) {
  const snapshot = await db.collection('broker_payout_otps').doc(challengeId).get();
  assert(snapshot.exists, `Broker payout OTP ${challengeId} was not persisted.`);
  const value = snapshot.data() || {};
  assert(text(value.otpHashVersion) === OTP_HASH_VERSION, 'Broker payout OTP is not protected by the required HMAC hash version.');
  const providerMessageId = text(value.delivery?.messageId);
  const bindingHash = text(value.bindingHash);
  assert(providerMessageId, 'Broker payout OTP provider did not return a delivery message ID.');
  assert(/^[a-f0-9]{64}$/.test(bindingHash), 'Broker payout OTP binding hash is missing.');
  const correlationId = text(value.correlationId);
    assert(correlationId, 'Broker payout OTP correlation ID is missing.');
    return { providerMessageId, bindingHash, correlationId, otpHashVersion: text(value.otpHashVersion) };
}

async function waitForUiLead(brokerUid, expectedLeadName, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = 0;

  while (Date.now() < deadline) {
    const snapshot = await db.collection('brokerLeads')
      .where('brokerId', '==', brokerUid)
      .where('leadName', '==', expectedLeadName)
      .limit(2)
      .get();
    lastSize = snapshot.size;
    if (snapshot.size === 1) return snapshot.docs[0];
    if (snapshot.size > 1) {
      throw new Error(`Expected exactly one UI-created Broker lead named ${expectedLeadName}; found ${snapshot.size}.`);
    }
    await sleep(1_000);
  }

  throw new Error(
    `UI reported Broker lead ${expectedLeadName} as recorded, but it was not server-visible after ${timeoutMs}ms (found ${lastSize}).`,
  );
}

async function main() {
  const startedAt = new Date().toISOString();
  const runId = safeId(createBusinessEvidenceRunScope(process.env), 'local');
  const brokerRecord = await auth.getUserByEmail(brokerMailboxEmail);
  assert(brokerRecord.emailVerified, 'The protected Broker email must be verified.');

  const brokerUid = brokerRecord.uid;
  const [profileSnap, privateKycSnap] = await Promise.all([
    db.collection('users').doc(brokerUid).get(),
    db.collection('broker_kyc_profiles').doc(brokerUid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const privateKyc = privateKycSnap.data() || {};
  assert(profile.e2eLaunchSeed === true, 'Refusing production evidence for a Broker that is not the dedicated E2E account.');
  assert(upper(profile.role || profile.userRole) === 'BROKER', 'Dedicated E2E account is not a Broker.');
  assert(profile.reraVerified === true && profile.ibanVerified === true, 'Broker public KYC readiness is incomplete.');
  assert(privateKycSnap.exists && privateKyc.reraVerified === true && privateKyc.ibanVerified === true, 'Broker private KYC readiness is incomplete.');
  assert(privateKyc.commissionAgreementAccepted === true, 'Broker commission agreement is not accepted.');
  assert(text(privateKyc.submissionHash) && text(privateKyc.approvedSubmissionHash) === text(privateKyc.submissionHash), 'Broker private KYC approval hash is not current.');

  const leadDocument = await waitForUiLead(brokerUid, leadName);
  const lead = leadDocument.data() || {};
  assert(text(lead.attributionId).startsWith(`broker_lead_${brokerUid}_`), 'UI-created lead attribution is missing or does not belong to the Broker.');

  await cleanupPreviousEvidence(brokerUid);

  const contractId = safeId(`e2e_broker_contract_${runId}_${leadDocument.id}`);
  const commissionId = `commission_${contractId}`;
  const annualContractValue = 10000;
  const expectedCommissionAmount = 500;
  const contractRef = db.collection('contracts').doc(contractId);
  const commissionRef = db.collection('broker_commissions').doc(commissionId);

  await contractRef.set({
    contractId,
    intakeId: leadDocument.id,
    sourceLeadId: leadDocument.id,
    attributionId: text(lead.attributionId),
    brokerId: brokerUid,
    brokerUid,
    brokerEmail: brokerAuthEmail,
    brokerName: text(profile.displayName || profile.name || brokerRecord.displayName || 'E2E Broker'),
    brokerCode: text(profile.brokerCode || profile.affiliateCode) || `BIN-${brokerUid.slice(0, 8).toUpperCase()}`,
    brokerCommissionRate: 0.05,
    annualContractValue,
    quoteSnapshot: { annualContractValue, currency: 'AED', locked: true },
    propertyName: `E2E Broker Conversion Property ${runId}`,
    currency: 'AED',
    status: 'DRAFT',
    e2eRunId: runId,
    e2eEvidenceType: EVIDENCE_TYPE,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await Promise.all([
    contractRef.set({ status: 'ACTIVE', activatedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }),
    leadDocument.ref.set({
      status: 'converted',
      lifecycleStatus: 'CONTRACT_ACTIVATED',
      contractId,
      convertedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true }),
  ]);

  const generatedCommission = await waitForDocument(
    commissionRef,
    (value) => value.contractId === contractId && value.source === 'CONTRACT_ACTIVATION',
    'contract-triggered Broker commission creation',
  );
  assert(generatedCommission.brokerId === brokerUid, 'Generated commission lost Broker attribution.');
  assert(Number(generatedCommission.amount) === expectedCommissionAmount, 'Generated commission does not equal the locked 5% allocation.');
  assert(upper(generatedCommission.status) === 'PENDING', 'Generated commission did not enter the expected PENDING review state.');

  await contractRef.set({ commissionGenerated: false, e2eReplayRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  await sleep(5000);
  const commissionCountAfterReplay = await db.collection('broker_commissions').where('contractId', '==', contractId).get();
  assert(commissionCountAfterReplay.size === 1, `Contract activation replay created ${commissionCountAfterReplay.size} commissions instead of one.`);
  assert(commissionCountAfterReplay.docs[0].id === commissionId, 'Commission replay did not preserve the deterministic commission ID.');

  await commissionRef.set({
    status: 'APPROVED',
    payoutStatus: 'NOT_REQUESTED',
    complianceHold: false,
    e2eEvidenceType: EVIDENCE_TYPE,
    e2eApprovalMode: 'PROTECTED_FIXTURE_AFTER_REAL_CONTRACT_COMMISSION',
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const appCheckToken = await exchangeAppCheckToken();
  const brokerSession = await signIn(brokerAuthEmail, brokerPassword);
  assert(brokerSession.uid === brokerUid, 'Broker Auth UID does not match the dedicated production fixture.');

  const otpRequestedAt = Date.now();
  const requested = await callFunction('requestBrokerPayoutOtp', { commissionIds: [commissionId] }, appCheckToken, brokerSession.idToken);
  const challengeId = text(requested.challengeId);
    const correlationId = text(requested.correlationId);
    assert(requested.status === 'OTP_SENT' && challengeId && correlationId, 'Broker payout OTP request did not return a challenge and correlation ID.');
  assert(Number(requested.amount) === expectedCommissionAmount && Number(requested.commissionCount) === 1, 'Broker payout OTP binding amount/count is incorrect.');

  const otpDelivery = await inspectOtpDelivery(challengeId);
    assert(otpDelivery.correlationId === correlationId, 'Broker payout OTP correlation ID is not backend-bound.');
    const mailboxReceipt = await waitForMailboxOtp({
      providerMessageId: otpDelivery.providerMessageId,
      requestedAt: otpRequestedAt,
      correlationId,
    });
  const providerMessageIdHash = sha256(normalizeMessageId(otpDelivery.providerMessageId));
  assert(providerMessageIdHash === mailboxReceipt.messageIdHash, 'Broker mailbox receipt is not bound to the SMTP provider Message-ID.');
  const verified = await callFunction('verifyBrokerPayoutOtp', {
    challengeId,
    otp: mailboxReceipt.code,
  }, appCheckToken, brokerSession.idToken);
  assert(verified.status === 'VERIFIED' && text(verified.challengeId) === challengeId, 'Broker payout OTP verification did not complete with the mailbox-received code.');

  const submitted = await callFunction('submitBrokerPayoutRequest', {
    challengeId,
    commissionIds: [commissionId],
  }, appCheckToken, brokerSession.idToken);
  const payoutRequestId = text(submitted.payoutRequestId);
  assert(submitted.status === 'SUCCESS' && payoutRequestId, 'Broker payout submission did not create a payout request.');
  assert(Number(submitted.amount) === expectedCommissionAmount && Number(submitted.commissionCount) === 1, 'Submitted payout amount/count is incorrect.');

  const replayFailure = await callFunctionExpectingFailure('submitBrokerPayoutRequest', {
    challengeId,
    commissionIds: [commissionId],
  }, appCheckToken, brokerSession.idToken);

  const [challenge, payoutRequest, commissionAfterPayout, convertedLead, activeContract] = await Promise.all([
    waitForDocument(db.collection('broker_payout_otps').doc(challengeId), (value) => upper(value.status) === 'CONSUMED' && value.payoutRequestId === payoutRequestId, 'consumed Broker payout OTP'),
    waitForDocument(db.collection('broker_payout_requests').doc(payoutRequestId), (value) => upper(value.status) === 'PENDING_ADMIN_REVIEW', 'submitted Broker payout request'),
    waitForDocument(commissionRef, (value) => upper(value.payoutStatus) === 'REQUESTED' && value.payoutRequestId === payoutRequestId, 'commission payout binding'),
    waitForDocument(leadDocument.ref, (value) => upper(value.status) === 'CONVERTED' && value.contractId === contractId, 'converted Broker lead'),
    waitForDocument(contractRef, (value) => upper(value.status) === 'ACTIVE', 'active attributed contract'),
  ]);

  await db.collection('broker_payout_requests').doc(payoutRequestId).set({
    e2eRunId: runId,
    e2eEvidenceType: EVIDENCE_TYPE,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  assert(payoutRequest.brokerId === brokerUid, 'Payout request lost Broker identity.');
  assert(Array.isArray(payoutRequest.commissionIds) && payoutRequest.commissionIds.length === 1 && payoutRequest.commissionIds[0] === commissionId, 'Payout request is not bound to the single generated commission.');
  assert(text(payoutRequest.mfaChallengeId) === challengeId, 'Payout request is not bound to the verified OTP challenge.');
  assert(upper(payoutRequest.verificationState) === 'EMAIL_OTP_SINGLE_USE_PRIVATE_KYC', 'Payout request verification state is incorrect.');
  assert(upper(challenge.status) === 'CONSUMED', 'Payout OTP was not consumed exactly once.');
  assert(text(challenge.otpHashVersion) === OTP_HASH_VERSION, 'Consumed payout OTP does not retain the HMAC protection version.');
  assert(upper(commissionAfterPayout.payoutStatus) === 'REQUESTED', 'Commission was not locked to the submitted payout request.');
  assert(convertedLead.contractId === contractId && activeContract.brokerId === brokerUid, 'Lead-to-contract attribution chain is incomplete.');

  const evidence = {
    schemaVersion: 2,
    status: 'passed',
    source: 'run-broker-production-evidence',
    projectId,
    productionUrl: 'https://bin-group-57c60.web.app',
    commitSha,
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    startedAt,
    finishedAt: new Date().toISOString(),
    broker: {
      uid: brokerUid,
      emailDomain: brokerAuthEmail.split('@')[1] || '',
      authenticated: true,
      privateKycVerified: true,
      commissionAgreementAccepted: true,
    },
    leadConversion: {
      leadId: leadDocument.id,
      attributionId: text(lead.attributionId),
      leadCreatedThroughUi: true,
      converted: upper(convertedLead.status) === 'CONVERTED',
      contractId,
      contractActive: upper(activeContract.status) === 'ACTIVE',
    },
    commission: {
      commissionId,
      source: text(generatedCommission.source),
      annualContractValue,
      percentage: Number(generatedCommission.percentage),
      amount: Number(generatedCommission.amount),
      currency: text(generatedCommission.currency),
      countAfterActivationReplay: commissionCountAfterReplay.size,
      deterministicIdPreserved: commissionCountAfterReplay.docs[0].id === commissionId,
      payoutStatus: upper(commissionAfterPayout.payoutStatus),
    },
    payout: {
      challengeId,
      correlationIdHash: sha256(correlationId),
      providerMessageIdHash,
      bindingHash: otpDelivery.bindingHash,
      otpHashVersion: otpDelivery.otpHashVersion,
      mailboxReceiptVerified: true,
      mailboxReceivedAt: mailboxReceipt.receivedAt,
      mailboxMessageIdHash: mailboxReceipt.messageIdHash,
      otpVerified: true,
      otpConsumed: upper(challenge.status) === 'CONSUMED',
      payoutRequestId,
      payoutStatus: upper(payoutRequest.status),
      verificationState: upper(payoutRequest.verificationState),
      amount: Number(payoutRequest.amount),
      commissionCount: Number(payoutRequest.commissionCount),
      replayRejected: replayFailure.status >= 400 || Boolean(replayFailure.body?.error),
    },
    hardLaunchClaim: false,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`[broker-production-evidence] PASS lead=${leadDocument.id} contract=${contractId} payout=${payoutRequestId}`);
  console.log(`[broker-production-evidence] wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('[broker-production-evidence] FAIL', error?.stack || error);
  process.exit(1);
});
