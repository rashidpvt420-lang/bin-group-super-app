// Regression: Owner ticket detail (/owner/ticket/:id) must show the evidence the
// technician actually recorded (before/after photos, notes, materials), read from
// every field the technician flow and evidence callables write, de-duplicated,
// rendered outside the owner-review gate, with an honest empty state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OWNER_AFTER_EVIDENCE_FIELDS,
  OWNER_BEFORE_EVIDENCE_FIELDS,
  resolveOwnerTicketEvidence,
  storageObjectPathFromUrl,
} from '../../src/owner/utils/ownerTicketEvidence.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ownerDetail = read('../../src/owner/pages/OwnerTicketDetailPage.tsx');
const evidencePanel = read('../../src/owner/components/OwnerTicketEvidencePanel.tsx');
const beforeWriter = read('../../functions/technicianBeforeWorkEvidence.ts');
const afterWriter = read('../../functions/technicianAfterWorkEvidence.ts');
const technicianJob = read('../../src/technician/pages/TechnicianJobDetailPage.tsx');
const storageRules = read('../../storage.rules');

const BUCKET = 'https://firebasestorage.googleapis.com/v0/b/example-bucket.firebasestorage.app/o/';
const storageUrl = (path, token) => `${BUCKET}${encodeURIComponent(path)}?alt=media&token=${token}`;
const BEFORE_PATH = 'maintenanceTickets/T1/proofPhotos/before_work_1_JPEG.jpg';
const AFTER_PATH = 'maintenanceTickets/T1/proofPhotos/after_work_2_JPEG.jpg';
const BEFORE_URL = storageUrl(BEFORE_PATH, 'tok-before');
const AFTER_URL = storageUrl(AFTER_PATH, 'tok-after');

// Field shape of a completed ticket as written by the technician flow:
// confirmTechnicianBeforeWorkEvidence + confirmTechnicianAfterWorkEvidence +
// TechnicianJobDetailPage completion write.
const completedTicket = {
  status: 'COMPLETED_PENDING_APPROVAL',
  assignedTechnicianId: 'tech-1',
  photos: [],
  technicianBeforePhotos: [BEFORE_URL],
  technicianBeforePhotoUrl: BEFORE_URL,
  technicianBeforeStoragePath: BEFORE_PATH,
  technicianBeforeEvidenceState: 'CONFIRMED',
  beforePhotos: [BEFORE_URL],
  beforePhotoUrl: BEFORE_URL,
  technicianAfterPhotos: [AFTER_URL],
  technicianAfterPhotoUrl: AFTER_URL,
  technicianAfterStoragePath: AFTER_PATH,
  technicianAfterEvidenceState: 'CONFIRMED',
  afterPhotos: [AFTER_URL],
  afterPhotoUrl: AFTER_URL,
  completionPhotos: [AFTER_URL],
  proofPhotos: [AFTER_URL],
  evidencePhotos: [AFTER_URL],
  technicianNotes: 'It was not working we fixed it',
  notes: 'It was not working we fixed it',
  materialsUsed: ['Gas was used'],
  partsDisposition: 'Gas was used',
};

test('completed ticket shows exactly the recorded before and after photo once each, plus notes and materials', () => {
  const evidence = resolveOwnerTicketEvidence(completedTicket);
  assert.deepEqual(evidence.before.map((item) => item.url), [BEFORE_URL]);
  assert.deepEqual(evidence.after.map((item) => item.url), [AFTER_URL]);
  assert.equal(evidence.before[0].storagePath, BEFORE_PATH);
  assert.equal(evidence.after[0].storagePath, AFTER_PATH);
  assert.equal(evidence.notes, 'It was not working we fixed it');
  assert.deepEqual(evidence.materials, ['Gas was used']);
  assert.equal(evidence.beforeEvidenceConfirmed, true);
  assert.equal(evidence.afterEvidenceConfirmed, true);
  assert.equal(evidence.hasAnyEvidence, true);
});

test('technician-only evidence fields (no mirrored arrays) still reach the Owner', () => {
  const evidence = resolveOwnerTicketEvidence({
    technicianBeforePhotoUrl: BEFORE_URL,
    technicianAfterPhotos: [AFTER_URL],
    technicianAfterEvidenceState: 'CONFIRMED',
  });
  assert.deepEqual(evidence.before.map((item) => item.url), [BEFORE_URL]);
  assert.deepEqual(evidence.after.map((item) => item.url), [AFTER_URL]);
});

test('a confirmed Storage path without a download URL is surfaced for SDK resolution, not dropped', () => {
  const evidence = resolveOwnerTicketEvidence({ technicianAfterStoragePath: AFTER_PATH });
  assert.equal(evidence.after.length, 1);
  assert.equal(evidence.after[0].url, null);
  assert.equal(evidence.after[0].storagePath, AFTER_PATH);
});

