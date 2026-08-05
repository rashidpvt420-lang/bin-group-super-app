import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('technician jobs remain identity-bound and do not expose an open ticket pool', async () => {
  const [jobs, rules] = await Promise.all([
    read('src/technician/pages/TechnicianJobsPage.tsx'),
    read('firestore.rules'),
  ]);

  expectAll(jobs, [
    /where\('assignedTechnicianId', '==', user\.uid\)/,
    /technician-dispatch-boundary/,
    /full mission details appear only after dispatch assigns the ticket to you/,
  ], 'assigned jobs query');
  assert.doesNotMatch(jobs, /where\(['"]status['"], ['"]in['"]/);
  assert.doesNotMatch(jobs, /OPEN JOB POOL|CLAIM MISSION|ACCEPT JOB/);

  expectAll(rules, [
    /function techOwns\(data\)/,
    /isTechnicianId\(data\.get\('assignedTechnicianId', null\)\)/,
    /match \/maintenanceTickets\/\{ticketId\}/,
    /allow read: if isNotSuspended\(\) && \(participantCanRead\(resource\.data\) \|\| canDispatchJobs\(\)\)/,
  ], 'identity-bound ticket rules');
});

test('dispatch assignment creates an idempotent technician notification with delivery receipt fields', async () => {
  const [trigger, delivery, runtime, jobs] = await Promise.all([
    read('functions/technicianDispatchNotifications.ts'),
    read('functions/notificationDelivery.ts'),
    read('functions/runtime.ts'),
    read('src/technician/pages/TechnicianJobsPage.tsx'),
  ]);

  expectAll(trigger, [
    /onDocumentCreated/,
    /onDocumentUpdated/,
    /TECHNICIAN_JOB_ASSIGNED/,
    /transaction\.create\(notificationRef/,
    /assignmentNotificationId/,
    /assignmentEventKey/,
    /recipientRole: "technician"/,
    /link: `\/technician\/job\/\$\{ticketId\}`/,
    /TECHNICIAN_ASSIGNMENT_NOTIFICATION_CREATED/,
    /collection\("fcmTokens"\)\.get\(\)/,
    /hasRegisteredPushToken/,
    /isCurrentRegisteredPushToken/,
    /CURRENT_PUSH_TOKEN_MAX_AGE_MS/,
    /pushDeliveryState: "PENDING_TRIGGER"/,
    /pushTokenCount: 0/,
    /pushDeliveryState: "NO_REGISTERED_TOKEN"/,
  ], 'assignment notification trigger');
  expectAll(delivery, [
    /pushDeliveryState: deliveryState/,
    /pushSuccessCount: successCount/,
    /pushFailureCount: failureCount/,
  ], 'push delivery receipt');
  expectAll(jobs, [
    /TECHNICIAN_JOB_ASSIGNED/,
    /technician-job-notification-receipt/,
    /data-delivery-state/,
  ], 'technician receipt UI');
  assert.match(runtime, /export \* from "\.\/technicianDispatchNotifications";/);
});

test('before-work evidence is technician-owned, Storage-verified and required before work starts', async () => {
  const [callable, lifecycle, component, runtime] = await Promise.all([
    read('functions/technicianBeforeWorkEvidence.ts'),
    read('functions/secureTechnicianOperations.ts'),
    read('src/technician/components/TechnicianBeforeWorkEvidence.tsx'),
    read('functions/runtime.ts'),
  ]);

  expectAll(callable, [
    /export const submitTechnicianBeforeWorkEvidence = onCall/,
    /enforceAppCheck: true/,
    /assignedTechnicianId\(ticket\) !== technicianId/,
    /status, 80\)\.toUpperCase\(\) !== "ARRIVED"/,
    /maintenanceTickets\/\$\{ticketId\}\/proofPhotos\//,
    /object\.exists\(\)/,
    /object\.getMetadata\(\)/,
    /technician_before_work/,
    /technicianBeforePhotos: FieldValue\.arrayUnion\(downloadUrl\)/,
    /TECHNICIAN_BEFORE_WORK_EVIDENCE_CONFIRMED/,
  ], 'secure before-work callable');
  expectAll(lifecycle, [
    /assertLifecycleEvidence/,
    /\["IN_PROGRESS", "COMPLETED", "COMPLETED_PENDING_APPROVAL"\]/,
    /hasTechnicianBeforeWorkEvidence\(ticket\)/,
    /Capture and verify a technician before-work site photo/,
  ], 'server lifecycle proof gate');
  expectAll(component, [
    /capture="environment"/,
    /technician-before-work-file/,
    /submitTechnicianBeforeWorkEvidence/,
    /evidenceType: 'technician_before_work'/,
  ], 'field capture UI');
  assert.match(runtime, /export \* from "\.\/technicianBeforeWorkEvidence";/);
});

test('offline lifecycle actions replay automatically but arrival and completion stay foreground-only', async () => {
  const [actions, agent, app, offlinePage] = await Promise.all([
    read('src/technician/utils/offlineJobActions.ts'),
    read('src/technician/components/TechnicianOfflineSyncAgent.tsx'),
    read('src/technician/TechnicianApp.tsx'),
    read('src/technician/pages/TechnicianOfflinePage.tsx'),
  ]);

  expectAll(actions, [
    /replayEligibleOfflineJobActions/,
    /parseQueuedTechnicianJobAction/,
    /\['EN_ROUTE', 'IN_PROGRESS'\]\.includes\(status\)/,
    /attempts >= 3/,
    /markOfflineQueueItemFailed/,
  ], 'offline replay engine');
  assert.doesNotMatch(actions, /\['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'\]/);
  expectAll(agent, [
    /window\.addEventListener\('online'/,
    /bin-offline-queue-updated/,
    /replayEligibleOfflineJobActions/,
    /technician-offline-sync-agent/,
  ], 'automatic sync agent');
  expectAll(offlinePage, [
    /replayOfflineJobAction/,
    /replayEligibleOfflineJobActions/,
    /Arrival requires fresh foreground GPS/,
    /Completion requires foreground evidence upload/,
  ], 'manual queue UI');
  assert.match(app, /<TechnicianOfflineSyncAgent \/>/);
});

test('Storage uploads retry transient failures and protected E2E covers field failure modes honestly', async () => {
  const [firebase, e2e] = await Promise.all([
    read('src/lib/firebase.ts'),
    read('tests/e2e/business-technician.spec.ts'),
  ]);

  expectAll(firebase, [
    /uploadBytes as firebaseUploadBytes/,
    /for \(let attempt = 1; attempt <= 3; attempt \+= 1\)/,
    /storage\/retry-limit-exceeded/,
    /message\.includes\('failed to fetch'\)/,
    /350 \* \(2 \*\* \(attempt - 1\)\)/,
  ], 'Storage retry wrapper');
  expectAll(e2e, [
    /dispatch assigns the job, records an explicit push state/,
    /data-delivery-state/,
    /pushTokenCount/,
    /CURRENT_PUSH_TOKEN_MAX_AGE_MS/,
    /hasCurrentProductionPushToken/,
    /PROTECTED_E2E_DISPATCH/,
    /technician-before-work-file/,
    /network-recovery-after-work-proof\.png/,
    /location permission denial keeps arrival fail-closed/,
    /poor GPS accuracy keeps arrival fail-closed/,
    /offline EN_ROUTE action automatically replays/,
    /context\.setOffline\(true\)/,
    /context\.setOffline\(false\)/,
  ], 'protected Technician E2E');
  assert.doesNotMatch(e2e, /page\.route\(|route\.abort\(|route\.fulfill\(|route\.continue\(/);
});
