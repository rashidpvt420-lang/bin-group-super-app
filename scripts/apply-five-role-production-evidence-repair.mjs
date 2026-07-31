#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const fail = (message) => {
  throw new Error(`[five-role-evidence-repair] ${message}`);
};

function replaceExact(source, before, after, expectedCount, label) {
  const crlf = source.includes('\r\n');
  const normalized = source.replace(/\r\n/g, '\n');
  const normalizedBefore = before.replace(/\r\n/g, '\n');
  const normalizedAfter = after.replace(/\r\n/g, '\n');
  const parts = normalized.split(normalizedBefore);
  const actualCount = parts.length - 1;
  if (actualCount !== expectedCount) {
    fail(`${label}: expected ${expectedCount} exact match(es), found ${actualCount}.`);
  }
  const patched = parts.join(normalizedAfter);
  return crlf ? patched.replace(/\n/g, '\r\n') : patched;
}

function update(path, transform) {
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) fail(`${path}: repair produced no change.`);
  writeFileSync(path, after);
  console.log(`[five-role-evidence-repair] updated ${path}`);
}

const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8').replace(/\r\n/g, '\n');
for (const name of ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET']) {
  const binding = `${name}: ${{ secrets.${name} }}`;
  const count = workflow.split(binding).length - 1;
  if (count !== 2) fail(`Merged Founder repair is incomplete for ${name}: expected 2 bindings, found ${count}.`);
}

update('scripts/prepare-protected-business-fixtures.mjs', (source) => {
  const founderBlock = [
    "const founderRole = text(founder.customClaims?.role || founder.customClaims?.primaryRole).toLowerCase();",
    "if (!['ceo', 'super_admin', 'admin'].includes(founderRole)) fail(`Founder account role is not privileged: ${founderRole || 'missing'}.`);",
  ].join('\n');
  const founderAndTechnicianBlock = [
    founderBlock,
    '',
    "const technicianEmail = text(process.env.E2E_TECHNICIAN_EMAIL).toLowerCase();",
    "if (!technicianEmail) fail('E2E_TECHNICIAN_EMAIL is required for protected Tenant and Technician lifecycle evidence.');",
    'const technician = await admin.auth().getUserByEmail(technicianEmail);',
    "if (technician.disabled || technician.emailVerified !== true) fail('The Technician evidence account must be enabled and email verified.');",
    "const technicianRole = text(technician.customClaims?.role || technician.customClaims?.primaryRole).toLowerCase();",
    "if (technicianRole !== 'technician') fail(`Technician account role is invalid: ${technicianRole || 'missing'}.`);",
  ].join('\n');
  source = replaceExact(source, founderBlock, founderAndTechnicianBlock, 1, 'Technician authority resolution');

  const timestampMarker = 'const serverNow = admin.firestore.FieldValue.serverTimestamp();';
  const readinessBlock = [
    timestampMarker,
    '',
    "const technicianShiftId = `protected-five-role-${text(process.env.GITHUB_RUN_ID) || 'unknown'}-${technician.uid.slice(0, 20)}`;",
    'const credentialExpiry = admin.firestore.Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000));',
    'const technicianReadiness = {',
    "  role: 'technician',",
    "  userRole: 'technician',",
    "  primaryRole: 'technician',",
    "  status: 'active',",
    "  approvalStatus: 'approved',",
    '  suspended: false,',
    '  onDuty: true,',
    "  dutyStatus: 'on_duty',",
    '  isAvailable: true,',
    '  available: true,',
    '  currentShiftId: technicianShiftId,',
    "  shiftStatus: 'active',",
    '  deviceRegistered: true,',
    '  deviceVerified: true,',
    "  registeredDeviceId: 'protected-five-role-browser',",
    "  medicalCardStatus: 'valid',",
    '  medicalCardExpiry: credentialExpiry,',
    "  drivingLicenseStatus: 'valid',",
    '  drivingLicenseExpiry: credentialExpiry,',
    "  certificationsStatus: 'valid',",
    "  certifications: [{ name: 'Protected E2E Trade', status: 'valid', expiryAt: credentialExpiry }],",
    '  lastGpsAt: verifiedAt,',
    '  gpsMaxAgeMs: 60 * 60 * 1000,',
    '  activeJobCount: 0,',
    '  maxConcurrentJobs: 10,',
    '  protectedFiveRoleEvidenceReady: true,',
    '  protectedFiveRoleEvidenceRunId: text(process.env.GITHUB_RUN_ID),',
    '  updatedAt: serverNow,',
    '};',
    'await Promise.all([',
    "  db.collection('users').doc(technician.uid).set(technicianReadiness, { merge: true }),",
    "  db.collection('technicians').doc(technician.uid).set(technicianReadiness, { merge: true }),",
    ']);',
    'const [technicianUserSnap, technicianProfileSnap] = await Promise.all([',
    "  db.collection('users').doc(technician.uid).get(),",
    "  db.collection('technicians').doc(technician.uid).get(),",
    ']);',
    'for (const [label, record] of [',
    "  ['users', technicianUserSnap.data() || {}],",
    "  ['technicians', technicianProfileSnap.data() || {}],",
    ']) {',
    '  if (',
    "    text(record.status).toLowerCase() !== 'active' ||",
    "    text(record.approvalStatus).toLowerCase() !== 'approved' ||",
    '    record.suspended === true ||',
    '    record.onDuty !== true ||',
    '    record.isAvailable !== true ||',
    '    record.deviceRegistered !== true ||',
    '    record.deviceVerified !== true ||',
    "    text(record.medicalCardStatus).toLowerCase() !== 'valid' ||",
    "    text(record.drivingLicenseStatus).toLowerCase() !== 'valid' ||",
    "    text(record.certificationsStatus).toLowerCase() !== 'valid' ||",
    '    !Array.isArray(record.certifications) || record.certifications.length !== 1 ||',
    '    !text(record.currentShiftId) ||',
    '    !record.lastGpsAt ||',
    '    Number(record.activeJobCount) >= Number(record.maxConcurrentJobs)',
    '  ) {',
    '    fail(`Protected Technician readiness did not persist in ${label}/${technician.uid}.`);',
    '  }',
    '}',
  ].join('\n');
  return replaceExact(source, timestampMarker, readinessBlock, 1, 'Protected Technician readiness fixture');
});

