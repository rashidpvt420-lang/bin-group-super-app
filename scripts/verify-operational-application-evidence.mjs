#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

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
if (process.env.GITHUB_ACTOR !== 'rashidpvt420-lang') fail('only the authorized founder account may run application evidence');

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
    db.collection('invoices').where('paymentId', '==', bindings.paymentId).limit(20).get(),
    db.collection('audit_logs').where('paymentId', '==', bindings.paymentId).limit(100).get(),
  ]);
  const invoicesBefore = invoicesBeforeSnapshot.docs.map(docResult);
  const approvalAuditsBefore = auditsBeforeSnapshot.docs.map(docResult).filter(({ data }) => data.action === 'ADMIN_APPROVE_PAYMENT');
  if (invoicesBefore.length !== 1 || approvalAuditsBefore.length !== 1) fail('pre-replay activation is not exactly-once');
  const before = {
    paymentApprovedAt: millis(paymentBefore.data.approvedAt),
    contractApprovedAt: millis(contractBefore.data.approvedAt),
    ownerApprovedAt: millis(userBefore.data.approvedAt),
    invoiceId: invoicesBefore[0].id,
    invoiceProofHash: text(invoicesBefore[0].data.proofHash),
  };
  if (!before.paymentApprovedAt || !before.contractApprovedAt || !before.ownerApprovedAt || !/^[a-f0-9]{64}$/i.test(before.invoiceProofHash)) fail('pre-replay approval timestamps or invoice proof are missing');

  const replay = await replayPaymentApproval(bindings.paymentId);
  const [paymentAfter, contractAfter, userAfter, invoicesAfterSnapshot, auditsAfterSnapshot] = await Promise.all([
    requireSnapshot(db.collection('payment_transactions').doc(bindings.paymentId), `payment_transactions/${bindings.paymentId}`),
    requireSnapshot(db.collection('contracts').doc(bindings.contractId), `contracts/${bindings.contractId}`),
    requireSnapshot(db.collection('users').doc(bindings.ownerUid), `users/${bindings.ownerUid}`),
    db.collection('invoices').where('paymentId', '==', bindings.paymentId).limit(20).get(),
    db.collection('audit_logs').where('paymentId', '==', bindings.paymentId).limit(100).get(),
  ]);
  const invoicesAfter = invoicesAfterSnapshot.docs.map(docResult);
  const approvalAuditsAfter = auditsAfterSnapshot.docs.map(docResult).filter(({ data }) => data.action === 'ADMIN_APPROVE_PAYMENT');
  const after = {
    paymentApprovedAt: millis(paymentAfter.data.approvedAt),
    contractApprovedAt: millis(contractAfter.data.approvedAt),
    ownerApprovedAt: millis(userAfter.data.approvedAt),
    invoiceId: invoicesAfter[0]?.id || '',
    invoiceProofHash: text(invoicesAfter[0]?.data?.proofHash),
  };
  if (invoicesAfter.length !== 1 || approvalAuditsAfter.length !== 1) fail('replay created duplicate invoice or approval audit');
  if (JSON.stringify(before) !== JSON.stringify(after)) fail('replay mutated durable activation state');
  if (paymentAfter.data.unlocksDashboard !== true || userAfter.data.dashboardUnlocked !== true || contractAfter.data.dashboardUnlockApproved !== true) fail('dashboard unlock state is not consistently active');

  return {
    paymentId: bindings.paymentId,
    contractId: bindings.contractId,
    ownerUidHash: sha256(bindings.ownerUid),
    invoiceId: after.invoiceId,
    invoiceProofHash: after.invoiceProofHash,
    approvalAuditCount: approvalAuditsAfter.length,
    invoiceCount: invoicesAfter.length,
    replayHttpStatus: replay.responseStatus,
    replayActorUidHash: replay.replayActorUidHash,
    stateUnchanged: true,
    observedAt: new Date().toISOString(),
  };
}

