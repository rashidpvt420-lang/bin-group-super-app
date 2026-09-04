import * as admin from 'firebase-admin';
import type * as FirebaseFirestore from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { resolveActivePaymentConfiguration } from './paymentConfiguration';
import { assertDesignPaymentBinding, designPaymentTerms, DESIGN_PAYMENT_METHODS, DESIGN_PAYMENT_WORKFLOW } from './designPaymentPolicy';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const options = { cors: true, region: 'europe-west3', enforceAppCheck: true };
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

export const adminReviewDesignPayment = onCall({ ...options, memory: '512MiB' }, async (request) => {
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
    transaction.update(s.designRef, { status: 'ENGINEER_REVIEW', workflowStage: 'ENGINEER_REVIEW', adminHandoffStatus: 'ENGINEER_REVIEW', engineerHandoffStatus: 'READY_FOR_SCOPE_REVIEW', engineerHandoffBy: user.uid, engineerHandoffAt: now(), updatedAt: now() });
    transaction.create(db.collection('audit_logs').doc(`design_handoff_${requestId}`), { action: 'DESIGN_ENGINEER_HANDOFF_READY', actorId: user.uid, actorRole: user.role, targetType: 'design_requests', targetId: requestId, paymentId: s.paymentRef.id, quoteHash: s.terms.quoteHash, createdAt: now() });
    return { ok: true, idempotent: false };
  });
});
