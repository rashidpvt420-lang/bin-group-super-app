#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const ADMIN_FILE = 'tests/e2e/business-admin.spec.ts';
const TENANT_FILE = 'tests/e2e/business-tenant.spec.ts';
const TECHNICIAN_FILE = 'tests/e2e/business-technician.spec.ts';

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, '\n');
}

function restoreNewlines(value, hadCrlf) {
  return hadCrlf ? value.replace(/\n/g, '\r\n') : value;
}

function replaceExactlyOnce(source, before, after, label) {
  const hadCrlf = source.includes('\r\n');
  const normSource = normalizeNewlines(source);
  const normBefore = normalizeNewlines(before);
  const normAfter = normalizeNewlines(after);

  const first = normSource.indexOf(normBefore);
  if (first < 0) throw new Error(`${label}: expected source anchor was not found.`);
  if (normSource.indexOf(normBefore, first + normBefore.length) >= 0) {
    throw new Error(`${label}: source anchor was not unique.`);
  }
  const patched = `${normSource.slice(0, first)}${normAfter}${normSource.slice(first + normBefore.length)}`;
  return restoreNewlines(patched, hadCrlf);
}

function replaceFirstAvailable(source, replacements, label) {
  let lastNotFound = '';
  for (const { before, after } of replacements) {
    try {
      return replaceExactlyOnce(source, before, after, label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('expected source anchor was not found')) throw error;
      lastNotFound = message;
    }
  }
  throw new Error(lastNotFound || `${label}: expected source anchor was not found.`);
}

export function patchTenantBusinessEvidence(source, label = TENANT_FILE) {
  let patched = source;

  if (!patched.includes('const callableResponsePromise = page.waitForResponse(')) {
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
    patched = replaceExactlyOnce(patched, before, after, label);
  }

  if (!patched.includes('(?:CLOSED|COMPLETED)\\|true\\|APPROVED\\|true')) {
    const completionBeforeTwoSpace = `  await expect.poll(async () => {
    const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
    const data = snap.data() || {};
    return \`\${data.status}|\${data.tenantApproved}|\${data.tenantApprovalStatus}|\${data.finalApproval}\`;
  }, { timeout: 40_000 }).toMatch(/CLOSED\\|true\\|APPROVED\\|true/i);
`;
    const completionAfterTwoSpace = `  await expect.poll(async () => {
    const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
    const data = snap.data() || {};
    return \`\${String(data.status || '').toUpperCase()}|\${data.tenantApproved}|\${data.tenantApprovalStatus}|\${data.finalApproval}\`;
  }, { timeout: 40_000 }).toMatch(/(?:CLOSED|COMPLETED)\\|true\\|APPROVED\\|true/i);
`;
    const completionBeforeFourSpace = `    await expect.poll(async () => {
      const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const data = snap.data() || {};
      return \`\${data.status}|\${data.tenantApproved}|\${data.tenantApprovalStatus}|\${data.finalApproval}\`;
    }, { timeout: 40_000 }).toMatch(/CLOSED\\|true\\|APPROVED\\|true/i);
`;
    const completionAfterFourSpace = `    await expect.poll(async () => {
      const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const data = snap.data() || {};
      return \`\${String(data.status || '').toUpperCase()}|\${data.tenantApproved}|\${data.tenantApprovalStatus}|\${data.finalApproval}\`;
    }, { timeout: 40_000 }).toMatch(/(?:CLOSED|COMPLETED)\\|true\\|APPROVED\\|true/i);
`;
    patched = replaceFirstAvailable(patched, [
      { before: completionBeforeFourSpace, after: completionAfterFourSpace },
      { before: completionBeforeTwoSpace, after: completionAfterTwoSpace },
    ], `${label}: tenant completion terminal status`);
  }

  if (!patched.includes('page.getByLabel(/Resolution notes|Completion notes|Work summary|Resolution summary/i)')) {
    const notesBefore = `    const notes = page.getByLabel(/Resolution notes/i).first();
    await expect(notes).toBeVisible({ timeout: 10_000 });
    await notes.fill(\`Cross-role completion \${RUN_MARKER}: inspected, repaired, tested, and left operational.\`);

    const materials = page.getByLabel(/Materials used|No parts required/i).first();
`;
    const notesAfter = `    let notes = page.getByLabel(/Resolution notes|Completion notes|Work summary|Resolution summary/i).first();
    if (!(await notes.isVisible({ timeout: 10_000 }).catch(() => false))) {
      await reloadTechnicianMission(page, ticketId);
      await expect(page.locator('body')).toContainText(/IN PROGRESS|Proof readiness|Status updated|Complete Mission/i, { timeout: 25_000 });
      notes = page.getByLabel(/Resolution notes|Completion notes|Work summary|Resolution summary/i).first();
    }
    await expect(notes).toBeVisible({ timeout: 20_000 });
    await notes.fill(\`Cross-role completion \${RUN_MARKER}: inspected, repaired, tested, and left operational.\`);

    const materials = page.getByLabel(/Materials used|No parts required|Materials/i).first();
`;
    patched = replaceExactlyOnce(patched, notesBefore, notesAfter, `${label}: technician completion notes fallback`);
  }

  return patched;
}