async function brokerCommissionProof() {
  const commissionBefore = await latestBrokerCommission();
  const contractId = canonicalId(commissionBefore.data.contractId, 'contract_id');
  const contractBefore = await requireSnapshot(db.collection('contracts').doc(contractId), `contracts/${contractId}`);
  const paymentId = canonicalId(
    contractBefore.data.approvedPaymentId || contractBefore.data.activationPaymentId || contractBefore.data.paymentId,
    'payment_id',
  );
  const payment = await requireSnapshot(db.collection('payment_transactions').doc(paymentId), `payment_transactions/${paymentId}`);
  if (text(payment.data.contractId || payment.data.intakeId || paymentId) !== contractId) fail('payment and commission contract are not bound');
  const commissionId = `commission_${contractId}`;
  if (commissionBefore.id !== commissionId) fail('commission is not deterministically locked');
  const brokerUid = canonicalId(commissionBefore.data.brokerId || commissionBefore.data.brokerUid, 'broker_uid');
  if (text(contractBefore.data.commissionId) !== commissionId || contractBefore.data.commissionGenerated !== true) fail('contract commission binding is incomplete');
  const commissionsBeforeSnapshot = await db.collection('broker_commissions').where('contractId', '==', contractId).limit(20).get();
  if (commissionsBeforeSnapshot.size !== 1) fail('commission is not locked exactly once before replay');
  const auditBefore = await requireSnapshot(db.collection('auditLogs').doc(`broker_commission_${contractId}`), `auditLogs/broker_commission_${contractId}`);
  if (auditBefore.data.action !== 'BROKER_COMMISSION_CREATED' || auditBefore.data.commissionId !== commissionId) fail('deterministic commission audit is missing');
  const beforeHash = sha256(JSON.stringify({
    id: commissionId,
    amount: commissionBefore.data.amount,
    percentage: commissionBefore.data.percentage,
    status: commissionBefore.data.status,
    createdAt: millis(commissionBefore.data.createdAt),
    auditId: auditBefore.id,
  }));

  const replay = await replayPaymentApproval(paymentId);
  const [contractAfter, commissionsAfterSnapshot, auditAfter] = await Promise.all([
    requireSnapshot(db.collection('contracts').doc(contractId), `contracts/${contractId}`),
    db.collection('broker_commissions').where('contractId', '==', contractId).limit(20).get(),
    requireSnapshot(db.collection('auditLogs').doc(`broker_commission_${contractId}`), `auditLogs/broker_commission_${contractId}`),
  ]);
  if (commissionsAfterSnapshot.size !== 1 || commissionsAfterSnapshot.docs[0].id !== commissionId) fail('payment replay created or replaced a commission lock');
  const commissionAfter = commissionsAfterSnapshot.docs[0].data() || {};
  const afterHash = sha256(JSON.stringify({
    id: commissionId,
    amount: commissionAfter.amount,
    percentage: commissionAfter.percentage,
    status: commissionAfter.status,
    createdAt: millis(commissionAfter.createdAt),
    auditId: auditAfter.id,
  }));
  if (beforeHash !== afterHash || contractAfter.data.commissionId !== commissionId) fail('commission lock changed during replay');

  return {
    paymentId,
    contractId,
    commissionId,
    brokerUidHash: sha256(brokerUid),
    commissionCount: commissionsAfterSnapshot.size,
    commissionStateHash: afterHash,
    replayHttpStatus: replay.responseStatus,
    replayActorUidHash: replay.replayActorUidHash,
    stateUnchanged: true,
    observedAt: new Date().toISOString(),
  };
}

