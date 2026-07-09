import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { assertCompletionReady } from './completionGuards';
import { buildSlaFields } from './slaPolicy';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const text = (value: unknown) => String(value || '').trim();
const role = (value: unknown) => text(value).toLowerCase();

function hasRole(auth: any, allowed: string[]) {
  const claims = auth?.token || {};
  const claimRole = role(claims.role || claims.userRole || claims.primaryRole);
  return claims.admin === true || claims.super_admin === true || claims.superAdmin === true || allowed.includes(claimRole);
}

function assignedTechnicianId(ticket: Record<string, any>) {
  return text(ticket.assignedTechnicianId || ticket.technicianId || ticket.assignedTechId || ticket.techId);
}

export const updateTicketLifecycleV2 = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Auth required.');

  const data = request.data || {};
  const ticketId = text(data.ticketId);
  const status = text(data.status).toUpperCase();
  const allowedStatuses = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED_PENDING_APPROVAL', 'COMPLETED'];

  if (!ticketId) throw new HttpsError('invalid-argument', 'Ticket ID required.');
  if (!allowedStatuses.includes(status)) throw new HttpsError('invalid-argument', 'Invalid status transition.');
  if (!hasRole(request.auth, ['technician', 'admin', 'super_admin', 'operations_admin'])) {
    throw new HttpsError('permission-denied', 'Technician access required.');
  }

  const ticketRef = db.collection('maintenanceTickets').doc(ticketId);
  const ticketDoc = await ticketRef.get();
  if (!ticketDoc.exists) throw new HttpsError('not-found', 'Ticket not found.');

  const ticketData = ticketDoc.data() || {};
  const isAdminActor = hasRole(request.auth, ['admin', 'super_admin', 'operations_admin']);
  const assignedId = assignedTechnicianId(ticketData);
  if (!isAdminActor && (!assignedId || assignedId !== request.auth.uid)) {
    throw new HttpsError('permission-denied', 'You are not assigned to this mission.');
  }

  const now = FieldValue.serverTimestamp();
  const updateData: Record<string, any> = {
    status,
    updatedAt: now,
    ...buildSlaFields(data.slaPriority || data.priority || ticketData.slaPriority || ticketData.priority),
  };

  if (status === 'EN_ROUTE') updateData.onTheWayAt = now;
  if (status === 'IN_PROGRESS') updateData.startedAt = now;

  if (status === 'ARRIVED') {
    updateData.arrivedAt = now;
    const location = data.arrivalLocation || {};
    if (location.lat !== undefined || location.lng !== undefined || location.latitude !== undefined || location.longitude !== undefined) {
      const lat = Number(location.lat ?? location.latitude);
      const lng = Number(location.lng ?? location.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new HttpsError('invalid-argument', 'Valid arrival GPS coordinates are required.');
      }
      const cleanLocation = {
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        accuracy: Number(location.accuracy || 0),
        heading: location.heading ?? null,
        speed: location.speed ?? null,
      };
      updateData.arrivedLocation = cleanLocation;
      updateData.technicianLocation = cleanLocation;
      updateData.technicianLocationUpdatedAt = now;
      updateData.gpsVerified = true;
      updateData.gpsVerifiedAt = now;
      updateData.onSiteVerification = 'GPS_VERIFIED';
    }
  }

  const proofType = text(data.proofType).toUpperCase();
  const proofUrl = text(data.proofUrl);
  if (proofType && proofUrl) {
    if (proofType === 'BEFORE') updateData.beforePhotoUrl = proofUrl;
    if (proofType === 'AFTER') updateData.afterPhotoUrl = proofUrl;
    if (proofType === 'SIGNATURE') updateData.signatureUrl = proofUrl;
  }

  if (status === 'COMPLETED' || status === 'COMPLETED_PENDING_APPROVAL') {
    const nextBeforePhotoUrl = proofType === 'BEFORE' && proofUrl ? proofUrl : ticketData.beforePhotoUrl;
    const nextAfterPhotoUrl = proofType === 'AFTER' && proofUrl ? proofUrl : ticketData.afterPhotoUrl;
    const nextNotes = text(data.notes || ticketData.notes || ticketData.technicianNotes);
    const readiness = assertCompletionReady({
      ticketData,
      nextBeforePhotoUrl,
      nextAfterPhotoUrl,
      nextNotes,
      partsState: data.partsDisposition || data.partsState,
      residentReviewState: data.residentReviewState || data.tenantApprovalStatus,
    });

    updateData.completedAt = now;
    updateData.notes = nextNotes;
    updateData.technicianNotes = nextNotes;
    updateData.tenantApprovalRequired = true;
    updateData.partsDisposition = readiness.partsDisposition;
    updateData.residentReviewState = readiness.residentReviewState;
  }

  await ticketRef.update(updateData);
  await db.collection('audit_logs').add({
    actorId: request.auth.uid,
    actorRole: 'technician',
    action: `LIFECYCLE_${status}`,
    targetType: 'maintenanceTickets',
    targetId: ticketId,
    metadata: { proofType, hasProofUrl: Boolean(proofUrl) },
    createdAt: now,
  });

  return { status: 'SUCCESS', ticketId };
});
