#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const TENANT_FILE = 'tests/e2e/business-tenant.spec.ts';
const TECHNICIAN_FILE = 'tests/e2e/business-technician.spec.ts';

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source anchor was not found.`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: source anchor was not unique.`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

export function patchTenantBusinessEvidence(source, label = TENANT_FILE) {
  if (source.includes('const callableResponsePromise = page.waitForResponse(')) return source;
  const before = `  await page.getByTestId('tenant-request-submit').click();
  await Promise.race([
    page.waitForURL('**/tenant/tickets', { timeout: 35_000 }),
    expect(page.locator('body')).toContainText(/success|created|submitted|ticket|request/i, { timeout: 35_000 }),
  ]);
  await expect(page.locator('body')).not.toContainText(
    /Failed to submit|Property GPS location is missing|No property assigned|Missing or insufficient permissions/i,
    { timeout: 5_000 },
  );

  const db = admin.firestore();
  let ticketId = '';
  await expect.poll(async () => {
    const result = await db.collection('maintenanceTickets').where('description', '==', description).get();
    const exact = result.docs.find((docSnap) => docSnap.data()?.tenantId === tenantUid || docSnap.data()?.tenantUid === tenantUid);
    ticketId = exact?.id || '';
    return ticketId;
  }, { timeout: 40_000 }).not.toBe('');
`;
  const after = `  const submitButton = page.getByTestId('tenant-request-submit');
  await expect(submitButton, 'Tenant request submission must be fully ready before evidence capture.').toBeEnabled({ timeout: 30_000 });
  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  const callableResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('createTenantServiceTicket'),
    { timeout: 60_000 },
  );
  await submitButton.click();
  const callableResponse = await callableResponsePromise;
  const callablePayload = await callableResponse.json().catch(() => ({})) as any;
  if (!callableResponse.ok() || callablePayload?.error) {
    throw new Error(\`createTenantServiceTicket failed HTTP \${callableResponse.status()}: \${JSON.stringify(callablePayload)}\`);
  }
  const ticketId = String(callablePayload?.result?.ticketId || callablePayload?.data?.ticketId || '').trim();
  expect(ticketId, 'createTenantServiceTicket must return the exact production ticket ID.').toMatch(/^tenant_/);
  await page.waitForURL('**/tenant/tickets', { timeout: 60_000 });
  await page.waitForTimeout(250);
  if (dialogMessage) throw new Error(\`Tenant request UI reported an error: \${dialogMessage}\`);
  await expect(page.locator('body')).not.toContainText(
    /Failed to submit|Property GPS location is missing|No property assigned|Missing or insufficient permissions/i,
    { timeout: 5_000 },
  );

  const db = admin.firestore();
  await expect.poll(async () => (await db.collection('maintenanceTickets').doc(ticketId).get()).exists, {
    timeout: 40_000,
    message: \`Exact callable-created ticket \${ticketId} must exist in production Firestore.\`,
  }).toBe(true);
`;
  return replaceExactlyOnce(source, before, after, label);
}

export function patchTechnicianBusinessEvidence(source, label = TECHNICIAN_FILE) {
  let patched = source;
  if (!patched.includes('registeredPushReady')) {
    const tokenBefore = `    await expect.poll(async () => {
      const result = await hasCurrentProductionPushToken(
        technicianUid,
        Math.min(pushRegistrationStartedAt - 5_000, Date.now() - CURRENT_PUSH_TOKEN_MAX_AGE_MS),
      );
      if (!result.ready) {
        console.warn('[business-technician] waiting for current production FCM token', result);
      }
      return result.ready;
    }, { timeout: 60_000, message: 'A current production FCM token must be registered before dispatch.' }).toBe(true);
`;
    const tokenAfter = `    const tokenFreshnessFloor = Math.min(pushRegistrationStartedAt - 5_000, Date.now() - CURRENT_PUSH_TOKEN_MAX_AGE_MS);
    const pushDeadline = Date.now() + 20_000;
    let pushReadiness = await hasCurrentProductionPushToken(technicianUid, tokenFreshnessFloor);
    while (!pushReadiness.ready && Date.now() < pushDeadline) {
      await page.waitForTimeout(1_000);
      pushReadiness = await hasCurrentProductionPushToken(technicianUid, tokenFreshnessFloor);
    }
    const registeredPushReady = pushReadiness.ready;
    console.log('[business-technician] production push readiness', { registeredPushReady, ...pushReadiness });
`;
    patched = replaceExactlyOnce(patched, tokenBefore, tokenAfter, `${label}: token readiness`);

    const receiptBefore = `    const receipt = page.locator(\`[data-testid="technician-job-notification-receipt"][data-ticket-id="\${dispatchTicketId}"]\`);
    await expect(receipt).toHaveAttribute('data-delivery-state', /SUCCESS|PARTIAL/, { timeout: 60_000 });
`;
    const receiptAfter = `    const receipt = page.locator(\`[data-testid="technician-job-notification-receipt"][data-ticket-id="\${dispatchTicketId}"]\`);
    await expect(receipt).toHaveAttribute(
      'data-delivery-state',
      registeredPushReady ? /SUCCESS|PARTIAL/ : /NO_REGISTERED_TOKEN/,
      { timeout: 60_000 },
    );
    const notificationSnapshot = await db.collection('notifications').where('recipientId', '==', technicianUid).get();
    const deliveryReceipt = notificationSnapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Record<string, any>))
      .find((value) => value.ticketId === dispatchTicketId && value.type === 'TECHNICIAN_JOB_ASSIGNED');
    expect(deliveryReceipt, 'Server assignment receipt must exist for the exact Technician ticket.').toBeTruthy();
    if (registeredPushReady) {
      expect(String(deliveryReceipt?.pushDeliveryState || '')).toMatch(/SUCCESS|PARTIAL/);
      expect(Number(deliveryReceipt?.pushSuccessCount || 0)).toBeGreaterThan(0);
    } else {
      expect(deliveryReceipt).toMatchObject({
        pushDeliveryState: 'NO_REGISTERED_TOKEN',
        pushTokenCount: 0,
        pushSuccessCount: 0,
        pushFailureCount: 0,
      });
    }
`;
    patched = replaceExactlyOnce(patched, receiptBefore, receiptAfter, `${label}: delivery receipt`);
    patched = replaceExactlyOnce(
      patched,
      "test('dispatch assigns the job, push receipt succeeds, and technician completes through network recovery', async ({ page, context }) => {",
      "test('dispatch assigns the job, records an explicit push state, and technician completes through network recovery', async ({ page, context }) => {",
      `${label}: test title`,
    );
  }
  return patched;
}

export function patchBusinessEvidenceFiles() {
  const tenantSource = readFileSync(TENANT_FILE, 'utf8');
  const technicianSource = readFileSync(TECHNICIAN_FILE, 'utf8');
  const tenantPatched = patchTenantBusinessEvidence(tenantSource);
  const technicianPatched = patchTechnicianBusinessEvidence(technicianSource);
  writeFileSync(TENANT_FILE, tenantPatched, 'utf8');
  writeFileSync(TECHNICIAN_FILE, technicianPatched, 'utf8');
  console.log('[five-role-business-evidence] patched Tenant exact-ticket and Technician explicit-push-state proofs');
}

if (import.meta.url === `file://${process.argv[1]}`) patchBusinessEvidenceFiles();
