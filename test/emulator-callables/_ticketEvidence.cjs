'use strict';
// Seeds server-confirmed, immutable technician after-work evidence exactly as the protected
// evidence flow records it (Storage object + TECHNICIAN_EVIDENCE_CONFIRMATION audit record +
// ticket identity fields). Used by closure tests (N-22).
const { admin, db } = require('./_setup.cjs');

async function seedVerifiedAfterWorkEvidence(ticketId, technicianId) {
  const bucket = admin.storage().bucket();
  const storagePath = `maintenanceTickets/${ticketId}/proofPhotos/after_${Date.now()}.jpg`;
  const bytes = Buffer.from(`after-work-${ticketId}`);
  await bucket.file(storagePath).save(bytes, { resumable: false, metadata: { contentType: 'image/jpeg' } });
  const [metadata] = await bucket.file(storagePath).getMetadata();
  const downloadUrl = `https://example.invalid/${encodeURIComponent(storagePath)}`;
  const confirmationRef = db.collection('audit_logs').doc();
  await confirmationRef.set({
    recordType: 'TECHNICIAN_EVIDENCE_CONFIRMATION',
    action: 'TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMATION',
    state: 'CONFIRMED',
    ticketId,
    technicianId,
    evidenceType: 'technician_after_work',
    bucketName: bucket.name,
    storagePath,
    objectGeneration: String(metadata.generation),
    contentHash: String(metadata.md5Hash || metadata.etag),
    contentType: 'image/jpeg',
    sizeBytes: Number(metadata.size),
    downloadUrl,
  });
  return {
    technicianAfterEvidenceState: 'CONFIRMED',
    technicianAfterConfirmationId: confirmationRef.id,
    technicianAfterPhotoUrl: downloadUrl,
    technicianAfterPhotos: [downloadUrl],
    technicianAfterStoragePath: storagePath,
    technicianAfterObjectGeneration: String(metadata.generation),
    technicianAfterContentHash: String(metadata.md5Hash || metadata.etag),
  };
}

// Seeds server-confirmed before-work evidence the way submitTechnicianBeforeWorkEvidence records it.
async function seedVerifiedBeforeWorkEvidence(ticketId, technicianId) {
  const bucket = admin.storage().bucket();
  const storagePath = `maintenanceTickets/${ticketId}/proofPhotos/before_${Date.now()}.jpg`;
  await bucket.file(storagePath).save(Buffer.from(`before-work-${ticketId}`), { resumable: false, metadata: { contentType: 'image/jpeg' } });
  const [metadata] = await bucket.file(storagePath).getMetadata();
  const downloadUrl = `https://example.invalid/${encodeURIComponent(storagePath)}`;
  const confirmationRef = db.collection('audit_logs').doc();
  await confirmationRef.set({
    recordType: 'TECHNICIAN_EVIDENCE_CONFIRMATION',
    action: 'TECHNICIAN_BEFORE_WORK_EVIDENCE_CONFIRMATION',
    state: 'CONFIRMED',
    ticketId,
    technicianId,
    evidenceType: 'technician_before_work',
    bucketName: bucket.name,
    storagePath,
    objectGeneration: String(metadata.generation),
    contentHash: String(metadata.md5Hash || metadata.etag),
    contentType: 'image/jpeg',
    sizeBytes: Number(metadata.size),
    downloadUrl,
  });
  return {
    technicianBeforeEvidenceState: 'CONFIRMED',
    technicianBeforeConfirmationId: confirmationRef.id,
    technicianBeforePhotoUrl: downloadUrl,
    technicianBeforePhotos: [downloadUrl],
    technicianBeforeStoragePath: storagePath,
    technicianBeforeObjectGeneration: String(metadata.generation),
    technicianBeforeContentHash: String(metadata.md5Hash || metadata.etag),
    technicianBeforeEvidenceAt: admin.firestore.Timestamp.now(),
  };
}

// Server-written arrival exactly as updateTicketLifecycle ARRIVED records it.
function serverArrivalFields(mode = 'GPS_VERIFIED') {
  return {
    arrivedAt: admin.firestore.Timestamp.now(),
    arrivedLocation: { lat: 25.2048, lng: 55.2708, latitude: 25.2048, longitude: 55.2708, accuracy: 12, capturedAtMs: Date.now() },
    onSiteVerification: mode,
    arrivalEvidenceMode: mode === 'GPS_VERIFIED' ? 'PLAY_INTEGRITY_INSTALLATION_BOUND' : 'BROWSER_FUNCTIONAL_ONLY',
  };
}

// Complete job proof for the evidence gate: arrival + verified before/after photos + notes.
async function seedCompleteJobEvidence(ticketId, technicianId) {
  const after = await seedVerifiedAfterWorkEvidence(ticketId, technicianId);
  return {
    ...serverArrivalFields(),
    ...(await seedVerifiedBeforeWorkEvidence(ticketId, technicianId)),
    ...after,
    technicianAfterEvidenceAt: admin.firestore.Timestamp.now(),
    technicianNotes: 'Replaced the faulty valve and tested for leaks.',
  };
}

module.exports = { seedVerifiedAfterWorkEvidence, seedVerifiedBeforeWorkEvidence, serverArrivalFields, seedCompleteJobEvidence };
