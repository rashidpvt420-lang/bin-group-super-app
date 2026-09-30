import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe('Push token server authority', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('users and browser Admins cannot read or mutate server-managed push token documents', async () => {
    await seed('users/tenant_push', {
      uid: 'tenant_push',
      email: 'tenant-push@example.test',
      role: 'tenant',
      status: 'active',
      language: 'en',
    });
    await seed('users/tenant_push/fcmTokens/hash_1', {
      token: 'server-managed-token',
      tokenHash: 'hash_1',
      userId: 'tenant_push',
      active: true,
    });

    const tenantDb = testEnv.authenticatedContext('tenant_push', {
      role: 'tenant',
      email: 'tenant-push@example.test',
      email_verified: true,
    }).firestore();
    const tokenRef = doc(tenantDb, 'users/tenant_push/fcmTokens/hash_1');
    await assertFails(getDoc(tokenRef));
    await assertFails(setDoc(doc(tenantDb, 'users/tenant_push/fcmTokens/forged'), {
      token: 'forged-client-token',
      tokenHash: 'forged',
      userId: 'tenant_push',
    }));
    await assertFails(updateDoc(tokenRef, { active: false }));
    await assertFails(deleteDoc(tokenRef));

    const adminDb = testEnv.authenticatedContext('browser_admin', {
      role: 'admin',
      admin: true,
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(adminDb, 'users/tenant_push/fcmTokens/hash_1')));
    await assertFails(deleteDoc(doc(adminDb, 'users/tenant_push/fcmTokens/hash_1')));
  });

  it('users cannot write raw push tokens, push authority summaries or readiness to their root profile', async () => {
    await seed('users/owner_push', {
      uid: 'owner_push',
      email: 'owner-push@example.test',
      role: 'owner',
      status: 'active',
      language: 'en',
    });
    const ownerDb = testEnv.authenticatedContext('owner_push', {
      role: 'owner',
      email: 'owner-push@example.test',
      email_verified: true,
    }).firestore();
    const profileRef = doc(ownerDb, 'users/owner_push');

    await assertSucceeds(updateDoc(profileRef, {
      language: 'ar',
      updatedAt: new Date().toISOString(),
    }));
    for (const mutation of [
      { fcmTokens: ['raw-client-token'] },
      { pushEnabled: true },
      { pushTokenCount: 99 },
      { pushPermission: 'granted' },
      { pushPlatform: 'web' },
      { pushRole: 'admin' },
      { platform: 'web', isStandalone: true },
      { userAgent: 'raw-client-user-agent' },
      { deviceInfo: { platform: 'web' } },
    ]) {
      await assertFails(updateDoc(profileRef, {
        ...mutation,
        updatedAt: new Date().toISOString(),
      }));
    }
    await assertFails(setDoc(doc(ownerDb, 'users/owner_push/deviceReadiness/current'), {
      pushEnabled: true,
      permission: 'granted',
    }));
  });

  it('technician operational readiness remains available under the technicians collection', async () => {
    await seed('technicians/tech_push', {
      uid: 'tech_push',
      role: 'technician',
      status: 'active',
      approvalStatus: 'approved',
      approved: true,
      suspended: false,
    });
    const techDb = testEnv.authenticatedContext('tech_push', {
      role: 'technician',
      email_verified: true,
    }).firestore();
    await assertSucceeds(setDoc(doc(techDb, 'technicians/tech_push/deviceReadiness/current'), {
      deviceId: 'approved-device',
      ready: true,
      updatedAt: new Date().toISOString(),
    }));
  });
});
