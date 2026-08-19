import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  patchAdminBusinessEvidence,
  patchTenantBusinessEvidence,
} from '../../scripts/apply-five-role-business-evidence-fixes.mjs';

const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

test('Admin protected replay matches the current Phase 1 payment-return UI and fails fast on selector drift', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  const patched = patchAdminBusinessEvidence(source);

  assert.ok(patched.includes("await expect(approvalDialog).toBeVisible({ timeout: 20_000 });"));
  assert.ok(patched.includes("await confirmApproval.click();"));
  assert.ok(patched.includes("response.request().method() === 'POST' && response.url().includes('adminApprovePayment')"));
  assert.ok(patched.includes('Admin payment approval callable failed HTTP'));
  assert.ok(!patched.includes("(response) => response.url().includes('adminApprovePayment'),"));
  assert.ok(!patched.includes('confirmApproval.evaluate((node: HTMLElement) => { node.click(); node.click(); })'));
  assert.ok(patched.includes("name: /^(?:Return|Reject \\/ Return)$/i"));
  assert.ok(patched.includes('Return \\/ Reject Payment (?:Evidence|Proof)'));
  assert.ok(patched.includes('getByLabel(/Return reason \\/ Admin review note/i)'));
  assert.ok(patched.includes("click({ timeout: 20_000 })"));

  const ui = read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx');
  assert.ok(ui.includes('Return / Reject Payment Evidence'));
  assert.ok(ui.includes('Return reason / Admin review note'));
  assert.ok(ui.includes('>Return</Button>'));
});

test('Admin protected replay upgrades a method-agnostic callable waiter before it can accept CORS preflight', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  const postCallableDiagnostics = `    const approveResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('adminApprovePayment'),
      { timeout: 45_000 },
    );
    await confirmApproval.click();
    const approveResponse = await approveResponsePromise;
    const approveResponseText = await approveResponse.text().catch(() => '');
    if (!approveResponse.ok() || /\\\"error\\\"\\s*:/i.test(approveResponseText)) {
      throw new Error(
        \`Admin payment approval callable failed HTTP \${approveResponse.status()}: \${approveResponseText.slice(0, 1_500)}\`,
      );
    }`;
  const methodAgnosticCallableWaiter = `    const approveResponsePromise = page.waitForResponse(
      (response) => response.url().includes('adminApprovePayment'),
      { timeout: 45_000 },
    );
    await confirmApproval.click();
    const approveResponse = await approveResponsePromise;
    expect(approveResponse.status(), 'adminApprovePayment Callable endpoint returned error status').toBeLessThan(400);`;
  const legacySource = source.replace(postCallableDiagnostics, methodAgnosticCallableWaiter);
  assert.notEqual(legacySource, source, 'fixture must model the preflight-vulnerable waiter');

  const patched = patchAdminBusinessEvidence(legacySource);
  assert.ok(patched.includes("response.request().method() === 'POST' && response.url().includes('adminApprovePayment')"));
  assert.ok(patched.includes('Admin payment approval callable failed HTTP'));
  assert.ok(!patched.includes("(response) => response.url().includes('adminApprovePayment'),"));
});

test('Tenant-to-Technician protected replay survives Firestore lifecycle replacement and waits for Start Work convergence', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  const patched = patchTenantBusinessEvidence(source);

  assert.ok(patched.includes('enabledTimeout = 2_000'));
  assert.ok(patched.includes('const deadline = Date.now() + 35_000'));
  assert.ok(patched.includes('await target.evaluate((node: HTMLElement) => node.click())'));
  assert.ok(!patched.includes("await target.click({ timeout: enabledTimeout });"));
  assert.ok(patched.includes("const startWorkButton = page.getByTestId('technician-start-work');"));
  assert.ok(patched.includes('Start Work must become enabled after persisted before-work evidence reaches the Technician page listener.'));
  assert.ok(patched.includes(').toBeEnabled({ timeout: 45_000 });'));
  assert.ok(patched.includes('button:has-text("قبول المهمة")'));
  assert.ok(patched.includes('button:has-text("على الطريق")'));
  assert.ok(patched.includes('button:has-text("وصلت")'));
  assert.ok(patched.includes('Complete Mission & Request Tenant Feedback|إكمال المهمة'));

  const technicianUi = read('src/technician/pages/TechnicianJobDetailPage.tsx');
  assert.ok(technicianUi.includes('data-testid="technician-start-work"'));
  assert.ok(technicianUi.includes("status !== 'ARRIVED' || !hasTechnicianBeforeProof || !ppeChecked || !safetyChecked"));
});

test('protected interaction replay is idempotent', () => {
  const adminOnce = patchAdminBusinessEvidence(read('tests/e2e/business-admin.spec.ts'));
  const adminTwice = patchAdminBusinessEvidence(adminOnce);
  assert.equal(adminTwice, adminOnce);

  const tenantOnce = patchTenantBusinessEvidence(read('tests/e2e/business-tenant.spec.ts'));
  const tenantTwice = patchTenantBusinessEvidence(tenantOnce);
  assert.equal(tenantTwice, tenantOnce);
});
