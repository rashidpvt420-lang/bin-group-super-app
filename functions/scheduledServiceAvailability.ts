import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const REGION = 'europe-west3';
const ADMIN_ROLES = new Set([
  'admin', 'super_admin', 'ceo', 'manager', 'operations_admin',
  'operations_manager', 'dispatcher', 'support_admin',
]);
const SERVICE_CODES = new Set(['deep-clean', 'pest-control', 'vacation-care', 'moving']);
const TIME_WINDOWS = new Set(['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00']);

const clean = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => clean(value).toLowerCase();

function asTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? Timestamp.fromDate(date) : null;
}

async function operationsRole(auth: any) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const token = auth.token || {};
  const tokenRole = normalized(token.role || token.userRole || token.primaryRole);
  if (token.admin === true || token.superAdmin === true || token.super_admin === true || ADMIN_ROLES.has(tokenRole)) {
    return tokenRole || 'admin';
  }
  throw new HttpsError('permission-denied', 'Operations custom claim is required.');
}

async function audit(actorId: string, actorRole: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  await db.collection('audit_logs').add({
    actorId,
    actorRole,
    action,
    targetType: 'scheduled_service',
    targetId,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const getScheduledServiceAvailability = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
    const serviceCode = normalized(request.data?.serviceCode);
    const date = clean(request.data?.date);
    const propertyId = clean(request.data?.propertyId);
    if (!SERVICE_CODES.has(serviceCode)) throw new HttpsError('invalid-argument', 'Unsupported service type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'A valid service date is required.');

    const snapshot = await db.collection('serviceAvailability').where('serviceCode', '==', serviceCode).limit(100).get();
    const slots = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() } as any))
      .filter((slot) => slot.date === date)
      .filter((slot) => normalized(slot.status || 'open') === 'open')
      .filter((slot) => !slot.propertyId || !propertyId || clean(slot.propertyId) === propertyId)
      .filter((slot) => Number(slot.bookedCount || 0) < Math.max(1, Number(slot.capacity || 1)))
      .map((slot) => ({
        id: slot.id,
        serviceCode: clean(slot.serviceCode),
        date: clean(slot.date),
        timeWindow: clean(slot.timeWindow),
        vendorId: clean(slot.vendorId),
        vendorName: clean(slot.vendorName || 'BIN GROUP approved provider'),
        capacity: Math.max(1, Number(slot.capacity || 1)),
        remaining: Math.max(0, Math.max(1, Number(slot.capacity || 1)) - Number(slot.bookedCount || 0)),
        priceFrom: Number(slot.priceFrom || 0),
        currency: clean(slot.currency || 'AED'),
        notes: clean(slot.publicNotes),
      }));

    return { slots };
  },
);

export const adminManageScheduledServiceAvailability = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const role = await operationsRole(request.auth);
    const action = normalized(request.data?.action);

    if (action === 'list') {
      const snapshot = await db.collection('serviceAvailability').orderBy('date', 'asc').limit(200).get();
      return {
        slots: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      };
    }

    const slotId = clean(request.data?.slotId);
    if (action === 'close' || action === 'open' || action === 'delete') {
      if (!slotId) throw new HttpsError('invalid-argument', 'slotId is required.');
      const ref = db.collection('serviceAvailability').doc(slotId);
      if (action === 'delete') await ref.delete();
      else await ref.update({ status: action === 'open' ? 'OPEN' : 'CLOSED', updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid });
      await audit(request.auth!.uid, role, `SERVICE_AVAILABILITY_${action.toUpperCase()}`, slotId);
      return { ok: true, slotId };
    }

    if (action !== 'upsert') throw new HttpsError('invalid-argument', 'Unsupported availability action.');
    const serviceCode = normalized(request.data?.serviceCode);
    const date = clean(request.data?.date);
    const timeWindow = clean(request.data?.timeWindow);
    const vendorName = clean(request.data?.vendorName);
    const capacity = Math.max(1, Math.min(100, Number(request.data?.capacity || 1)));
    const priceFrom = Math.max(0, Number(request.data?.priceFrom || 0));
    if (!SERVICE_CODES.has(serviceCode)) throw new HttpsError('invalid-argument', 'Unsupported service type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'A valid date is required.');
    if (!TIME_WINDOWS.has(timeWindow)) throw new HttpsError('invalid-argument', 'Choose a supported time window.');
    if (vendorName.length < 2) throw new HttpsError('invalid-argument', 'Vendor name is required.');

    const ref = slotId ? db.collection('serviceAvailability').doc(slotId) : db.collection('serviceAvailability').doc();
    const existing = await ref.get();
    await ref.set({
      serviceCode,
      date,
      timeWindow,
      vendorId: clean(request.data?.vendorId),
      vendorName,
      propertyId: clean(request.data?.propertyId) || null,
      capacity,
      bookedCount: existing.exists ? Number(existing.data()?.bookedCount || 0) : 0,
      priceFrom,
      currency: 'AED',
      publicNotes: clean(request.data?.publicNotes),
      status: 'OPEN',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth!.uid,
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: request.auth!.uid }),
    }, { merge: true });
    await audit(request.auth!.uid, role, 'SERVICE_AVAILABILITY_UPSERT', ref.id, { serviceCode, date, timeWindow, vendorName, capacity, priceFrom });
    return { ok: true, slotId: ref.id };
  },
);

