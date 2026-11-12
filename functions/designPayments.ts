import * as admin from 'firebase-admin';
import type * as FirebaseFirestore from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertCashWithinPropertyContractCap } from './ownerCashCap';
import { resolveActivePaymentConfiguration } from './paymentConfiguration';
import { assertDesignPaymentBinding, designPaymentTerms, DESIGN_PAYMENT_METHODS, DESIGN_PAYMENT_WORKFLOW } from './designPaymentPolicy';
import { protectedMediaUrl } from './aiDesignMedia';
import {
  assertChoiceLockedForHandoff,
  buildExecutionBrief,
  buildLockedChoice,
  ENGINEER_BRIEF_STATUSES,
  LOCKABLE_DESIGN_STATUSES,
  matchDesignOption,
  publicExecutionBrief,
  publicLockedChoice,
  sameLockedChoice,
} from './designExecutionBrief';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const options = { cors: true, region: 'europe-west3', enforceAppCheck: true };
const STORAGE_BUCKET = 'bin-group-57c60.firebasestorage.app';
const MEDIA_TTL_MS = 15 * 60 * 1000;
const ENGINEER_ROLES = ['technician', 'engineer'];
const now = () => admin.firestore.FieldValue.serverTimestamp();
const text = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
const financeRole = (token: any) => ['admin', 'super_admin', 'ceo', 'finance_admin'].includes(roleOf(token)) || token?.admin === true || token?.isAdmin === true || token?.superAdmin === true || token?.super_admin === true || token?.ceo === true;
const pendingStatuses = ['AI_CONCEPT_READY', 'DEPOSIT_PENDING', 'OWNER_APPROVED_TENANT_TO_PAY', 'OWNER_APPROVED_OWNER_TO_PAY', 'PAYMENT_PENDING'];

function id(value: unknown) {
  const result = text(value, 181);
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(result)) throw new HttpsError('invalid-argument', 'A valid design request ID is required.');
  return result;
}

async function actor(request: any, finance = false) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Login required.');
  const token = request.auth.token || {};
  const record = await admin.auth().getUser(request.auth.uid);
  if (record.disabled || !record.emailVerified || token.email_verified !== true || token.suspended === true || record.customClaims?.suspended === true) {
    throw new HttpsError('permission-denied', 'An active, verified account is required.');
  }
  if (finance ? (!financeRole(token) || !financeRole(record.customClaims) || !token.firebase?.sign_in_second_factor) :
      (!['owner', 'tenant'].includes(roleOf(token)) || roleOf(record.customClaims) !== roleOf(token))) {
    throw new HttpsError('permission-denied', finance ? 'An active Finance Admin MFA session is required.' : 'Owner or Tenant authority is required.');
  }
  return { uid: request.auth.uid as string, role: roleOf(token) };
}

function termsFor(design: Record<string, any>, quote: Record<string, any>) {
  try { return designPaymentTerms(design, quote); }
  catch (error) { throw new HttpsError('failed-precondition', (error as Error).message); }
}

async function state(transaction: FirebaseFirestore.Transaction, requestId: string) {
  const designRef = db.collection('design_requests').doc(requestId);
  const paymentRef = db.collection('payment_transactions').doc(`design_${requestId}`);
  const [designSnap, quoteSnap, paymentSnap, configSnap] = await Promise.all([
    transaction.get(designRef), transaction.get(db.collection('design_quotes').doc(requestId)),
    transaction.get(paymentRef), transaction.get(db.collection('system_payment_config').doc('current')),
  ]);
  if (!designSnap.exists || !quoteSnap.exists) throw new HttpsError('not-found', 'The design request or canonical quote is missing.');
  const design = designSnap.data() || {};
  const terms = termsFor(design, quoteSnap.data() || {});
  const config = resolveActivePaymentConfiguration(configSnap.data() || {});
  return { designRef, paymentRef, design, terms, config, payment: paymentSnap.data(), paymentExists: paymentSnap.exists };
}

function assertBinding(s: Awaited<ReturnType<typeof state>>, method: string) {
  if (!s.paymentExists || s.payment?.designRequestId !== s.designRef.id) throw new HttpsError('failed-precondition', 'The bound design payment is missing.');
  try { assertDesignPaymentBinding(s.payment!, s.terms, s.config, method); }
  catch (error) { throw new HttpsError('failed-precondition', (error as Error).message); }
}

export const getDesignPaymentInstructions = onCall(options, async (request) => {
  const user = await actor(request);
  const requestId = id(request.data?.designRequestId);
  return db.runTransaction(async (transaction) => {
    const s = await state(transaction, requestId);
    if (s.terms.payerId !== user.uid || s.terms.payerRole !== user.role) throw new HttpsError('permission-denied', 'Only the approved payer can retrieve payment instructions.');
    return { amount: s.terms.amount, currency: 'AED', legalBeneficiary: s.config.legalBeneficiary, officeLocation: s.config.officeLocation, approvedMethods: s.config.approvedMethods, paymentConfigVersion: s.config.version, paymentConfigHash: s.config.configHash };
  });
});

