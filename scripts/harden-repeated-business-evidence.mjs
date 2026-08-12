#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const ADMIN_FILE = 'tests/e2e/business-admin.spec.ts';
const TENANT_FILE = 'tests/e2e/business-tenant.spec.ts';
const TECHNICIAN_FILE = 'tests/e2e/business-technician.spec.ts';

function normalize(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function replaceOnce(source, before, after, label) {
  const hadCrlf = source.includes('\r\n');
  const text = normalize(source);
  const needle = normalize(before);
  const replacement = normalize(after);
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`[repeated-business-evidence] ${label}: source anchor not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`[repeated-business-evidence] ${label}: source anchor is not unique`);
  }
  const patched = `${text.slice(0, first)}${replacement}${text.slice(first + needle.length)}`;
  return hadCrlf ? patched.replace(/\n/g, '\r\n') : patched;
}

function hasAdminCallableDiagnostics(source) {
  const text = normalize(source);

  // A callable can emit an OPTIONS preflight before its POST response. Only a
  // method-specific response waiter plus an error-body diagnostic is strong
  // enough to qualify as hardened production evidence.
  const protectedInteractionContract = text.includes('const approveResponsePromise = page.waitForResponse(')
    && text.includes("response.request().method() === 'POST' && response.url().includes('adminApprovePayment')")
    && text.includes('Admin payment approval callable failed HTTP');

  const runtimeDiagnosticContract = text.includes('const approvalResponsePromise = page.waitForResponse(')
    && text.includes("response.request().method() === 'POST' && response.url().includes('adminApprovePayment')")
    && text.includes('Admin payment approval callable failed HTTP');

  return protectedInteractionContract || runtimeDiagnosticContract;
}

function patchTechnician(source) {
  if (source.includes('Technician before-work evidence must persist before Start Work.')) return source;

  const before = `    const beforeInput = page.getByTestId('technician-before-work-file');
    await expect(beforeInput).toHaveCount(1);
    await setImage(beforeInput, 'technician-before-work.png');
    await expect(page.getByTestId('technician-before-work-success')).toBeVisible({ timeout: 45_000 });

    await page.locator('#ppe').check();
    await page.locator('#safety').check();
    await clickRequired(page, ['button:has-text("Start Work")'], 'Start work action');
    await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 35_000 }).toBe('IN_PROGRESS');`;

  const after = `    const beforeInput = page.getByTestId('technician-before-work-file');
    await expect(beforeInput).toHaveCount(1);
    await setImage(beforeInput, 'technician-before-work.png');
    await expect(page.getByTestId('technician-before-work-success')).toBeVisible({ timeout: 45_000 });

    // The evidence child reports local success as soon as the callable returns,
    // while the parent mission page enables Start Work only after its Firestore
    // listener observes the persisted proof. Wait on the durable backend state
    // first so a slow listener cannot make this production proof flaky.
    await expect.poll(async () => {
      const snap = await db.collection('maintenanceTickets').doc(dispatchTicketId).get();
      const data = snap.data() || {};
      return Boolean(data.technicianBeforePhotoUrl)
        || (Array.isArray(data.technicianBeforePhotos) && data.technicianBeforePhotos.length > 0);
    }, {
      timeout: 45_000,
      message: 'Technician before-work evidence must persist before Start Work.',
    }).toBe(true);

    const ppe = page.locator('#ppe');
    const safety = page.locator('#safety');
    await ppe.check();
    await safety.check();
    const startWorkButton = page.getByTestId('technician-start-work');
    await expect(ppe, 'PPE confirmation must remain checked before Start Work.').toBeChecked();
    await expect(safety, 'Safety confirmation must remain checked before Start Work.').toBeChecked();
    await expect(
      startWorkButton,
      'Start Work must become enabled after persisted before-work evidence reaches the Technician page listener.',
    ).toBeEnabled({ timeout: 45_000 });
    await startWorkButton.click();
    await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 35_000 }).toBe('IN_PROGRESS');`;

  return replaceOnce(source, before, after, 'Technician Start Work convergence');
}

function patchTenant(source) {
  let patched = source;

  if (!patched.includes('async function cleanupStaleE2eCorrectionRequests()')) {
    const helperAnchor = `async function cleanupRunData() {`;
    const helper = `async function cleanupStaleE2eCorrectionRequests() {
  if (!tenantUid || !admin.apps.length) return;
  const db = admin.firestore();
  const snapshot = await db.collection('tenant_correction_requests')
    .where('tenantUid', '==', tenantUid)
    .limit(50)
    .get();

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() || {};
    const pending = String(data.status || '').trim() === 'PENDING_ADMIN_REVIEW';
    const requestedValue = String(data.requestedValue || '');
    const reason = String(data.reason || '');
    const e2eOwned = requestedValue.startsWith('E2E Correction ')
      || reason.includes('Main Tenant business correction evidence')
      || reason.includes('Tenant business correction evidence');
    if (!pending || !e2eOwned) continue;

    const events = await docSnap.ref.collection('events').limit(50).get();
    const batch = db.batch();
    events.docs.forEach((eventDoc) => batch.delete(eventDoc.ref));
    batch.delete(docSnap.ref);
    await batch.commit();
  }
}

