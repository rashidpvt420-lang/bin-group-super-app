import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Technician after-work evidence is verified by protected backend authority before completion', async () => {
  const [backend, secureOps, runtime, firestoreRules] = await Promise.all([
    read('functions/technicianAfterWorkEvidence.ts'),
    read('functions/secureTechnicianOperations.ts'),
    read('functions/runtime.ts'),
    read('firestore.rules'),
  ]);

  expectAll(backend, [
    /submitTechnicianAfterWorkEvidence = onCall/,
    /enforceAppCheck: true/,
    /status, 80\)\.toUpperCase\(\) !== "IN_PROGRESS"/,
    /maintenanceTickets\/\$\{ticketId\}\/proofPhotos\//,
    /evidenceType, 80\) !== "technician_after_work"/,
    /parsed\.protocol !== "https:"/,
    /decodedPathname = decodeURIComponent\(parsed\.pathname\)/,
    /decodedPathname !== expectedPath/,
    /createHash\("sha256"\)/,
    /metadata\.generation/,
    /metadata\.md5Hash \|\| metadata\.etag/,
    /confirmationId\(ticketId, technicianId, storagePath, objectGeneration, contentHash\)/,
    /technicianAfterConfirmationId: confirmationRef\.id/,
    /technicianAfterStoragePath: storagePath/,
    /technicianAfterObjectGeneration: objectGeneration/,
    /technicianAfterContentHash: contentHash/,
    /recordType: "TECHNICIAN_EVIDENCE_CONFIRMATION"/,
    /action: "TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMATION"/,
    /bucketName: bucket\.name/,
    /objectGeneration,/,
    /contentHash,/,
    /technicianAfterEvidenceState: "CONFIRMED"/,
    /technicianAfterPhotos: FieldValue\.arrayUnion\(downloadUrl\)/,
    /completionPhotos: FieldValue\.arrayUnion\(downloadUrl\)/,
    /TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMED/,
    /db\.runTransaction/,
  ], 'protected after-work backend');
  assert.doesNotMatch(backend, /technicianEvidenceConfirmations/, 'Completion confirmation must not use an Admin-browser-writable catch-all collection.');

  expectAll(secureOps, [
    /hasTechnicianAfterWorkEvidence/,
    /ticket\.technicianAfterConfirmationId/,
    /db\.collection\("audit_logs"\)\.doc\(confirmationId\)\.get\(\)/,
    /confirmation\.recordType === "TECHNICIAN_EVIDENCE_CONFIRMATION"/,
    /confirmation\.action === "TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMATION"/,
    /confirmation\.state === "CONFIRMED"/,
    /confirmation\.evidenceType === "technician_after_work"/,
    /protectedIdentityMatchesTicket/,
    /bucket\.file\(confirmedStoragePath\)\.getMetadata\(\)/,
    /liveGeneration === confirmedGeneration/,
    /liveContentHash === confirmedContentHash/,
    /immutableStorageObjectMatches/,
    /After-work evidence changed after verification/,
  ], 'completion lifecycle gate');

  expectAll(firestoreRules, [
    /match \/audit_logs\/\{logId\} \{/,
    /allow create: if false;/,
    /allow update: if false;/,
    /allow delete: if false;/,
  ], 'server-only audit confirmation store');

  assert.match(runtime, /export \* from "\.\/technicianAfterWorkEvidence";/);
});

