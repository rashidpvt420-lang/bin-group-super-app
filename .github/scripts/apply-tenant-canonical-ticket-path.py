from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one marker, found {count}")
    return source.replace(old, new, 1)


page_path = Path("src/tenant/pages/TenantRequestPage.tsx")
page = page_path.read_text(encoding="utf-8")
page = replace_once(page, "import React, { useState, useEffect } from 'react';", "import React, { useState, useEffect, useRef } from 'react';", "TenantRequest React imports")
page = replace_once(
    page,
    "import { db, storage, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs, doc, getDoc, ref, uploadBytes, getDownloadURL } from '../../lib/firebase';",
    "import { db, storage, functions, collection, updateDoc, serverTimestamp, query, where, getDocs, doc, getDoc, ref, uploadBytes, getDownloadURL, httpsCallable } from '../../lib/firebase';",
    "TenantRequest Firebase imports",
)
page = replace_once(
    page,
    '''    // Property/unit lookup is async (see fetchResidence below); these derive whether the
    // form has enough real data to be submitted, so the submit button itself can stay
    // disabled during the load window instead of only failing inside handleSubmit after
    // the user has already filled out the form and clicked dispatch.
    const propertyLocationSource =
        propertyData?.location ||
        propertyData?.propertyLocation ||
        propertyData?.geoPoint ||
        propertyData;

    const propertyLat = Number(
        propertyLocationSource?.lat ??
        propertyLocationSource?.latitude ??
        0
    );

    const propertyLng = Number(
        propertyLocationSource?.lng ??
        propertyLocationSource?.longitude ??
        0
    );

    const propertyContextReady =
        residenceChecked &&
        Boolean(unitData) &&
        Boolean(propertyData);

    const propertyGpsReady =
        propertyContextReady &&
        Number.isFinite(propertyLat) &&
        Number.isFinite(propertyLng) &&
        propertyLat !== 0 &&
        propertyLng !== 0;
''',
    '''    const clientRequestIdRef = useRef('');

    // This is a display/readiness hint only. The callable independently reads and
    // validates canonical property geo before it creates any dispatchable ticket.
    const propertyContextReady =
        residenceChecked &&
        Boolean(unitData) &&
        Boolean(propertyData);
    const canonicalGeo = propertyData?.geo;
    const canonicalGeoVerification = propertyData?.geoVerification;
    const canonicalLat = Number(canonicalGeo?.lat ?? canonicalGeo?.point?.latitude);
    const canonicalLng = Number(canonicalGeo?.lng ?? canonicalGeo?.point?.longitude);
    const canonicalVerifier = String(canonicalGeo?.verifiedBy || '').trim();
    const verificationActor = String(canonicalGeoVerification?.verifiedBy || '').trim();
    const propertyGpsReady =
        propertyContextReady &&
        Number.isFinite(canonicalLat) &&
        Number.isFinite(canonicalLng) &&
        canonicalLat >= -90 &&
        canonicalLat <= 90 &&
        canonicalLng >= -180 &&
        canonicalLng <= 180 &&
        !(canonicalLat === 0 && canonicalLng === 0) &&
        canonicalGeo?.verified === true &&
        canonicalGeo?.dispatchReady === true &&
        canonicalGeo?.requiresGeoReview !== true &&
        Number(canonicalGeo?.verificationVersion) === 1 &&
        Boolean(canonicalGeo?.verifiedAt) &&
        Boolean(canonicalVerifier) &&
        canonicalVerifier === verificationActor &&
        canonicalGeoVerification?.state === 'VERIFIED' &&
        canonicalGeoVerification?.source === 'FOUNDER_MFA_REVIEW' &&
        Number(canonicalGeoVerification?.verificationVersion) === 1;

    const stableClientRequestId = () => {
        if (!clientRequestIdRef.current) {
            const randomPart =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            clientRequestIdRef.current = `tenant_web_${randomPart}`;
        }
        return clientRequestIdRef.current;
    };
''',
    "TenantRequest canonical property readiness",
)
page = replace_once(
    page,
    '''        const jobLocation = propertyGpsReady ? {
            lat: propertyLat,
            lng: propertyLng,
            latitude: propertyLat,
            longitude: propertyLng,
            address:
                propertyData?.address ||
                propertyData?.locationAddress ||
                propertyLocationSource?.address ||
                '',
            source: 'property',
        } : null;

        if (!jobLocation) {
            alert('Please confirm exact service location before submitting. Property GPS location is missing — contact management.');
            return;
        }

        if (!unitData.propertyId) {
''',
    '''        if (!propertyGpsReady) {
            alert('This property is still waiting for Founder-verified dispatch geography. Contact management before submitting.');
            return;
        }

        if (!unitData.propertyId) {
''',
    "TenantRequest browser jobLocation removal",
)
page = replace_once(
    page,
    '''            const docRef = await addDoc(collection(db, 'maintenanceTickets'), {
                requesterRole: 'tenant',
                tenantId: user.uid,
                tenantUid: user.uid,
                tenantName: user.displayName || 'Resident',
                tenantPhone: user.phoneNumber || '',
                tenantEmail: user.email || '',
                requesterId: user.uid,
                requesterEmail: user.email || '',
                reporterEmail: user.email || '',
                createdBy: user.uid,
                createdByUid: user.uid,
                propertyId: unitData.propertyId || '',
                propertyName: propertyData?.name || propertyData?.propertyName || '',
                ownerId: propertyData?.ownerId || '',
                ownerUid: propertyData?.ownerUid || propertyData?.ownerId || '',
                ownerEmail: propertyData?.ownerEmail || '',
                unitId: unitData.id,
                unitNumber: unitData.unitNumber || '',
                floor: unitData.floorNumber || '',
                category,
                priority,
                slaPriority: selectedSlaKey,
                slaLabel: selectedSlaPolicy.label,
                description: description.trim(),
                specificLocation: cleanLocation,
                serviceLocationDetail: cleanLocation,
                serviceLocationRequired: true,
                serviceLocationVerified: true,
                photos: [],
                primaryPhotoUrl: '',
                jobLocation,
                photoEvidenceRequired: true,
                evidenceStatus: 'PENDING_TENANT_UPLOAD',
                source: 'TENANT_PORTAL',
                status: 'OPEN',
                dispatchStatus: 'PENDING_ASSIGNMENT',
                trackingStatus: 'WAITING_FOR_TECHNICIAN',
                technicianId: null,
                assignedTechnicianId: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                slaMinutes: selectedSlaMinutes,
                canonicalSlaVersion: 'uae-domination-2026-07-04',
            });
            createdTicketId = docRef.id;
''',
    '''            const createTenantServiceTicket = httpsCallable(functions, 'createTenantServiceTicket');
            const response: any = await createTenantServiceTicket({
                kind: 'AI_CONCIERGE',
                unitId: unitData.id,
                propertyId: unitData.propertyId,
                clientRequestId: stableClientRequestId(),
                details: {
                    category,
                    priority,
                    description: description.trim(),
                    specificLocation: cleanLocation,
                    photoEvidenceExpected: true,
                },
            });
            createdTicketId = String(response?.data?.ticketId || '').trim();
            if (!createdTicketId) {
                throw new Error('The server did not return a maintenance ticket ID.');
            }
''',
    "TenantRequest callable creation",
)
page = page.replace("uploadPhotosToStorage(docRef.id)", "uploadPhotosToStorage(createdTicketId)")
page = page.replace("doc(db, 'maintenanceTickets', docRef.id)", "doc(db, 'maintenanceTickets', createdTicketId)")
page = page.replace("notifyEmergency(docRef.id,", "notifyEmergency(createdTicketId,")
page = page.replace("notifyTicketCreated(docRef.id,", "notifyTicketCreated(createdTicketId,")
for forbidden in ["addDoc(collection(db, 'maintenanceTickets')", "const jobLocation = propertyGpsReady", "propertyData?.location ||", "propertyData?.propertyLocation ||", "propertyData?.geoPoint ||"]:
    if forbidden in page:
        raise SystemExit(f"TenantRequest forbidden browser creation fragment remains: {forbidden}")