export const createDesignPaymentRequest = onCall(options, async (request) => {
  const user = await actor(request);
  const requestId = id(request.data?.designRequestId);
  const method = text(request.data?.method).toUpperCase();
  if (!DESIGN_PAYMENT_METHODS.includes(method as 'CASH' | 'CHEQUE')) throw new HttpsError('invalid-argument', 'Select Cash or Cheque.');
  return db.runTransaction(async (transaction) => {
    const s = await state(transaction, requestId);
    if (s.terms.payerId !== user.uid || s.terms.payerRole !== user.role) throw new HttpsError('permission-denied', 'Only the approved payer can request payment.');
    if (!pendingStatuses.includes(s.design.status)) throw new HttpsError('failed-precondition', 'The design is not awaiting payment.');
    if (request.data?.paymentConfigVersion !== s.config.version || request.data?.paymentConfigHash !== s.config.configHash) throw new HttpsError('failed-precondition', 'Payment instructions changed. Refresh and review them before continuing.');
    if (s.paymentExists) {
      assertBinding(s, method);
      return { ok: true, paymentId: s.paymentRef.id, idempotent: true };
    }
    await assertCashWithinPropertyContractCap({
      db,
      reader: transaction,
      method,
      amountAed: Number(s.terms.amount || 0),
      contractId: s.design.contractId || s.terms.contractId || null,
      propertyId: s.design.propertyId || null,
      excludePaymentIds: [s.paymentRef.id],
    });
    transaction.create(s.paymentRef, {
      paymentId: s.paymentRef.id, type: 'DESIGN_STUDIO_EXECUTION', source: 'AI_DESIGN_STUDIO',
      workflowVersion: DESIGN_PAYMENT_WORKFLOW, designRequestId: requestId, ...s.terms,
      ownerId: s.design.ownerId, tenantId: s.design.tenantId || null, userId: user.uid,
      propertyId: s.design.propertyId || null, propertyName: s.design.propertyName || null,
      currency: 'AED', method, paymentMethod: method, provider: 'MANUAL',
      paymentConfigVersion: s.config.version, paymentConfigHash: s.config.configHash,
      paymentManifest: { legalBeneficiary: s.config.legalBeneficiary, officeLocation: s.config.officeLocation, approvedMethods: s.config.approvedMethods },
      status: 'PENDING_ADMIN_PAYMENT_VERIFICATION', paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
      verificationState: 'AWAITING_CASH_CHEQUE_RECEIPT', adminApprovalRequired: true,
      paymentVerified: false, approved: false, amountReceived: 0, createdAt: now(), updatedAt: now(),
    });
    transaction.update(s.designRef, {
      status: 'PAYMENT_PENDING', workflowStage: 'PAYMENT_PENDING', paymentId: s.paymentRef.id,
      payerId: user.uid, payerRole: user.role, paymentMethod: method,
      paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION', paymentVerified: false,
      executionStatus: 'AWAITING_PAYMENT_VERIFICATION', adminHandoffStatus: 'PAYMENT_QUEUE',
      engineerHandoffStatus: 'WAITING_PAYMENT', paymentRequestedAt: now(), updatedAt: now(),
    });
    transaction.create(db.collection('audit_logs').doc(`design_payment_${requestId}`), {
      action: 'DESIGN_MANUAL_PAYMENT_REQUESTED', actorId: user.uid, actorRole: user.role,
      targetType: 'design_requests', targetId: requestId, paymentId: s.paymentRef.id,
      amount: s.terms.amount, quoteHash: s.terms.quoteHash, method,
      paymentConfigHash: s.config.configHash, createdAt: now(),
    });
    return { ok: true, paymentId: s.paymentRef.id, idempotent: false };
  });
});

