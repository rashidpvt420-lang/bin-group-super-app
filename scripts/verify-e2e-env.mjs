import { existsSync } from 'fs';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

const root = process.cwd();
for (const pkg of ['dotenv', 'firebase-admin']) {
  if (!existsSync(path.join(root, 'node_modules', pkg))) {
    console.error(`[E2E_ENV_GUARD] missing root dependency "${pkg}".`);
    console.error('[E2E_ENV_GUARD] Run at repo root: npm install --legacy-peer-deps');
    process.exit(1);
  }
}

const possibleConfigPaths = [
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
];

for (const envPath of possibleConfigPaths) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
    console.log('[E2E_ENV_GUARD] loaded=' + envPath);
    break;
  }
}

const roles = ['ADMIN', 'OWNER', 'TENANT', 'TECHNICIAN', 'BROKER'];
const mailboxEmailEnv = (role) =>
  role === 'OWNER' || role === 'BROKER'
    ? `E2E_${role}_MAILBOX_EMAIL`
    : `E2E_${role}_EMAIL`;
// Owner and Broker use dedicated OAuth-authenticated mailboxes.
const EMAIL_KEY = (role) =>
  role === 'OWNER' || role === 'BROKER' ? `E2E_${role}_MAILBOX_EMAIL` : `E2E_${role}_EMAIL`;
const mailboxOauthKeys = [
  'E2E_OWNER_MAILBOX_CLIENT_ID',
  'E2E_OWNER_MAILBOX_CLIENT_SECRET',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'E2E_BROKER_MAILBOX_CLIENT_ID',
  'E2E_BROKER_MAILBOX_CLIENT_SECRET',
  'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
];
const MAILBOX_OAUTH_ATTESTATION = 'owner+broker-profile-verified';
const strictRoles = process.env.E2E_STRICT_ROLES === 'true';
const requireMailboxEvidence = process.env.E2E_REQUIRE_MAILBOX_EVIDENCE === 'true';
const mailboxEvidenceKeys = [
  'E2E_OWNER_MAILBOX_EMAIL',
  'E2E_OWNER_MAILBOX_CLIENT_ID',
  'E2E_OWNER_MAILBOX_CLIENT_SECRET',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'E2E_BROKER_MAILBOX_EMAIL',
  'E2E_BROKER_MAILBOX_CLIENT_ID',
  'E2E_BROKER_MAILBOX_CLIENT_SECRET',
  'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
];
const requireFounderEvidence = strictRoles && (
  process.env.E2E_REQUIRE_FOUNDER_MFA === 'true' ||
  process.env.GITHUB_WORKFLOW === 'Live Role Smoke Tests' ||
  process.env.GITHUB_WORKFLOW === 'Admin Production Evidence'
);
const keys = [
  'E2E_BASE_URL',
  ...(strictRoles ? ['E2E_ADMIN_BASE_URL'] : []),
  ...roles.flatMap((role) => [EMAIL_KEY(role), `E2E_${role}_PASSWORD`]),
  ...(requireFounderEvidence ? ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD'] : []),
  ...(requireMailboxEvidence ? mailboxEvidenceKeys : []),
];
const missing = keys.filter((key) => !String(process.env[key] || '').trim());
const allowMissing = process.env.E2E_ALLOW_MISSING_ENV === 'true';

const PLACEHOLDER_PATTERNS = [
  /^your[_-]?registered[_-]?uuid$/i,
  /^replace[_-]?(me|with)/i,
  /^xxx+$/i,
  /^todo$/i,
  /^changeme$/i,
  /^false$/i,
  /^true$/i,
];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskToken(token) {
  if (!token || token.length < 12) return '(invalid)';
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function validateAppCheckToken() {
  const token = String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
  const skip = process.env.E2E_SKIP_APPCHECK_TOKEN === 'true';
  if (skip) {
    if (process.env.E2E_STRICT_LIVE === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      console.error('[E2E_ENV_GUARD] E2E_SKIP_APPCHECK_TOKEN is forbidden in strict live or GitHub Actions runs.');
      return ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN(skip-forbidden)'];
    }
    console.warn('[E2E_ENV_GUARD] App Check token check skipped via E2E_SKIP_APPCHECK_TOKEN=true (not allowed for launch clearance).');
    return [];
  }
  if (!token) return ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN'];
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(token)) || token.includes('YOUR_REGISTERED_UUID')) {
    console.error('[E2E_ENV_GUARD] VITE_FIREBASE_APPCHECK_DEBUG_TOKEN is a placeholder and must be a Console-registered UUID.');
    return ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN(placeholder)'];
  }
  if (!UUID_RE.test(token)) {
    console.error('[E2E_ENV_GUARD] VITE_FIREBASE_APPCHECK_DEBUG_TOKEN is malformed; expected UUID.');
    return ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN(malformed)'];
  }
  console.log('[E2E_ENV_GUARD] appcheck_token_fingerprint=' + maskToken(token));
  return [];
}