update('tests/e2e/business-tenant.spec.ts', (source) => {
  const before = [
    '    await clickRequired(page, [',
    '      \'button:has-text("On The Way")\',',
    '      \'button:has-text("Start Trip")\',',
    '      \'button:has-text("En Route")\',',
    "    ], 'Start trip action');",
    "    await expect(page.locator('.MuiChip-label').filter({ hasText: /^EN ROUTE$/i }).first()).toBeVisible({ timeout: 40_000 });",
  ].join('\n');
  const after = [
    '    await clickRequired(page, [',
    '      \'button:has-text("On The Way")\',',
    '      \'button:has-text("Start Trip")\',',
    '      \'button:has-text("En Route")\',',
    "    ], 'Start trip action');",
    '    await expect.poll(async () => {',
    "      const lifecycleSnap = await db.collection('maintenanceTickets').doc(ticketId).get();",
    "      return String(lifecycleSnap.data()?.status || '').toUpperCase();",
    "    }, { timeout: 40_000, message: 'Technician Start Trip must persist EN_ROUTE in production Firestore.' }).toBe('EN_ROUTE');",
    "    await expect(page.locator('body')).toContainText(/EN ROUTE|Status updated/i, { timeout: 20_000 });",
  ].join('\n');
  return replaceExact(source, before, after, 1, 'Tenant EN_ROUTE evidence');
});

