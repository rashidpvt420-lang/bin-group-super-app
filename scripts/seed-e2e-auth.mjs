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
    loadDotenv({ path: p, override: false });
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

function expectedRoleClaims(role, extraClaims = {}) {
  return {
    ...extraClaims,
    role,
    userRole: role,
    primaryRole: role,
    active: true,
    testAccount: true,
  };
}

async function assertLaunchReadyRoleIdentity(uid, email, role) {
  const [authUser, profileSnap] = await Promise.all([
    auth.getUser(uid),
    db.collection('users').doc(uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const claims = authUser.customClaims || {};
  const failures = [];

  if (String(authUser.email || '').trim().toLowerCase() !== email) failures.push('Auth email mismatch');
  if (authUser.disabled) failures.push('Auth user disabled');
  if (claims.role !== role) failures.push(`claims.role=${String(claims.role)}`);
  if (claims.userRole !== role) failures.push(`claims.userRole=${String(claims.userRole)}`);
  if (claims.primaryRole !== role) failures.push(`claims.primaryRole=${String(claims.primaryRole)}`);
  if (claims.active !== true) failures.push(`claims.active=${String(claims.active)}`);
  if (!profileSnap.exists) failures.push('users profile missing');
  if (profile.role !== role) failures.push(`profile.role=${String(profile.role)}`);
  if (profile.userRole !== role) failures.push(`profile.userRole=${String(profile.userRole)}`);
  if (profile.primaryRole !== role) failures.push(`profile.primaryRole=${String(profile.primaryRole)}`);
  if (String(profile.status || '').toLowerCase() !== 'active') failures.push(`profile.status=${String(profile.status)}`);
  if (String(profile.approvalStatus || '').toLowerCase() !== 'approved') failures.push(`profile.approvalStatus=${String(profile.approvalStatus)}`);
  if (profile.suspended === true) failures.push('profile.suspended=true');

  if (failures.length) {
    throw new Error(`E2E ${role} fixture is not launch-ready for ${email} (${uid}): ${failures.join('; ')}`);
  }
  console.log(`✅ Verified launch-ready ${role} identity ${email} (${uid})`);
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

      // Rebuild from the declared fixture role, as the original seeder did.
      // Carrying old claims could retain stale Admin authority on another role.
      const canonicalClaims = expectedRoleClaims(user.role, user.claims || {});
      await auth.setCustomUserClaims(authUser.uid, canonicalClaims);
      console.log(`Claims set for ${email}: ${JSON.stringify(canonicalClaims)}`);

      // Write the exact same role identity into users/{uid}. The production app
      // reads both Auth claims and the Firestore profile before resolving routes.
      const profileRef = db.collection('users').doc(authUser.uid);
      await profileRef.set({
        uid: authUser.uid,
        email,
        role: user.role,
        userRole: user.role,
        primaryRole: user.role,
        status: 'active',
        approvalStatus: 'approved',
        suspended: false,
        active: true,
        testAccount: true,
        displayName: user.displayName,
        onboardingComplete: true,
        legalAcceptedAt: new Date().toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(user.extraProfile || {})
      }, { merge: true });
      console.log(`Firestore profile synced for ${email} in users/${authUser.uid}`);

      // Fail before Playwright if the account used by the E2E suite still cannot
      // resolve to its canonical production role.
      await assertLaunchReadyRoleIdentity(authUser.uid, email, user.role);
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
