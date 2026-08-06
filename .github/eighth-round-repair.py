from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text(encoding="utf-8-sig")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one source block, found {count}")
    target.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    "apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx",
    """<Button size=\"small\" startIcon={<CheckCircle size={14} />} disabled={busyId === row.id || !inspectionReady} onClick={() => openApproveDialog(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}>{rent ? 'Verify Rent' : 'Record 15% & Approve'}</Button>""",
    """<Button data-testid=\"admin-payment-approve\" size=\"small\" startIcon={<CheckCircle size={14} />} disabled={busyId === row.id || !inspectionReady} onClick={() => openApproveDialog(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}>{rent ? 'Verify Rent' : 'Record 15% & Approve'}</Button>""",
)
replace_once(
    "apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx",
    """<Dialog open={Boolean(approvalTarget)} onClose={() => !busyId && setApprovalTarget(null)} fullWidth maxWidth=\"sm\" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>""",
    """<Dialog data-testid=\"admin-payment-approval-dialog\" open={Boolean(approvalTarget)} onClose={() => !busyId && setApprovalTarget(null)} fullWidth maxWidth=\"sm\" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>""",
)
replace_once(
    "apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx",
    """<Button onClick={() => void approvePayment()} disabled={!approvalTarget || busyId === approvalTarget?.id} startIcon={busyId === approvalTarget?.id ? <CircularProgress size={16} /> : <CheckCircle size={16} />} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>{approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : 'Verify 15% & Approve Owner'}</Button>""",
    """<Button data-testid=\"admin-payment-confirm-approval\" onClick={() => void approvePayment()} disabled={!approvalTarget || busyId === approvalTarget?.id} startIcon={busyId === approvalTarget?.id ? <CircularProgress size={16} /> : <CheckCircle size={16} />} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>{approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : 'Verify 15% & Approve Owner'}</Button>""",
)

replace_once(
    "tests/e2e/business-admin.spec.ts",
    """    await activationRow.getByRole('button', { name: /Verify & Unlock/i }).click();
    const approvalDialog = page.getByRole('dialog', { name: /Confirm Payment & Unlock Owner/i });
    const confirmApproval = approvalDialog.getByRole('button', { name: /Confirm & Unlock Owner/i });""",
    """    await activationRow.getByTestId('admin-payment-approve').click();
    const approvalDialog = page.getByTestId('admin-payment-approval-dialog');
    const confirmApproval = approvalDialog.getByTestId('admin-payment-confirm-approval');""",
)

replace_once(
    "tests/e2e/business-tenant.spec.ts",
    """    emailVerified: true,
    e2eTenantRecovery: true,""",
    """    emailVerified: true,
    // This fixture exercises unit-link recovery, not first-login legal consent.
    // Mark the temporary Tenant as having already accepted the agreement so
    // the global modal cannot obscure the recovery form.
    legalAcceptedAt: new Date().toISOString(),
    e2eTenantRecovery: true,""",
)
replace_once(
    "tests/e2e/business-tenant.spec.ts",
    """  test.beforeEach(async ({ page }) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
    await login(page, 'tenant', TENANT_EMAIL, TENANT_PASSWORD);
  });""",
    """  test.beforeEach(async ({ page }, testInfo) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
    // The recovery test signs in as a separate temporary Tenant. Starting it
    // with the canonical Tenant session leaves Firebase Auth persistence in
    // IndexedDB and makes /login redirect before the recovery credentials can
    // be entered.
    if (!testInfo.title.startsWith('Unassigned-residence fallback')) {
      await login(page, 'tenant', TENANT_EMAIL, TENANT_PASSWORD);
    }
  });""",
)
replace_once(
    "tests/e2e/business-tenant.spec.ts",
    """    await login(page, 'tenant', RECOVERY_EMAIL, RECOVERY_PASSWORD);
    await page.goto(`/tenant/request?recovery=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const fallback = page.getByTestId('tenant-unit-link-fallback');""",
    """    await login(page, 'tenant', RECOVERY_EMAIL, RECOVERY_PASSWORD);
    await page.goto(`/tenant/request?recovery=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('legal-agreement-content')).toHaveCount(0);
    const fallback = page.getByTestId('tenant-unit-link-fallback');""",
)

print('Eighth-round five-role evidence repairs applied successfully.')
