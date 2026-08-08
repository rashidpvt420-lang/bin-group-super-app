#!/usr/bin/env node

function normalizeNewlines(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function restoreNewlines(value, hadCrlf) {
  return hadCrlf ? value.replace(/\n/g, '\r\n') : value;
}

function replaceExactlyOnce(source, before, after, label) {
  const hadCrlf = source.includes('\r\n');
  const normalizedSource = normalizeNewlines(source);
  const normalizedBefore = normalizeNewlines(before);
  const normalizedAfter = normalizeNewlines(after);
  const first = normalizedSource.indexOf(normalizedBefore);
  if (first < 0) throw new Error(`${label}: expected source anchor was not found.`);
  if (normalizedSource.indexOf(normalizedBefore, first + normalizedBefore.length) >= 0) {
    throw new Error(`${label}: source anchor was not unique.`);
  }
  return restoreNewlines(
    `${normalizedSource.slice(0, first)}${normalizedAfter}${normalizedSource.slice(first + normalizedBefore.length)}`,
    hadCrlf,
  );
}

function replaceFirstAvailable(source, variants, after, afterMarker, label) {
  if (source.includes(afterMarker)) return source;
  for (const before of variants) {
    if (normalizeNewlines(source).includes(normalizeNewlines(before))) {
      return replaceExactlyOnce(source, before, after, label);
    }
  }
  throw new Error(`${label}: neither the expected source anchor nor the hardened marker was found.`);
}

export function patchAdminProtectedInteractions(source, label = 'tests/e2e/business-admin.spec.ts') {
  let patched = source;

  const rawApproval = `    const approvalDialog = page.getByTestId('admin-payment-approval-dialog');
    const confirmApproval = approvalDialog.getByTestId('admin-payment-confirm-approval');
    await expect(confirmApproval).toBeEnabled();
    await confirmApproval.evaluate((node: HTMLElement) => { node.click(); node.click(); });`;
  const hardenedApproval = `    const approvalDialog = page.getByTestId('admin-payment-approval-dialog');
    await expect(approvalDialog).toBeVisible({ timeout: 20_000 });
    const confirmApproval = approvalDialog.getByTestId('admin-payment-confirm-approval');
    await expect(confirmApproval).toBeVisible({ timeout: 20_000 });
    await expect(confirmApproval).toBeEnabled({ timeout: 20_000 });
    await confirmApproval.click();`;
  patched = replaceFirstAvailable(
    patched,
    [rawApproval],
    hardenedApproval,
    "await expect(approvalDialog).toBeVisible({ timeout: 20_000 });",
    `${label}: Admin payment approval readiness`,
  );

  const staleReturnClick = `    await rejectPaymentRow.getByRole('button', { name: /Reject \\/ Return/i }).click();`;
  const currentReturnClick = `    await rejectPaymentRow.getByRole('button', { name: /^(?:Return|Reject \\/ Return)$/i }).click({ timeout: 20_000 });`;
  patched = replaceFirstAvailable(
    patched,
    [staleReturnClick],
    currentReturnClick,
    "name: /^(?:Return|Reject \\/ Return)$/i",
    `${label}: Admin payment return row action`,
  );

  const staleReturnDialog = `    const rejectPaymentDialog = page.getByRole('dialog', { name: /Return \\/ Reject Payment Proof/i });`;
  const currentReturnDialog = `    const rejectPaymentDialog = page.getByRole('dialog', { name: /Return \\/ Reject Payment (?:Evidence|Proof)/i });`;
  patched = replaceFirstAvailable(
    patched,
    [staleReturnDialog],
    currentReturnDialog,
    'Return \\/ Reject Payment (?:Evidence|Proof)',
    `${label}: Admin payment return dialog title`,
  );

  const staleReasonField = `    await rejectPaymentDialog.getByLabel('Return reason / admin review note').fill('Protected E2E payment evidence does not match the submitted reference.');`;
  const currentReasonField = `    await rejectPaymentDialog.getByLabel(/Return reason \\/ Admin review note/i).fill('Protected E2E payment evidence does not match the submitted reference.');`;
  patched = replaceFirstAvailable(
    patched,
    [staleReasonField],
    currentReasonField,
    'getByLabel(/Return reason \\/ Admin review note/i)',
    `${label}: Admin payment return reason field`,
  );

  return patched;
}

export function patchTenantProtectedInteractions(source, label = 'tests/e2e/business-tenant.spec.ts') {
  let patched = source;

  const slowPolling = `async function clickRequired(page: Page, selectors: string[], label: string, enabledTimeout = 15_000) {
  const deadline = Date.now() + 25_000;`;
  const boundedPolling = `async function clickRequired(page: Page, selectors: string[], label: string, enabledTimeout = 2_000) {
  const deadline = Date.now() + 35_000;`;
  patched = replaceFirstAvailable(
    patched,
    [slowPolling],
    boundedPolling,
    'enabledTimeout = 2_000',
    `${label}: bounded lifecycle polling`,
  );

  const rawRequiredClick = `        await target.evaluate((node: HTMLElement) => node.click());`;
  const userRequiredClick = `        await target.click({ timeout: enabledTimeout });`;
  patched = replaceFirstAvailable(
    patched,
    [rawRequiredClick],
    userRequiredClick,
    'await target.click({ timeout: enabledTimeout });',
    `${label}: Playwright lifecycle click`,
  );

  patched = replaceFirstAvailable(
    patched,
    [`      await clickRequired(page, ['button:has-text("Accept Mission")'], 'Accept Mission action');`],
    `      await clickRequired(page, ['button:has-text("Accept Mission")', 'button:has-text("قبول المهمة")'], 'Accept Mission action');`,
    'button:has-text("قبول المهمة")',
    `${label}: bilingual Accept Mission`,
  );

  const startTripBefore = `      await clickRequired(page, [
        'button:has-text("On The Way")',
        'button:has-text("Start Trip")',
        'button:has-text("En Route")',
      ], 'Start trip action');`;
  const startTripAfter = `      await clickRequired(page, [
        'button:has-text("On The Way")',
        'button:has-text("Start Trip")',
        'button:has-text("En Route")',
        'button:has-text("على الطريق")',
      ], 'Start trip action');`;
  patched = replaceFirstAvailable(
    patched,
    [startTripBefore],
    startTripAfter,
    'button:has-text("على الطريق")',
    `${label}: bilingual Start Trip`,
  );

  const arrivalBefore = `      await clickRequired(page, [
        'button:has-text("Arrived")',
        'button:has-text("I have arrived")',
        'button:has-text("On Site")',
      ], 'Arrival action', 40_000);`;
  const arrivalAfter = `      await clickRequired(page, [
        'button:has-text("Arrived")',
        'button:has-text("I have arrived")',
        'button:has-text("On Site")',
        'button:has-text("وصلت")',
      ], 'Arrival action', 40_000);`;
  patched = replaceFirstAvailable(
    patched,
    [arrivalBefore],
    arrivalAfter,
    'button:has-text("وصلت")',
    `${label}: bilingual Arrived`,
  );

  patched = replaceFirstAvailable(
    patched,
    [`    await expect(page.locator('body')).toContainText(/ON THE WAY|EN ROUTE|Status updated/i, { timeout: 20_000 });`],
    `    await expect(page.locator('body')).toContainText(/ON THE WAY|EN ROUTE|Status updated|على الطريق/i, { timeout: 20_000 });`,
    'Status updated|على الطريق',
    `${label}: bilingual en-route readiness`,
  );

  patched = replaceFirstAvailable(
    patched,
    [`    await expect(page.locator('body')).toContainText(/ARRIVED|PRE-WORK SAFETY PROTOCOL|Status updated/i, { timeout: 25_000 });`],
    `    await expect(page.locator('body')).toContainText(/ARRIVED|PRE-WORK SAFETY PROTOCOL|Status updated|وصلت/i, { timeout: 25_000 });`,
    'Status updated|وصلت',
    `${label}: bilingual arrival readiness`,
  );

  const startWorkBefore = `    await clickRequired(page, ['button:has-text("Start Work")'], 'Start work action');`;
  const startWorkBilingualBefore = `    await clickRequired(page, ['button:has-text("Start Work")', 'button:has-text("بدء العمل")'], 'Start work action');`;
  const startWorkAfter = `    const startWorkButton = page.getByTestId('technician-start-work');
    await expect(ppe, 'PPE confirmation must remain checked before Start Work.').toBeChecked();
    await expect(safety, 'Safety confirmation must remain checked before Start Work.').toBeChecked();
    await expect(
      startWorkButton,
      'Start Work must become enabled after persisted before-work evidence reaches the Technician page listener.',
    ).toBeEnabled({ timeout: 45_000 });
    await startWorkButton.click();`;
  patched = replaceFirstAvailable(
    patched,
    [startWorkBefore, startWorkBilingualBefore],
    startWorkAfter,
    "const startWorkButton = page.getByTestId('technician-start-work');",
    `${label}: Start Work listener convergence`,
  );

  patched = replaceFirstAvailable(
    patched,
    [`    await expect(page.locator('body')).toContainText(/IN PROGRESS|Proof readiness|Status updated/i, { timeout: 25_000 });`],
    `    await expect(page.locator('body')).toContainText(/IN PROGRESS|Proof readiness|Status updated|بدء العمل/i, { timeout: 25_000 });`,
    'Status updated|بدء العمل',
    `${label}: bilingual Start Work readiness`,
  );

  patched = replaceFirstAvailable(
    patched,
    [`    const complete = page.getByRole('button', { name: /Complete Mission & Request Tenant Feedback/i }).first();`],
    `    const complete = page.getByRole('button', { name: /Complete Mission & Request Tenant Feedback|إكمال المهمة/i }).first();`,
    'Complete Mission & Request Tenant Feedback|إكمال المهمة',
    `${label}: bilingual Complete Mission`,
  );

  return patched;
}
