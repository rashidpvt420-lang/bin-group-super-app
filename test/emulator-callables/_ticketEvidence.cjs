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

module.exports = { seedVerifiedAfterWorkEvidence };
