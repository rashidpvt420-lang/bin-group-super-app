from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    source = target.read_text(encoding="utf-8-sig")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one source block, found {count}")
    target.write_text(source.replace(old, new, 1), encoding="utf-8")


# Admin evidence must compile before a protected deployment. The property
# approval browser dialog and the later payment approval dialog shared one
# block-scoped identifier, so Playwright rejected the entire Admin suite.
replace_once(
    "tests/e2e/business-admin.spec.ts",
    """    const approvalDialog = await approvalDialogPromise;
    const approvalDialogMessage = approvalDialog.message();
    await approvalDialog.accept();
    await approvalClickPromise;
    await expect.poll(async () => (await db.collection('properties').doc(APPROVE_PROPERTY_ID).get()).data()?.status, { timeout: 45_000 }).toBe('APPROVED');
    expect(approvalDialogMessage).toMatch(/approved successfully/i);
    expect(approvalDialogMessage).not.toMatch(/error|failed/i);""",
    """    const propertyApprovalBrowserDialog = await approvalDialogPromise;
    const propertyApprovalDialogMessage = propertyApprovalBrowserDialog.message();
    await propertyApprovalBrowserDialog.accept();
    await approvalClickPromise;
    await expect.poll(async () => (await db.collection('properties').doc(APPROVE_PROPERTY_ID).get()).data()?.status, { timeout: 45_000 }).toBe('APPROVED');
    expect(propertyApprovalDialogMessage).toMatch(/approved successfully/i);
    expect(propertyApprovalDialogMessage).not.toMatch(/error|failed/i);""",
)

# An assigned Technician list query already had a narrow rule predicate, but a
# direct mission document reload fell through the much larger participant rule.
# Add an equally narrow assigned-Technician get predicate without widening role,
# approval, suspension, or assignment requirements.
replace_once(
    "firestore.rules",
    """    function canListAssignedTechnicianTicket(data) {
      // This narrow predicate is intentionally separate from participantCanRead.
      // Firestore can prove the assignment equality from the client query without
      // evaluating every Owner, Tenant, Broker and dispatcher branch per result.
      return signedIn() &&
        claimedRole() in ['technician', 'tech'] &&
        data.get('assignedTechnicianId', null) == request.auth.uid &&
        hasApprovedTechnicianRecord() &&
        isNotSuspended();
    }

    function participantCanRead(data) { return isAdmin() || ownerCanRead(data) || tenantOwns(data) || (isApprovedTechnician() && techOwns(data)) || brokerOwns(data); }""",
    """    function canListAssignedTechnicianTicket(data) {
      // This narrow predicate is intentionally separate from participantCanRead.
      // Firestore can prove the assignment equality from the client query without
      // evaluating every Owner, Tenant, Broker and dispatcher branch per result.
      return signedIn() &&
        claimedRole() in ['technician', 'tech'] &&
        data.get('assignedTechnicianId', null) == request.auth.uid &&
        hasApprovedTechnicianRecord() &&
        isNotSuspended();
    }

    function canGetAssignedTechnicianTicket(data) {
      // Direct mission reloads must use the same fail-closed Technician boundary
      // without evaluating unrelated Owner, Tenant, Broker and dispatcher paths.
      return signedIn() &&
        claimedRole() in ['technician', 'tech'] &&
        techOwns(data) &&
        hasApprovedTechnicianRecord() &&
        isNotSuspended();
    }

    function participantCanRead(data) { return isAdmin() || ownerCanRead(data) || tenantOwns(data) || (isApprovedTechnician() && techOwns(data)) || brokerOwns(data); }""",
)
replace_once(
    "firestore.rules",
    """    match /tickets/{ticketId} {
      allow list: if canListAssignedTechnicianTicket(resource.data);
      allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());""",
    """    match /tickets/{ticketId} {
      allow list: if canListAssignedTechnicianTicket(resource.data);
      allow get: if canGetAssignedTechnicianTicket(resource.data);
      allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());""",
)
replace_once(
    "firestore.rules",
    """    match /maintenanceTickets/{ticketId} {
      allow list: if canListAssignedTechnicianTicket(resource.data);
      allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());""",
    """    match /maintenanceTickets/{ticketId} {
      allow list: if canListAssignedTechnicianTicket(resource.data);
      allow get: if canGetAssignedTechnicianTicket(resource.data);
      allow read: if isNotSuspended() && (participantCanRead(resource.data) || canDispatchJobs());""",
)

# Canonicalize protected Technician custom claims before the browser signs in,
# preserving any unrelated claims while guaranteeing the exact rule vocabulary.
replace_once(
    "tests/e2e/business-technician.spec.ts",
    """    const technician = await admin.auth().getUserByEmail(EMAIL);
    technicianUid = technician.uid;
    const suffix = technicianUid.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48);""",
    """    const technician = await admin.auth().getUserByEmail(EMAIL);
    technicianUid = technician.uid;
    await admin.auth().setCustomUserClaims(technicianUid, {
      ...(technician.customClaims || {}),
      role: 'technician',
      userRole: 'technician',
      primaryRole: 'technician',
      technician: true,
      admin: false,
      isAdmin: false,
      superAdmin: false,
      super_admin: false,
      suspended: false,
    });
    const canonicalTechnician = await admin.auth().getUser(technicianUid);
    expect(canonicalTechnician.customClaims).toMatchObject({
      role: 'technician',
      userRole: 'technician',
      primaryRole: 'technician',
      technician: true,
      suspended: false,
    });
    const suffix = technicianUid.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48);""",
)

