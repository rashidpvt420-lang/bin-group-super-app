import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as crypto from 'crypto';

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const REGION = 'europe-west3';
const POLICY_VERSION = 'BIN-SCHEDULED-SERVICES-2026-07';
const ACCESS_KEY_DOCUMENT = 'scheduled_service_access_key';
const ACCESS_KEY_COLLECTION = 'system_secrets';
const ADMIN_ROLES = new Set([
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'operations_manager',
  'dispatcher',
  'support_admin',
]);

const clean = (value: unknown): string => String(value ?? '').trim();
const normalized = (value: unknown): string => clean(value).toLowerCase();

function timestampFrom(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return Timestamp.fromDate(value);
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    const nanoseconds = Number((value as { nanoseconds?: unknown }).nanoseconds || 0);
    if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) return new Timestamp(seconds, nanoseconds);
  }
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? Timestamp.fromDate(date) : null;
}

function tenantOwnsTicket(data: FirebaseFirestore.DocumentData, auth: any): boolean {
  if (!auth?.uid) return false;
  const uid = clean(auth.uid);
  const email = normalized(auth.token?.email);
  const idMatch = [
    data.tenantId,
    data.tenantUid,
    data.userId,
    data.createdBy,
    data.createdByUid,
    data.requesterId,
  ].some((value) => clean(value) === uid);
  const emailMatch = Boolean(email) && [
    data.tenantEmail,
    data.requesterEmail,
    data.reporterEmail,
    data.email,
  ].some((value) => normalized(value) === email);
  return idMatch || emailMatch;
}

async function assertTenantScheduledService(ticketId: string, auth: any) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  if (!ticketId) throw new HttpsError('invalid-argument', 'ticketId is required.');
  const ref = db.collection('maintenanceTickets').doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Scheduled service request was not found.');
  const data = snap.data() || {};
  if (data.requestType !== 'SCHEDULED_SERVICE') {
    throw new HttpsError('failed-precondition', 'This action is only available for scheduled services.');
  }
  if (!tenantOwnsTicket(data, auth)) {
    throw new HttpsError('permission-denied', 'This request does not belong to the signed-in tenant.');
  }
  return { ref, data };
}

async function actorRole(auth: any): Promise<string> {
  const tokenRole = normalized(auth?.token?.role || auth?.token?.userRole || auth?.token?.primaryRole);
  if (
    auth?.token?.admin === true ||
    auth?.token?.superAdmin === true ||
    auth?.token?.super_admin === true ||
    ADMIN_ROLES.has(tokenRole)
  ) {
    return tokenRole || 'admin';
  }
  if (!auth?.uid) return '';
  const profile = await db.collection('users').doc(auth.uid).get();
  const data = profile.data() || {};
  const profileRole = normalized(data.role || data.userRole || data.primaryRole);
  return ADMIN_ROLES.has(profileRole) ? profileRole : '';
}

async function assertOperations(auth: any): Promise<string> {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const role = await actorRole(auth);
  if (!role) throw new HttpsError('permission-denied', 'Operations access is required.');
  return role;
}

function cancellationWindow(data: FirebaseFirestore.DocumentData) {
  const start = timestampFrom(data.appointmentStart || data.confirmedAppointmentStart || data.requestedServiceDate);
  if (!start) return { code: 'APPOINTMENT_NOT_CONFIRMED', refundPercent: 100, hoursUntil: null as number | null };
  const hoursUntil = (start.toMillis() - Date.now()) / 3_600_000;
  if (hoursUntil >= 24) return { code: 'FULL_REFUND_WINDOW', refundPercent: 100, hoursUntil };
  if (hoursUntil >= 6) return { code: 'PARTIAL_REFUND_WINDOW', refundPercent: 50, hoursUntil };
  return { code: 'NO_REFUND_WINDOW', refundPercent: 0, hoursUntil };
}

function paidService(data: FirebaseFirestore.DocumentData): boolean {
  const paymentStatus = normalized(data.paymentStatus || data.servicePaymentStatus);
  return data.paymentVerified === true || ['paid', 'captured', 'completed', 'succeeded'].includes(paymentStatus);
}