update('tests/e2e/business-technician.spec.ts', (source) => {
  const ageMarker = 'const CURRENT_PUSH_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;';
  const runKeyBlock = [
    ageMarker,
    "const EVIDENCE_RUN_KEY = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`",
    "  .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40);",
  ].join('\n');
  source = replaceExact(source, ageMarker, runKeyBlock, 1, 'Run-specific Technician fixture key');

  const idsBefore = [
    '    dispatchTicketId = `e2e-tech-dispatch-${suffix}`;',
    '    gpsDeniedTicketId = `e2e-tech-gps-denied-${suffix}`;',
    '    gpsPoorTicketId = `e2e-tech-gps-poor-${suffix}`;',
    '    offlineTicketId = `e2e-tech-offline-${suffix}`;',
  ].join('\n');
  const idsAfter = [
    '    dispatchTicketId = `e2e-tech-dispatch-${EVIDENCE_RUN_KEY}-${suffix}`;',
    '    gpsDeniedTicketId = `e2e-tech-gps-denied-${EVIDENCE_RUN_KEY}-${suffix}`;',
    '    gpsPoorTicketId = `e2e-tech-gps-poor-${EVIDENCE_RUN_KEY}-${suffix}`;',
    '    offlineTicketId = `e2e-tech-offline-${EVIDENCE_RUN_KEY}-${suffix}`;',
  ].join('\n');
  source = replaceExact(source, idsBefore, idsAfter, 1, 'Run-specific Technician ticket IDs');

  const acceptBefore = [
    "    const acceptMission = page.getByRole('button', { name: /Accept Mission/i }).first();",
    '    await expect(acceptMission).toBeEnabled({ timeout: 15_000 });',
    '    await acceptMission.click();',
    "    await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 30_000 }).toBe('ACCEPTED');",
  ].join('\n');
  const acceptAfter = [
    '    const statusBeforeAccept = await firestoreStatus(dispatchTicketId);',
    "    if (['ASSIGNED', 'AUTO_ASSIGNED'].includes(statusBeforeAccept)) {",
    "      const acceptMission = page.getByRole('button', { name: /Accept Mission/i }).first();",
    '      await expect(acceptMission).toBeEnabled({ timeout: 15_000 });',
    '      await acceptMission.click();',
    "      await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 30_000 }).toBe('ACCEPTED');",
    "    } else if (statusBeforeAccept === 'ACCEPTED') {",
    "      const acceptedSnap = await db.collection('maintenanceTickets').doc(dispatchTicketId).get();",
    '      const accepted = acceptedSnap.data() || {};',
    "      expect(String(accepted.assignedTechnicianId || accepted.technicianId || '')).toBe(technicianUid);",
    "      expect(accepted.acceptedAt, 'An already-accepted mission must retain server acceptance evidence.').toBeTruthy();",
    '    } else {',
    "      throw new Error(`Protected dispatch ticket entered unexpected status before acceptance: ${statusBeforeAccept || 'missing'}.`);",
    '    }',
  ].join('\n');
  return replaceExact(source, acceptBefore, acceptAfter, 1, 'Status-aware Technician acceptance');
});

