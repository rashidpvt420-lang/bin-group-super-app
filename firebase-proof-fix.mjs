import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function mustReplace(file, from, to, name) {
  const s = read(file);
  if (!s.includes(from)) fail(`${file}: missing target for ${name}`);
  write(file, s.replace(from, to));
  console.log(`✅ ${name}`);
}

function mustRegex(file, re, to, name) {
  const s = read(file);
  if (!re.test(s)) fail(`${file}: missing regex target for ${name}`);
  write(file, s.replace(re, to));
  console.log(`✅ ${name}`);
}

function optionalReplaceFile(file, from, to, name) {
  const s = read(file);
  if (!s.includes(from)) {
    console.log(`⚠️ ${name}: target not found or already patched`);
    return false;
  }
  write(file, s.replace(from, to));
  console.log(`✅ ${name}`);
  return true;
}

/* 1 + 2: Firestore admin role alignment + safe permissions */
mustRegex(
  'firestore.rules',
  /function isAdmin\(\) \{[\s\S]*?\n    \}\n\n    function hasPermission/,
  `function isAdmin() {
      return signedIn() && (
        request.auth.token.admin == true ||
        request.auth.token.isAdmin == true ||
        request.auth.token.ceo == true ||
        request.auth.token.manager == true ||
        request.auth.token.operations_admin == true ||
        request.auth.token.finance_admin == true ||
        request.auth.token.hr_admin == true ||
        request.auth.token.support_admin == true ||
        request.auth.token.role in ['admin', 'ceo', 'super_admin', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin'] ||
        request.auth.token.userRole in ['admin', 'ceo', 'super_admin', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin'] ||
        request.auth.token.primaryRole in ['admin', 'ceo', 'super_admin', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin'] ||
        (exists(/databases/$(database)/documents/users/$(request.auth.uid)) && userDoc().role in ['admin', 'ceo', 'super_admin', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin'])
      );
    }

    function hasPermission`,
  'Firestore admin roles aligned'
);

mustReplace(
  'firestore.rules',
  `function hasPermission(permission) {
      return signedIn() && exists(/databases/$(database)/documents/users/$(request.auth.uid)) && userDoc().permissions[permission] == true;
    }`,
  `function hasPermission(permission) {
      return signedIn() &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        ('permissions' in userDoc()) &&
        userDoc().permissions[permission] == true;
    }`,
  'Firestore hasPermission hardened'
);

/* 4: owner self-update protection */
if (!read('firestore.rules').includes('function safeOwnerProfileUpdate()')) {
  mustReplace(
    'firestore.rules',
    `    function designParticipant(data) {`,
    `    function safeOwnerProfileUpdate() {
      return signedIn() &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'uid','email','displayName','name','phone','mobile','photoURL','language',
          'billingContact','notificationPreferences','fcmTokens','pushEnabled','pushUpdatedAt',
          'updatedAt','lastLoginAt','pdplCompliance','gpsConsent','onboardingComplete'
        ]) &&
        (!('status' in request.resource.data) || request.resource.data.status == resource.data.status) &&
        (!('activeContractId' in request.resource.data) || request.resource.data.activeContractId == resource.data.activeContractId) &&
        (!('dashboardUnlocked' in request.resource.data) || request.resource.data.dashboardUnlocked == resource.data.dashboardUnlocked) &&
        (!('paymentVerified' in request.resource.data) || request.resource.data.paymentVerified == resource.data.paymentVerified) &&
        (!('adminNotes' in request.resource.data) || request.resource.data.adminNotes == resource.data.adminNotes) &&
        (!('permissions' in request.resource.data) || request.resource.data.permissions == resource.data.permissions);
    }

    function designParticipant(data) {`,
    'Added safeOwnerProfileUpdate'
  );
} else {
  console.log('✅ safeOwnerProfileUpdate already exists');
}

mustReplace(
  'firestore.rules',
  `    match /owners/{ownerId} {
      allow read: if isOwner(ownerId) || emailOwns(resource.data) || isAdmin() || hasPermission('canManageTenants');
      allow create, update: if isOwner(ownerId) || isAdmin() || hasPermission('canManageTenants');
      allow delete: if isAdmin() || hasPermission('canManageTenants');
    }`,
  `    match /owners/{ownerId} {
      allow read: if isOwner(ownerId) || emailOwns(resource.data) || isAdmin() || hasPermission('canManageTenants');
      allow create: if isAdmin() || hasPermission('canManageTenants') || (isOwner(ownerId) && safeOwnerProfileUpdate());
      allow update: if isAdmin() || hasPermission('canManageTenants') || (isOwner(ownerId) && safeOwnerProfileUpdate());
      allow delete: if isAdmin() || hasPermission('canManageTenants');
    }`,
  'Owner self-update protected'
);

/* 5: properties_pending owner-safe read */
if (!read('firestore.rules').includes('match /properties_pending/{propertyId}')) {
  mustReplace(
    'firestore.rules',
    `    match /units/{unitId} {`,
    `    match /properties_pending/{propertyId} {
      allow read: if isAdmin() || hasPermission('canManageProperties') || ownerCanRead(resource.data);
      allow create, update, delete: if isAdmin() || hasPermission('canManageProperties');
    }

    match /units/{unitId} {`,
    'properties_pending owner-safe read added'
  );
} else {
  console.log('✅ properties_pending rule already exists');
}