export const submitDesignOwnerDecision = onCall(options, async (request) => {
  const user = await actor(request);
  const requestId = id(request.data?.designRequestId);
  const action = text(request.data?.action).toUpperCase();
  if (user.role !== 'owner' || !['APPROVE', 'TAKEOVER', 'REJECT'].includes(action)) throw new HttpsError('permission-denied', 'An Owner decision is required.');
  return db.runTransaction(async (transaction) => {
    const designRef = db.collection('design_requests').doc(requestId);
    const approvalRef = db.collection('design_approvals').doc(`${requestId}_owner`);
    const [designSnap, quoteSnap, approvalSnap, paymentSnap] = await Promise.all([
      transaction.get(designRef), transaction.get(db.collection('design_quotes').doc(requestId)),
      transaction.get(approvalRef), transaction.get(db.collection('payment_transactions').doc(`design_${requestId}`)),
    ]);
    const design = designSnap.data() || {};
    if (!designSnap.exists || design.ownerId !== user.uid || design.role !== 'tenant' || approvalSnap.data()?.ownerId !== user.uid) throw new HttpsError('permission-denied', 'Only the bound property Owner can decide this tenant request.');
    if (design.ownerAction === action && design.ownerActionBy === user.uid && design.approvedQuoteHash === design.quote?.quoteHash) return { ok: true, idempotent: true };
    if (paymentSnap.exists || !['AWAITING_OWNER_APPROVAL', 'PENDING_OWNER_NOC'].includes(design.status)) throw new HttpsError('failed-precondition', 'This design is no longer awaiting an Owner decision.');
    const payerRole = action === 'TAKEOVER' ? 'owner' : 'tenant';
    const payerId = payerRole === 'owner' ? user.uid : text(design.tenantId || design.userId);
    const decision = { payerId, payerRole, ownerAction: action, ownerActionBy: user.uid, approvedQuoteHash: design.quote?.quoteHash || '', approvalStatus: action === 'REJECT' ? 'OWNER_REJECTED' : 'OWNER_APPROVED' };
    if (action !== 'REJECT') termsFor({ ...design, ...decision }, quoteSnap.data() || {});
    const status = action === 'REJECT' ? 'OWNER_REJECTED' : action === 'TAKEOVER' ? 'OWNER_APPROVED_OWNER_TO_PAY' : 'OWNER_APPROVED_TENANT_TO_PAY';
    transaction.update(designRef, { ...decision, status, workflowStage: status, quoteStatus: action === 'REJECT' ? 'REJECTED' : 'DEPOSIT_PENDING', ownerActionAt: now(), updatedAt: now() });
    transaction.update(approvalRef, { ...decision, status: decision.approvalStatus, decision: action === 'REJECT' ? 'REJECTED' : 'APPROVED', decidedBy: user.uid, decidedAt: now(), updatedAt: now() });
    transaction.update(db.collection('design_quotes').doc(requestId), { status: action === 'REJECT' ? 'REJECTED' : 'DEPOSIT_PENDING', updatedAt: now() });
    transaction.create(db.collection('audit_logs').doc(`design_owner_decision_${requestId}`), { action: `DESIGN_OWNER_${action}`, actorId: user.uid, actorRole: user.role, targetType: 'design_requests', targetId: requestId, ...decision, createdAt: now() });
    transaction.create(db.collection('notifications').doc(`design_owner_decision_${requestId}`), {
      recipientId: design.userId, type: 'DESIGN_OWNER_DECISION', title: 'Design Owner decision',
      body: action === 'REJECT' ? 'The Owner declined this design request.' : 'The Owner approved your design request. Review the approved payer and payment instructions.',
      link: `/tenant/design-studio/${requestId}`, read: false, createdAt: now(),
    });
    return { ok: true, idempotent: false };
  });
});