test('Technician after-work photo survives offline sessions and replays before completion actions', async () => {
  const [queue, afterWork, agent, app, offlineActions] = await Promise.all([
    read('src/technician/utils/offlineEvidenceQueue.ts'),
    read('src/technician/components/TechnicianAfterWorkEvidence.tsx'),
    read('src/technician/components/TechnicianOfflineSyncAgent.tsx'),
    read('src/technician/TechnicianApp.tsx'),
    read('src/technician/utils/offlineJobActions.ts'),
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
    /Boolean\(ticket\?\.technicianAfterConfirmationId\)/,
    /kind: 'after_work'/,
    /submitTechnicianAfterWorkEvidence/,
    /evidenceType: 'technician_after_work'/,
    /if \(!navigator\.onLine\)/,
    /Mission completion remains locked until upload and protected server verification both succeed/,
    /const \[pendingStoragePath, setPendingStoragePath\] = React\.useState\(''\)/,
    /const confirmedStoragePath = String\(ticket\?\.technicianAfterStoragePath \|\| ''\)/,
    /confirmedStoragePath === pendingStoragePath/,
    /setPendingStoragePath\(storagePath\)/,
    /setQueuedLocally\(false\)/,
    /setPendingStoragePath\(''\)/,
    /data-pending-storage-path/,
    /data-server-confirmed/,
  ], 'after-work evidence capture and queued replay convergence');
  assert.doesNotMatch(afterWork, /\bupdateDoc\s*\(/, 'After-work UI must not attach completion evidence directly to Firestore.');

  expectAll(agent, [
    /let evidenceReplayUnavailable = false/,
    /evidenceResult = await replayTechnicianEvidenceQueue\(\)/,
    /catch \{\s*evidenceReplayUnavailable = true;/s,
    /actionResult = await replayEligibleOfflineJobActions\(\)/,
    /Completion remains locked until evidence sync is restored/,
  ], 'evidence replay failure isolation');

  const evidenceIndex = agent.indexOf('evidenceResult = await replayTechnicianEvidenceQueue();');
  const actionIndex = agent.indexOf('actionResult = await replayEligibleOfflineJobActions();');
  assert.ok(evidenceIndex >= 0 && actionIndex > evidenceIndex, 'Offline replay must attempt photo evidence before replaying safe lifecycle actions.');

  expectAll(offlineActions, [
    /return \['EN_ROUTE', 'IN_PROGRESS'\]\.includes\(status\)/,
    /Completion needs foreground photo upload/,
  ], 'completion fail-closed auto replay policy');
  assert.doesNotMatch(offlineActions, /return \[[^\]]*'COMPLETED'/, 'COMPLETED must never auto-replay when evidence storage is unavailable.');

  assert.match(app, /<TechnicianAfterWorkEvidence \/>/);
});

test('Technician job close readiness trusts only protected server-confirmed after-work evidence', async () => {
  const jobDetail = await read('src/technician/pages/TechnicianJobDetailPage.tsx');

  expectAll(jobDetail, [
    /const hasProtectedAfterProof = ticket\?\.technicianAfterEvidenceState === 'CONFIRMED'/,
    /Boolean\(ticket\?\.technicianAfterPhotoUrl\)/,
    /listLength\(ticket\?\.technicianAfterPhotos\) > 0/,
    /Server-verified after-work photo/,
    /ready: hasProtectedAfterProof/,
    /Capture and verify the after-work photo in the protected evidence panel above/,
    /Completion can be queued, but it remains blocked until the protected after-work photo is uploaded and server-confirmed/,
  ], 'canonical completion readiness');

  assert.doesNotMatch(jobDetail, /uploadCompletionPhotos/, 'Legacy completion photo uploader must not coexist with protected evidence capture.');
  assert.doesNotMatch(jobDetail, /maintenanceTickets\/\$\{id\}\/completionPhotos\//, 'Job detail must not upload completion photos through the legacy path.');
  assert.doesNotMatch(jobDetail, /data-testid="technician-after-work-file"/, 'Only the protected after-work evidence component may expose the after-work file input.');
  assert.doesNotMatch(jobDetail, /\bcompletionPhotos\s*:/, 'Job detail must not directly attach completion evidence fields.');
  assert.doesNotMatch(jobDetail, /\bafterPhotos\s*:/, 'Job detail must not directly attach generic after-work evidence fields.');
  assert.doesNotMatch(jobDetail, /\bafterPhotoUrl\s*:/, 'Job detail must not directly attach a generic after-work URL.');
});