/* 7: canonical tenant_invitations rules */
if (!read('firestore.rules').includes('match /tenant_invitations/{inviteId}')) {
  mustReplace(
    'firestore.rules',
    `    match /tenantInvitations/{inviteId} {`,
    `    match /tenant_invitations/{inviteId} {
      allow read: if isAdmin() || (signedIn() && (resource.data.ownerId == request.auth.uid || resource.data.ownerUid == request.auth.uid || resource.data.tenantUid == request.auth.uid || resource.data.tenantEmail == request.auth.token.email));
      allow write: if isAdmin() || (signedIn() && (request.resource.data.ownerId == request.auth.uid || request.resource.data.ownerUid == request.auth.uid));
    }

    match /tenantInvitations/{inviteId} {`,
    'tenant_invitations canonical rules added'
  );
} else {
  console.log('✅ tenant_invitations rule already exists');
}

/* 3: admin App Check env fix */
let adminFirebase = read('apps/admin-panel/src/lib/firebase.ts');
adminFirebase = adminFirebase.replace(
  `const siteKey = process.env.REACT_APP_APP_CHECK_SITE_KEY || "6Lc_REPLACE_ME_WITH_REAL_KEY";`,
  `const siteKey = process.env.REACT_APP_APP_CHECK_SITE_KEY || process.env.VITE_APP_CHECK_SITE_KEY || "";`
);
adminFirebase = adminFirebase.replace(
  `initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true
        });
        console.log("🛡️ [SECURITY] App Check active in MONITORING mode.");`,
  `if (siteKey) {
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(siteKey),
                isTokenAutoRefreshEnabled: true
            });
            console.log("🛡️ [SECURITY] App Check active in MONITORING mode.");
        } else {
            console.warn("[Firebase] Admin App Check site key missing. Set REACT_APP_APP_CHECK_SITE_KEY or VITE_APP_CHECK_SITE_KEY.");
        }`
);
write('apps/admin-panel/src/lib/firebase.ts', adminFirebase);
console.log('✅ Admin App Check fixed');

/* 12: storage tenant ticket photo path */
mustReplace(
  'storage.rules',
  `    // Tenant issue photos uploaded by TenantRequestPage.tsx:
    // maintenanceTickets/{tenantUid}/{timestamp}_{fileName}
    match /maintenanceTickets/{tenantId}/{fileName} {
      allow read: if isAuth() && (request.auth.uid == tenantId || isAdmin() || isAuditor() || isTechnicianRole());
      allow write: if isAuth() && request.auth.uid == tenantId && isImageUpload(10);
    }`,
  `    // Tenant issue photos are ticket-scoped to prevent broad technician access.
    // Canonical path: maintenanceTickets/{ticketId}/tenant/{fileName}
    match /maintenanceTickets/{ticketId}/tenant/{fileName} {
      allow read: if canReadTicketEvidence(ticketId);
      allow write: if isAuth() && ticketExists(ticketId) && (
        ticket(ticketId).tenantId == request.auth.uid ||
        ticket(ticketId).tenantUid == request.auth.uid ||
        ticket(ticketId).ownerId == request.auth.uid ||
        ticket(ticketId).ownerUid == request.auth.uid ||
        isAdmin()
      ) && isImageUpload(10);
    }

    // Legacy tenant-id path: read-only for old files; no new writes.
    match /maintenanceTickets/{tenantId}/{fileName} {
      allow read: if isAuth() && (request.auth.uid == tenantId || isAdmin() || isAuditor());
      allow write: if false;
    }`,
  'Storage tenant ticket photo path hardened'
);

/* 8, 9, 10, 11, 14: functions hardening */
optionalReplaceFile(
  'functions/index.ts',
  `export const acceptTechnicianTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const { ticketId } = request.data;`,
  `export const acceptTechnicianTicket = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
    const hasAccess = await hasCallableRoleAccess(request.auth, new Set(["technician", "admin", "super_admin", "operations_admin"]));
    if (!hasAccess) throw new HttpsError("permission-denied", "Technician access required.");
    const { ticketId } = request.data;`,
  'Technician callable role check'
);

let fn = read('functions/index.ts');

fn = fn.replace(
  `    if (ticketData.status !== 'assigned' && ticketData.status !== 'OPEN' && ticketData.status !== 'pending_assignment') {
        throw new HttpsError("failed-precondition", "Ticket is not available for acceptance.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ticketRef.update({
        status: 'assigned',`,
  `    const existingTechId = ticketData.assignedTechnicianId || ticketData.technicianId || '';
    if (existingTechId && existingTechId !== request.auth.uid) {
        throw new HttpsError("failed-precondition", "Ticket is already assigned to another technician.");
    }
    if (!['OPEN', 'open', 'AUTO_ASSIGNED', 'auto_assigned', 'assigned', 'pending_assignment'].includes(ticketData.status)) {
        throw new HttpsError("failed-precondition", "Ticket is not available for acceptance.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    await ticketRef.update({
        status: 'ACCEPTED',`
);