function receiptBytes(data: any) {
  const contentType = text(data?.contentType).toLowerCase();
  const encoded = String(data?.encodedDocument || '');
  if (encoded.length > 14 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new HttpsError('invalid-argument', 'A valid receipt file of at most 10 MB is required.');
  const bytes = Buffer.from(encoded, 'base64');
  const validType = (contentType === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-') ||
    (contentType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (contentType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (contentType === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
  if (!validType || !bytes.length || bytes.length > 10 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Receipt must be a valid PDF, JPEG, PNG, or WebP file under 10 MB.');
  return { bytes, contentType, hash: createHash('sha256').update(bytes).digest('hex') };
}

export const adminReviewDesignPayment = onCall({ ...options, enforceAppCheck: true, memory: '512MiB' }, async (request) => {
  const user = await actor(request, true);
  const requestId = id(request.data?.designRequestId);
  const decision = text(request.data?.decision).toUpperCase();
  if (!['APPROVE', 'RETURN'].includes(decision)) throw new HttpsError('invalid-argument', 'Select APPROVE or RETURN.');
  const reference = text(request.data?.paymentReferenceId, 180);
  const method = text(request.data?.method).toUpperCase();
  const notes = text(request.data?.internalNotes, 1000);
  let receipt: { storagePath: string; receiptHash: string; generation: string; contentType: string } | null = null;
  if (decision === 'APPROVE') {
    if (reference.length < 4) throw new HttpsError('invalid-argument', 'An official receipt reference is required.');
    const proof = receiptBytes(request.data);
    const initial = await db.runTransaction((transaction) => state(transaction, requestId));
    assertBinding(initial, method);
    if (Number(request.data?.amountReceived) !== initial.terms.amount) throw new HttpsError('failed-precondition', 'The received amount must exactly match the approved design deposit.');
    if (initial.payment?.paymentVerified === true) {
      if (initial.payment.receiptHash !== proof.hash || initial.payment.paymentReferenceId !== reference) throw new HttpsError('already-exists', 'This payment has already been verified with different evidence.');
      return { ok: true, idempotent: true, paymentId: initial.paymentRef.id };
    }
    if (initial.design.status !== 'PAYMENT_PENDING') throw new HttpsError('failed-precondition', 'The design is not awaiting payment.');
    const storagePath = `design-payment-receipts/${requestId}/${proof.hash}`;
    const file = admin.storage().bucket().file(storagePath);
    try {
      await file.save(proof.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: proof.contentType, metadata: { evidenceType: 'design_payment_receipt', designRequestId: requestId, paymentId: initial.paymentRef.id, receiptHash: proof.hash, recordedBy: user.uid } } });
    } catch (error: any) {
      if (Number(error?.code) !== 412) throw new HttpsError('unavailable', 'The receipt could not be stored securely.');
    }
    const [metadata] = await file.getMetadata();
    if (!metadata.generation || metadata.metadata?.receiptHash !== proof.hash || metadata.metadata?.paymentId !== initial.paymentRef.id || metadata.contentType !== proof.contentType || Number(metadata.size) !== proof.bytes.length) throw new HttpsError('failed-precondition', 'Immutable receipt metadata does not match this payment.');
    receipt = { storagePath, receiptHash: proof.hash, generation: String(metadata.generation), contentType: proof.contentType };
  } else if (notes.length < 8) throw new HttpsError('invalid-argument', 'A clear return reason is required.');

  return db.runTransaction(async (transaction) => {
    const s = await state(transaction, requestId);
    assertBinding(s, decision === 'APPROVE' ? method : text(s.payment?.method));
    if (s.payment?.paymentVerified === true) {
      if (decision === 'APPROVE' && s.payment.receiptHash === receipt?.receiptHash && s.payment.paymentReferenceId === reference) return { ok: true, idempotent: true, paymentId: s.paymentRef.id };
      throw new HttpsError('failed-precondition', 'A verified payment cannot be returned or replaced.');
    }
    if (s.design.status !== 'PAYMENT_PENDING') throw new HttpsError('failed-precondition', 'The design is not awaiting payment.');
    if (decision === 'APPROVE' && Number(request.data?.amountReceived) !== s.terms.amount) throw new HttpsError('aborted', 'The locked deposit changed during verification.');
    const verified = decision === 'APPROVE';
    if (verified) {
      const referenceHash = createHash('sha256').update(reference.toUpperCase()).digest('hex');
      const evidenceRefs = [
        db.collection('design_receipt_registry').doc(`file_${receipt!.receiptHash}`),
        db.collection('design_receipt_registry').doc(`reference_${referenceHash}`),
      ];
      const evidence = await Promise.all(evidenceRefs.map((ref) => transaction.get(ref)));
      if (evidence.some((snapshot) => snapshot.exists)) throw new HttpsError('already-exists', 'This receipt file or reference has already been allocated. Finance review is required; do not record the payment twice.');
      for (const ref of evidenceRefs) transaction.create(ref, { paymentId: s.paymentRef.id, designRequestId: requestId, receiptHash: receipt!.receiptHash, referenceHash, recordedBy: user.uid, createdAt: now() });
    }
    transaction.update(s.paymentRef, {
      status: verified ? 'APPROVED' : 'PENDING_ADMIN_PAYMENT_VERIFICATION',
      paymentStatus: verified ? 'APPROVED' : 'PENDING_ADMIN_PAYMENT_VERIFICATION',
      verificationState: verified ? 'ADMIN_VERIFIED' : 'EVIDENCE_RETURNED',
      paymentVerified: verified, approved: verified, adminApprovalRequired: !verified,
      ...(verified ? { amountReceived: s.terms.amount, paymentReferenceId: reference, receiptPath: receipt!.storagePath, receiptHash: receipt!.receiptHash, receiptGeneration: receipt!.generation, receiptEvidence: receipt, approvedBy: user.uid, approvedAt: now() } : {}),
      // Approval notes stay in the Admin audit; only a return reason is payer-visible.
      adminNotes: verified ? '' : notes, updatedAt: now(),
    });
    transaction.update(s.designRef, {
      status: verified ? 'PAID' : 'PAYMENT_PENDING', workflowStage: verified ? 'PAID' : 'PAYMENT_PENDING',
      paymentVerified: verified, paymentStatus: verified ? 'APPROVED' : 'EVIDENCE_RETURNED',
      adminHandoffStatus: verified ? 'PAYMENT_VERIFIED' : 'PAYMENT_QUEUE',
      executionStatus: verified ? 'AWAITING_ADMIN_HANDOFF' : 'AWAITING_PAYMENT_VERIFICATION',
      engineerHandoffStatus: 'WAITING_ADMIN_HANDOFF', paymentReviewNote: verified ? '' : notes, updatedAt: now(),
    });
    const auditRef = verified ? db.collection('audit_logs').doc(`design_payment_approved_${requestId}`) : db.collection('audit_logs').doc();
    transaction.create(auditRef, { action: verified ? 'DESIGN_PAYMENT_APPROVED' : 'DESIGN_PAYMENT_RETURNED', actorId: user.uid, actorRole: user.role, targetType: 'payment_transactions', targetId: s.paymentRef.id, designRequestId: requestId, amount: s.terms.amount, quoteHash: s.terms.quoteHash, receiptEvidence: receipt, notes, createdAt: now() });
    transaction.create(verified ? db.collection('notifications').doc(`design_payment_approved_${requestId}`) : db.collection('notifications').doc(), {
      recipientId: s.terms.payerId, type: 'DESIGN_PAYMENT_REVIEW', title: 'Design payment reviewed',
      body: verified ? 'Your Cash/Cheque deposit was verified. Admin handoff is next; work has not yet started.' : `Payment evidence needs review: ${notes}`,
      link: `/${s.terms.payerRole}/design-studio/${requestId}`, read: false, createdAt: now(),
    });
    return { ok: true, paymentId: s.paymentRef.id, idempotent: false };
  });
});

export const adminHandoffDesignRequest = onCall(options, async (request) => {
  const user = await actor(request, true);
  const requestId = id(request.data?.designRequestId);
  return db.runTransaction(async (transaction) => {
    const s = await state(transaction, requestId);
    assertBinding(s, text(s.payment?.method));
    if (s.payment?.paymentVerified !== true || s.payment?.status !== 'APPROVED' || !s.payment.receiptGeneration || !s.payment.receiptHash || s.design.paymentVerified !== true) throw new HttpsError('failed-precondition', 'Verified immutable payment evidence is required before engineer handoff.');
    if (s.design.status === 'ENGINEER_REVIEW') return { ok: true, idempotent: true };
    if (s.design.status !== 'PAID') throw new HttpsError('failed-precondition', 'Only a paid design can enter engineer review.');
    let executionBrief: ReturnType<typeof buildExecutionBrief>;
    try {
      assertChoiceLockedForHandoff(s.design, s.terms.quoteHash);
      executionBrief = buildExecutionBrief(s.design);
    } catch (error) {
      throw new HttpsError('failed-precondition', (error as Error).message);
    }
    const handoffCount = Number(s.design.engineerHandoffCount || 0) + 1;
    const handoffAuditId = handoffCount === 1 ? `design_handoff_${requestId}` : `design_handoff_${requestId}_v${handoffCount}`;
    transaction.update(s.designRef, {
      status: 'ENGINEER_REVIEW', workflowStage: 'ENGINEER_REVIEW', adminHandoffStatus: 'ENGINEER_REVIEW',
      engineerHandoffStatus: 'READY_FOR_SCOPE_REVIEW', engineerHandoffBy: user.uid, engineerHandoffAt: now(),
      engineerHandoffCount: handoffCount, executionBrief, updatedAt: now(),
    });
    transaction.create(db.collection('audit_logs').doc(handoffAuditId), {
      action: 'DESIGN_ENGINEER_HANDOFF_READY', actorId: user.uid, actorRole: user.role,
      targetType: 'design_requests', targetId: requestId, paymentId: s.paymentRef.id, quoteHash: s.terms.quoteHash,
      lockedOptionId: s.design.lockedChoice.optionId, lockedImageStoragePath: s.design.lockedChoice.imageStoragePath,
      handoffCount, createdAt: now(),
    });
    return { ok: true, idempotent: false };
  });
});

function canLockDesign(user: { uid: string; role: string }, design: Record<string, any>) {
  if (user.role === 'owner' && design.ownerId === user.uid) return true;
  return user.role === 'tenant' && design.role === 'tenant' && (design.tenantId === user.uid || design.userId === user.uid);
}

function choiceError(error: unknown): never {
  throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'The chosen design could not be locked.');
}

function partyRecipients(requestId: string, design: Record<string, any>) {
  const ownerId = text(design.ownerId, 180);
  const tenantId = text(design.tenantId, 180);
  const recipients: Array<{ id: string; role: 'owner' | 'tenant'; link: string }> = [];
  if (ownerId) recipients.push({ id: ownerId, role: 'owner', link: `/owner/design-studio/request/${requestId}` });
  if (tenantId && tenantId !== ownerId) recipients.push({ id: tenantId, role: 'tenant', link: `/tenant/design-studio/request/${requestId}` });
  return recipients;
}

function conceptDocId(requestId: string, conceptId: unknown) {
  const idPart = text(conceptId, 80);
  return /^[A-Za-z0-9_-]{1,80}$/.test(idPart) ? `${requestId}_${idPart}` : '';
}

export const lockChosenDesignOption = onCall(options, async (request) => {
  const user = await actor(request);
  const requestId = id(request.data?.designRequestId);
  const optionId = text(request.data?.optionId, 80);
  if (request.data?.optionIndex !== undefined && request.data?.optionIndex !== null && !Number.isInteger(request.data.optionIndex)) {
    throw new HttpsError('invalid-argument', 'optionIndex must be a whole number.');
  }
  if (!optionId && !Number.isInteger(request.data?.optionIndex)) throw new HttpsError('invalid-argument', 'Choose a design option.');
  const optionIndex = Number.isInteger(request.data?.optionIndex) ? Number(request.data.optionIndex) : undefined;
  return db.runTransaction(async (transaction) => {
    const designRef = db.collection('design_requests').doc(requestId);
    const quoteRef = db.collection('design_quotes').doc(requestId);
    const approvalRef = db.collection('design_approvals').doc(`${requestId}_owner`);
    const designSnap = await transaction.get(designRef);
    if (!designSnap.exists) throw new HttpsError('not-found', 'The design request is missing.');
    const design = designSnap.data() || {};
    if (!canLockDesign(user, design)) throw new HttpsError('permission-denied', 'Only the tenant or the property owner can lock this design.');
    const status = String(design.status || '');
    if (!LOCKABLE_DESIGN_STATUSES.includes(status as typeof LOCKABLE_DESIGN_STATUSES[number])) {
      throw new HttpsError('failed-precondition', status === 'ENGINEER_REVIEW'
        ? 'The chosen design is with the engineer. An admin must authorize a design-choice revision before it can change. The deposit is not refunded by that step.'
        : 'This design can no longer be changed from here.');
    }
    if (status === 'CHOICE_REVISION_PENDING' && design.choiceRevisionAuthorized !== true) {
      throw new HttpsError('failed-precondition', 'A design-choice revision has not been authorized.');
    }
    const match = (() => {
      try { return matchDesignOption(design, { optionId, optionIndex }); }
      catch (error) { choiceError(error); }
    })();
    const nextVersion = Number(design.lockedChoice?.lockVersion || 0) + 1;
    const draft = buildLockedChoice(design, match, user, nextVersion);
    if (sameLockedChoice(design.lockedChoice, draft)) {
      if (design.executionBrief?.imageStoragePath === draft.imageStoragePath) {
        return { ok: true, idempotent: true, optionId: draft.optionId, lockVersion: Number(design.lockedChoice.lockVersion || 1) };
      }
      const executionBrief = (() => {
        try { return buildExecutionBrief(design); }
        catch (error) { choiceError(error); }
      })();
      transaction.update(designRef, { executionBrief, updatedAt: now() });
      return { ok: true, idempotent: false, optionId: design.lockedChoice.optionId, lockVersion: Number(design.lockedChoice.lockVersion || 1) };
    }
    const choice = draft;
    const conceptTargets = (Array.isArray(design.concepts) ? design.concepts : [])
      .map((concept: any) => ({ concept, docId: conceptDocId(requestId, concept?.id) }))
      .filter((item: { docId: string }) => Boolean(item.docId));
    const conceptRefs = conceptTargets.map((item: { docId: string }) => db.collection('design_concepts').doc(item.docId));
    const [quoteSnap, approvalSnap, ...conceptSnaps] = await Promise.all([
      transaction.get(quoteRef),
      transaction.get(approvalRef),
      ...conceptRefs.map((ref) => transaction.get(ref)),
    ]);
    if (!quoteSnap.exists) throw new HttpsError('not-found', 'The canonical design quote is missing.');
    const executionBrief = (() => {
      try { return buildExecutionBrief({ ...design, lockedChoice: choice }); }
      catch (error) { choiceError(error); }
    })();
    const summary = publicLockedChoice(choice);
    const returnedToPaid = status === 'CHOICE_REVISION_PENDING' && design.paymentVerified === true;
    transaction.update(designRef, {
      lockedChoice: { ...choice, lockedAt: now() },
      selectedConceptId: choice.optionId,
      executionBrief,
      choiceRevisionAuthorized: false,
      ...(returnedToPaid ? {
        status: 'PAID',
        workflowStage: 'PAID',
        adminHandoffStatus: 'PAYMENT_VERIFIED',
        engineerHandoffStatus: 'WAITING_ADMIN_HANDOFF',
        executionStatus: 'AWAITING_ADMIN_HANDOFF',
      } : {}),
      updatedAt: now(),
    });
    transaction.update(quoteRef, { lockedChoice: summary, updatedAt: now() });
    if (approvalSnap.exists) transaction.update(approvalRef, { lockedChoice: summary, updatedAt: now() });
    conceptSnaps.forEach((snap, index) => {
      if (!snap.exists) return;
      const selected = conceptTargets[index]?.concept?.id === choice.optionId;
      transaction.update(conceptRefs[index], { selected, selectedForExecution: selected, updatedAt: now() });
    });
    transaction.create(db.collection('audit_logs').doc(`design_choice_lock_${requestId}_v${choice.lockVersion}`), {
      action: 'DESIGN_CHOICE_LOCKED', actorId: user.uid, actorRole: user.role,
      targetType: 'design_requests', targetId: requestId,
      optionId: choice.optionId, optionIndex: choice.optionIndex, optionLabel: choice.optionLabel,
      imageStoragePath: choice.imageStoragePath, imageSha256: choice.imageSha256,
      quoteHash: choice.quoteHash, lockVersion: choice.lockVersion, createdAt: now(),
    });
    return { ok: true, idempotent: false, optionId: choice.optionId, lockVersion: choice.lockVersion };
  });
});

// Re-approval path after engineer handoff: admin MFA authorizes a new lock.
// The previous picture stays in place until the tenant or owner locks again.
// Payment is not refunded, re-approved, or collected again. Handoff must be repeated.
export const authorizeDesignChoiceRevision = onCall(options, async (request) => {
  const user = await actor(request, true);
  const requestId = id(request.data?.designRequestId);
  const reason = text(request.data?.reason, 500);
  if (reason.length < 8) throw new HttpsError('invalid-argument', 'A short reason for the design-choice revision is required.');
  return db.runTransaction(async (transaction) => {
    const s = await state(transaction, requestId);
    if (s.design.status === 'CHOICE_REVISION_PENDING' && s.design.choiceRevisionAuthorized === true) return { ok: true, idempotent: true };
    if (s.design.status !== 'ENGINEER_REVIEW') {
      throw new HttpsError('failed-precondition', 'A design-choice revision is only available while the engineer is reviewing the locked design, and before it is marked ready.');
    }
    if (s.payment?.paymentVerified !== true) throw new HttpsError('failed-precondition', 'Verified payment is required. This step does not approve or refund a payment.');
    const revisionCount = Number(s.design.choiceRevisionCount || 0) + 1;
    const revisionKey = revisionCount === 1 ? requestId : `${requestId}_v${revisionCount}`;
    transaction.update(s.designRef, {
      status: 'CHOICE_REVISION_PENDING', workflowStage: 'CHOICE_REVISION_PENDING',
      choiceRevisionAuthorized: true, choiceRevisionBy: user.uid, choiceRevisionReason: reason, choiceRevisionAt: now(),
      choiceRevisionCount: revisionCount,
      adminHandoffStatus: 'CHOICE_REVISION_PENDING', engineerHandoffStatus: 'CHOICE_REVISION_PENDING',
      executionStatus: 'AWAITING_CHOICE_REVISION', updatedAt: now(),
    });
    transaction.create(db.collection('audit_logs').doc(`design_choice_revision_${revisionKey}`), {
      action: 'DESIGN_CHOICE_REVISION_AUTHORIZED', actorId: user.uid, actorRole: user.role,
      targetType: 'design_requests', targetId: requestId, reason, quoteHash: s.terms.quoteHash,
      previousOptionId: s.design.lockedChoice?.optionId || null, revisionCount, createdAt: now(),
    });
    for (const recipient of partyRecipients(requestId, s.design)) {
      transaction.create(db.collection('notifications').doc(`design_choice_revision_${revisionKey}_${recipient.role}`), {
        recipientId: recipient.id, type: 'DESIGN_CHOICE_REVISION', title: 'Confirm the chosen design again',
        body: `Design request ${requestId} needs the chosen design confirmed again before execution continues. The deposit is unchanged. Reason: ${reason}`,
        link: recipient.link, requestId, read: false, createdAt: now(),
      });
    }
    return { ok: true, idempotent: false };
  });
});

async function executionActor(request: any) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Login required.');
  const token = request.auth.token || {};
  const record = await admin.auth().getUser(request.auth.uid);
  if (record.disabled || !record.emailVerified || token.email_verified !== true || token.suspended === true || record.customClaims?.suspended === true) {
    throw new HttpsError('permission-denied', 'An active, verified account is required.');
  }
  const role = roleOf(token);
  const claimsRole = roleOf(record.customClaims);
  if (financeRole(token) && financeRole(record.customClaims) && token.firebase?.sign_in_second_factor) {
    return { uid: request.auth.uid as string, role, kind: 'admin' as const };
  }
  if (ENGINEER_ROLES.includes(role) && role === claimsRole) return { uid: request.auth.uid as string, role, kind: 'engineer' as const };
  if (['owner', 'tenant'].includes(role) && role === claimsRole) return { uid: request.auth.uid as string, role, kind: 'party' as const };
  throw new HttpsError('permission-denied', 'You cannot open this design execution brief.');
}

function partyCanRead(user: { uid: string; role: string }, design: Record<string, any>) {
  return (user.role === 'owner' && design.ownerId === user.uid)
    || (user.role === 'tenant' && (design.tenantId === user.uid || design.userId === user.uid));
}

async function signedDesignImage(path: unknown, kind: 'reference' | 'generated') {
  const safe = text(path, 1000);
  if (!safe || safe.includes('://') || safe.startsWith('/') || safe.includes('..')) return '';
  return protectedMediaUrl(admin.storage().bucket(STORAGE_BUCKET) as any, safe, kind, MEDIA_TTL_MS, (message, detail) => {
    console.warn(`designExecution: ${message}`, detail);
  });
}

export const getDesignExecutionBrief = onCall(options, async (request) => {
  const user = await executionActor(request);
  const requestId = id(request.data?.designRequestId || request.data?.requestId);
  const snap = await db.collection('design_requests').doc(requestId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'The design request is missing.');
  const design = snap.data() || {};
  const allowed = user.kind === 'admin' || user.kind === 'engineer' || (user.kind === 'party' && partyCanRead(user, design));
  if (!allowed) throw new HttpsError('permission-denied', 'You cannot open this design execution brief.');
  if (user.kind === 'engineer' && !ENGINEER_BRIEF_STATUSES.includes(String(design.status || '') as typeof ENGINEER_BRIEF_STATUSES[number])) {
    throw new HttpsError('failed-precondition', 'The execution brief is available once the design is in engineer review.');
  }
  if (!design.lockedChoice?.imageStoragePath) throw new HttpsError('failed-precondition', 'Lock a chosen design before opening the execution brief.');
  const executionBrief = (() => {
    try {
      const stored = design.executionBrief?.imageStoragePath === design.lockedChoice.imageStoragePath
        ? design.executionBrief
        : buildExecutionBrief(design);
      return publicExecutionBrief(stored);
    } catch (error) {
      throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'The execution brief is unavailable.');
    }
  })();
  const [chosenImageUrl, referenceImageUrl] = await Promise.all([
    signedDesignImage(design.lockedChoice.imageStoragePath, 'generated'),
    signedDesignImage(executionBrief?.referenceImagePath || design.referenceImagePaths?.[0], 'reference'),
  ]);
  return {
    requestId,
    status: design.status || '',
    propertyName: text(design.propertyName, 160),
    lockedChoice: publicLockedChoice(design.lockedChoice),
    executionBrief,
    chosenImageUrl,
    referenceImageUrl,
    completionNote: text(design.completionNote, 500),
  };
});

export const listDesignsAwaitingExecution = onCall(options, async (request) => {
  const user = await executionActor(request);
  if (user.kind === 'party') throw new HttpsError('permission-denied', 'Only an engineer or admin can list design execution jobs.');
  const snap = await db.collection('design_requests').where('status', 'in', ['ENGINEER_REVIEW', 'EXECUTION_READY']).limit(30).get();
  return {
    designs: snap.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const choice = data.lockedChoice || {};
      return {
        id: docSnap.id,
        status: String(data.status || ''),
        propertyName: text(data.propertyName, 160),
        zoneType: text(data.scope?.zoneType, 80),
        optionLabel: text(choice.optionLabel, 120),
        finishTier: text(choice.finishTier, 40),
      };
    }),
  };
});

