#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const ADMIN_APPROVE_PAYMENT_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/adminApprovePayment';
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
const fail = (message) => {
  console.error(`[operational-application-evidence] FAIL — ${message}`);
  process.exit(1);
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (Number.isFinite(Number(value?._seconds))) return new Date(Number(value._seconds) * 1000);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};
const iso = (value) => toDate(value)?.toISOString() || '';
const millis = (value) => toDate(value)?.getTime() || null;
const statusIn = (value, accepted) => accepted.includes(upper(value));
const safeId = (value, label) => {
  const id = text(value);
  if (!/^[A-Za-z0-9_-]{3,180}$/.test(id)) fail(`${label} is missing or invalid`);
  return id;
};
const jsonRequest = async (url, options = {}) => {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let payload = null;
  try { payload = bodyText ? JSON.parse(bodyText) : null; }
  catch { payload = { raw: bodyText.slice(0, 500) }; }
  return { response, payload };
};

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

async function requiredDoc(collectionName, id, label = `${collectionName}/${id}`) {
  const snapshot = await db.collection(collectionName).doc(id).get();
  if (!snapshot.exists) fail(`${label} does not exist`);
  return { id: snapshot.id, ref: snapshot.ref, data: snapshot.data() || {} };
}

async function queryDocs(collectionName, field, value, max = 100) {
  const snapshot = await db.collection(collectionName).where(field, '==', value).limit(max).get();
  return snapshot.docs.map((item) => ({ id: item.id, data: item.data() || {} }));
}

function paymentBindings(paymentId, payment) {
  const intakeId = text(payment.intakeId);
  const contractId = text(payment.contractId || intakeId || paymentId);
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  if (!intakeId || !contractId || !ownerUid) fail('payment is not bound to canonical intake, contract and owner IDs');
  return { paymentId, intakeId, contractId, ownerUid };
}

async function signInWithAppCheck(emailEnv, passwordEnv) {
  const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
  const appId = text(process.env.VITE_FIREBASE_APP_ID);
  const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
  const email = text(process.env[emailEnv]).toLowerCase();
  const password = text(process.env[passwordEnv]);
  if (!apiKey || !appId || !debugToken || !email || !password) fail('Firebase Auth and App Check protected bindings are incomplete');

  const signInEndpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
  signInEndpoint.searchParams.set('key', apiKey);
  const signIn = await jsonRequest(signInEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!signIn.response.ok || !text(signIn.payload?.idToken) || !text(signIn.payload?.localId)) {
    fail(`Firebase Admin sign-in failed with HTTP ${signIn.response.status}`);
  }

  const exchangeEndpoint = new URL(
    `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken`,
  );
  exchangeEndpoint.searchParams.set('key', apiKey);
  const exchange = await jsonRequest(exchangeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ debugToken }),
  });
  if (!exchange.response.ok || !text(exchange.payload?.token)) {
    fail(`App Check token exchange failed with HTTP ${exchange.response.status}`);
  }
  return {
    idToken: text(signIn.payload.idToken),
    appCheckToken: text(exchange.payload.token),
    uid: text(signIn.payload.localId),
  };
}

