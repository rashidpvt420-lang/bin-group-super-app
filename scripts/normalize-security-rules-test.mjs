import { readFileSync, writeFileSync } from 'node:fs';

const file = 'test/security-rules.test.js';
const sourceRaw = readFileSync(file, 'utf8');
const newline = sourceRaw.includes('\r\n') ? '\r\n' : '\n';
const source = sourceRaw.replace(/\r\n/g, '\n');
const requiredImports = [
  "import './broker-kyc-security-rules.test.js';",
  "import './five-profile-protected-fields-rules.test.js';",
  "import './push-token-security-rules.test.js';",
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
const obsoleteUserSubcollectionStart = "  it('user subcollection restrictions: Operations and Finance can read top-level user directories but NOT subcollections'";
const canonicalUserSubcollectionStart = "  it('user push-token and readiness subcollections are server-only for every browser role'";
const followingUserSubcollectionTest = "  it('production-shaped stale-token suspension blocks critical client writes'";
const canonicalUserSubcollectionBlock = `  it('user push-token and readiness subcollections are server-only for every browser role', async () => {
    await seedServerDocument('users/some_user', {
      uid: 'some_user',
      displayName: 'John Doe',
      role: 'tenant',
      status: 'active',
    });
    await seedServerDocument('users/some_user/fcmTokens/hash_123', {
      token: 'server-managed-token',
      tokenHash: 'hash_123',
      userId: 'some_user',
      active: true,
    });
    await seedServerDocument('users/some_user/deviceReadiness/current', {
      pushEnabled: true,
      permission: 'granted',
      userId: 'some_user',
    });

    const selfDb = testEnv.authenticatedContext('some_user', { role: 'tenant' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true, role: 'admin' }).firestore();
    const hrDb = testEnv.authenticatedContext('hr_user', { role: 'hr_admin' }).firestore();
    const opsDb = testEnv.authenticatedContext('ops_user', { role: 'operations_manager' }).firestore();
    const financeDb = testEnv.authenticatedContext('finance_user', { role: 'finance_admin' }).firestore();
    const otherDb = testEnv.authenticatedContext('other_user', { role: 'tenant' }).firestore();

    await assertSucceeds(getDoc(doc(opsDb, 'users/some_user')));
    await assertSucceeds(getDoc(doc(financeDb, 'users/some_user')));

    for (const database of [selfDb, adminDb, hrDb, opsDb, financeDb, otherDb]) {
      const tokenRef = doc(database, 'users/some_user/fcmTokens/hash_123');
      await assertFails(getDoc(tokenRef));
      await assertFails(setDoc(doc(database, 'users/some_user/fcmTokens/forged'), {
        token: 'forged-client-token',
        tokenHash: 'forged',
        userId: 'some_user',
      }));
      await assertFails(updateDoc(tokenRef, { active: false }));
      await assertFails(deleteDoc(tokenRef));

      const readinessRef = doc(database, 'users/some_user/deviceReadiness/current');
      await assertFails(getDoc(readinessRef));
      await assertFails(setDoc(doc(database, 'users/some_user/deviceReadiness/forged'), {
        pushEnabled: true,
        permission: 'granted',
      }));
    }
  });

  it('unknown and privileged user subcollections remain denied to every browser role', async () => {
    await seedServerDocument('users/user_a', { uid: 'user_a', role: 'tenant', status: 'active' });
    const databases = [
      testEnv.authenticatedContext('user_a', { role: 'tenant' }).firestore(),
      testEnv.authenticatedContext('admin_user', { admin: true, role: 'admin' }).firestore(),
      testEnv.authenticatedContext('hr_user', { role: 'hr_admin' }).firestore(),
      testEnv.authenticatedContext('ops_user', { role: 'operations_manager' }).firestore(),
      testEnv.authenticatedContext('finance_user', { role: 'finance_admin' }).firestore(),
    ];

    for (const database of databases) {
      await assertFails(setDoc(doc(database, 'users/user_a/permissions/escalated'), { admin: true }));
      await assertFails(setDoc(doc(database, 'users/user_a/security/session'), { bypass: true }));
      await assertFails(setDoc(doc(database, 'users/user_a/arbitrary/unknown'), { allowed: true }));
    }
  });

`;

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

const obsoleteUserStartIndex = next.indexOf(obsoleteUserSubcollectionStart);
const canonicalUserStartIndex = next.indexOf(canonicalUserSubcollectionStart);
if (obsoleteUserStartIndex >= 0 && canonicalUserStartIndex === -1) {
  const followingTestIndex = next.indexOf(followingUserSubcollectionTest, obsoleteUserStartIndex);
  if (followingTestIndex === -1) {
    throw new Error('[normalize-rule-tests] could not find the test following legacy user subcollection cases');
  }
  next = `${next.slice(0, obsoleteUserStartIndex)}${canonicalUserSubcollectionBlock}${next.slice(followingTestIndex)}`;
} else if (!(obsoleteUserStartIndex === -1 && canonicalUserStartIndex >= 0)) {
  throw new Error(
    `[normalize-rule-tests] expected legacy or canonical user subcollection cases; ` +
    `legacy=${obsoleteUserStartIndex >= 0}, canonical=${canonicalUserStartIndex >= 0}`,
  );
}

for (const requiredImport of [...requiredImports].reverse()) {
  if (!next.includes(requiredImport)) {
    next = `${requiredImport}\n${next}`;
  }
}

if (next === source) {
  console.log('[normalize-rule-tests] callable-only lifecycle, Broker KYC, five-profile and push-token rules tests already canonical');
  process.exit(0);
}

writeFileSync(file, next.replace(/\n/g, newline));
console.log('[normalize-rule-tests] technician lifecycle, Broker KYC, five-profile and push-token rules tests normalized');
