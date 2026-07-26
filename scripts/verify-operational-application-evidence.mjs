#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const ADMIN_APPROVE_PAYMENT_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/adminApprovePayment';
const APPLICATION_PROOF_PATH = 'launch_package/application-proof.json';
const PRIVILEGED_ROLES = new Set(['admin', 'super_admin', 'ceo', 'operations_admin', 'finance_admin']);
const ALLOWED_GATES = new Set([
  'ownerPaymentActivation',
  'paymentUnlockExactlyOnce',
  'tenantNotificationDelivery',
  'brokerCommissionLockExactlyOnce',
  'adminStaffClaims',
  'renewalScheduler',
]);

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const upper = (value) => text(value).toUpperCase();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  console.error(`[operational-application-evidence] FAIL — ${message}`);
  process.exit(1);
};
const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (Number.isFinite(Number(value?._seconds))) return new Date(Number(value._seconds) * 1000);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};
const iso = (value) => toDate(value)?.toISOString() || '';
const millis = (value) => toDate(value)?.getTime() || 0;
const statusIn = (value, accepted) => accepted.includes(upper(value));
const canonicalId = (value, label) => {
  const id = text(value);
  if (!/^[A-Za-z0-9_-]{3,180}$/.test(id)) fail(`${label} is missing or invalid`);
  return id;
};
const responseJson = async (response) => {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; }
  catch { return { raw: raw.slice(0, 500) }; }
};
const docResult = (snapshot) => ({ id: snapshot.id, ref: snapshot.ref, data: snapshot.data() || {} });
const sortedResults = (snapshot, fields) => snapshot.docs
  .map(docResult)
  .sort((left, right) => {
    const leftMs = Math.max(...fields.map((field) => millis(left.data[field])));
    const rightMs = Math.max(...fields.map((field) => millis(right.data[field])));
    return rightMs - leftMs;
  });

if (process.env.GITHUB_ACTIONS !== 'true') fail('verifier may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY) fail('unexpected repository');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('verifier requires refs/heads/main');
if (process.env.GITHUB_WORKFLOW !== 'Operational Application Evidence') fail('unexpected workflow');
if (process.env.GITHUB_JOB !== 'verify-and-publish') fail('unexpected job');
try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }

const gate = text(process.env.OPERATIONAL_GATE);
const commitSha = text(process.env.GITHUB_SHA);
const workflowRunId = text(process.env.GITHUB_RUN_ID);
if (!ALLOWED_GATES.has(gate)) fail(`unsupported application gate: ${gate || '(missing)'}`);
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(workflowRunId)) fail('exact SHA and numeric workflow run ID are required');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();

async function requireSnapshot(reference, label) {
  const snapshot = await reference.get();
  if (!snapshot.exists) fail(`${label} does not exist`);
  return docResult(snapshot);
}

async function latestApprovedPayment() {
  const snapshot = await db.collection('payment_transactions').where('status', '==', 'APPROVED').limit(100).get();
  const candidates = sortedResults(snapshot, ['approvedAt', 'updatedAt', 'createdAt']);
  const payment = candidates.find(({ data }) => data.paymentVerified === true && data.unlocksDashboard === true);
  if (!payment) fail('no approved production activation payment was found');
  return payment;
}

async function latestDeliveredNotification() {
  const snapshot = await db.collection('notifications').where('pushDeliveryState', '==', 'SUCCESS').limit(100).get();
  const candidates = sortedResults(snapshot, ['pushAttemptedAt', 'updatedAt', 'createdAt']);
  const notification = candidates.find(({ data }) => Number(data.pushSuccessCount || 0) > 0 && Number(data.pushFailureCount || 0) === 0);
  if (!notification) fail('no successful production tenant notification was found');
  return notification;
}

