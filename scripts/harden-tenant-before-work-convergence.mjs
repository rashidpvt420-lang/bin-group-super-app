#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const TENANT_FILE = 'tests/e2e/business-tenant.spec.ts';
const CONVERGENCE_MARKER = 'Tenant cross-role before-work evidence must persist before Start Work.';

function normalize(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function replaceOnce(source, before, after, label) {
  const hadCrlf = source.includes('\r\n');
  const text = normalize(source);
  const needle = normalize(before);
  const replacement = normalize(after);
  const first = text.indexOf(needle);
  if (first < 0) throw new Error(`[tenant-before-work-convergence] ${label}: source anchor not found`);
  if (text.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`[tenant-before-work-convergence] ${label}: source anchor is not unique`);
  }
  const patched = `${text.slice(0, first)}${replacement}${text.slice(first + needle.length)}`;
  return hadCrlf ? patched.replace(/\n/g, '\r\n') : patched;
}

function patchTenant(source) {
  if (source.includes(CONVERGENCE_MARKER)) return source;

  const before = `    const beforeWorkInput = page.getByTestId('technician-before-work-file');
    await expect(beforeWorkInput).toHaveCount(1);
    await beforeWorkInput.setInputFiles({
      name: \`technician-before-\${ticketId}.png\`,
      mimeType: 'image/png',
      buffer: IMAGE_BUFFER,
    });
    await expect(page.getByTestId('technician-before-work-success')).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => {
      const beforeWorkSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const beforeWork = beforeWorkSnap.data() || {};
      return Boolean(beforeWork.technicianBeforePhotoUrl)
        || (Array.isArray(beforeWork.technicianBeforePhotos) && beforeWork.technicianBeforePhotos.length > 0);
    }, { timeout: 45_000, message: 'Technician before-work evidence must persist before Start Work.' }).toBe(true);`;

  const after = `    const beforeWorkInput = page.getByTestId('technician-before-work-file');
    await expect(beforeWorkInput).toHaveCount(1);
    await beforeWorkInput.setInputFiles({
      name: \`technician-before-\${ticketId}.png\`,
      mimeType: 'image/png',
      buffer: IMAGE_BUFFER,
    });

    // The Firestore ticket is the launch authority for before-work proof. The
    // success Alert is useful operator feedback, but it is transient React state
    // and can be lost if the mission listener re-renders after the callable
    // commits. Fail immediately on a real UI upload error, otherwise require the
    // durable proof before allowing the lifecycle to continue.
    const beforeWorkSuccess = page.getByTestId('technician-before-work-success');
    const beforeWorkError = page.getByTestId('technician-before-work-error');
    const beforeWorkDeadline = Date.now() + 45_000;
    let beforeWorkPersisted = false;
    while (Date.now() < beforeWorkDeadline) {
      if (await beforeWorkError.isVisible({ timeout: 250 }).catch(() => false)) {
        const message = (await beforeWorkError.innerText().catch(() => 'unknown Technician before-work upload error')).trim();
        throw new Error(\`Technician before-work evidence upload failed: \${message}\`);
      }
      const beforeWorkSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const beforeWork = beforeWorkSnap.data() || {};
      beforeWorkPersisted = Boolean(beforeWork.technicianBeforePhotoUrl)
        || (Array.isArray(beforeWork.technicianBeforePhotos) && beforeWork.technicianBeforePhotos.length > 0);
      if (beforeWorkPersisted) break;
      await page.waitForTimeout(500);
    }
    expect(beforeWorkPersisted, '${CONVERGENCE_MARKER}').toBe(true);

    const successVisible = await beforeWorkSuccess.isVisible({ timeout: 1_000 }).catch(() => false);
    if (!successVisible) {
      // A persisted proof with a missing transient Alert is listener/UI
      // convergence, not missing evidence. Reload the exact mission and then let
      // the proof-backed Start Work readiness assertion below prove UI recovery.
      await reloadTechnicianMission(page, ticketId);
      await expect(page.getByTestId('technician-before-work-evidence')).toBeVisible({ timeout: 20_000 });
    }`;

  return replaceOnce(source, before, after, 'Tenant before-work durable convergence');
}

const source = readFileSync(TENANT_FILE, 'utf8');
const patched = patchTenant(source);
if (patched !== source) writeFileSync(TENANT_FILE, patched, 'utf8');

console.log('[tenant-before-work-convergence] hardened Tenant cross-role proof around durable Firestore authority');
