import admin from 'firebase-admin';
import { existsSync } from 'fs';
import { config as loadDotenv } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';

// Load .env.e2e to get passwords and emails
const possibleConfigPaths = [
  path.resolve(__dirname, '../.env.e2e'),
  path.resolve(__dirname, '../../.env.e2e'),
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
];
for (const p of possibleConfigPaths) {
  if (existsSync(p)) {
    loadDotenv({ path: p });
    console.log(`Loaded E2E environment from: ${p}`);
    break;
  }
}

// Validate required environment variables and exit on failure
const requiredEnvVars = [
  'E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD',
  'E2E_OWNER_MAILBOX_EMAIL', 'E2E_OWNER_PASSWORD',
  'E2E_TENANT_EMAIL', 'E2E_TENANT_PASSWORD',
  'E2E_TECHNICIAN_EMAIL', 'E2E_TECHNICIAN_PASSWORD',
  'E2E_BROKER_MAILBOX_EMAIL', 'E2E_BROKER_PASSWORD'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required E2E environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

const requiredRoleEmailVars = [
  'E2E_ADMIN_EMAIL',
  'E2E_OWNER_MAILBOX_EMAIL',
  'E2E_TENANT_EMAIL',
  'E2E_TECHNICIAN_EMAIL',
  'E2E_BROKER_MAILBOX_EMAIL',
];
const configuredRoleEmails = requiredRoleEmailVars.map((name) => ({
  name,
  email: String(process.env[name] || '').trim().toLowerCase(),
}));
function duplicateEmailGroups(entries) {
  const byEmail = new Map();
  for (const { name, email } of entries) {
    const names = byEmail.get(email) || [];
    names.push(name);
    byEmail.set(email, names);
  }
  return [...byEmail.values()].filter((names) => names.length > 1);
}
if (configuredRoleEmails.some(({ email }) => email === CANONICAL_FOUNDER_EMAIL)) {
  console.error(`❌ E2E role accounts must never use the canonical Founder email ${CANONICAL_FOUNDER_EMAIL}.`);
  process.exit(1);
}
const uniqueRoleEmails = new Set(configuredRoleEmails.map(({ email }) => email));
if (uniqueRoleEmails.size !== configuredRoleEmails.length) {
  const duplicateGroups = duplicateEmailGroups(configuredRoleEmails)
    .map((names) => names.join(' + '))
    .join('; ');
  console.error(`❌ Every E2E role must use a distinct email address. Duplicate variable groups: ${duplicateGroups}`);
  process.exit(1);
}

const projectId = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'bin-group-57c60';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();
const auth = admin.auth();

const usersToSeed = [
  {
    role: 'admin',
    email: configuredRoleEmails.find(({ name }) => name === 'E2E_ADMIN_EMAIL').email,
    password: process.env.E2E_ADMIN_PASSWORD,
    claims: { admin: true, role: 'admin', testAccount: true },
    displayName: 'E2E Admin',
  },
  {
    role: 'owner',
    email: configuredRoleEmails.find(({ name }) => name === 'E2E_OWNER_MAILBOX_EMAIL').email,
    password: process.env.E2E_OWNER_PASSWORD,
    claims: { role: 'owner', testAccount: true },
    displayName: 'E2E Owner',
    extraProfile: {
      paymentVerified: true,
      adminApproved: true,
      onboardingComplete: true,
      dashboardUnlocked: true,
    }
  },
  {
    role: 'tenant',
    email: configuredRoleEmails.find(({ name }) => name === 'E2E_TENANT_EMAIL').email,
    password: process.env.E2E_TENANT_PASSWORD,
    claims: { role: 'tenant', testAccount: true },
    displayName: 'E2E Tenant',
    extraProfile: {
      onboardingComplete: true,
    }
  },
  {
    role: 'technician',
    email: configuredRoleEmails.find(({ name }) => name === 'E2E_TECHNICIAN_EMAIL').email,
    password: process.env.E2E_TECHNICIAN_PASSWORD,
    claims: { role: 'technician', testAccount: true },
    displayName: 'E2E Technician',
    extraProfile: {
      onDuty: true,
      dutyStatus: 'ON_DUTY',
    }
  },
  {
    role: 'broker',
    email: configuredRoleEmails.find(({ name }) => name === 'E2E_BROKER_MAILBOX_EMAIL').email,
    password: process.env.E2E_BROKER_PASSWORD,
    claims: { role: 'broker', testAccount: true },
    displayName: 'E2E Broker',
  }
];

const techBEmail = String(process.env.E2E_TECHNICIAN_B_EMAIL || '').trim().toLowerCase();
const techBPassword = String(process.env.E2E_TECHNICIAN_B_PASSWORD || '').trim();
if (techBEmail && techBPassword) {
  if (techBEmail === CANONICAL_FOUNDER_EMAIL || uniqueRoleEmails.has(techBEmail)) {
    console.error('❌ E2E Technician B must use a distinct non-Founder email address.');
    process.exit(1);
  }
  usersToSeed.push({
    role: 'technician',
    email: techBEmail,
    password: techBPassword,
    claims: { role: 'technician', testAccount: true, technicianB: true },
    displayName: 'E2E Technician B',
    extraProfile: {
      onDuty: true,
      dutyStatus: 'ON_DUTY',
    },
  });
} else if (techBEmail || techBPassword) {
  console.error('❌ E2E_TECHNICIAN_B_EMAIL and E2E_TECHNICIAN_B_PASSWORD must both be set together.');
  process.exit(1);
}

async function seed() {
  console.log('🚀 Seeding/Updating E2E Auth accounts in production...');
  for (const user of usersToSeed) {
    const email = user.email.trim().toLowerCase();
    try {
      let authUser;
      try {
        authUser = await auth.getUserByEmail(email);
        console.log(`User ${email} exists in Auth. Updating password and enabling...`);
        authUser = await auth.updateUser(authUser.uid, {
          password: user.password,
          disabled: false,
          emailVerified: true,
          displayName: user.displayName,
        });
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          console.log(`User ${email} not found in Auth. Creating...`);
          authUser = await auth.createUser({
            email,
            password: user.password,
            emailVerified: true,
            displayName: user.displayName,
            disabled: false,
          });
        } else {
          throw err;
        }
      }

      // Set Custom Claims
      await auth.setCustomUserClaims(authUser.uid, user.claims);
      console.log(`Claims set for ${email}: ${JSON.stringify(user.claims)}`);

      // Write to Firestore users collection
      const profileRef = db.collection('users').doc(authUser.uid);
      await profileRef.set({
        uid: authUser.uid,
        email,
        role: user.role,
        status: 'active',
        testAccount: true,
        displayName: user.displayName,
        onboardingComplete: true,
        legalAcceptedAt: new Date().toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(user.extraProfile || {})
      }, { merge: true });
      console.log(`Firestore profile synced for ${email} in users/${authUser.uid}`);

    } catch (err) {
      console.error(`❌ Error seeding ${email}:`, err);
      throw err;
    }
  }
}

seed().then(() => {
  console.log('🎉 Seeding complete!');
  process.exit(0);
}).catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
