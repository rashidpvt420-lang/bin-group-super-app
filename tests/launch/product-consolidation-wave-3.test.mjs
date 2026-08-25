import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Owner simple home exposes one source-labelled payable equation', async () => {
  const [home, truth] = await Promise.all([
    read('src/owner/pages/OwnerSimpleDashboardPage.tsx'),
    read('src/owner/components/OwnerFinancialTruthCard.tsx'),
  ]);

  assert.match(home, /<OwnerFinancialTruthCard \/>/);
  expectAll(truth, [
    /owner-financial-truth-card/,
    /Current amount payable to you/,
    /Rent received − maintenance\/expenses − BIN management fee = amount payable/,
    /propertyPassports/,
    /MANAGEMENT_FEE_RATE = 0\.05/,
    /minimumFractionDigits: 2/,
    /Refreshed/,
    /Pending verification/,
  ], 'Owner financial truth');
});

test('Technician before-work photo evidence is durable and remains behind protected server authority', async () => {
  const [queue, beforeWork, agent, statusStrip, app] = await Promise.all([
    read('src/technician/utils/offlineEvidenceQueue.ts'),
    read('src/technician/components/TechnicianBeforeWorkEvidence.tsx'),
    read('src/technician/components/TechnicianOfflineSyncAgent.tsx'),
    read('src/technician/components/TechnicianSyncStatusStrip.tsx'),
    read('src/technician/TechnicianApp.tsx'),
  ]);

  expectAll(queue, [
    /TechnicianEvidenceKind = 'before_work'/,
    /indexedDB\.open\(DB_NAME, DB_VERSION\)/,
    /blob: Blob/,
    /MAX_ATTEMPTS = 5/,
    /submitTechnicianBeforeWorkEvidence/,
    /evidenceType: 'technician_before_work'/,
    /replayTechnicianEvidenceQueue/,
    /bin-technician-evidence-queue-updated/,
  ], 'durable before-work evidence queue');
  assert.doesNotMatch(queue, /\bupdateDoc\s*\(/, 'Queued evidence must not mutate maintenance tickets directly.');
  assert.doesNotMatch(queue, /TechnicianEvidenceKind = [^\n]*completion/, 'Completion evidence is not an implemented Wave 3 producer and must not be advertised by this queue.');

  expectAll(beforeWork, [
    /queueTechnicianEvidence/,
    /kind: 'before_work'/,
    /if \(!navigator\.onLine\)/,
    /Start Work remains locked until the upload and server verification both succeed/,
    /data-evidence-queued/,
  ], 'before-work evidence capture');

  expectAll(agent, [
    /replayTechnicianEvidenceQueue/,
    /data-queued-evidence/,
    /TECHNICIAN_EVIDENCE_QUEUE_EVENT/,
  ], 'automatic evidence replay');

  expectAll(statusStrip, [
    /data-unsent-actions/,
    /data-unsent-evidence/,
    /Mission completion is never auto-confirmed from the queue/,
  ], 'visible sync truth');

  assert.match(app, /<TechnicianSyncStatusStrip \/>/);
  assert.match(app, /<TechnicianOfflineSyncAgent \/>/);
});