async function latestBrokerCommission() {
  const snapshot = await db.collection('broker_commissions').limit(100).get();
  const candidates = sortedResults(snapshot, ['createdAt', 'updatedAt']);
  const commission = candidates.find(({ data }) => text(data.contractId) && text(data.brokerId || data.brokerUid));
  if (!commission) fail('no production broker commission lock was found');
  return commission;
}

async function latestStaffCreationAudit() {
  const snapshot = await db.collection('audit_logs').where('action', '==', 'ADMIN_CREATE_STAFF_USER').limit(100).get();
  const candidates = sortedResults(snapshot, ['createdAt', 'timestamp']);
  const audit = candidates.find(({ data }) => text(data.targetId));
  if (!audit) fail('no audited production staff provisioning record was found');
  return audit;
}

async function latestRenewalWatch() {
  const snapshot = await db.collection('contract_renewal_watch').limit(100).get();
  const candidates = sortedResults(snapshot, ['generatedAt', 'updatedAt', 'createdAt']);
  const watch = candidates.find(({ data }) => text(data.sourceCollection) && text(data.sourceId) && text(data.pdfUrl));
  if (!watch) fail('no production renewal watch with PDF evidence was found');
  return watch;
}

function paymentBindings(payment) {
  const paymentId = canonicalId(payment.id, 'payment_id');
  const intakeId = canonicalId(payment.data.intakeId, 'intake_id');
  const contractId = canonicalId(payment.data.contractId || intakeId || paymentId, 'contract_id');
  const ownerUid = canonicalId(payment.data.ownerUid || payment.data.ownerId, 'owner_uid');
  return { paymentId, intakeId, contractId, ownerUid };
}

async function signInAdminWithAppCheck() {
  const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
  const appId = text(process.env.VITE_FIREBASE_APP_ID);
  const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
  const email = text(process.env.E2E_ADMIN_EMAIL).toLowerCase();
  const password = text(process.env.E2E_ADMIN_PASSWORD);
  if (!apiKey || !appId || !debugToken || !email || !password) fail('Firebase Auth and App Check protected bindings are incomplete');

  const signInEndpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
  signInEndpoint.searchParams.set('key', apiKey);
  const signInResponse = await fetch(signInEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signInPayload = await responseJson(signInResponse);
  if (!signInResponse.ok || !text(signInPayload?.idToken) || !text(signInPayload?.localId)) {
    fail(`Firebase Admin sign-in failed with HTTP ${signInResponse.status}`);
  }

  const exchangeEndpoint = new URL(
    `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken`,
  );
  exchangeEndpoint.searchParams.set('key', apiKey);
  const exchangeResponse = await fetch(exchangeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ debugToken }),
  });
  const exchangePayload = await responseJson(exchangeResponse);
  if (!exchangeResponse.ok || !text(exchangePayload?.token)) {
    fail(`App Check token exchange failed with HTTP ${exchangeResponse.status}`);
  }
  return {
    idToken: text(signInPayload.idToken),
    appCheckToken: text(exchangePayload.token),
    uid: text(signInPayload.localId),
  };
}