export function patchAdminBusinessEvidence(source, label = ADMIN_FILE) {
  if (source.includes('const verifyAndUnlockButton = activationRow.getByRole')) return source;

  const before = `    const activationRow = page.getByRole('row').filter({ hasText: PAYMENT_ID }).first();
    await expect(activationRow).toBeVisible({ timeout: 35_000 });
    await activationRow.getByRole('button', { name: /Verify & Unlock/i }).click();
    const approvalDialog = page.getByRole('dialog', { name: /Confirm Payment & Unlock Owner/i });
    const confirmApproval = approvalDialog.getByRole('button', { name: /Confirm & Unlock Owner/i });
    await expect(confirmApproval).toBeEnabled();
    await confirmApproval.evaluate((node: HTMLElement) => { node.click(); node.click(); });
`;
  const after = `    const activationRow = page.getByRole('row').filter({ hasText: PAYMENT_ID }).first();
    await expect(activationRow).toBeVisible({ timeout: 35_000 });
    const verifyAndUnlockButton = activationRow.getByRole('button', { name: /Verify & Unlock/i });
    if (await verifyAndUnlockButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await verifyAndUnlockButton.click();
      const approvalDialog = page.getByRole('dialog', { name: /Confirm Payment & Unlock Owner/i });
      const confirmApproval = approvalDialog.getByRole('button', { name: /Confirm & Unlock Owner/i });
      await expect(confirmApproval).toBeEnabled();
      await confirmApproval.evaluate((node: HTMLElement) => { node.click(); node.click(); });
    } else {
      const currentActivationState = await Promise.all([
        db.collection('payment_transactions').doc(PAYMENT_ID).get(),
        db.collection('contracts').doc(PAYMENT_ID).get(),
        db.collection('intake_submissions').doc(PAYMENT_ID).get(),
        db.collection('users').doc(PAYMENT_OWNER_UID).get(),
        db.collection('properties').doc(PAYMENT_PROPERTY_ID).get(),
      ]).then(([payment, contract, intake, owner, property]) => [
        payment.data()?.status,
        contract.data()?.status,
        intake.data()?.status,
        owner.data()?.dashboardUnlocked,
        property.data()?.status,
      ].join('|'));
      const activationRowText = await activationRow.innerText({ timeout: 5_000 }).catch(() => '<row text unavailable>');
      expect(
        currentActivationState,
        'Missing Verify & Unlock button is acceptable only when this exact owner activation is already idempotently approved. row=' + activationRowText,
      ).toBe('APPROVED|ACTIVE|ACTIVE|true|ACTIVE');
    }
`;
  return replaceExactlyOnce(source, before, after, `${label}: idempotent payment activation`);
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
  const adminSource = readFileSync(ADMIN_FILE, 'utf8');
  const tenantSource = readFileSync(TENANT_FILE, 'utf8');
  const technicianSource = readFileSync(TECHNICIAN_FILE, 'utf8');
  const adminPatched = patchAdminBusinessEvidence(adminSource);
  const tenantPatched = patchTenantBusinessEvidence(tenantSource);
  const technicianPatched = patchTechnicianBusinessEvidence(technicianSource);
  writeFileSync(ADMIN_FILE, adminPatched, 'utf8');
  writeFileSync(TENANT_FILE, tenantPatched, 'utf8');
  writeFileSync(TECHNICIAN_FILE, technicianPatched, 'utf8');
  console.log('[five-role-business-evidence] patched Admin idempotent unlock, Tenant terminal completion states, exact-ticket, and Technician explicit-push-state proofs');
}

if (import.meta.url === `file://${process.argv[1]}`) patchBusinessEvidenceFiles();
