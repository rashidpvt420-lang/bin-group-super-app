import { readFileSync, writeFileSync } from 'node:fs';

const file = 'test/security-rules.test.js';
const sourceRaw = readFileSync(file, 'utf8');
const newline = sourceRaw.includes('\r\n') ? '\r\n' : '\n';
const source = sourceRaw.replace(/\r\n/g, '\n');
const requiredImports = [
  "import './broker-kyc-security-rules.test.js';",
  "import './five-profile-protected-fields-rules.test.js';",
  "import './push-token-security-rules.test.js';",
  "import './technician-assigned-list-security-rules.test.js';",
  "import './property-geo-authority-rules.test.js';",
  "import './tenant-ticket-server-authority-rules.test.js';",
];
const obsoleteBlock = `    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
  `;
const canonicalBlock = `    await assertFails(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      status: 'IN_PROGRESS',
      updatedAt: new Date().toISOString(),
    }));
    await assertSucceeds(updateDoc(doc(techADb, 'maintenanceTickets/ticket_3'), {
      technicianNotes: 'Verified evidence note from assigned technician.',
      updatedAt: new Date().toISOString(),
    }));
  `;

const legacyTenantCreate = "    await assertSucceeds(setDoc(doc(tenantADb, 'maintenanceTickets/tenant_valid_ticket'), {";
const canonicalTenantCreate = "    await assertFails(setDoc(doc(tenantADb, 'maintenanceTickets/tenant_valid_ticket'), {";

const legacyUserSubcollectionStart =
  "  it('user subcollection restrictions: Operations and Finance can read top-level user directories but NOT subcollections', async () => {";
const nextUserSubcollectionTest =
  "  it('production-shaped stale-token suspension blocks critical client writes', async () => {";
const canonicalUserSubcollectionMarker =
  "  it('user push token and readiness subcollections are server-only while unknown paths fail closed', async () => {";
const canonicalUserSubcollectionBlock = `  it('user push token and readiness subcollections are server-only while unknown paths fail closed', async () => {
    await seedServerDocument('users/user_a', { role: 'tenant', status: 'active' });
    await seedServerDocument('users/user_b', { role: 'tenant', status: 'active' });
    await seedServerDocument('users/user_a/fcmTokens/token_seeded', {
      token: 'server-managed-token',
      tokenHash: 'token_seeded',
      userId: 'user_a',
      active: true,
    });
    await seedServerDocument('users/user_a/deviceReadiness/push', {
      platform: 'web',
      supportsMessaging: true,
      userId: 'user_a',
    });

    const selfDb = testEnv.authenticatedContext('user_a', { role: 'tenant' }).firestore();
    const otherDb = testEnv.authenticatedContext('user_b', { role: 'tenant' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true, role: 'admin' }).firestore();
    const hrDb = testEnv.authenticatedContext('hr_user', { role: 'hr_admin' }).firestore();
    const opsDb = testEnv.authenticatedContext('ops_user', { role: 'operations_manager' }).firestore();
    const financeDb = testEnv.authenticatedContext('finance_user', { role: 'finance_admin' }).firestore();

    await assertSucceeds(getDoc(doc(opsDb, 'users/user_a')));
    await assertSucceeds(getDoc(doc(financeDb, 'users/user_a')));

    for (const database of [selfDb, otherDb, adminDb, hrDb, opsDb, financeDb]) {
      await assertFails(getDoc(doc(database, 'users/user_a/fcmTokens/token_seeded')));
      await assertFails(getDoc(doc(database, 'users/user_a/deviceReadiness/push')));
      await assertFails(setDoc(doc(database, 'users/user_a/fcmTokens/forged'), {
        token: 'forged-client-token',
        platform: 'web',
      }));
      await assertFails(setDoc(doc(database, 'users/user_a/deviceReadiness/forged'), {
        platform: 'web',
        supportsMessaging: true,
      }));
      await assertFails(setDoc(doc(database, 'users/user_a/permissions/escalated'), { admin: true }));
      await assertFails(setDoc(doc(database, 'users/user_a/security/session'), { bypass: true }));
    }
  });

`;