async function cleanupRunData() {`;
    patched = replaceOnce(patched, helperAnchor, helper, 'Tenant stale correction cleanup helper');
  }

  if (!patched.includes('await cleanupStaleE2eCorrectionRequests();')) {
    const uidAnchor = `    tenantUid = tenant.uid;
    technicianUid = technician.uid;`;
    const uidReplacement = `    tenantUid = tenant.uid;
    technicianUid = technician.uid;
    // Failed or interrupted production evidence runs can leave synthetic pending
    // corrections behind. Remove only records created by this E2E contract so
    // the canonical Tenant never hits the five-pending or duplicate-field gate.
    await cleanupStaleE2eCorrectionRequests();`;
    patched = replaceOnce(patched, uidAnchor, uidReplacement, 'Tenant cleanup invocation');
  }

  if (!patched.includes('Tenant correction callable failed:')) {
    const submitAnchor = `    await page.getByTestId('tenant-correction-submit').click();
    await expect(page.getByTestId('tenant-correction-success')).toContainText(/submitted|تم إرسال/i, { timeout: 30_000 });`;
    const submitReplacement = `    await page.getByTestId('tenant-correction-submit').click();
    const correctionSuccess = page.getByTestId('tenant-correction-success');
    const correctionError = page.getByTestId('tenant-correction-error');
    const correctionDeadline = Date.now() + 30_000;
    while (Date.now() < correctionDeadline) {
      if (await correctionSuccess.isVisible({ timeout: 250 }).catch(() => false)) break;
      if (await correctionError.isVisible({ timeout: 250 }).catch(() => false)) {
        const message = (await correctionError.innerText().catch(() => 'unknown Tenant correction error')).trim();
        throw new Error(\`Tenant correction callable failed: \${message}\`);
      }
      await page.waitForTimeout(250);
    }
    await expect(correctionSuccess).toContainText(/submitted|تم إرسال/i, { timeout: 2_000 });`;
    patched = replaceOnce(patched, submitAnchor, submitReplacement, 'Tenant correction outcome diagnostics');
  }

  return patched;
}

function patchAdmin(source) {
  if (hasAdminCallableDiagnostics(source)) return source;

  const before = `    await expect(confirmApproval).toBeVisible({ timeout: 20_000 });
    await expect(confirmApproval).toBeEnabled({ timeout: 20_000 });
    await confirmApproval.click();

    await expect.poll(async () => {`;

  const after = `    await expect(confirmApproval).toBeVisible({ timeout: 20_000 });
    await expect(confirmApproval).toBeEnabled({ timeout: 20_000 });
    const approvalResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('adminApprovePayment'),
      { timeout: 45_000 },
    );
    await confirmApproval.click();
    const approvalResponse = await approvalResponsePromise;
    const approvalResponseText = await approvalResponse.text().catch(() => '');
    if (!approvalResponse.ok() || /\\"error\\"\\s*:/i.test(approvalResponseText)) {
      throw new Error(
        \`Admin payment approval callable failed HTTP \${approvalResponse.status()}: \${approvalResponseText.slice(0, 1_500)}\`,
      );
    }

    await expect.poll(async () => {`;

  return replaceOnce(source, before, after, 'Admin payment callable diagnostics');
}

const sources = {
  admin: readFileSync(ADMIN_FILE, 'utf8'),
  tenant: readFileSync(TENANT_FILE, 'utf8'),
  technician: readFileSync(TECHNICIAN_FILE, 'utf8'),
};

writeFileSync(ADMIN_FILE, patchAdmin(sources.admin), 'utf8');
writeFileSync(TENANT_FILE, patchTenant(sources.tenant), 'utf8');
writeFileSync(TECHNICIAN_FILE, patchTechnician(sources.technician), 'utf8');

console.log('[repeated-business-evidence] hardened Admin callable diagnostics, Tenant stale-run cleanup, and Technician listener convergence');
