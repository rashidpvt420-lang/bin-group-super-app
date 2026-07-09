import { HttpsError } from 'firebase-functions/v2/https';

const asText = (value: unknown) => String(value || '').trim();
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export type CompletionReadinessInput = {
  ticketData: Record<string, any>;
  nextBeforePhotoUrl?: string;
  nextAfterPhotoUrl?: string;
  nextNotes?: string;
  partsState?: string;
  residentReviewState?: string;
};

export function assertCompletionReady(input: CompletionReadinessInput) {
  const ticket = input.ticketData || {};
  const beforePhotos = asArray(ticket.beforePhotos);
  const afterPhotos = asArray(ticket.afterPhotos);
  const evidencePhotos = asArray(ticket.evidencePhotos);
  const proofPhotos = asArray(ticket.proofPhotos);
  const completionPhotos = asArray(ticket.completionPhotos);

  const hasBefore = Boolean(asText(input.nextBeforePhotoUrl) || asText(ticket.beforePhotoUrl) || beforePhotos.length > 0);
  const hasAfter = Boolean(asText(input.nextAfterPhotoUrl) || asText(ticket.afterPhotoUrl) || afterPhotos.length > 0 || completionPhotos.length > 0 || proofPhotos.length > 0 || evidencePhotos.length > 0);
  const hasNotes = asText(input.nextNotes || ticket.notes || ticket.technicianNotes).length >= 10;

  const parts = asText(input.partsState || ticket.partsDisposition || ticket.partsStatus || ticket.materialsDisposition).toUpperCase();
  const review = asText(input.residentReviewState || ticket.residentReviewState || ticket.tenantApprovalStatus).toUpperCase();

  const partsReady = ['NOT_REQUIRED', 'NO_PARTS_USED', 'USED_RECORDED', 'PARTS_RECORDED', 'MATERIALS_RECORDED'].includes(parts);
  const reviewReady = ['SIGNED', 'APPROVED', 'REFUSED', 'NOT_AVAILABLE', 'WAIVED'].includes(review);

  if (!hasBefore) throw new HttpsError('failed-precondition', 'Before photo proof is required before completing this ticket.');
  if (!hasAfter) throw new HttpsError('failed-precondition', 'After photo proof is required before completing this ticket.');
  if (!hasNotes) throw new HttpsError('failed-precondition', 'Technician completion notes are required before completing this ticket.');
  if (!partsReady) throw new HttpsError('failed-precondition', 'Parts or materials state is required before completing this ticket.');
  if (!reviewReady) throw new HttpsError('failed-precondition', 'Resident review state is required before completing this ticket.');

  return { partsDisposition: parts, residentReviewState: review };
}
