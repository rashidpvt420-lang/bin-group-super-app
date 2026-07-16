import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

const roleCases = [
  {
    role: 'owner',
    allowed: {
      displayName: 'Updated Owner',
      phoneNumber: '+971500000101',
      companyName: 'Updated Portfolio',
      billingContact: { name: 'Billing Contact', email: 'billing@example.test', phone: '+971500000102' },
      notificationPreferences: { preferredContact: 'email', language: 'en' },
      language: 'en',
    },
  },
  {
    role: 'tenant',
    allowed: {
      displayName: 'Updated Tenant',
      phoneNumber: '+971500000201',
      emergencyContact: { name: 'Emergency Contact', phone: '+971500000202' },
      language: 'ar',
    },
  },
  {
    role: 'technician',
    allowed: {
      displayName: 'Updated Technician',
      phoneNumber: '+971500000301',
      requestedTrade: 'HVAC',
      serviceZonePreference: 'Al Ain',
      emergencyContact: { name: 'Emergency Contact', phone: '+971500000302' },
      language: 'en',
    },
  },
  {
    role: 'broker',
    allowed: {
      displayName: 'Updated Broker',
      phoneNumber: '+971500000401',
      language: 'ar',
    },
  },
];

const protectedMutations = [
  {
    name: 'role and permission escalation',
    data: { role: 'admin', permissions: { canManageProperties: true }, adminApproved: true },
  },
  {
    name: 'payment and activation authority',
    data: { paymentVerified: true, dashboardUnlocked: true, activeContractId: 'forged-contract' },
  },
  {
    name: 'suspension and lifecycle status',
    data: { status: 'active', suspended: false, approvalStatus: 'APPROVED' },
  },
  {
    name: 'Broker KYC and payout authority',
    data: { brokerKycStatus: 'APPROVED', reraLicense: 'FORGED-RERA', bankIban: 'AE000000000000000000000' },
  },
];

describe('Five-profile protected user fields', () => {
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

  for (const roleCase of roleCases) {
    it(`${roleCase.role} can update allowlisted profile data but cannot mutate server-owned authority`, async () => {
      const uid = `${roleCase.role}_profile_user`;
      await seed(`users/${uid}`, {
        uid,
        email: `${roleCase.role}@example.test`,
        role: roleCase.role,
        userRole: roleCase.role,
        primaryRole: roleCase.role,
        status: 'active',
        displayName: `Original ${roleCase.role}`,
        phoneNumber: '+971500000000',
        language: 'en',
        adminApproved: false,
        paymentVerified: false,
        dashboardUnlocked: false,
        activeContractId: null,
      });

      const roleDb = testEnv.authenticatedContext(uid, {
        role: roleCase.role,
        email: `${roleCase.role}@example.test`,
        email_verified: true,
      }).firestore();
      const profileRef = doc(roleDb, `users/${uid}`);

      await assertSucceeds(updateDoc(profileRef, {
        ...roleCase.allowed,
        updatedAt: new Date().toISOString(),
      }));

      for (const mutation of protectedMutations) {
        await assertFails(updateDoc(profileRef, {
          ...mutation.data,
          updatedAt: new Date().toISOString(),
        }));
      }
    });
  }
});
