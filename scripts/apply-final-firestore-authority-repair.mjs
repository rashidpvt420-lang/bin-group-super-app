import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function replaceExactly(source, legacy, canonical, label) {
  const legacyCount = source.split(legacy).length - 1;
  const canonicalCount = source.split(canonical).length - 1;
  if (legacyCount === 0 && canonicalCount === 1) return source;
  if (legacyCount !== 1 || canonicalCount !== 0) {
    throw new Error(`[final-authority-repair] ${label}: legacy=${legacyCount}, canonical=${canonicalCount}`);
  }
  return source.replace(legacy, canonical);
}

const hardener = spawnSync(process.execPath, ['scripts/harden-final-firestore-authority.mjs'], {
  encoding: 'utf8',
});
if (hardener.status !== 0) {
  throw new Error(hardener.stderr || hardener.stdout || 'Final Firestore hardener failed.');
}
process.stdout.write(hardener.stdout);

const packagePath = 'package.json';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
packageJson.scripts['harden:final-firestore-authority'] = 'node scripts/harden-final-firestore-authority.mjs';
if (!packageJson.scripts['prepare:rules'].includes('harden:final-firestore-authority')) {
  packageJson.scripts['prepare:rules'] += ' && npm run harden:final-firestore-authority';
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const regressionPath = 'test/full-system-regressions.test.mjs';
let regression = readFileSync(regressionPath, 'utf8');
regression = replaceExactly(
  regression,
  `  assert.match(rules, /allow read: if participantCanRead\\(resource\\.data\\) \\|\\| canDispatchJobs\\(\\);/);`,
  `  assert.match(rules, /allow read: if isNotSuspended\\(\\) && \\(participantCanRead\\(resource\\.data\\) \\|\\| canDispatchJobs\\(\\)\\);/);\n  assert.match(rules, /function profileAllowsAccess\\(data\\)/);\n  assert.match(rules, /data\\.get\\('status', ''\\) in \\[/);\n  assert.match(rules, /function hasDispatchAuthorityClaimOnly\\(\\)/);\n  assert.match(rules, /match \\/fcmTokens\\/\\{tokenId\\} \\{/);\n  assert.match(rules, /match \\/deviceReadiness\\/\\{readinessId\\} \\{/);\n  assert.match(rules, /match \\/\\{subcollection\\}\\/\\{document=\\*\\*\\} \\{\\n\\s*allow read, write: if false;/);`,
  'technician privacy and final Firestore authority assertions',
);
writeFileSync(regressionPath, regression);

const securityPath = 'test/security-rules.test.js';
let security = readFileSync(securityPath, 'utf8');
security = replaceExactly(
  security,
  `    // User profile in firestore is suspended: true\n    await setDoc(doc(adminDb, 'users/suspended_user'), { suspended: true });`,
  `    // Production suspension callables write status='suspended' before stale tokens refresh.\n    await setDoc(doc(adminDb, 'users/suspended_user'), { status: 'suspended', suspended: false });`,
  'production-shaped stale-token suspension fixture',
);

const testMarker = "it('explicit user subcollection allowlist enforces read/write policy and denies unknown paths'";
if (!security.includes(testMarker)) {
  const insertion = `

  it('explicit user subcollection allowlist enforces read/write policy and denies unknown paths', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'users/user_a'), { role: 'tenant', status: 'active' });
    await setDoc(doc(adminDb, 'users/user_b'), { role: 'tenant', status: 'active' });

    const selfDb = testEnv.authenticatedContext('user_a', { role: 'tenant' }).firestore();
    const otherDb = testEnv.authenticatedContext('user_b', { role: 'tenant' }).firestore();
    const hrDb = testEnv.authenticatedContext('hr_user', { role: 'hr_admin' }).firestore();
    const opsDb = testEnv.authenticatedContext('ops_user', { role: 'operations_manager' }).firestore();
    const financeDb = testEnv.authenticatedContext('finance_user', { role: 'finance_admin' }).firestore();

    const selfToken = doc(selfDb, 'users/user_a/fcmTokens/token_self');
    await assertSucceeds(setDoc(selfToken, { token: 'token_self', platform: 'web' }));
    await assertSucceeds(getDoc(selfToken));
    await assertSucceeds(updateDoc(selfToken, { platform: 'android-web' }));
    await assertSucceeds(getDoc(doc(adminDb, 'users/user_a/fcmTokens/token_self')));
    await assertSucceeds(getDoc(doc(hrDb, 'users/user_a/fcmTokens/token_self')));
    await assertFails(getDoc(doc(opsDb, 'users/user_a/fcmTokens/token_self')));
    await assertFails(getDoc(doc(financeDb, 'users/user_a/fcmTokens/token_self')));
    await assertFails(getDoc(doc(otherDb, 'users/user_a/fcmTokens/token_self')));
    await assertFails(updateDoc(doc(hrDb, 'users/user_a/fcmTokens/token_self'), { platform: 'forged' }));

    const readiness = doc(selfDb, 'users/user_a/deviceReadiness/push');
    await assertSucceeds(setDoc(readiness, { platform: 'web', supportsMessaging: true }));
    await assertSucceeds(getDoc(readiness));
    await assertSucceeds(getDoc(doc(adminDb, 'users/user_a/deviceReadiness/push')));
    await assertSucceeds(getDoc(doc(hrDb, 'users/user_a/deviceReadiness/push')));
    await assertFails(getDoc(doc(opsDb, 'users/user_a/deviceReadiness/push')));
    await assertFails(getDoc(doc(financeDb, 'users/user_a/deviceReadiness/push')));
    await assertFails(setDoc(doc(hrDb, 'users/user_a/deviceReadiness/forged'), { platform: 'forged' }));

    for (const database of [selfDb, adminDb, hrDb, opsDb, financeDb]) {
      await assertFails(setDoc(doc(database, 'users/user_a/permissions/escalated'), { admin: true }));
      await assertFails(setDoc(doc(database, 'users/user_a/security/session'), { bypass: true }));
    }

    await assertSucceeds(setDoc(doc(adminDb, 'users/user_a/fcmTokens/token_admin'), {
      token: 'token_admin',
      platform: 'web',
    }));
    await assertSucceeds(deleteDoc(doc(adminDb, 'users/user_a/fcmTokens/token_admin')));
    await assertSucceeds(deleteDoc(selfToken));
  });

  it('production-shaped stale-token suspension blocks critical client writes', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });

    await setDoc(doc(adminDb, 'users/suspended_tenant'), {
      role: 'tenant',
      status: 'suspended',
      suspended: false,
      propertyId: 'prop_suspended',
      unitId: 'unit_suspended',
    });
    await setDoc(doc(adminDb, 'units/unit_suspended'), {
      tenantId: 'suspended_tenant',
      tenantUid: 'suspended_tenant',
      propertyId: 'prop_suspended',
      ownerId: 'owner_suspended',
    });
    const existingTenantTicket = {
      tenantId: 'suspended_tenant',
      tenantUid: 'suspended_tenant',
      unitId: 'unit_suspended',
      propertyId: 'prop_suspended',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
      photos: [],
      tenantPhotos: [],
    };
    await setDoc(doc(adminDb, 'tickets/suspended_tenant_existing'), existingTenantTicket);
    await setDoc(doc(adminDb, 'maintenanceTickets/suspended_tenant_existing'), existingTenantTicket);

    const staleTenantDb = testEnv.authenticatedContext('suspended_tenant', { role: 'tenant' }).firestore();
    const newTicket = {
      tenantId: 'suspended_tenant',
      tenantUid: 'suspended_tenant',
      unitId: 'unit_suspended',
      propertyId: 'prop_suspended',
      status: 'OPEN',
      source: 'TENANT_PORTAL',
      evidenceStatus: 'PENDING_TENANT_UPLOAD',
      assignedTechnicianId: null,
      technicianId: null,
    };
    await assertFails(setDoc(doc(staleTenantDb, 'tickets/suspended_tenant_new'), newTicket));
    await assertFails(setDoc(doc(staleTenantDb, 'maintenanceTickets/suspended_tenant_new'), newTicket));
    await assertFails(updateDoc(doc(staleTenantDb, 'tickets/suspended_tenant_existing'), {
      evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
      photos: ['https://storage.example.com/suspended.jpg'],
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(staleTenantDb, 'maintenanceTickets/suspended_tenant_existing'), {
      evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
      photos: ['https://storage.example.com/suspended.jpg'],
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(setDoc(doc(staleTenantDb, 'users/suspended_tenant/fcmTokens/blocked'), { token: 'blocked' }));

    await setDoc(doc(adminDb, 'users/suspended_owner'), { role: 'owner', status: 'suspended', suspended: false });
    await setDoc(doc(adminDb, 'properties/suspended_owner_existing'), {
      ownerId: 'suspended_owner',
      status: 'draft',
      name: 'Existing property',
    });
    const staleOwnerDb = testEnv.authenticatedContext('suspended_owner', { role: 'owner' }).firestore();
    await assertFails(setDoc(doc(staleOwnerDb, 'properties/suspended_owner_new'), {
      ownerId: 'suspended_owner',
      status: 'draft',
      name: 'Blocked property',
    }));
    await assertFails(updateDoc(doc(staleOwnerDb, 'properties/suspended_owner_existing'), { name: 'Blocked update' }));

    await setDoc(doc(adminDb, 'users/suspended_tech'), {
      role: 'technician',
      status: 'suspended',
      suspended: false,
      approvalStatus: 'approved',
    });
    await setDoc(doc(adminDb, 'technicians/suspended_tech'), {
      status: 'active',
      approvalStatus: 'approved',
      suspended: false,
    });
    const existingTechTicket = {
      assignedTechnicianId: 'suspended_tech',
      technicianId: 'suspended_tech',
      status: 'ASSIGNED',
      beforePhotos: [],
      afterPhotos: [],
      proofPhotos: [],
      completionPhotos: [],
      evidencePhotos: [],
    };
    await setDoc(doc(adminDb, 'tickets/suspended_tech_existing'), existingTechTicket);
    await setDoc(doc(adminDb, 'maintenanceTickets/suspended_tech_existing'), existingTechTicket);
    const staleTechDb = testEnv.authenticatedContext('suspended_tech', { role: 'technician' }).firestore();
    await assertFails(updateDoc(doc(staleTechDb, 'tickets/suspended_tech_existing'), {
      technicianNotes: 'Blocked stale-token update',
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(staleTechDb, 'maintenanceTickets/suspended_tech_existing'), {
      technicianNotes: 'Blocked stale-token update',
      updatedAt: new Date().toISOString(),
    }));
  });
`;
  const closeIndex = security.lastIndexOf('\n});');
  if (closeIndex < 0) throw new Error('[final-authority-repair] security suite closing marker not found');
  security = security.slice(0, closeIndex) + insertion + security.slice(closeIndex);
}
writeFileSync(securityPath, security);

const verifierPath = 'scripts/verify-firestore-launch-hardening.mjs';
let verifier = readFileSync(verifierPath, 'utf8');
const forbiddenAnchor = `  {\n    label: 'tickets update rule still permits direct technician claiming',\n    text: '|| safeOpenMissionClaim()',\n  },\n];`;
const forbiddenCanonical = `  {\n    label: 'tickets update rule still permits direct technician claiming',\n    text: '|| safeOpenMissionClaim()',\n  },\n  {\n    label: 'boolean-only database suspension guard',\n    text: "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true",\n  },\n  {\n    label: 'token-only directory list suspension guard',\n    text: "allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (",\n  },\n  {\n    label: 'broad user-subcollection authorization',\n    text: 'allow create: if isNotSuspended() && (isAdmin() || (signedIn() && request.auth.uid == userId));',\n  },\n];`;
verifier = replaceExactly(verifier, forbiddenAnchor, forbiddenCanonical, 'verifier forbidden final-authority fragments');

const requiredAnchor = `  {\n    label: 'AI quota records are server-only',\n    text: "match /ai_usage/{usageId} {\\n      allow read: if isAdmin();\\n      allow write: if false;",\n  },\n];`;
const requiredCanonical = `  {\n    label: 'AI quota records are server-only',\n    text: "match /ai_usage/{usageId} {\\n      allow read: if isAdmin();\\n      allow write: if false;",\n  },\n  {\n    label: 'production status-aware suspension helper',\n    text: 'function profileAllowsAccess(data) {',\n  },\n  {\n    label: 'production suspension status variants',\n    text: "data.get('status', '') in [",\n  },\n  {\n    label: 'dispatch checks claims before database suspension',\n    text: 'function hasDispatchAuthorityClaimOnly() {',\n  },\n  {\n    label: 'directory list checks database-backed suspension once',\n    text: 'allow list: if isNotSuspended() && (',\n  },\n  {\n    label: 'FCM token path is explicitly allowlisted',\n    text: 'match /fcmTokens/{tokenId} {',\n  },\n  {\n    label: 'device readiness path is explicitly allowlisted',\n    text: 'match /deviceReadiness/{readinessId} {',\n  },\n  {\n    label: 'unknown user subcollections are denied',\n    text: 'match /{subcollection}/{document=**} {\\n        allow read, write: if false;',\n  },\n  {\n    label: 'tenant evidence updates verify suspension',\n    text: 'tenantOwns(resource.data) &&\\n        isNotSuspended() &&',\n  },\n  {\n    label: 'technician updates verify suspension after cheap identity checks',\n    text: 'techOwns(resource.data) &&\\n        isNotSuspended() &&\\n        isApprovedTechnician() &&',\n  },\n];`;
verifier = replaceExactly(verifier, requiredAnchor, requiredCanonical, 'verifier required final-authority fragments');
writeFileSync(verifierPath, verifier);

console.log('[final-authority-repair] package, rules, verifier, launch regressions, and emulator tests updated');