page_path.write_text(page, encoding="utf-8")

rules_path = Path("firestore.rules")
rules = rules_path.read_text(encoding="utf-8")
legacy_create = "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);"
if rules.count(legacy_create) != 2:
    raise SystemExit(f"Ticket create rule count was {rules.count(legacy_create)}, expected 2")
rules = rules.replace(legacy_create, "      allow create: if isAdmin();")
rules_path.write_text(rules, encoding="utf-8")

binding_path = Path("scripts/apply-ticket-rule-binding.mjs")
binding = binding_path.read_text(encoding="utf-8")
binding = replace_once(
    binding,
    '''const canonicalCreate = "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);";
for (const legacyCreate of [
''',
    '''const canonicalCreate = "      allow create: if isAdmin();";
for (const legacyCreate of [
  "      allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);",
''',
    "ticket binding canonical create",
)
binding = replace_once(
    binding,
    '''if (!text.includes(canonicalCreate)) {
  throw new Error('[ticket-rule-binding] Ticket creation is not callable/admin or tenant-binding authoritative.');
}
''',
    '''for (const marker of ['    match /tickets/{ticketId} {', '    match /maintenanceTickets/{ticketId} {']) {
  const start = text.indexOf(marker);
  const block = start < 0 ? '' : text.slice(start, start + 700);
  if (!block.includes(canonicalCreate)) {
    throw new Error(`[ticket-rule-binding] ${marker} must deny direct browser ticket creation outside Admin authority.`);
  }
}
if (text.includes("allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);")) {
  throw new Error('[ticket-rule-binding] Direct Tenant ticket creation remains enabled.');
}
''',
    "ticket binding create verification",
)
binding_path.write_text(binding, encoding="utf-8")