export const markDesignExecutionReady = onCall(options, async (request) => {
  const user = await executionActor(request);
  if (user.kind === 'party') throw new HttpsError('permission-denied', 'Only an engineer or an admin with MFA can mark this design ready.');
  const requestId = id(request.data?.designRequestId);
  const note = text(request.data?.completionNote, 500);
  return db.runTransaction(async (transaction) => {
    const s = await state(transaction, requestId);
    if (s.design.status === 'EXECUTION_READY') {
      if (note && note !== text(s.design.completionNote, 500)) {
        throw new HttpsError('failed-precondition', 'This design is already marked ready. Completion details cannot be changed here.');
      }
      return { ok: true, idempotent: true };
    }
    if (s.design.status !== 'ENGINEER_REVIEW') throw new HttpsError('failed-precondition', 'Only a design in engineer review can be marked ready for handover.');
    if (s.payment?.paymentVerified !== true || s.design.paymentVerified !== true) {
      throw new HttpsError('failed-precondition', 'Verified deposit evidence is required. Marking ready does not approve a payment.');
    }
    try { assertChoiceLockedForHandoff(s.design, s.terms.quoteHash); }
    catch (error) { throw new HttpsError('failed-precondition', (error as Error).message); }
    const choice = s.design.lockedChoice || {};
    transaction.update(s.designRef, {
      status: 'EXECUTION_READY', workflowStage: 'EXECUTION_READY', executionStatus: 'READY_FOR_HANDOVER',
      engineerHandoffStatus: 'EXECUTION_READY', adminHandoffStatus: 'EXECUTION_READY',
      completionNote: note, completedBy: user.uid, completedByRole: user.role, completedAt: now(), updatedAt: now(),
    });
    transaction.create(db.collection('audit_logs').doc(`design_execution_ready_${requestId}`), {
      action: 'DESIGN_EXECUTION_MARKED_READY', actorId: user.uid, actorRole: user.role,
      targetType: 'design_requests', targetId: requestId, optionId: choice.optionId || null,
      optionLabel: choice.optionLabel || null, completionNote: note, quoteHash: s.terms.quoteHash, createdAt: now(),
    });
    const summary = [
      `Design request ${requestId} is done and ready for handover.`,
      choice.optionLabel ? `Locked design: ${choice.optionLabel}.` : '',
      choice.style ? `Style: ${choice.style}.` : '',
      choice.finishTier ? `Finish tier: ${choice.finishTier}.` : '',
      s.design.propertyName ? `Property: ${text(s.design.propertyName, 160)}.` : '',
      note ? `Completion note: ${note}` : 'The locked design and execution brief are on the request.',
    ].filter(Boolean).join(' ');
    for (const recipient of partyRecipients(requestId, s.design)) {
      transaction.create(db.collection('notifications').doc(`design_execution_ready_${requestId}_${recipient.role}`), {
        recipientId: recipient.id, type: 'DESIGN_EXECUTION_READY', title: 'Design work is ready for handover',
        body: summary, link: recipient.link, requestId, read: false, createdAt: now(),
      });
    }
    return { ok: true, idempotent: false };
  });
});
