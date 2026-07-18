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
      language: 'ar',
    },
    denied: [
      { displayName: 'Bypassed Owner Name' },
      { phoneNumber: '+971500000101' },
      { phone: '+971500000101' },
      { mobile: '+971500000101' },
      { companyName: 'Bypassed Portfolio' },
      { ownerCompanyName: 'Bypassed Portfolio' },
      { billingContact: { name: 'Bypassed Billing', email: 'billing@example.test', phone: '+971500000102' } },
    ],
  },
  {
    role: 'tenant',
    allowed: {
      language: 'ar',
    },
    denied: [
      { displayName: 'Bypassed Tenant Name' },
      { phoneNumber: '+971500000201' },
      { phone: '+971500000201' },
      { mobile: '+971500000201' },
      { emergencyContact: { name: 'Bypassed Contact', phone: '+971500000202' } },
    ],
  },
  {
    role: 'technician',
    allowed: {
      language: 'ar',
    },
    denied: [
      { displayName: 'Bypassed Technician Name' },
      { phoneNumber: '+971500000301' },
      { phone: '+971500000301' },
      { mobile: '+971500000301' },
      { requestedTrade: 'Unverified Trade' },
      { serviceZonePreference: 'Forged Dispatch Zone' },
      { emergencyContact: { name: 'Bypassed Contact', phone: '+971500000302' } },
    ],
  },
  {
    role: 'broker',
    allowed: {
      language: 'ar',
    },
    denied: [
      { displayName: 'Bypassed Broker Name' },
      { phoneNumber: '+971500000401' },
      { phone: '+971500000401' },
      { companyName: 'Bypassed Brokerage' },
      { primaryRegion: 'Bypassed Region' },
      { brokerTerritory: 'Bypassed Territory' },
      { reraLicense: 'FORGED-RERA' },
      { bankIban: 'AE000000000000000000000' },
      { commissionAgreementAccepted: true },
    ],
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
    it(`${roleCase.role} keeps language self-service but cannot bypass reviewed profile authority`, async () => {
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
        phone: '+971500000000',
        mobile: '+971500000000',
        emergencyContact: { name: 'Original Contact', phone: '+971500000001' },
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

      for (const deniedMutation of roleCase.denied) {
        await assertFails(updateDoc(profileRef, {
          ...deniedMutation,
          updatedAt: new Date().toISOString(),
        }));
      }

      for (const mutation of protectedMutations) {
        await assertFails(updateDoc(profileRef, {
          ...mutation.data,
          updatedAt: new Date().toISOString(),
        }));
      }
    });
  }
});