verify_path = Path("scripts/verify-firestore-launch-hardening.mjs")
verify = verify_path.read_text(encoding="utf-8")
verify = replace_once(
    verify,
    '''  ['tenant ticket create without unit/property validation', "ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);"],
''',
    '''  ['tenant ticket create without unit/property validation', "ownerDraftCreate(request.resource.data) || tenantOwns(request.resource.data);"],
  ['direct Tenant browser ticket creation', 'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);'],
''',
    "Firestore verifier direct Tenant create forbidden",
)
verify = replace_once(
    verify,
    '''  ['tenant ticket unit/property binding helper', 'function canCreateTenantBoundTicket(data) {'],
  ['tenant ticket create uses binding helper', 'allow create: if isAdmin() || canCreateTenantBoundTicket(request.resource.data);'],
''',
    '''  ['ticket creation is callable/Admin only', 'allow create: if isAdmin();'],
''',
    "Firestore verifier server-only ticket creation",
)
verify = replace_once(
    verify,
    '''if (rules.split('allow update: if safeTicketUpdateByActor();').length - 1 !== 2) failures.push('Single ticket update gate must exist exactly twice.');
''',
    '''for (const marker of ['    match /tickets/{ticketId} {', '    match /maintenanceTickets/{ticketId} {']) {
  const start = rules.indexOf(marker);
  const block = start < 0 ? '' : rules.slice(start, start + 700);
  if (!block.includes('allow create: if isAdmin();')) {
    failures.push(`${marker} must require the server/Admin creation path.`);
  }
}
if (rules.split('allow update: if safeTicketUpdateByActor();').length - 1 !== 2) failures.push('Single ticket update gate must exist exactly twice.');
''',
    "Firestore verifier ticket block checks",
)
verify_path.write_text(verify, encoding="utf-8")