async function writeAudit(params: {
  actorId: string;
  actorRole: string;
  action: string;
  ticketId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.collection('audit_logs').add({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    targetType: 'maintenanceTickets',
    targetId: params.ticketId,
    metadata: params.metadata || {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const tenantManageScheduledService = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const action = normalized(request.data?.action);
    const ticketId = clean(request.data?.ticketId);
    const { ref, data } = await assertTenantScheduledService(ticketId, request.auth);
    const updates: FirebaseFirestore.DocumentData = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (action === 'approve_quote') {
      if (data.quoteStatus !== 'PENDING_TENANT_APPROVAL') {
        throw new HttpsError('failed-precondition', 'No quote is awaiting approval.');
      }
      const quotedPrice = Number(data.quotedPrice);
      if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) {
        throw new HttpsError('failed-precondition', 'The quote amount is invalid.');
      }
      const expiry = timestampFrom(data.quoteExpiresAt);
      if (expiry && expiry.toMillis() < Date.now()) {
        throw new HttpsError('deadline-exceeded', 'This quote has expired.');
      }
      updates.quoteStatus = 'APPROVED';
      updates.tenantQuoteDecision = 'APPROVED';
      updates.tenantQuoteApprovedAt = FieldValue.serverTimestamp();
      updates.recurringPlanApproved = Boolean(data.recurrenceFrequency && data.recurrenceFrequency !== 'one-time');
      updates.status = data.appointmentStatus === 'CONFIRMED' ? 'SCHEDULED' : 'PENDING_SCHEDULING';
      updates.trackingStatus = data.appointmentStatus === 'CONFIRMED'
        ? 'APPOINTMENT_CONFIRMED'
        : 'WAITING_FOR_APPOINTMENT_CONFIRMATION';
    } else if (action === 'reject_quote') {
      const reason = clean(request.data?.reason);
      if (data.quoteStatus !== 'PENDING_TENANT_APPROVAL') {
        throw new HttpsError('failed-precondition', 'No quote is awaiting a decision.');
      }
      updates.quoteStatus = 'REJECTED';
      updates.tenantQuoteDecision = 'REJECTED';
      updates.quoteRejectionReason = reason || 'Tenant declined the service quote.';
      updates.tenantQuoteRejectedAt = FieldValue.serverTimestamp();
      updates.status = 'QUOTE_REJECTED';
      updates.dispatchStatus = 'ON_HOLD';
    } else if (action === 'request_reschedule') {
      const preferredDate = clean(request.data?.preferredDate);
      const preferredTimeWindow = clean(request.data?.preferredTimeWindow);
      const reason = clean(request.data?.reason);
      const parsedDate = new Date(`${preferredDate}T00:00:00+04:00`);
      if (!preferredDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.getTime() < Date.now() - 86_400_000) {
        throw new HttpsError('invalid-argument', 'Choose a valid future date.');
      }
      if (!preferredTimeWindow) throw new HttpsError('invalid-argument', 'Choose a preferred time window.');
      if (reason.length < 3) throw new HttpsError('invalid-argument', 'Provide a reschedule reason.');
      updates.rescheduleRequest = {
        preferredDate,
        preferredTimeWindow,
        reason,
        requestedAt: Timestamp.now(),
        requestedBy: request.auth?.uid,
      };
      updates.status = 'RESCHEDULE_REQUESTED';
      updates.appointmentStatus = 'RESCHEDULE_REQUESTED';
      updates.dispatchStatus = 'ON_HOLD';
      updates.trackingStatus = 'WAITING_FOR_RESCHEDULE_CONFIRMATION';
    } else if (action === 'request_cancel') {
      const reason = clean(request.data?.reason);
      if (reason.length < 3) throw new HttpsError('invalid-argument', 'Provide a cancellation reason.');
      if (['CANCELLED', 'COMPLETED', 'CLOSED'].includes(clean(data.status).toUpperCase())) {
        throw new HttpsError('failed-precondition', 'This request can no longer be cancelled.');
      }
      const window = cancellationWindow(data);
      const paid = paidService(data);
      const immediate = !paid && data.quoteStatus !== 'APPROVED';
      updates.cancellationRequestedAt = FieldValue.serverTimestamp();
      updates.cancellationRequestedBy = request.auth?.uid;
      updates.cancellationReason = reason;
      updates.cancellationPolicyVersion = data.cancellationPolicyVersion || POLICY_VERSION;
      updates.cancellationPolicyWindow = window.code;
      updates.refundPercentUnderPolicy = paid ? window.refundPercent : 0;
      updates.refundStatus = paid
        ? window.refundPercent === 100
          ? 'FULL_REFUND_REVIEW'
          : window.refundPercent === 50
            ? 'PARTIAL_REFUND_REVIEW'
            : 'NO_REFUND_UNDER_POLICY'
        : 'NOT_APPLICABLE_NO_PAYMENT';
      updates.cancellationStatus = immediate ? 'CONFIRMED' : 'PENDING_OPERATIONS_REVIEW';
      updates.status = immediate ? 'CANCELLED' : 'CANCELLATION_REQUESTED';
      updates.appointmentStatus = immediate ? 'CANCELLED' : data.appointmentStatus;
      updates.dispatchStatus = 'ON_HOLD';
      updates.trackingStatus = immediate ? 'CANCELLED_BY_TENANT' : 'WAITING_FOR_CANCELLATION_REVIEW';
    } else {
      throw new HttpsError('invalid-argument', 'Unsupported scheduled-service action.');
    }

    await ref.update(updates);
    await writeAudit({
      actorId: request.auth!.uid,
      actorRole: 'tenant',
      action: `SCHEDULED_SERVICE_${action.toUpperCase()}`,
      ticketId,
      metadata: { policyVersion: POLICY_VERSION },
    });
    return { ok: true, action, ticketId };
  },
);

async function accessKey(): Promise<Buffer> {
  const ref = db.collection(ACCESS_KEY_COLLECTION).doc(ACCESS_KEY_DOCUMENT);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const encoded = clean(snapshot.get('keyBase64'));
      const existing = Buffer.from(encoded, 'base64');
      if (existing.length !== 32) {
        throw new HttpsError('data-loss', 'The scheduled-service encryption key is invalid.');
      }
      return existing;
    }

    const generated = crypto.randomBytes(32);
    transaction.create(ref, {
      keyBase64: generated.toString('base64'),
      algorithm: 'AES-256-GCM',
      purpose: 'scheduled-service-temporary-access-codes',
      createdAt: FieldValue.serverTimestamp(),
      rotatedAt: null,
      version: 1,
    });
    return generated;
  });
}