async function tenantNotificationProof() {
  const notification = await latestDeliveredNotification();
  const notificationId = canonicalId(notification.id, 'notification_id');
  const tenantUid = canonicalId(notification.data.recipientId, 'tenant_uid');
  const ticketId = canonicalId(notification.data.ticketId, 'ticket_id');
  const data = notification.data;
  if (Number(data.pushTokenCount || 0) < 1 || !data.pushAttemptedAt) fail('tenant notification token evidence is incomplete');

  const maintenanceSnapshot = await db.collection('maintenanceTickets').doc(ticketId).get();
  const ticketSnapshot = maintenanceSnapshot.exists ? maintenanceSnapshot : await db.collection('tickets').doc(ticketId).get();
  if (!ticketSnapshot.exists) fail('tenant maintenance request does not exist');
  const ticketCollection = maintenanceSnapshot.exists ? 'maintenanceTickets' : 'tickets';
  const ticket = ticketSnapshot.data() || {};
  const participantIds = [ticket.tenantId, ticket.tenantUid, ticket.userId, ticket.createdBy, ticket.requesterId].map(text);
  if (!participantIds.includes(tenantUid)) fail('ticket is not bound to the tenant');
  const evidence = photoEvidence(ticket);
  if (!evidence) fail('tenant request has no production photo/evidence reference');
  if (!text(ticket.propertyId) || !text(ticket.unitId || ticket.unitNumber || ticket.unit)) fail('tenant request is not linked to property and unit');

  return {
    notificationId,
    ticketId,
    ticketCollection,
    tenantUidHash: sha256(tenantUid),
    propertyIdHash: sha256(text(ticket.propertyId)),
    unitBindingHash: sha256(text(ticket.unitId || ticket.unitNumber || ticket.unit)),
    photoEvidenceHash: sha256(evidence),
    pushTokenCount: Number(data.pushTokenCount),
    pushSuccessCount: Number(data.pushSuccessCount),
    pushFailureCount: Number(data.pushFailureCount),
    pushAttemptedAt: iso(data.pushAttemptedAt),
    observedAt: new Date().toISOString(),
  };
}

async function adminStaffClaimsProof() {
  const creationAudit = await latestStaffCreationAudit();
  const staffUid = canonicalId(creationAudit.data.targetId, 'staff_uid');
  const authRecord = await admin.auth().getUser(staffUid);
  const [userDoc, accessDoc, hrDoc, technicianDoc, auditSnapshot] = await Promise.all([
    requireSnapshot(db.collection('users').doc(staffUid), `users/${staffUid}`),
    requireSnapshot(db.collection('staffAccess').doc(staffUid), `staffAccess/${staffUid}`),
    requireSnapshot(db.collection('hrProfiles').doc(staffUid), `hrProfiles/${staffUid}`),
    requireSnapshot(db.collection('technicians').doc(staffUid), `technicians/${staffUid}`),
    db.collection('audit_logs').where('targetId', '==', staffUid).limit(100).get(),
  ]);
  const role = lower(userDoc.data.role || userDoc.data.userRole);
  const claims = authRecord.customClaims || {};
  if (role !== 'technician') fail('latest audited staff account is not a technician');
  if (authRecord.disabled || lower(claims.role || claims.userRole) !== role || claims.staff !== true || claims.technician !== true) fail('technician Auth claims do not match the staff profile');
  if (claims.admin === true || claims.super_admin === true || claims.superAdmin === true || claims.ceo === true || PRIVILEGED_ROLES.has(lower(claims.role))) fail('technician account has privileged Admin claims');
  if (lower(accessDoc.data.role) !== role || accessDoc.data.active !== true || lower(hrDoc.data.role || hrDoc.data.employeeType) !== role || lower(technicianDoc.data.role) !== role) fail('staff registries do not agree on technician role');
  const permissions = accessDoc.data.permissions && typeof accessDoc.data.permissions === 'object' ? accessDoc.data.permissions : {};
  const forbidden = ['canManageSecurity', 'canManageUsers', 'canApprovePayments', 'canManageContracts', 'canManageHr'];
  if (forbidden.some((key) => permissions[key] === true || claims.permissions?.[key] === true)) fail('technician account has elevated permissions');
  const creationAudits = auditSnapshot.docs.map(docResult).filter(({ data }) => data.action === 'ADMIN_CREATE_STAFF_USER');
  if (creationAudits.length !== 1) fail('staff creation audit is missing or duplicated');

  return {
    staffUidHash: sha256(staffUid),
    role,
    authDisabled: authRecord.disabled,
    staffRegistryCount: 4,
    creationAuditCount: creationAudits.length,
    permissionsHash: sha256(JSON.stringify(permissions)),
    createdAt: iso(userDoc.data.createdAt || authRecord.metadata.creationTime),
    observedAt: new Date().toISOString(),
  };
}