security_path = Path("test/security-rules.test.js")
security = security_path.read_text(encoding="utf-8")
security = replace_once(
    security,
    '''  it('tenant ticket creation: tenant must use their own assigned unit and matching property', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'units/unit_a'), { tenantId: 'tenant_a', propertyId: 'prop_a', ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'units/unit_b'), { tenantId: 'tenant_b', propertyId: 'prop_b', ownerId: 'owner_b' });

    const tenantADb = testEnv.authenticatedContext('tenant_a', { role: 'tenant', email: 'tenant-a@example.com' }).firestore();

    await assertSucceeds(setDoc(doc(tenantADb, 'maintenanceTickets/tenant_valid_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_a',
      propertyId: 'prop_a',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    }));

    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/wrong_property_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_a',
      propertyId: 'prop_b',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    }));

    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/wrong_unit_ticket'), {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_b',
      propertyId: 'prop_b',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    }));
  });
''',
    '''  it('tenant ticket creation: browser clients must use the App Check callable', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'units/unit_a'), { tenantId: 'tenant_a', propertyId: 'prop_a', ownerId: 'owner_a' });

    const tenantADb = testEnv.authenticatedContext('tenant_a', { role: 'tenant', email: 'tenant-a@example.com' }).firestore();
    const directTicket = {
      tenantId: 'tenant_a',
      tenantUid: 'tenant_a',
      unitId: 'unit_a',
      propertyId: 'prop_a',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    };

    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/direct_maintenance_ticket'), directTicket));
    await assertFails(setDoc(doc(tenantADb, 'tickets/direct_legacy_ticket'), directTicket));
    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/forged_location_ticket'), {
      ...directTicket,
      jobLocation: { lat: 24.999, lng: 55.999, source: 'browser_forged' },
    }));
  });
''',
    "Tenant direct ticket rules regression",
)
security_path.write_text(security, encoding="utf-8")

launch_path = Path("tests/launch/property-geo-authority.test.mjs")
launch = launch_path.read_text(encoding="utf-8")
launch = replace_once(
    launch,
    "const ownerTickets = readFileSync('functions/ownerMaintenanceOperations.ts', 'utf8');\n",
    "const ownerTickets = readFileSync('functions/ownerMaintenanceOperations.ts', 'utf8');\nconst tenantRequestPage = readFileSync('src/tenant/pages/TenantRequestPage.tsx', 'utf8');\nconst ticketRuleBinding = readFileSync('scripts/apply-ticket-rule-binding.mjs', 'utf8');\n",
    "property geo launch Tenant form fixtures",
)
launch = replace_once(
    launch,
    "test('Admin map and all ticket callables require the same canonical verification', () => {\n",
    '''test('normal Tenant maintenance requests use the canonical callable and direct Firestore creation is denied', () => {
  assert.match(tenantRequestPage, /httpsCallable\(functions, 'createTenantServiceTicket'\)/);
  assert.match(tenantRequestPage, /kind: 'AI_CONCIERGE'/);
  assert.match(tenantRequestPage, /clientRequestId: stableClientRequestId\(\)/);
  assert.doesNotMatch(tenantRequestPage, /addDoc\(collection\(db, 'maintenanceTickets'\)/);
  assert.doesNotMatch(tenantRequestPage, /jobLocation\s*[,}]/);
  assert.doesNotMatch(rules, /allow create: if isAdmin\(\) \|\| canCreateTenantBoundTicket/);
  assert.match(ticketRuleBinding, /const canonicalCreate = "      allow create: if isAdmin\(\);"/);
});

test('Admin map and all ticket callables require the same canonical verification', () => {
''',
    "property geo launch Tenant form contract",
)
launch_path.write_text(launch, encoding="utf-8")

print("Tenant ticket creation is callable-only and canonical property geo remains server-authoritative.")