async function replayPaymentApproval(paymentId) {
  const auth = await signInAdminWithAppCheck();
  const adminRecord = await admin.auth().getUser(auth.uid);
  const adminRole = lower(adminRecord.customClaims?.role || adminRecord.customClaims?.userRole);
  if (adminRecord.disabled || (!PRIVILEGED_ROLES.has(adminRole) && adminRecord.customClaims?.admin !== true)) {
    fail('replay account is not an active privileged Admin');
  }
  const replayResponse = await fetch(ADMIN_APPROVE_PAYMENT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.idToken}`,
      'X-Firebase-AppCheck': auth.appCheckToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ data: { paymentId } }),
  });
  const replayPayload = await responseJson(replayResponse);
  if (!replayResponse.ok) fail(`adminApprovePayment replay failed with HTTP ${replayResponse.status}`);
  const payload = replayPayload?.result || replayPayload?.data || replayPayload;
  if (payload?.status !== 'SUCCESS' || payload?.idempotent !== true) {
    fail('adminApprovePayment replay did not return SUCCESS with idempotent=true');
  }
  return { replayActorUidHash: sha256(auth.uid), responseStatus: replayResponse.status };
}

function photoEvidence(ticket) {
  const values = [
    ticket.photoUrl,
    ticket.imageUrl,
    ticket.evidenceUrl,
    ticket.beforePhotoUrl,
    ticket.requestPhotoUrl,
    ...(Array.isArray(ticket.photoUrls) ? ticket.photoUrls : []),
    ...(Array.isArray(ticket.images) ? ticket.images : []),
    ...(Array.isArray(ticket.attachments) ? ticket.attachments.map((item) => item?.url || item?.path) : []),
  ].map(text).filter(Boolean);
  return values.find((value) => /^(https:\/\/|gs:\/\/|tickets\/|maintenance-requests\/|tenant-tickets\/)/i.test(value)) || '';
}

async function ownerActivationProof() {
  const payment = await latestApprovedPayment();
  const bindings = paymentBindings(payment);
  const [contractDoc, intakeDoc, userDoc, ownerDoc, propertiesSnapshot] = await Promise.all([
    requireSnapshot(db.collection('contracts').doc(bindings.contractId), `contracts/${bindings.contractId}`),
    requireSnapshot(db.collection('intake_submissions').doc(bindings.intakeId), `intake_submissions/${bindings.intakeId}`),
    requireSnapshot(db.collection('users').doc(bindings.ownerUid), `users/${bindings.ownerUid}`),
    requireSnapshot(db.collection('owners').doc(bindings.ownerUid), `owners/${bindings.ownerUid}`),
    db.collection('properties').where('intakeId', '==', bindings.intakeId).limit(100).get(),
  ]);
  const contract = contractDoc.data;
  const intake = intakeDoc.data;
  const user = userDoc.data;
  const owner = ownerDoc.data;
  const properties = propertiesSnapshot.docs.map(docResult);
  if (!properties.length) fail('owner activation has no bound property records');
  const invoiceId = canonicalId(payment.data.invoiceId || contract.invoiceId, 'invoice_id');
  const invoice = await requireSnapshot(db.collection('invoices').doc(invoiceId), `invoices/${invoiceId}`);

  if (!statusIn(contract.status || contract.contractStatus, ['ACTIVE']) || contract.adminApproved !== true || contract.dashboardUnlockApproved !== true) fail('contract is not active and Admin-approved');
  if (!statusIn(intake.status || intake.activationState, ['ACTIVE'])) fail('intake is not active');
  if (user.dashboardUnlocked !== true || user.dashboardLocked === true || !statusIn(user.activationStatus, ['ACTIVE'])) fail('users owner dashboard is not unlocked');
  if (owner.dashboardUnlocked !== true || owner.dashboardLocked === true || !statusIn(owner.activationStatus || owner.status, ['ACTIVE'])) fail('owners registry is not unlocked');
  if (properties.some(({ data }) => !statusIn(data.status || data.activationStatus, ['ACTIVE']) || text(data.ownerUid || data.ownerId) !== bindings.ownerUid)) fail('one or more properties are not active or owner-bound');
  if (!statusIn(invoice.data.status, ['PAID']) || invoice.data.paymentId !== bindings.paymentId || invoice.data.contractId !== bindings.contractId) fail('paid mobilization invoice is missing or mismatched');

  const annual = Number(payment.data.quoteSnapshot?.annualContractValue || contract.quoteSnapshot?.annualContractValue || contract.annualContractValue || 0);
  const amount = Number(payment.data.amountReceived || payment.data.quoteSnapshot?.activationDeposit || payment.data.amount || 0);
  if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(amount) || Math.abs(amount - Math.round(annual * 0.15)) > 0.01) fail('activation amount is not the locked 15% deposit');

  return {
    paymentId: bindings.paymentId,
    contractId: bindings.contractId,
    intakeId: bindings.intakeId,
    ownerUidHash: sha256(bindings.ownerUid),
    invoiceId,
    propertyCount: properties.length,
    amountMinor: Math.round(amount * 100),
    currency: 'AED',
    paymentApprovedAt: iso(payment.data.approvedAt),
    contractApprovedAt: iso(contract.approvedAt),
    ownerApprovedAt: iso(user.approvedAt),
    observedAt: new Date().toISOString(),
  };
}

async function paymentUnlockExactlyOnceProof() {
  const paymentBefore = await latestApprovedPayment();
  const bindings = paymentBindings(paymentBefore);
  const [contractBefore, userBefore, invoicesBeforeSnapshot, auditsBeforeSnapshot] = await Promise.all([
    requireSnapshot(db.collection('contracts').doc(bindings.contractId), `contracts/${bindings.contractId}`),
    requireSnapshot(db.collection('users').doc(bindings.ownerUid), `users/${bindings.ownerUid}`),
    db.collection('invoices').where('paymentId', '==', bindings.paymentId).limit(100).get(),
    db.collection('audit_logs').where('action', '==', 'PAYMENT_TRANSACTION_APPROVED').where('targetId', '==', bindings.paymentId).limit(100).get(),
  ]);
  const invoicesBefore = invoicesBeforeSnapshot.docs.map(docResult);
  const auditsBefore = auditsBeforeSnapshot.docs.map(docResult);
  if (invoicesBefore.length !== 1 || auditsBefore.length !== 1) fail('payment activation does not have exactly one invoice and one approval audit');
  const before = {
    payment: paymentBefore.data,
    contract: contractBefore.data,
    user: userBefore.data,
    invoice: invoicesBefore[0].data,
    approvalAudit: auditsBefore[0].data,
  };
  const replay = await replayPaymentApproval(bindings.paymentId);
  const [paymentAfter, contractAfter, userAfter, invoicesAfterSnapshot, auditsAfterSnapshot] = await Promise.all([
    requireSnapshot(db.collection('payment_transactions').doc(bindings.paymentId), `payment_transactions/${bindings.paymentId}`),
    requireSnapshot(db.collection('contracts').doc(bindings.contractId), `contracts/${bindings.contractId}`),
    requireSnapshot(db.collection('users').doc(bindings.ownerUid), `users/${bindings.ownerUid}`),
    db.collection('invoices').where('paymentId', '==', bindings.paymentId).limit(100).get(),
    db.collection('audit_logs').where('action', '==', 'PAYMENT_TRANSACTION_APPROVED').where('targetId', '==', bindings.paymentId).limit(100).get(),
  ]);
  const invoicesAfter = invoicesAfterSnapshot.docs.map(docResult);
  const auditsAfter = auditsAfterSnapshot.docs.map(docResult);
  if (invoicesAfter.length !== 1 || auditsAfter.length !== 1) fail('payment approval replay created duplicate invoice or audit state');
  const after = {
    payment: paymentAfter.data,
    contract: contractAfter.data,
    user: userAfter.data,
    invoice: invoicesAfter[0].data,
    approvalAudit: auditsAfter[0].data,
  };
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('payment approval replay changed persisted activation state');

  return {
    paymentId: bindings.paymentId,
    contractId: bindings.contractId,
    ownerUidHash: sha256(bindings.ownerUid),
    invoiceId: invoicesAfter[0].id,
    invoiceProofHash: sha256(JSON.stringify(invoicesAfter[0].data)),
    replayActorUidHash: replay.replayActorUidHash,
    replayHttpStatus: replay.responseStatus,
    approvalAuditCount: auditsAfter.length,
    invoiceCount: invoicesAfter.length,
    stateUnchanged: true,
    observedAt: new Date().toISOString(),
  };
}

async function tenantNotificationProof() {
  const notification = await latestDeliveredNotification();
  const ticketId = canonicalId(notification.data.ticketId || notification.data.targetId, 'ticket_id');
  const tenantUid = canonicalId(notification.data.userId || notification.data.tenantUid || notification.data.recipientUid, 'tenant_uid');
  let ticket = null;
  let ticketCollection = '';
  for (const collection of ['maintenanceTickets', 'tickets']) {
    const snapshot = await db.collection(collection).doc(ticketId).get();
    if (snapshot.exists) {
      ticket = snapshot.data() || {};
      ticketCollection = collection;
      break;
    }
  }
  if (!ticket) fail('notification ticket does not exist');
  const ticketTenantUid = text(ticket.tenantUid || ticket.tenantId || ticket.userId);
  if (ticketTenantUid !== tenantUid) fail('ticket is not bound to the tenant');
  const propertyId = canonicalId(ticket.propertyId, 'property_id');
  const unitBinding = text(ticket.unitId || ticket.unitNumber || ticket.unitName);
  if (!unitBinding) fail('ticket does not include property and unit binding');
  const photo = photoEvidence(ticket);
  if (!photo) fail('ticket does not include production photo evidence');

  return {
    notificationId: notification.id,
    ticketId,
    ticketCollection,
    tenantUidHash: sha256(tenantUid),
    propertyIdHash: sha256(propertyId),
    unitBindingHash: sha256(unitBinding),
    photoEvidenceHash: sha256(photo),
    pushTokenCount: Number(notification.data.pushTokenCount || notification.data.pushSuccessCount || 0),
    pushSuccessCount: Number(notification.data.pushSuccessCount || 0),
    pushFailureCount: Number(notification.data.pushFailureCount || 0),
    pushAttemptedAt: iso(notification.data.pushAttemptedAt),
    observedAt: new Date().toISOString(),
  };
}

async function brokerCommissionProof() {
  const commissionBefore = await latestBrokerCommission();
  const contractId = canonicalId(commissionBefore.data.contractId, 'contract_id');
  const commissionId = `commission_${contractId}`;
  if (commissionBefore.id !== commissionId) fail('broker commission does not use the deterministic contract identity');
  const brokerUid = canonicalId(commissionBefore.data.brokerUid || commissionBefore.data.brokerId, 'broker_uid');
  const payment = await latestApprovedPayment();
  const paymentBindingsValue = paymentBindings(payment);
  if (paymentBindingsValue.contractId !== contractId) fail('latest approved payment is not bound to the broker commission contract');
  const beforeSnapshot = await db.collection('broker_commissions').where('contractId', '==', contractId).limit(100).get();
  if (beforeSnapshot.size !== 1) fail('commission contract does not have exactly one commission before replay');
  const beforeHash = sha256(JSON.stringify(beforeSnapshot.docs[0].data() || {}));
  const replay = await replayPaymentApproval(paymentBindingsValue.paymentId);
  const commissionsAfterSnapshot = await db.collection('broker_commissions').where('contractId', '==', contractId).limit(100).get();
  if (commissionsAfterSnapshot.size !== 1) fail('payment replay created duplicate broker commission state');
  const commissionAfter = commissionsAfterSnapshot.docs[0];
  if (commissionAfter.id !== commissionId) fail('commission identity changed after replay');
  const afterHash = sha256(JSON.stringify(commissionAfter.data() || {}));
  if (beforeHash !== afterHash) fail('commission state changed after payment replay');

  return {
    paymentId: paymentBindingsValue.paymentId,
    contractId,
    commissionId,
    brokerUidHash: sha256(brokerUid),
    commissionStateHash: afterHash,
    replayActorUidHash: replay.replayActorUidHash,
    replayHttpStatus: replay.responseStatus,
    commissionCount: commissionsAfterSnapshot.size,
    stateUnchanged: true,
    observedAt: new Date().toISOString(),
  };
}

async function adminStaffClaimsProof() {
  const audit = await latestStaffCreationAudit();
  const staffUid = canonicalId(audit.data.targetId, 'staff_uid');
  const [authUser, userDoc, staffDoc, technicianDoc, hrDoc, creationAudits] = await Promise.all([
    admin.auth().getUser(staffUid),
    requireSnapshot(db.collection('users').doc(staffUid), `users/${staffUid}`),
    requireSnapshot(db.collection('staff').doc(staffUid), `staff/${staffUid}`),
    requireSnapshot(db.collection('technicians').doc(staffUid), `technicians/${staffUid}`),
    requireSnapshot(db.collection('hrProfiles').doc(staffUid), `hrProfiles/${staffUid}`),
    db.collection('audit_logs').where('action', '==', 'ADMIN_CREATE_STAFF_USER').where('targetId', '==', staffUid).limit(100).get(),
  ]);
  const claims = authUser.customClaims || {};
  const role = lower(claims.role || claims.userRole || userDoc.data.role || staffDoc.data.role);
  if (authUser.disabled || role !== 'technician') fail('staff identity is not an active technician');
  if (claims.admin === true || claims.superAdmin === true || claims.canManageSecurity === true || PRIVILEGED_ROLES.has(role)) fail('staff account contains privileged claims');
  if (creationAudits.size !== 1) fail('staff provisioning does not have exactly one audit record');

  return {
    staffUidHash: sha256(staffUid),
    role,
    emailVerified: authUser.emailVerified === true,
    disabled: authUser.disabled === true,
    privilegedClaimsAbsent: true,
    userRegistryHash: sha256(JSON.stringify(userDoc.data)),
    staffRegistryHash: sha256(JSON.stringify(staffDoc.data)),
    technicianRegistryHash: sha256(JSON.stringify(technicianDoc.data)),
    hrRegistryHash: sha256(JSON.stringify(hrDoc.data)),
    creationAuditCount: creationAudits.size,
    observedAt: new Date().toISOString(),
  };
}

async function renewalSchedulerProof() {
  const watch = await latestRenewalWatch();
  const sourceCollection = text(watch.data.sourceCollection);
  const sourceId = canonicalId(watch.data.sourceId, 'renewal_source_id');
  const source = await requireSnapshot(db.collection(sourceCollection).doc(sourceId), `${sourceCollection}/${sourceId}`);
  const daysRemaining = Number(watch.data.daysRemaining);
  if (!Number.isFinite(daysRemaining)) fail('renewal daysRemaining is invalid');
  if (!text(watch.data.pdfUrl)) fail('renewal PDF is missing');
  const provenance = lower(watch.data.schedulerProvenance || watch.data.generatedBy || watch.data.source);
  if (!/(scheduler|cron|contract renewal watcher)/.test(provenance)) fail('renewal scheduler provenance is missing');

  return {
    renewalWatchId: watch.id,
    sourceCollection,
    sourceId,
    sourceStatus: text(source.data.status || source.data.contractStatus),
    daysRemaining,
    pdfUrlHash: sha256(text(watch.data.pdfUrl)),
    schedulerProvenance: provenance,
    generatedAt: iso(watch.data.generatedAt || watch.data.createdAt),
    observedAt: new Date().toISOString(),
  };
}

const builders = {
  ownerPaymentActivation: ownerActivationProof,
  paymentUnlockExactlyOnce: paymentUnlockExactlyOnceProof,
  tenantNotificationDelivery: tenantNotificationProof,
  brokerCommissionLockExactlyOnce: brokerCommissionProof,
  adminStaffClaims: adminStaffClaimsProof,
  renewalScheduler: renewalSchedulerProof,
};
const evidence = await builders[gate]();
mkdirSync('launch_package', { recursive: true });
const proof = {
  schemaVersion: 1,
  status: 'passed',
  gate,
  commitSha,
  projectId,
  repository: REPOSITORY,
  workflowRunId,
  evidence,
  observedAt: new Date().toISOString(),
  hardLaunchClaim: false,
};
writeFileSync(APPLICATION_PROOF_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[operational-application-evidence] PASS gate=${gate}`);