async function encryptAccessCode(code: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', await accessKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

async function decryptAccessCode(data: FirebaseFirestore.DocumentData): Promise<string> {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    await accessKey(),
    Buffer.from(clean(data.accessCodeIv), 'base64'),
  );
  decipher.setAuthTag(Buffer.from(clean(data.accessCodeAuthTag), 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(clean(data.accessCodeCiphertext), 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export const saveScheduledServiceAccessCode = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const ticketId = clean(request.data?.ticketId);
    const code = clean(request.data?.code);
    const expiresAt = timestampFrom(request.data?.expiresAt);
    const { ref, data } = await assertTenantScheduledService(ticketId, request.auth);
    if (data.accessMethod !== 'smart-lock') {
      throw new HttpsError('failed-precondition', 'This request is not using smart-lock access.');
    }
    if (code.length < 4 || code.length > 32) {
      throw new HttpsError('invalid-argument', 'Access code must be between 4 and 32 characters.');
    }
    if (!expiresAt || expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('invalid-argument', 'Choose a future access-code expiry.');
    }
    if (expiresAt.toMillis() > Date.now() + 31 * 86_400_000) {
      throw new HttpsError('invalid-argument', 'Access-code expiry cannot be more than 31 days away.');
    }

    const encrypted = await encryptAccessCode(code);
    await ref.update({
      accessCodeCiphertext: encrypted.ciphertext,
      accessCodeIv: encrypted.iv,
      accessCodeAuthTag: encrypted.tag,
      accessCodeLast4: code.slice(-4),
      accessCodeExpiresAt: expiresAt,
      accessCodeStatus: 'ACTIVE_PENDING_SECURITY_CONFIRMATION',
      securityAccessStatus: 'PENDING_CONFIRMATION',
      accessCodeSavedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await writeAudit({
      actorId: request.auth!.uid,
      actorRole: 'tenant',
      action: 'SCHEDULED_SERVICE_ACCESS_CODE_SAVED',
      ticketId,
      metadata: { expiresAt: expiresAt.toDate().toISOString(), last4: code.slice(-4) },
    });
    return { ok: true, last4: code.slice(-4), expiresAt: expiresAt.toDate().toISOString() };
  },
);

export const adminRevealScheduledServiceAccessCode = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const role = await assertOperations(request.auth);
    const ticketId = clean(request.data?.ticketId);
    if (!ticketId) throw new HttpsError('invalid-argument', 'ticketId is required.');
    const ref = db.collection('maintenanceTickets').doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Scheduled service request was not found.');
    const data = snap.data() || {};
    if (data.requestType !== 'SCHEDULED_SERVICE') {
      throw new HttpsError('failed-precondition', 'This is not a scheduled service.');
    }
    const expiry = timestampFrom(data.accessCodeExpiresAt);
    if (!expiry || expiry.toMillis() <= Date.now()) {
      await ref.update({ accessCodeStatus: 'EXPIRED', updatedAt: FieldValue.serverTimestamp() });
      throw new HttpsError('deadline-exceeded', 'The temporary access code has expired.');
    }
    if (!data.accessCodeCiphertext || !data.accessCodeIv || !data.accessCodeAuthTag) {
      throw new HttpsError('failed-precondition', 'No encrypted access code is stored.');
    }

    const code = await decryptAccessCode(data);
    await ref.update({
      accessCodeLastRevealedAt: FieldValue.serverTimestamp(),
      accessCodeLastRevealedBy: request.auth!.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await writeAudit({
      actorId: request.auth!.uid,
      actorRole: role,
      action: 'SCHEDULED_SERVICE_ACCESS_CODE_REVEALED',
      ticketId,
      metadata: { expiresAt: expiry.toDate().toISOString(), last4: code.slice(-4) },
    });
    return { ok: true, code, last4: code.slice(-4), expiresAt: expiry.toDate().toISOString() };
  },
);

async function writeTenantNotification(
  ticketId: string,
  data: FirebaseFirestore.DocumentData,
  key: string,
  title: string,
  body: string,
): Promise<void> {
  const recipientId = clean(data.tenantId || data.tenantUid || data.requesterId);
  if (!recipientId) return;
  await db.collection('notifications').doc(`${ticketId}_${key}`).set({
    recipientId,
    userId: recipientId,
    type: 'SCHEDULED_SERVICE_REMINDER',
    title,
    body,
    link: `/tenant/ticket/${ticketId}`,
    read: false,
    priority: key.includes('2h') ? 'HIGH' : 'NORMAL',
    ticketId,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export const scheduledServiceReminderCron = onSchedule(
  { region: REGION, schedule: 'every 30 minutes', timeZone: 'Asia/Dubai' },
  async () => {
    const snapshot = await db.collection('maintenanceTickets')
      .where('appointmentStatus', '==', 'CONFIRMED')
      .limit(500)
      .get();
    const now = Date.now();

    for (const ticket of snapshot.docs) {
      const data = ticket.data();
      if (data.requestType !== 'SCHEDULED_SERVICE') continue;
      const start = timestampFrom(data.appointmentStart);
      if (!start) continue;
      const hours = (start.toMillis() - now) / 3_600_000;
      const updates: FirebaseFirestore.DocumentData = {};
      const serviceLabel = clean(data.serviceLabel || data.category || 'Scheduled service');
      const timeWindow = clean(data.confirmedTimeWindow || data.preferredTimeWindow);
      const vendor = clean(data.vendorName || data.confirmedVendorName || 'BIN GROUP service team');

      if (hours > 23 && hours <= 25 && !data.reminder24hSentAt) {
        await writeTenantNotification(
          ticket.id,
          data,
          'appointment_24h',
          `${serviceLabel} tomorrow`,
          `${vendor} is scheduled for ${timeWindow || start.toDate().toLocaleTimeString('en-AE')}. Review access and appointment details.`,
        );
        updates.reminder24hSentAt = FieldValue.serverTimestamp();
      }
      if (hours > 1 && hours <= 3 && !data.reminder2hSentAt) {
        await writeTenantNotification(
          ticket.id,
          data,
          'appointment_2h',
          `${serviceLabel} starts soon`,
          `${vendor} is expected within ${timeWindow || 'the confirmed appointment window'}. Make sure access is ready.`,
        );
        updates.reminder2hSentAt = FieldValue.serverTimestamp();
      }
      const accessExpiry = timestampFrom(data.accessCodeExpiresAt);
      if (accessExpiry && accessExpiry.toMillis() <= now && data.accessCodeStatus !== 'EXPIRED') {
        updates.accessCodeStatus = 'EXPIRED';
        updates.securityAccessStatus = data.securityAccessStatus === 'CONFIRMED'
          ? 'EXPIRED_AFTER_CONFIRMATION'
          : 'EXPIRED';
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = FieldValue.serverTimestamp();
        await ticket.ref.update(updates);
      }
    }
  },
);

export const onScheduledServiceUpdated = onDocumentUpdated(
  { region: REGION, document: 'maintenanceTickets/{ticketId}' },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const ticketId = clean(event.params.ticketId);
    if (after.requestType !== 'SCHEDULED_SERVICE') return;

    if (before.quoteStatus !== after.quoteStatus && after.quoteStatus === 'PENDING_TENANT_APPROVAL') {
      await writeTenantNotification(
        ticketId,
        after,
        `quote_${clean(after.quoteVersion || Date.now())}`,
        'Service quote ready',
        `${clean(after.serviceLabel || 'Scheduled service')} quote: AED ${Number(after.quotedPrice || 0).toFixed(2)}. Approve or reject it in the Tenant Portal.`,
      );
    }
    if (before.appointmentStatus !== after.appointmentStatus && after.appointmentStatus === 'CONFIRMED') {
      const start = timestampFrom(after.appointmentStart);
      await writeTenantNotification(
        ticketId,
        after,
        `appointment_confirmed_${start?.seconds || Date.now()}`,
        'Appointment confirmed',
        `${clean(after.serviceLabel || 'Scheduled service')} is confirmed for ${start
          ? start.toDate().toLocaleString('en-AE', { timeZone: 'Asia/Dubai' })
          : clean(after.confirmedTimeWindow)}.`,
      );
    }
    if (
      before.cancellationStatus !== after.cancellationStatus &&
      ['APPROVED', 'REJECTED', 'CONFIRMED'].includes(clean(after.cancellationStatus).toUpperCase())
    ) {
      await writeTenantNotification(
        ticketId,
        after,
        `cancellation_${clean(after.cancellationStatus)}_${Date.now()}`,
        'Cancellation update',
        `Your ${clean(after.serviceLabel || 'scheduled service')} cancellation is ${clean(after.cancellationStatus)
          .replaceAll('_', ' ')
          .toLowerCase()}. Refund status: ${clean(after.refundStatus || 'not applicable')
          .replaceAll('_', ' ')
          .toLowerCase()}.`,
      );
    }
  },
);

function addRecurrence(date: Date, frequency: string): Date {
  const next = new Date(date.getTime());
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === 'biweekly') next.setUTCDate(next.getUTCDate() + 14);
  else if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export const createNextRecurringScheduledService = onDocumentUpdated(
  { region: REGION, document: 'maintenanceTickets/{ticketId}' },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const completedBefore = ['COMPLETED', 'CLOSED'].includes(clean(before.status).toUpperCase());
    const completedAfter = ['COMPLETED', 'CLOSED'].includes(clean(after.status).toUpperCase());
    if (completedBefore || !completedAfter || after.requestType !== 'SCHEDULED_SERVICE') return;

    const frequency = normalized(after.recurrenceFrequency || 'one-time');
    if (!['weekly', 'biweekly', 'monthly'].includes(frequency)) return;
    if (after.recurringPlanApproved !== true) return;
    const total = Math.max(1, Math.min(52, Number(after.recurrenceOccurrences || 1)));
    const sequence = Math.max(1, Number(after.recurrenceSequence || 1));
    if (sequence >= total || after.nextRecurringTicketId) return;

    const base = timestampFrom(after.appointmentStart || after.requestedServiceDate || after.preferredServiceDate);
    if (!base) return;
    const nextDate = addRecurrence(base.toDate(), frequency);
    const nextRef = db.collection('maintenanceTickets').doc();
    const seriesId = clean(after.recurringSeriesId || event.params.ticketId);
    const copyFields = [
      'requesterRole', 'tenantId', 'tenantUid', 'tenantName', 'tenantPhone', 'tenantEmail',
      'requesterId', 'requesterEmail', 'reporterEmail', 'createdBy', 'createdByUid',
      'propertyId', 'propertyName', 'ownerId', 'ownerUid', 'unitId', 'unitNumber', 'floor',
      'requestType', 'serviceCode', 'serviceLabel', 'category', 'specificLocation',
      'serviceLocationDetail', 'occupancyStatus', 'tenantAway', 'vacationService', 'accessMethod',
      'accessAuthorized', 'contactDuringService', 'pestTarget', 'sensitiveOccupants',
      'specialInstructions', 'priority', 'slaPriority', 'slaStartsAt', 'photoEvidenceRequired',
      'source', 'currency', 'quotedPrice', 'recurrenceFrequency', 'recurrenceOccurrences',
      'cancellationPolicyVersion', 'cancellationPolicyAccepted', 'policyAcknowledgement',
    ];
    const payload: FirebaseFirestore.DocumentData = {};
    for (const field of copyFields) {
      if (after[field] !== undefined) payload[field] = after[field];
    }
    Object.assign(payload, {
      description: `${clean(after.serviceLabel || after.category)} recurring visit ${sequence + 1} of ${total}`,
      operationsSummary: `${clean(after.operationsSummary)} | Recurring visit ${sequence + 1} of ${total}`,
      requestedServiceDate: nextDate.toISOString().slice(0, 10),
      preferredServiceDate: nextDate.toISOString().slice(0, 10),
      preferredTimeWindow: clean(after.confirmedTimeWindow || after.preferredTimeWindow),
      appointmentStatus: 'PENDING_CONFIRMATION',
      status: 'PENDING_SCHEDULING',
      dispatchStatus: 'PENDING_SCHEDULING',
      trackingStatus: 'WAITING_FOR_APPOINTMENT_CONFIRMATION',
      quoteStatus: after.quotedPrice ? 'APPROVED_RECURRING_PLAN' : 'PENDING_OPERATIONS_QUOTE',
      recurringPlanApproved: true,
      recurringSeriesId: seriesId,
      recurrenceSequence: sequence + 1,
      previousRecurringTicketId: event.params.ticketId,
      accessCodeStatus: after.accessMethod === 'smart-lock' ? 'REQUIRED_FOR_NEXT_OCCURRENCE' : 'NOT_REQUIRED',
      securityAccessStatus: after.accessMethod === 'smart-lock' ? 'PENDING_NEW_CODE' : 'PENDING_CONFIRMATION',
      evidenceStatus: 'NOT_REQUIRED_AT_INTAKE',
      technicianId: null,
      assignedTechnicianId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await nextRef.set(payload);
    await event.data!.after.ref.update({
      nextRecurringTicketId: nextRef.id,
      recurringSeriesId: seriesId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);