function validateFounderEvidence() {
  if (!requireFounderEvidence) return [];
  const founderEmail = String(process.env.E2E_FOUNDER_EMAIL || '').trim().toLowerCase();
  const founderPassword = String(process.env.E2E_FOUNDER_PASSWORD || '').trim();
  const founderTotp = String(process.env.E2E_FOUNDER_TOTP_SECRET || '').trim().toUpperCase().replace(/[\s=-]/g, '');
  const founderRealPhoneCode = String(process.env.E2E_FOUNDER_REAL_MFA_CODE || '').trim();
  const e2eAdminEmail = String(process.env.E2E_ADMIN_EMAIL || '').trim().toLowerCase();
  const errors = [];
  if (founderEmail !== 'ceo@bin-groups.com') errors.push('E2E_FOUNDER_EMAIL(canonical-founder-required)');
  if (founderEmail && founderEmail === e2eAdminEmail) errors.push('E2E_FOUNDER_EMAIL(must-differ-from-ephemeral-admin)');
  if (founderPassword.length < 8) errors.push('E2E_FOUNDER_PASSWORD(invalid)');
  const validTotp = founderTotp.length >= 16 && /^[A-Z2-7]+$/.test(founderTotp);
  const validRealPhoneCode = /^\d{6}$/.test(founderRealPhoneCode);
  if (!validTotp && !validRealPhoneCode) errors.push('E2E_FOUNDER_TOTP_SECRET_or_REAL_MFA_CODE');
  if (!errors.length) {
    console.log(`[E2E_ENV_GUARD] FOUNDER: email=canonical credential=set mfa=${validTotp ? 'totp' : 'real-phone-code'}`);
  }
  return errors;
}

function hasTrustedMailboxOAuthAttestation() {
  const ownerEmail = String(process.env.E2E_OWNER_MAILBOX_EMAIL || '').trim().toLowerCase();
  const brokerEmail = String(process.env.E2E_BROKER_MAILBOX_EMAIL || '').trim().toLowerCase();
  return process.env.GITHUB_ACTIONS === 'true' &&
    process.env.GITHUB_WORKFLOW === 'Firebase Production Deploy' &&
    process.env.GITHUB_REF === 'refs/heads/main' &&
    process.env.E2E_MAILBOX_OAUTH_VERIFIED === MAILBOX_OAUTH_ATTESTATION &&
    EMAIL_RE.test(ownerEmail) &&
    EMAIL_RE.test(brokerEmail);
}

console.log('[E2E_ENV_GUARD] target=' + (process.env.E2E_BASE_URL || '(missing)'));
console.log('[E2E_ENV_GUARD] admin_target=' + (process.env.E2E_ADMIN_BASE_URL || (strictRoles ? '(missing)' : '(not required for this run)')));
for (const role of roles) {
  console.log(`[E2E_ENV_GUARD] ${role}: email=${process.env[EMAIL_KEY(role)] ? 'set' : 'missing'} credential=${process.env[`E2E_${role}_PASSWORD`] ? 'set' : 'missing'}`);
}

const appCheckMissing = validateAppCheckToken();
const founderMissing = validateFounderEvidence();
const allMissing = [...missing, ...appCheckMissing, ...founderMissing];

const techBEmail = String(process.env.E2E_TECHNICIAN_B_EMAIL || '').trim();
const techBPassword = String(process.env.E2E_TECHNICIAN_B_PASSWORD || '').trim();
if ((techBEmail && !techBPassword) || (!techBEmail && techBPassword)) {
  console.error('[E2E_ENV_GUARD] E2E_TECHNICIAN_B_EMAIL and E2E_TECHNICIAN_B_PASSWORD must both be set together.');
  process.exit(1);
}
if (techBEmail) {
  console.log('[E2E_ENV_GUARD] TECHNICIAN_B: email=set credential=set (optional walkthrough only)');
}

if (process.env.E2E_STRICT_LIVE === 'true') {
  if (!String(process.env.VITE_APP_CHECK_SITE_KEY || '').trim()) {
    console.error('[E2E_ENV_GUARD] VITE_APP_CHECK_SITE_KEY is required when E2E_STRICT_LIVE=true (rebuild hosting with npm run build:live before credentialed E2E).');
    process.exit(1);
  }
  console.log('[E2E_ENV_GUARD] live_build_site_key=set');

  const missingMailboxOauth = mailboxOauthKeys.filter((key) => !String(process.env[key] || '').trim());
  if (missingMailboxOauth.length && !hasTrustedMailboxOAuthAttestation()) {
    console.error('[E2E_ENV_GUARD] Missing mailbox OAuth secrets: ' + missingMailboxOauth.join(', '));
    console.error('[E2E_ENV_GUARD] Protected live OTP evidence requires both Owner and Broker read-only Gmail mailbox credentials or a same-job authenticated mailbox attestation.');
    process.exit(1);
  }
  if (missingMailboxOauth.length) {
    console.log('[E2E_ENV_GUARD] mailbox_oauth_attestation=verified (owner+broker authenticated profiles)');
  } else {
    console.log('[E2E_ENV_GUARD] mailbox_oauth_secrets=set (owner+broker)');
  }
}

if (process.env.E2E_STRICT_BUSINESS === 'true') {
  if (!String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()) {
    console.error('[E2E_ENV_GUARD] FIREBASE_SERVICE_ACCOUNT_JSON is required when E2E_STRICT_BUSINESS=true (business-admin Firestore seed).');
    process.exit(1);
  }
  console.log('[E2E_ENV_GUARD] business-admin service account: set');
}

if (allMissing.length) {
  console.error('[E2E_ENV_GUARD] missing=' + allMissing.join(', '));
  if (!allowMissing) {
    console.error('[E2E_ENV_GUARD] Launch audit blocked. Set all required E2E values in .env.e2e or injected secrets. E2E_ALLOW_MISSING_ENV=true is permitted only for non-launch local smoke work.');
    process.exit(1);
  }
  console.warn('[E2E_ENV_GUARD] Continuing with missing values because E2E_ALLOW_MISSING_ENV=true. This must not be used for launch clearance.');
} else {
  if (requireMailboxEvidence) {
    console.log('[E2E_ENV_GUARD] mailbox evidence inputs=set; live Gmail access is verified only by the dedicated consuming step.');
  }
  console.log('[E2E_ENV_GUARD] ok');
}
