import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Technician after-work evidence is verified by protected backend authority before completion', async () => {
  const [backend, secureOps, runtime] = await Promise.all([
    read('functions/technicianAfterWorkEvidence.ts'),
    read('functions/secureTechnicianOperations.ts'),
    read('functions/runtime.ts'),
  ]);

  expectAll(backend, [
    /submitTechnicianAfterWorkEvidence = onCall/,
    /enforceAppCheck: true/,
    /status, 80\)\.toUpperCase\(\) !== "IN_PROGRESS"/,
    /maintenanceTickets\/\$\{ticketId\}\/proofPhotos\//,
    /evidenceType, 80\) !== "technician_after_work"/,
    /technicianEvidenceConfirmations/,
    /technicianAfterEvidenceState: "CONFIRMED"/,
    /technicianAfterPhotos: FieldValue\.arrayUnion\(downloadUrl\)/,
    /completionPhotos: FieldValue\.arrayUnion\(downloadUrl\)/,
    /TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMED/,
    /db\.runTransaction/,
  ], 'protected after-work backend');

  expectAll(secureOps, [
    /hasTechnicianAfterWorkEvidence/,
    /technicianEvidenceConfirmations/,
    /completionEvidenceConfirmationId\(ticketId, auth\.uid\)/,
    /confirmation\.state === "CONFIRMED"/,
    /confirmation\.evidenceType === "technician_after_work"/,
    /Capture and verify an after-work completion photo through the protected evidence flow/,
  ], 'completion lifecycle gate');

  assert.match(runtime, /export \* from "\.\/technicianAfterWorkEvidence";/);
});

test('Technician after-work photo survives offline sessions and replays before completion actions', async () => {
  const [queue, afterWork, agent, app] = await Promise.all([
    read('src/technician/utils/offlineEvidenceQueue.ts'),
    read('src/technician/components/TechnicianAfterWorkEvidence.tsx'),
    read('src/technician/components/TechnicianOfflineSyncAgent.tsx'),
    read('src/technician/TechnicianApp.tsx'),
  ]);

  expectAll(queue, [
    /TechnicianEvidenceKind = 'before_work' \| 'after_work'/,
    /kind === 'after_work'/,
    /submitTechnicianAfterWorkEvidence/,
    /technician_after_work/,
    /blob: Blob/,
    /indexedDB\.open\(DB_NAME, DB_VERSION\)/,
  ], 'durable after-work queue');
  assert.doesNotMatch(queue, /\bupdateDoc\s*\(/, 'Offline evidence replay must never mutate mission completion state directly.');

  expectAll(afterWork, [
    /status !== 'IN_PROGRESS'/,
    /kind: 'after_work'/,
    /submitTechnicianAfterWorkEvidence/,
    /evidenceType: 'technician_after_work'/,
    /if \(!navigator\.onLine\)/,
    /Mission completion remains locked until upload and protected server verification both succeed/,
    /if \(!awaitingProofConvergence \|\| !existingProof\) return;/,
    /data-server-confirmed/,
  ], 'after-work evidence capture');
  assert.doesNotMatch(afterWork, /\bupdateDoc\s*\(/, 'After-work UI must not attach completion evidence directly to Firestore.');

  const evidenceIndex = agent.indexOf('const evidenceResult = await replayTechnicianEvidenceQueue();');
  const actionIndex = agent.indexOf('const actionResult = await replayEligibleOfflineJobActions();');
  assert.ok(evidenceIndex >= 0 && actionIndex > evidenceIndex, 'Offline replay must confirm photo evidence before replaying lifecycle actions.');

  assert.match(app, /<TechnicianAfterWorkEvidence \/>/);
});
