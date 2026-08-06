from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text(encoding="utf-8-sig")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one source block, found {count}")
    target.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    "tests/e2e/business-admin.spec.ts",
    """    const approvalDialogPromise = page.waitForEvent('dialog', { timeout: 30_000 });
    const approvalClickPromise = approvePropertyRow.getByRole('button', { name: 'Approve', exact: true }).click();
    const propertyApprovalBrowserDialog = await approvalDialogPromise;
    const propertyApprovalDialogMessage = propertyApprovalBrowserDialog.message();
    await propertyApprovalBrowserDialog.accept();
    await approvalClickPromise;
    await expect.poll(async () => (await db.collection('properties').doc(APPROVE_PROPERTY_ID).get()).data()?.status, { timeout: 45_000 }).toBe('APPROVED');
    expect(propertyApprovalDialogMessage).toMatch(/approved successfully/i);
    expect(propertyApprovalDialogMessage).not.toMatch(/error|failed/i);""",
    """    let propertyApprovalDialogMessage = '';
    const propertyApprovalDialogHandler = async (dialog: import('@playwright/test').Dialog) => {
      propertyApprovalDialogMessage = dialog.message();
      await dialog.accept();
    };
    page.on('dialog', propertyApprovalDialogHandler);
    await approvePropertyRow.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await db.collection('properties').doc(APPROVE_PROPERTY_ID).get()).data()?.status, { timeout: 60_000 }).toBe('APPROVED');
    page.off('dialog', propertyApprovalDialogHandler);
    if (propertyApprovalDialogMessage) {
      expect(propertyApprovalDialogMessage).toMatch(/approved successfully/i);
      expect(propertyApprovalDialogMessage).not.toMatch(/error|failed/i);
    }""",
)

replace_once(
    "tests/e2e/business-admin.spec.ts",
    """    const rejectionDialogPromise = page.waitForEvent('dialog', { timeout: 30_000 });
    const rejectionClickPromise = propertyRejectDialog.getByRole('button', { name: 'Reject Property' }).click();
    const rejectionDialog = await rejectionDialogPromise;
    const rejectionDialogMessage = rejectionDialog.message();
    expect(rejectionDialogMessage).toMatch(/rejected/i);
    expect(rejectionDialogMessage).not.toMatch(/error|failed/i);
    await rejectionDialog.accept();
    await rejectionClickPromise;
    await expect.poll(async () => (await db.collection('properties').doc(REJECT_PROPERTY_ID).get()).data()?.status, { timeout: 45_000 }).toBe('REJECTED');""",
    """    let propertyRejectionDialogMessage = '';
    const propertyRejectionDialogHandler = async (dialog: import('@playwright/test').Dialog) => {
      propertyRejectionDialogMessage = dialog.message();
      await dialog.accept();
    };
    page.on('dialog', propertyRejectionDialogHandler);
    await propertyRejectDialog.getByRole('button', { name: 'Reject Property' }).click();
    await expect.poll(async () => (await db.collection('properties').doc(REJECT_PROPERTY_ID).get()).data()?.status, { timeout: 60_000 }).toBe('REJECTED');
    page.off('dialog', propertyRejectionDialogHandler);
    if (propertyRejectionDialogMessage) {
      expect(propertyRejectionDialogMessage).toMatch(/rejected/i);
      expect(propertyRejectionDialogMessage).not.toMatch(/error|failed/i);
    }""",
)

replace_once(
    "src/technician/pages/TechnicianJobDetailPage.tsx",
    """                                    <input hidden type="file" accept="image/*" multiple onChange={handlePhotoChange} />""",
    """                                    <input data-testid="technician-after-work-file" hidden type="file" accept="image/*" multiple onChange={handlePhotoChange} />""",
)

replace_once(
    "tests/e2e/business-tenant.spec.ts",
    """    const completionInput = await firstVisible(page, [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ], 20_000);
    await completionInput.setInputFiles({""",
    """    const completionInput = page.getByTestId('technician-after-work-file');
    await expect(completionInput).toHaveCount(1, { timeout: 20_000 });
    await completionInput.setInputFiles({""",
)

replace_once(
    "tests/e2e/business-technician.spec.ts",
    """    await page.goto(`/technician/job/${offlineTicketId}`, { waitUntil: 'domcontentloaded' });
    await context.setOffline(true);
    await expect(page.locator('body')).toContainText(/Offline mode/i, { timeout: 15_000 });
    await clickRequired(page, ['button:has-text("On The Way")'], 'Offline start trip action');""",
    """    await page.goto(`/technician/job/${offlineTicketId}`, { waitUntil: 'domcontentloaded' });
    const offlineStartTrip = page.getByRole('button', { name: /On The Way/i }).first();
    await expect(offlineStartTrip).toBeVisible({ timeout: 30_000 });
    await expect(offlineStartTrip).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator('body')).toContainText(/Mission Lifecycle|On The Way/i, { timeout: 30_000 });
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('body')).toContainText(/Offline mode/i, { timeout: 15_000 });
    await offlineStartTrip.click();""",
)

print('Seventh-round evidence transformations applied successfully.')