async function replayPaymentApproval(paymentId) {
  const auth = await signInWithAppCheck('E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD');
  const adminRecord = await admin.auth().getUser(auth.uid);
  const adminRole = lower(adminRecord.customClaims?.role || adminRecord.customClaims?.userRole);
  if (adminRecord.disabled || !PRIVILEGED_ROLES.has(adminRole) && adminRecord.customClaims?.admin !== true) {
    fail('replay account is not an active privileged Admin');
  }
  const result = await jsonRequest(ADMIN_APPROVE_PAYMENT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.idToken}`,
      'X-Firebase-AppCheck': auth.appCheckToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ data: { paymentId } }),
  });
  if (!result.response.ok) fail(`adminApprovePayment replay failed with HTTP ${result.response.status}`);
  const payload = result.payload?.result || result.payload?.data || result.payload;
  if (payload?.status !== 'SUCCESS' || payload?.idempotent !== true) {
    fail('adminApprovePayment replay did not return SUCCESS with idempotent=true');
  }
  return { replayActorUidHash: sha256(auth.uid), responseStatus: result.response.status };
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
  const paymentId = safeId(process.env.PAYMENT_ID, 'payment_id');
  const paymentDoc = await requiredDoc('payment_transactions', paymentId);
  const payment = paymentDoc.data;
  const bindings = paymentBindings(paymentId, payment);
  const [contractDoc, intakeDoc, userDoc, ownerDoc] = await Promise.all([
    requiredDoc('contracts', bindings.contractId),
    requiredDoc('intake_submissions', bindings.intakeId),
    requiredDoc('users', bindings.ownerUid),
    requiredDoc('owners', bindings.ownerUid),
  ]);
  const contract = contractDoc.data;
  const intake = intakeDoc.data;
  const user = userDoc.data;
  const owner = ownerDoc.data;
  const properties = await queryDocs('properties', 'intakeId', bindings.intakeId);
  if (!properties.length) fail('owner activation has no bound property records');
  const invoiceId = text(payment.invoiceId || contract.invoiceId);
  const invoice = invoiceId ? await requiredDoc('invoices', invoiceId) : null;

  if (!statusIn(payment.status, ['APPROVED']) || payment.paymentVerified !== true || payment.unlocksDashboard !== true) fail('payment is not approved and dashboard-unlocking');
  if (!statusIn(contract.status || contract.contractStatus, ['ACTIVE']) || contract.adminApproved !== true || contract.dashboardUnlockApproved !== true) fail('contract is not active and Admin-approved');
  if (!statusIn(intake.status || intake.activationState, ['ACTIVE'])) fail('intake is not active');
  if (user.dashboardUnlocked !== true || user.dashboardLocked === true || !statusIn(user.activationStatus, ['ACTIVE'])) fail('users owner dashboard is not unlocked');
  if (owner.dashboardUnlocked !== true || owner.dashboardLocked === true || !statusIn(owner.activationStatus || owner.status, ['ACTIVE'])) fail('owners registry is not unlocked');
  if (properties.some(({ data }) => !statusIn(data.status || data.activationStatus, ['ACTIVE']) || text(data.ownerUid || data.ownerId) !== bindings.ownerUid)) fail('one or more properties are not active or owner-bound');
  if (!invoice || !statusIn(invoice.data.status, ['PAID']) || invoice.data.paymentId !== paymentId || invoice.data.contractId !== bindings.contractId) fail('paid mobilization invoice is missing or mismatched');

  const annual = Number(payment.quoteSnapshot?.annualContractValue || contract.quoteSnapshot?.annualContractValue || contract.annualContractValue || 0);
  const amount = Number(payment.amountReceived || payment.quoteSnapshot?.activationDeposit || payment.amount || 0);
  if (!Number.isFinite(annual) || annual <= 0 || !Number.isFinite(amount) || Math.abs(amount - Math.round(annual * 0.15)) > 0.01) fail('activation amount is not the locked 15% deposit');

  return {
    paymentId,
    contractId: bindings.contractId,
    intakeId: bindings.intakeId,
    ownerUidHash: sha256(bindings.ownerUid),
    invoiceId,
    propertyCount: properties.length,
    amountMinor: Math.round(amount * 100),
    currency: 'AED',
    paymentApprovedAt: iso(payment.approvedAt),
    contractApprovedAt: iso(contract.approvedAt),
    ownerApprovedAt: iso(user.approvedAt),
    observedAt: new Date().toISOString(),
  };
}

async function paymentUnlockExactlyOnceProof() {
  const paymentId = safeId(process.env.PAYMENT_ID, 'payment_id');
  const paymentBefore = await requiredDoc('payment_transactions', paymentId);
  const bindings = paymentBindings(paymentId, paymentBefore.data);
  const [contractBefore, userBefore, invoicesBefore, auditsBefore] = await Promise.all([
    requiredDoc('contracts', bindings.contractId),
    requiredDoc('users', bindings.ownerUid),
    queryDocs('invoices', 'paymentId', paymentId),
    queryDocs('audit_logs', 'paymentId', paymentId),
  ]);
  const approvalAuditsBefore = auditsBefore.filter(({ data }) => data.action === 'ADMIN_APPROVE_PAYMENT');
  if (invoicesBefore.length !== 1 || approvalAuditsBefore.length !== 1) fail('pre-replay activation is not exactly-once');
  const before = {
    paymentApprovedAt: millis(paymentBefore.data.approvedAt),
    contractApprovedAt: millis(contractBefore.data.approvedAt),
    ownerApprovedAt: millis(userBefore.data.approvedAt),
    invoiceId: invoicesBefore[0].id,
    invoiceProofHash: text(invoicesBefore[0].data.proofHash),
  };
  if (!before.paymentApprovedAt || !before.contractApprovedAt || !before.ownerApprovedAt || !/^[a-f0-9]{64}$/i.test(before.invoiceProofHash)) fail('pre-replay approval timestamps or invoice proof are missing');

  const replay = await replayPaymentApproval(paymentId);
  const [paymentAfter, contractAfter, userAfter, invoicesAfter, auditsAfter] = await Promise.all([
    requiredDoc('payment_transactions', paymentId),
    requiredDoc('contracts', bindings.contractId),
    requiredDoc('users', bindings.ownerUid),
    queryDocs('invoices', 'paymentId', paymentId),
    queryDocs('audit_logs', 'paymentId', paymentId),
  ]);
  const approvalAuditsAfter = auditsAfter.filter(({ data }) => data.action === 'ADMIN_APPROVE_PAYMENT');
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
    paymentId,
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
  const paymentId = safeId(process.env.PAYMENT_ID, 'payment_id');
  const contractId = safeId(process.env.CONTRACT_ID, 'contract_id');
  const contractBefore = await requiredDoc('contracts', contractId);
  const payment = await requiredDoc('payment_transactions', paymentId);
  if (text(payment.data.contractId || payment.data.intakeId || paymentId) !== contractId) fail('payment and contract input IDs are not bound');
  const commissionsBefore = await queryDocs('broker_commissions', 'contractId', contractId);
  if (commissionsBefore.length !== 1 || commissionsBefore[0].id !== `commission_${contractId}`) fail('commission is not deterministically locked exactly once');
  const commissionBefore = commissionsBefore[0].data;
  const brokerUid = text(commissionBefore.brokerUid || contractBefore.data.referralUid || contractBefore.data.brokerUid);
  if (!brokerUid || text(contractBefore.data.commissionId) !== commissionsBefore[0].id || contractBefore.data.commissionGenerated !== true) fail('contract commission binding is incomplete');
  if (text(commissionBefore.contractId) !== contractId || text(commissionBefore.ownerUid) !== text(contractBefore.data.ownerUid || contractBefore.data.ownerId)) fail('commission contract/owner binding mismatch');
  const auditBefore = await requiredDoc('auditLogs', `broker_commission_${contractId}`);
  if (auditBefore.data.action !== 'BROKER_COMMISSION_CREATED' || auditBefore.data.commissionId !== commissionsBefore[0].id) fail('deterministic commission audit is missing');
  const beforeHash = sha256(JSON.stringify({
    id: commissionsBefore[0].id,
    amount: commissionBefore.commissionAmount,
    rate: commissionBefore.commissionRate,
    status: commissionBefore.status,
    createdAt: millis(commissionBefore.createdAt),
    auditId: auditBefore.id,
  }));

  const replay = await replayPaymentApproval(paymentId);
  const [contractAfter, commissionsAfter, auditAfter] = await Promise.all([
    requiredDoc('contracts', contractId),
    queryDocs('broker_commissions', 'contractId', contractId),
    requiredDoc('auditLogs', `broker_commission_${contractId}`),
  ]);
  if (commissionsAfter.length !== 1 || commissionsAfter[0].id !== commissionsBefore[0].id) fail('payment replay created or replaced a commission lock');
  const afterHash = sha256(JSON.stringify({
    id: commissionsAfter[0].id,
    amount: commissionsAfter[0].data.commissionAmount,
    rate: commissionsAfter[0].data.commissionRate,
    status: commissionsAfter[0].data.status,
    createdAt: millis(commissionsAfter[0].data.createdAt),
    auditId: auditAfter.id,
  }));
  if (beforeHash !== afterHash || contractAfter.data.commissionId !== commissionsBefore[0].id) fail('commission lock changed during replay');

  return {
    paymentId,
    contractId,
    commissionId: commissionsBefore[0].id,
    brokerUidHash: sha256(brokerUid),
    commissionCount: commissionsAfter.length,
    commissionStateHash: afterHash,
    replayHttpStatus: replay.responseStatus,
    replayActorUidHash: replay.replayActorUidHash,
    stateUnchanged: true,
    observedAt: new Date().toISOString(),
  };
}

async function tenantNotificationProof() {
  const notificationId = safeId(process.env.NOTIFICATION_ID, 'notification_id');
  const ticketId = safeId(process.env.TICKET_ID, 'ticket_id');
  const tenantUid = safeId(process.env.TENANT_UID, 'tenant_uid');
  const notification = await requiredDoc('notifications', notificationId);
  const data = notification.data;
  if (text(data.recipientId) !== tenantUid || text(data.ticketId) !== ticketId) fail('notification recipient/ticket binding mismatch');
  if (upper(data.pushDeliveryState) !== 'SUCCESS' || Number(data.pushSuccessCount || 0) < 1 || Number(data.pushFailureCount || 0) !== 0 || Number(data.pushTokenCount || 0) < 1 || !data.pushAttemptedAt) fail('tenant push delivery was not successful');

  let ticket = null;
  for (const collectionName of ['maintenanceTickets', 'tickets']) {
    const snapshot = await db.collection(collectionName).doc(ticketId).get();
    if (snapshot.exists) { ticket = { collectionName, data: snapshot.data() || {} }; break; }
  }
  if (!ticket) fail('tenant maintenance request does not exist');
  const participantIds = [ticket.data.tenantId, ticket.data.tenantUid, ticket.data.userId, ticket.data.createdBy, ticket.data.requesterId].map(text);
  if (!participantIds.includes(tenantUid)) fail('ticket is not bound to the tenant');
  const evidence = photoEvidence(ticket.data);
  if (!evidence) fail('tenant request has no production photo/evidence reference');
  if (!text(ticket.data.propertyId) || !text(ticket.data.unitId || ticket.data.unitNumber || ticket.data.unit)) fail('tenant request is not linked to property and unit');

  return {
    notificationId,
    ticketId,
    ticketCollection: ticket.collectionName,
    tenantUidHash: sha256(tenantUid),
    propertyIdHash: sha256(text(ticket.data.propertyId)),
    unitBindingHash: sha256(text(ticket.data.unitId || ticket.data.unitNumber || ticket.data.unit)),
    photoEvidenceHash: sha256(evidence),
    pushTokenCount: Number(data.pushTokenCount),
    pushSuccessCount: Number(data.pushSuccessCount),
    pushFailureCount: Number(data.pushFailureCount),
    pushAttemptedAt: iso(data.pushAttemptedAt),
    observedAt: new Date().toISOString(),
  };
}

async function adminStaffClaimsProof() {
  const staffUid = safeId(process.env.STAFF_UID, 'staff_uid');
  const authRecord = await admin.auth().getUser(staffUid);
  const [userDoc, accessDoc, hrDoc, technicianDoc] = await Promise.all([
    requiredDoc('users', staffUid),
    requiredDoc('staffAccess', staffUid),
    requiredDoc('hrProfiles', staffUid),
    requiredDoc('technicians', staffUid),
  ]);
  const role = lower(userDoc.data.role || userDoc.data.userRole);
  const claims = authRecord.customClaims || {};
  if (role !== 'technician') fail('least-privilege launch proof requires a technician staff account');
  if (authRecord.disabled || lower(claims.role || claims.userRole) !== role || claims.staff !== true || claims.technician !== true) fail('technician Auth claims do not match the staff profile');
  if (claims.admin === true || claims.super_admin === true || claims.superAdmin === true || claims.ceo === true || PRIVILEGED_ROLES.has(lower(claims.role))) fail('technician account has privileged Admin claims');
  if (lower(accessDoc.data.role) !== role || accessDoc.data.active !== true || lower(hrDoc.data.role || hrDoc.data.employeeType) !== role || lower(technicianDoc.data.role) !== role) fail('staff registries do not agree on technician role');
  const permissions = accessDoc.data.permissions && typeof accessDoc.data.permissions === 'object' ? accessDoc.data.permissions : {};
  const forbidden = ['canManageSecurity', 'canManageUsers', 'canApprovePayments', 'canManageContracts', 'canManageHr'];
  if (forbidden.some((key) => permissions[key] === true || claims.permissions?.[key] === true)) fail('technician account has elevated permissions');
  const audits = await queryDocs('audit_logs', 'targetId', staffUid);
  const creationAudits = audits.filter(({ data }) => data.action === 'ADMIN_CREATE_STAFF_USER');
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
  const watchId = safeId(process.env.RENEWAL_WATCH_ID, 'renewal_watch_id');
  const watch = await requiredDoc('contract_renewal_watch', watchId);
  const data = watch.data;
  const sourceCollection = text(data.sourceCollection);
  const sourceId = text(data.sourceId);
  if (!sourceCollection || !sourceId || !/^[A-Za-z0-9_-]{2,80}$/.test(sourceCollection)) fail('renewal watch lacks source collection/document binding');
  const source = await requiredDoc(sourceCollection, sourceId, `${sourceCollection}/${sourceId}`);
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

const handlers = {
  ownerPaymentActivation: ownerActivationProof,
  paymentUnlockExactlyOnce: paymentUnlockExactlyOnceProof,
  tenantNotificationDelivery: tenantNotificationProof,
  brokerCommissionLockExactlyOnce: brokerCommissionProof,
  adminStaffClaims: adminStaffClaimsProof,
  renewalScheduler: renewalSchedulerProof,
};

const evidence = await handlers[gate]();
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
const outputPath = path.resolve(`launch_package/application-${gate}.json`);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[operational-application-evidence] PASS gate=${gate}`);
console.log(`[operational-application-evidence] wrote ${outputPath}`);