const legacyTicketFixtureReplacements = [
  [
    "    await setDoc(doc(adminDb, 'tickets/open_ticket'), openTicket);",
    "    await seedServerDocument('tickets/open_ticket', openTicket);",
    'open legacy mission seed',
  ],
  [
    "    await setDoc(doc(adminDb, 'tickets/open_ticket_approved_tech'), openTicket);",
    "    await seedServerDocument('tickets/open_ticket_approved_tech', openTicket);",
    'approved-Technician legacy mission seed',
  ],
  [
    "    await assertSucceeds(updateDoc(doc(dispatcherDb, 'tickets/open_ticket'), claim));",
    "    await assertFails(updateDoc(doc(dispatcherDb, 'tickets/open_ticket'), claim));",
    'dispatcher legacy mission mutation denial',
  ],
  [
    "    await setDoc(doc(adminDb, 'tickets/suspended_tenant_existing'), existingTenantTicket);",
    "    await seedServerDocument('tickets/suspended_tenant_existing', existingTenantTicket);",
    'suspended Tenant legacy seed',
  ],
  [
    "    await setDoc(doc(adminDb, 'tickets/suspended_tech_existing'), existingTechTicket);",
    "    await seedServerDocument('tickets/suspended_tech_existing', existingTechTicket);",
    'suspended Technician legacy seed',
  ],
];

const obsoleteCount = source.split(obsoleteBlock).length - 1;
const canonicalCount = source.split(canonicalBlock).length - 1;
let next = source;

if (obsoleteCount === 1 && canonicalCount === 0) {
  next = next.replace(obsoleteBlock, canonicalBlock);
} else if (!(obsoleteCount === 0 && canonicalCount === 1)) {
  throw new Error(
    `[normalize-rule-tests] expected one obsolete block or one canonical block; ` +
    `found obsolete=${obsoleteCount}, canonical=${canonicalCount}`,
  );
}

const legacyTenantCount = next.split(legacyTenantCreate).length - 1;
const canonicalTenantCount = next.split(canonicalTenantCreate).length - 1;
if (legacyTenantCount === 1 && canonicalTenantCount === 0) {
  next = next.replace(legacyTenantCreate, canonicalTenantCreate);
} else if (!(legacyTenantCount === 0 && canonicalTenantCount === 1)) {
  throw new Error(
    `[normalize-rule-tests] expected one legacy Tenant direct-create success or one canonical denial; ` +
    `found legacy=${legacyTenantCount}, canonical=${canonicalTenantCount}`,
  );
}

const legacyStartIndex = next.indexOf(legacyUserSubcollectionStart);
const canonicalUserSubcollectionCount = next.split(canonicalUserSubcollectionMarker).length - 1;
if (legacyStartIndex >= 0) {
  const nextTestIndex = next.indexOf(nextUserSubcollectionTest, legacyStartIndex);
  if (nextTestIndex < 0) {
    throw new Error('[normalize-rule-tests] stale user subcollection tests have no canonical end marker');
  }
  next = `${next.slice(0, legacyStartIndex)}${canonicalUserSubcollectionBlock}${next.slice(nextTestIndex)}`;
} else if (canonicalUserSubcollectionCount !== 1) {
  throw new Error(
    `[normalize-rule-tests] expected stale user subcollection tests or one canonical server-only test; ` +
    `found canonical=${canonicalUserSubcollectionCount}`,
  );
}

for (const [legacy, canonical, label] of legacyTicketFixtureReplacements) {
  const legacyCount = next.split(legacy).length - 1;
  const canonicalCountForFixture = next.split(canonical).length - 1;
  if (legacyCount === 1 && canonicalCountForFixture === 0) {
    next = next.replace(legacy, canonical);
  } else if (!(legacyCount === 0 && canonicalCountForFixture === 1)) {
    throw new Error(
      `[normalize-rule-tests] expected one legacy or canonical ${label}; ` +
      `found legacy=${legacyCount}, canonical=${canonicalCountForFixture}`,
    );
  }
}

for (const requiredImport of [...requiredImports].reverse()) {
  if (!next.includes(requiredImport)) next = `${requiredImport}\n${next}`;
}

if (next === source) {
  console.log('[normalize-rule-tests] callable-only lifecycle/Tenant tickets, read-only legacy fixtures, Broker KYC, five-profile, push-token and technician list tests already canonical');
  process.exit(0);
}

writeFileSync(file, next.replace(/\n/g, newline));
console.log('[normalize-rule-tests] Tenant ticket creation, read-only legacy fixtures and protected role rules tests normalized');