# The Tenant cross-role proof must perform the real Technician-owned before-work
# upload before attempting the server-protected ARRIVED -> IN_PROGRESS change.
replace_once(
    "tests/e2e/business-tenant.spec.ts",
    """    expect(lifecycleStatus).toBe('ARRIVED');
    await expect(page.locator('body')).toContainText(/ARRIVED|PRE-WORK SAFETY PROTOCOL|Status updated/i, { timeout: 25_000 });

    const ppe = page.locator('#ppe');""",
    """    expect(lifecycleStatus).toBe('ARRIVED');
    await expect(page.locator('body')).toContainText(/ARRIVED|PRE-WORK SAFETY PROTOCOL|Status updated/i, { timeout: 25_000 });

    const beforeWorkInput = page.getByTestId('technician-before-work-file');
    await expect(beforeWorkInput).toHaveCount(1);
    await beforeWorkInput.setInputFiles({
      name: `technician-before-${ticketId}.png`,
      mimeType: 'image/png',
      buffer: IMAGE_BUFFER,
    });
    await expect(page.getByTestId('technician-before-work-success')).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => {
      const beforeWorkSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const beforeWork = beforeWorkSnap.data() || {};
      return Boolean(beforeWork.technicianBeforePhotoUrl)
        || (Array.isArray(beforeWork.technicianBeforePhotos) && beforeWork.technicianBeforePhotos.length > 0);
    }, { timeout: 45_000, message: 'Technician before-work evidence must persist before Start Work.' }).toBe(true);

    const ppe = page.locator('#ppe');""",
)

# Match the browser button state to the callable's mandatory before-work proof
# gate so users receive an explicit instruction instead of a rejected transition.
replace_once(
    "src/technician/pages/TechnicianJobDetailPage.tsx",
    """    const hasTenantBeforeProof = Boolean(ticket?.beforePhotoUrl)
        || listLength(ticket?.beforePhotos) > 0
        || listLength(ticket?.tenantPhotos) > 0
        || listLength(ticket?.photos) > 0
        || listLength(ticket?.initialPhotoUrls) > 0;
    const hasAfterProof = hasAnyPhoto || hasExistingAfterProof;""",
    """    const hasTenantBeforeProof = Boolean(ticket?.beforePhotoUrl)
        || listLength(ticket?.beforePhotos) > 0
        || listLength(ticket?.tenantPhotos) > 0
        || listLength(ticket?.photos) > 0
        || listLength(ticket?.initialPhotoUrls) > 0;
    const hasTechnicianBeforeProof = Boolean(ticket?.technicianBeforePhotoUrl)
        || listLength(ticket?.technicianBeforePhotos) > 0;
    const hasAfterProof = hasAnyPhoto || hasExistingAfterProof;""",
)
replace_once(
    "src/technician/pages/TechnicianJobDetailPage.tsx",
    """                                        <Button variant="outlined" disabled={actionLoading || status !== 'ARRIVED' || !ppeChecked || !safetyChecked} startIcon={<Play />} onClick={() => updateLifecycle('IN_PROGRESS')} sx={{ color: '#10b981', borderColor: '#10b981', fontWeight: 950 }}>{tx('tech.job.start_work', 'Start Work')}</Button>""",
    """                                        <Button data-testid="technician-start-work" variant="outlined" disabled={actionLoading || status !== 'ARRIVED' || !hasTechnicianBeforeProof || !ppeChecked || !safetyChecked} startIcon={<Play />} onClick={() => updateLifecycle('IN_PROGRESS')} sx={{ color: '#10b981', borderColor: '#10b981', fontWeight: 950 }}>{tx('tech.job.start_work', 'Start Work')}</Button>""",
)
replace_once(
    "src/technician/pages/TechnicianJobDetailPage.tsx",
    """                                    {status === 'ARRIVED' && (
                                        <Paper sx={{ p: 2, bgcolor: alpha('#f59e0b', 0.05), border: `1px dashed ${alpha('#f59e0b', 0.3)}`, borderRadius: 3 }}>
                                            <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 950, display: 'block', mb: 1 }}>{tx('tech.job.safety_check', 'PRE-WORK SAFETY PROTOCOL')}</Typography>""",
    """                                    {status === 'ARRIVED' && (
                                        <Paper sx={{ p: 2, bgcolor: alpha('#f59e0b', 0.05), border: `1px dashed ${alpha('#f59e0b', 0.3)}`, borderRadius: 3 }}>
                                            {!hasTechnicianBeforeProof && (
                                                <Alert data-testid="technician-start-work-proof-required" severity="warning" sx={{ mb: 2 }}>
                                                    {tx('tech.job.before_work_required', 'Capture and verify the before-work site photo above before Start Work can be enabled.')}
                                                </Alert>
                                            )}
                                            <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 950, display: 'block', mb: 1 }}>{tx('tech.job.safety_check', 'PRE-WORK SAFETY PROTOCOL')}</Typography>""",
)

print("Sixth-round production evidence transformations applied successfully.")