test('the same object with different download tokens is de-duplicated by Storage path', () => {
  const evidence = resolveOwnerTicketEvidence({
    afterPhotos: [storageUrl(AFTER_PATH, 'a'), storageUrl(AFTER_PATH, 'b')],
    technicianAfterStoragePath: AFTER_PATH,
  });
  assert.equal(evidence.after.length, 1);
  assert.equal(storageObjectPathFromUrl(storageUrl(AFTER_PATH, 'z')), AFTER_PATH);
});

test('object-shaped entries are read; unsafe URLs and traversal paths are ignored', () => {
  const evidence = resolveOwnerTicketEvidence({
    completionPhotos: [{ downloadURL: AFTER_URL }, 'javascript:alert(1)', { storagePath: '../secrets/x.jpg' }],
    beforePhotos: ['maintenanceTickets/T1/../../x.jpg', { url: BEFORE_URL }],
  });
  assert.deepEqual(evidence.after.map((item) => item.url), [AFTER_URL]);
  assert.deepEqual(evidence.before.map((item) => item.url), [BEFORE_URL]);
});

test('no evidence yields an honest empty result and nothing is fabricated', () => {
  const evidence = resolveOwnerTicketEvidence({ status: 'OPEN', photos: [], notes: 'Owner complaint text' });
  assert.deepEqual(evidence.before, []);
  assert.deepEqual(evidence.after, []);
  assert.equal(evidence.notes, '', 'generic requester notes must not be attributed to the technician');
  assert.deepEqual(evidence.materials, []);
  assert.equal(evidence.hasAnyEvidence, false);
  assert.deepEqual(resolveOwnerTicketEvidence({ partsDisposition: 'No parts entered' }).materials, []);
  assert.equal(resolveOwnerTicketEvidence(null).hasAnyEvidence, false);
});

test('resolver covers every field the technician evidence writers produce', () => {
  for (const field of ['technicianBeforePhotos', 'technicianBeforePhotoUrl', 'beforePhotos', 'beforePhotoUrl']) {
    assert.match(beforeWriter, new RegExp(`${field}:`), `before writer no longer writes ${field}`);
    assert.ok(OWNER_BEFORE_EVIDENCE_FIELDS.includes(field), `Owner reader misses ${field}`);
  }
  for (const field of ['technicianAfterPhotos', 'technicianAfterPhotoUrl', 'completionPhotos', 'evidencePhotos']) {
    assert.match(afterWriter, new RegExp(`${field}:`), `after writer no longer writes ${field}`);
    assert.ok(OWNER_AFTER_EVIDENCE_FIELDS.includes(field), `Owner reader misses ${field}`);
  }
  assert.match(technicianJob, /technicianNotes:/);
  assert.match(technicianJob, /materialsUsed:/);
});

test('Owner detail renders the evidence panel outside the owner-review gate', () => {
  assert.match(ownerDetail, /resolveOwnerTicketEvidence\(ticket\)/);
  assert.match(ownerDetail, /from '\.\.\/utils\/ownerTicketEvidence\.mjs'/);
  const panel = ownerDetail.indexOf('<OwnerTicketEvidencePanel evidence={evidence} />');
  const reviewGate = ownerDetail.indexOf('{(canReviewCompleted || canEscalateOpen || ticket.ownerReviewAction) && (');
  assert.ok(panel > 0, 'evidence panel must render');
  assert.ok(reviewGate > panel, 'evidence panel must not be nested inside the owner-review gate');
  assert.doesNotMatch(ownerDetail, /beforeProofs|afterProofs/);
});

test('evidence panel shows honest empty and load-failure states and uses Storage SDK under existing rules', () => {
  assert.match(evidencePanel, /No technician evidence has been recorded for this ticket yet\./);
  assert.match(evidencePanel, /No before photo was recorded\./);
  assert.match(evidencePanel, /No after-work photo was recorded\./);
  assert.match(evidencePanel, /No technician notes were recorded\./);
  assert.match(evidencePanel, /Photo recorded — access denied/);
  assert.match(evidencePanel, /onError=\{\(\) => setState\(\{ status: 'failed', url: null \}\)\}/);
  assert.match(evidencePanel, /getDownloadURL\(ref\(storage, item\.storagePath\)\)/);
});

test('Storage evidence rules are unchanged: proofPhotos stay create-only for technicians and readable only by ticket parties', () => {
  assert.match(
    storageRules,
    /match \/maintenanceTickets\/\{ticketId\}\/proofPhotos\/\{fileName\} \{\s*allow read: if canReadTicketEvidence\(ticketId\);\s*allow write: if resource == null && canWriteTicketEvidence\(ticketId\) && isImageUpload\(10\);/,
  );
});