update('src/technician/pages/TechnicianJobDetailPage.tsx', (source) => {
  const queueMarker = "    const queueAction = (nextStatus: Step | 'ACCEPTED', reason: string) => {";
  source = replaceExact(source, queueMarker, [
    '    const isRetryableNetworkError = (error: any) => {',
    "        const code = String(error?.code || '').toLowerCase();",
    "        const detail = `${code} ${String(error?.message || '')}`;",
    "        return !navigator.onLine || /network-request-failed|unavailable|deadline-exceeded|timeout|failed to fetch|network error/i.test(detail);",
    '    };',
    '',
    queueMarker,
  ].join('\n'), 1, 'Technician network error classifier');

  source = replaceExact(source, [
    '        } catch (err: any) {',
    "            queueAction('ACCEPTED', err?.message || 'Accept mission failed before confirmation.');",
    '        } finally {',
  ].join('\n'), [
    '        } catch (err: any) {',
    '            if (isRetryableNetworkError(err)) {',
    "                queueAction('ACCEPTED', err?.message || 'Accept mission failed because the network was unavailable.');",
    '            } else {',
    "                setGpsError(err?.message || 'Mission acceptance was rejected by production controls.');",
    '                setMessage(null);',
    '            }',
    '        } finally {',
  ].join('\n'), 1, 'Visible online acceptance failure');

  return replaceExact(source, [
    "            if (nextStatus === 'ARRIVED') {",
    "                setGpsError(err?.message || 'GPS arrival verification failed. Arrival was not recorded.');",
    '                setMessage(null);',
    '            } else {',
    "                queueAction(nextStatus, err?.message || 'Mission lifecycle update failed before confirmation.');",
    '            }',
  ].join('\n'), [
    "            if (nextStatus === 'ARRIVED') {",
    "                setGpsError(err?.message || 'GPS arrival verification failed. Arrival was not recorded.');",
    '                setMessage(null);',
    '            } else if (isRetryableNetworkError(err)) {',
    "                queueAction(nextStatus, err?.message || 'Mission lifecycle update failed because the network was unavailable.');",
    '            } else {',
    "                setGpsError(err?.message || `Production rejected the ${nextStatus.replace(/_/g, ' ')} transition.`);",
    '                setMessage(null);',
    '            }',
  ].join('\n'), 1, 'Visible online lifecycle failure');
});

const regressionPath = 'tests/launch/five-role-production-evidence-repair.test.mjs';
writeFileSync(regressionPath, `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const fixture = readFileSync('scripts/prepare-protected-business-fixtures.mjs', 'utf8');
const tenant = readFileSync('tests/e2e/business-tenant.spec.ts', 'utf8');
const technician = readFileSync('tests/e2e/business-technician.spec.ts', 'utf8');
const jobDetail = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');

test('merged Founder MFA workflow wiring remains present in both production jobs', () => {
  for (const name of ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET']) {
    assert.equal((workflow.match(new RegExp(name + ': \\\\$\\{\\{ secrets\\.' + name + ' \\}\\}', 'g')) || []).length, 2, name);
  }
});

test('protected fixture makes the Technician callable-ready before Tenant handoff', () => {
  for (const field of ['currentShiftId', 'deviceRegistered', 'medicalCardStatus', 'drivingLicenseStatus', 'certificationsStatus', 'certifications', 'lastGpsAt', 'maxConcurrentJobs']) {
    assert.ok(fixture.includes(field), field);
  }
  assert.ok(fixture.includes('protectedFiveRoleEvidenceReady: true'));
});

test('Tenant and Technician evidence prove persisted lifecycle state without stale ticket assumptions', () => {
  assert.ok(tenant.includes('Technician Start Trip must persist EN_ROUTE in production Firestore.'));
  assert.ok(technician.includes('EVIDENCE_RUN_KEY'));
  assert.ok(technician.includes('statusBeforeAccept'));
  assert.ok(technician.includes('accepted.acceptedAt'));
});

test('online callable rejections are visible and are not disguised as offline queue success', () => {
  assert.ok(jobDetail.includes('isRetryableNetworkError'));
  assert.ok(jobDetail.includes('Mission acceptance was rejected by production controls.'));
  assert.ok(jobDetail.includes('Production rejected the'));
});
`);
console.log(`[five-role-evidence-repair] created ${regressionPath}`);

for (const temporaryPath of [
  '.github/workflows/owner-five-role-evidence-repair-command.yml',
  'scripts/apply-five-role-production-evidence-repair.mjs',
]) {
  unlinkSync(temporaryPath);
  console.log(`[five-role-evidence-repair] removed temporary bootstrap ${temporaryPath}`);
}

console.log('[five-role-evidence-repair] PASS');