export const adminUpdateScheduledService = onCall(
  { region: REGION, enforceAppCheck: true },
  async (request) => {
    const role = await operationsRole(request.auth);
    const action = normalized(request.data?.action);
    const ticketId = clean(request.data?.ticketId);
    if (!ticketId) throw new HttpsError('invalid-argument', 'ticketId is required.');
    const ref = db.collection('maintenanceTickets').doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Scheduled service request was not found.');
    const data = snap.data() || {};
    if (data.requestType !== 'SCHEDULED_SERVICE') throw new HttpsError('failed-precondition', 'This is not a scheduled service.');

    if (action === 'publish_quote') {
      const quotedPrice = Number(request.data?.quotedPrice);
      const quoteExpiresAt = asTimestamp(request.data?.quoteExpiresAt);
      if (!Number.isFinite(quotedPrice) || quotedPrice <= 0) throw new HttpsError('invalid-argument', 'Enter a valid quote amount.');
      if (!quoteExpiresAt || quoteExpiresAt.toMillis() <= Date.now()) throw new HttpsError('invalid-argument', 'Choose a future quote expiry.');
      await ref.update({
        quotedPrice,
        currency: 'AED',
        quoteStatus: 'PENDING_TENANT_APPROVAL',
        quoteVersion: Number(data.quoteVersion || 0) + 1,
        quoteExpiresAt,
        quotePublishedAt: FieldValue.serverTimestamp(),
        quotePublishedBy: request.auth!.uid,
        pricingRequired: true,
        status: 'AWAITING_TENANT_QUOTE_APPROVAL',
        dispatchStatus: 'ON_HOLD_FOR_QUOTE',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === 'confirm_appointment') {
      const appointmentStart = asTimestamp(request.data?.appointmentStart);
      const appointmentEnd = asTimestamp(request.data?.appointmentEnd);
      const vendorName = clean(request.data?.vendorName || data.vendorName);
      const confirmedTimeWindow = clean(request.data?.confirmedTimeWindow || data.preferredTimeWindow);
      if (!appointmentStart || appointmentStart.toMillis() <= Date.now()) throw new HttpsError('invalid-argument', 'Choose a future appointment start.');
      if (!appointmentEnd || appointmentEnd.toMillis() <= appointmentStart.toMillis()) throw new HttpsError('invalid-argument', 'Appointment end must be after the start.');
      if (vendorName.length < 2) throw new HttpsError('invalid-argument', 'Vendor or service team is required.');
      const slotId = clean(request.data?.slotId || data.availabilitySlotId);
      if (slotId) {
        await db.runTransaction(async (transaction) => {
          const slotRef = db.collection('serviceAvailability').doc(slotId);
          const slotSnap = await transaction.get(slotRef);
          if (!slotSnap.exists) throw new HttpsError('not-found', 'The selected availability slot no longer exists.');
          const slot = slotSnap.data() || {};
          const capacity = Math.max(1, Number(slot.capacity || 1));
          const bookedCount = Number(slot.bookedCount || 0);
          if (normalized(slot.status) !== 'open' || bookedCount >= capacity) throw new HttpsError('resource-exhausted', 'The selected slot is no longer available.');
          transaction.update(slotRef, { bookedCount: bookedCount + 1, updatedAt: FieldValue.serverTimestamp() });
          transaction.update(ref, {
            availabilitySlotId: slotId,
            vendorId: clean(slot.vendorId),
            vendorName: clean(slot.vendorName || vendorName),
            confirmedTimeWindow: clean(slot.timeWindow || confirmedTimeWindow),
            appointmentStart,
            appointmentEnd,
            appointmentStatus: 'CONFIRMED',
            appointmentConfirmedAt: FieldValue.serverTimestamp(),
            appointmentConfirmedBy: request.auth!.uid,
            status: data.quoteStatus === 'APPROVED' || data.quoteStatus === 'APPROVED_RECURRING_PLAN' ? 'SCHEDULED' : 'AWAITING_TENANT_QUOTE_APPROVAL',
            dispatchStatus: data.quoteStatus === 'APPROVED' || data.quoteStatus === 'APPROVED_RECURRING_PLAN' ? 'READY_FOR_ASSIGNMENT' : 'ON_HOLD_FOR_QUOTE',
            trackingStatus: 'APPOINTMENT_CONFIRMED',
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      } else {
        await ref.update({
          vendorName,
          confirmedTimeWindow,
          appointmentStart,
          appointmentEnd,
          appointmentStatus: 'CONFIRMED',
          appointmentConfirmedAt: FieldValue.serverTimestamp(),
          appointmentConfirmedBy: request.auth!.uid,
          status: data.quoteStatus === 'APPROVED' || data.quoteStatus === 'APPROVED_RECURRING_PLAN' ? 'SCHEDULED' : 'AWAITING_TENANT_QUOTE_APPROVAL',
          dispatchStatus: data.quoteStatus === 'APPROVED' || data.quoteStatus === 'APPROVED_RECURRING_PLAN' ? 'READY_FOR_ASSIGNMENT' : 'ON_HOLD_FOR_QUOTE',
          trackingStatus: 'APPOINTMENT_CONFIRMED',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else if (action === 'confirm_access') {
      await ref.update({
        securityAccessStatus: 'CONFIRMED',
        securityAccessConfirmedAt: FieldValue.serverTimestamp(),
        securityAccessConfirmedBy: request.auth!.uid,
        accessCodeStatus: data.accessMethod === 'smart-lock' ? 'ACTIVE_CONFIRMED_BY_SECURITY' : data.accessCodeStatus || 'NOT_REQUIRED',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === 'approve_reschedule') {
      const requestData = data.rescheduleRequest || {};
      const date = clean(request.data?.date || requestData.preferredDate);
      const timeWindow = clean(request.data?.timeWindow || requestData.preferredTimeWindow);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TIME_WINDOWS.has(timeWindow)) throw new HttpsError('invalid-argument', 'A valid replacement date and time are required.');
      await ref.update({
        requestedServiceDate: date,
        preferredServiceDate: date,
        preferredTimeWindow: timeWindow,
        appointmentStatus: 'PENDING_CONFIRMATION',
        status: 'PENDING_SCHEDULING',
        rescheduleStatus: 'APPROVED',
        rescheduleApprovedAt: FieldValue.serverTimestamp(),
        rescheduleApprovedBy: request.auth!.uid,
        trackingStatus: 'WAITING_FOR_APPOINTMENT_CONFIRMATION',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === 'cancellation_decision') {
      const decision = normalized(request.data?.decision);
      if (!['approve', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose approve or reject.');
      const refundStatus = clean(request.data?.refundStatus || data.refundStatus || 'NOT_APPLICABLE');
      await ref.update({
        cancellationStatus: decision === 'approve' ? 'APPROVED' : 'REJECTED',
        cancellationDecisionAt: FieldValue.serverTimestamp(),
        cancellationDecisionBy: request.auth!.uid,
        cancellationDecisionNote: clean(request.data?.note),
        refundStatus,
        status: decision === 'approve' ? 'CANCELLED' : (data.appointmentStatus === 'CONFIRMED' ? 'SCHEDULED' : 'PENDING_SCHEDULING'),
        appointmentStatus: decision === 'approve' ? 'CANCELLED' : data.appointmentStatus,
        dispatchStatus: decision === 'approve' ? 'CANCELLED' : data.dispatchStatus,
        trackingStatus: decision === 'approve' ? 'CANCELLED_BY_OPERATIONS' : data.trackingStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === 'mark_payment') {
      const paid = request.data?.paid === true;
      await ref.update({
        servicePaymentStatus: paid ? 'PAID' : 'PENDING',
        paymentVerified: paid,
        paymentVerifiedAt: paid ? FieldValue.serverTimestamp() : null,
        paymentVerifiedBy: paid ? request.auth!.uid : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      throw new HttpsError('invalid-argument', 'Unsupported scheduled-service operations action.');
    }

    await audit(request.auth!.uid, role, `SCHEDULED_SERVICE_ADMIN_${action.toUpperCase()}`, ticketId, {
      serviceCode: clean(data.serviceCode),
      tenantId: clean(data.tenantId || data.tenantUid),
    });
    return { ok: true, action, ticketId };
  },
);