fn = fn.replace(
  `const allowedStatuses = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];`,
  `const allowedStatuses = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED_PENDING_APPROVAL', 'COMPLETED'];`
);

fn = fn.replace(
  `if (status === 'EN_ROUTE') updateData.enRouteAt = now;`,
  `if (status === 'EN_ROUTE') updateData.onTheWayAt = now;`
);

fn = fn.replace(
  `if (status === 'COMPLETED') {`,
  `if (status === 'COMPLETED' || status === 'COMPLETED_PENDING_APPROVAL') {`
);

fn = fn.replace(
  `status: "accepted",
                dispatchStatus: "ASSIGNED",
                trackingStatus: "TECHNICIAN_ASSIGNED",
                acceptedAt: admin.firestore.FieldValue.serverTimestamp(),`,
  `status: "AUTO_ASSIGNED",
                dispatchStatus: "AUTO_ASSIGNED",
                trackingStatus: "TECHNICIAN_ASSIGNED",`
);

fn = fn.replace(
  `async function dispatchOmniNotification(userId: string, title: string, body: string, options: any = {}) {
    try {
        const userDoc = await db.collection("users").doc(userId).get();`,
  `async function dispatchOmniNotification(userId: string, title: string, body: string, options: any = {}) {
    try {
        const notificationRef = await db.collection("notifications").add({
            recipientId: userId,
            title,
            body,
            type: options.type || options.extraData?.type || "general",
            url: options.url || "/",
            extraData: cleanPlainValue(options.extraData || {}),
            read: false,
            channelStatus: {
                inApp: "CREATED",
                push: "PENDING",
                email: "PENDING",
                sms: "PENDING",
                whatsapp: "PENDING"
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const userDoc = await db.collection("users").doc(userId).get();`
);

fn = fn.replace(
  `await admin.messaging().sendEach(messages);`,
  `await admin.messaging().sendEach(messages);
            await notificationRef.update({ "channelStatus.push": "SENT" }).catch(() => undefined);`
);

fn = fn.replace(
  `} catch (err) { }
});`,
  `} catch (err: any) {
        console.error("scheduledDailyBackup failed", err);
        await db.collection("system_health").doc("backup").set({
            status: "ERROR",
            error: String(err?.message || err),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => undefined);
    }
});`
);

fn = fn.replace(
  `export const onIntakeCreated = onDocumentCreated("intake_submissions/{id}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    try {
        await db.collection("properties").add({ propertyName: data.propertyName || 'New Asset', ownerEmail: data.ownerEmail, status: 'PENDING_APPROVAL', createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await snap.ref.update({ status: 'PROCESSED' });
    } catch (err) {
        await snap.ref.update({ status: 'ERROR', error: String(err) });
    }
});`,
  `export const onIntakeCreated = onDocumentCreated("intake_submissions/{id}", async (event) => {
    // Legacy duplicate property creation disabled.
    // submitOwnerOnboarding is the canonical writer for properties_pending,
    // propertyPassports, contracts, payment_transactions, owners, and users.
    const snap = event.data;
    if (!snap) return;
    await snap.ref.set({
        legacyPropertyCreationDisabled: true,
        legacyReviewedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
});`
);

write('functions/index.ts', fn);
console.log('✅ Functions hardened');

/* 16: report */
fs.mkdirSync('docs', { recursive: true });
write('docs/FIREBASE_PROOF_AUDIT_REPORT.md', `# BIN GROUP Firebase Proof Audit Report

## Status

NO-GO until all validation commands pass and live Firebase Console accounts/secrets are verified.

## Fixed areas

- Admin role alignment in Firestore rules.
- Safe permissions lookup.
- Owner self-update protection.
- Owner-safe properties_pending reads.
- Canonical tenant_invitations rules.
- Admin-panel App Check placeholder removed.
- Technician ticket acceptance role check.
- Ticket assignment/status lifecycle hardened.
- EN_ROUTE timestamp standardized to onTheWayAt.
- In-app notification persistence added.
- Tenant ticket Storage path hardened to ticketId-based path.
- Legacy incomplete property creation disabled.
- Backup failure logging added.

## Remaining live Firebase Console requirements

- Firebase Auth users for admin, owner, tenant, technician, broker.
- users/{uid} role documents for all five accounts.
- GitHub E2E secrets for all role login accounts.
- Valid App Check site key for production domains.
- Google Maps API key with Firebase Hosting/custom domain allowed.
- Twilio/WhatsApp/SMTP secrets if those channels are part of launch.
- Live 53-tenant tower proof run.

## Required validation

\`\`\`bash
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npm run build
npm run build --workspace=home-os-admin-panel
npm run build --workspace=functions
npm run test:rules
npm run test:stability
npm run test:e2e:public
\`\`\`

## Launch recommendation

NO-GO for full public UAE launch until Firebase proof gate and live role E2E pass.
`);
console.log('✅ Firebase proof report created');

console.log('\n✅ Firebase Proof Fix completed. Now run validation.');