async function renewalSchedulerProof() {
  const watch = await latestRenewalWatch();
  const watchId = canonicalId(watch.id, 'renewal_watch_id');
  const data = watch.data;
  const sourceCollection = text(data.sourceCollection);
  const sourceId = canonicalId(data.sourceId, 'renewal_source_id');
  let sourceReference;
  if (sourceCollection === 'contracts') sourceReference = db.collection('contracts').doc(sourceId);
  else if (sourceCollection === 'leases') sourceReference = db.collection('leases').doc(sourceId);
  else if (sourceCollection === 'lease_contracts') sourceReference = db.collection('lease_contracts').doc(sourceId);
  else if (sourceCollection === 'tenancy_contracts') sourceReference = db.collection('tenancy_contracts').doc(sourceId);
  else fail('renewal sourceCollection is not allow-listed');
  const source = await requireSnapshot(sourceReference, `${sourceCollection}/${sourceId}`);
  const daysRemaining = Number(data.daysRemaining);
  const expiryAt = toDate(data.expiryAt);
  const pdfUrl = text(data.pdfUrl);
  const tenantBinding = text(data.tenantId || data.tenantEmail).toLowerCase();
  const renewalStatus = upper(data.renewalStatus || data.status);
  const generatedAt = toDate(data.generatedAt || data.createdAt || data.updatedAt);
  if (!tenantBinding || !Number.isFinite(daysRemaining) || !expiryAt || !generatedAt || !renewalStatus) fail('renewal watch timeline/status fields are incomplete');
  if (!/^(https:\/\/|gs:\/\/)/i.test(pdfUrl)) fail('renewal watch PDF evidence is missing');
  const computedDays = Math.ceil((expiryAt.getTime() - generatedAt.getTime()) / 86_400_000);
  if (Math.abs(computedDays - daysRemaining) > 2) fail('renewal daysRemaining does not match expiry timeline');
  const provenance = lower(data.generatedBy || data.source || data.scheduler || data.watchSource || data.createdBySystem);
  const schedulerRunId = text(data.schedulerRunId || data.workflowRunId || data.runId);
  if (!provenance.includes('renewal') && !schedulerRunId) fail('renewal watch lacks scheduler provenance');

  return {
    watchId,
    sourceCollection,
    sourceIdHash: sha256(sourceId),
    sourceDocumentExists: Boolean(source.id),
    tenantBindingHash: sha256(tenantBinding),
    renewalStatus,
    daysRemaining,
    expiryAt: expiryAt.toISOString(),
    generatedAt: generatedAt.toISOString(),
    pdfEvidenceHash: sha256(pdfUrl),
    schedulerRunIdHash: schedulerRunId ? sha256(schedulerRunId) : null,
    provenanceHash: provenance ? sha256(provenance) : null,
    observedAt: new Date().toISOString(),
  };
}

let evidence;
if (gate === 'ownerPaymentActivation') evidence = await ownerActivationProof();
else if (gate === 'paymentUnlockExactlyOnce') evidence = await paymentUnlockExactlyOnceProof();
else if (gate === 'tenantNotificationDelivery') evidence = await tenantNotificationProof();
else if (gate === 'brokerCommissionLockExactlyOnce') evidence = await brokerCommissionProof();
else if (gate === 'adminStaffClaims') evidence = await adminStaffClaimsProof();
else evidence = await renewalSchedulerProof();

const proof = {
  schemaVersion: 1,
  status: 'passed',
  source: 'operational-application-production-verifier',
  gate,
  commitSha,
  projectId,
  repository: REPOSITORY,
  workflowRunId,
  evidence,
  observedAt: evidence.observedAt,
  hardLaunchClaim: false,
};
mkdirSync('launch_package', { recursive: true });
writeFileSync('launch_package/application-proof.json', `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[operational-application-evidence] PASS gate=${gate}`);
console.log(`[operational-application-evidence] wrote ${APPLICATION_PROOF_PATH}`);
