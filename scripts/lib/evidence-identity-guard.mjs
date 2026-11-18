// Guard for evidence scripts that delete and recreate a disposable test identity (for example the
// owner-evidence account). They must never delete the canonical Founder, a configured Finance evidence
// tester, or any account that carries staff, Admin or Finance authority, even if an email secret is
// misconfigured to point at one.

const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';
const PROTECTED_ROLE_PATTERN = /^(admin|super_admin|ceo|manager|operations_admin|operations_manager|finance_admin|finance_manager|finance_controller|finance_staff|payroll_admin|hr_admin|hr_manager|hr_staff|support_admin|account_manager|dispatcher|admin_assistant|technician)$/;
const PROTECTED_FLAGS = [
  'admin',
  'isAdmin',
  'super_admin',
  'superAdmin',
  'ceo',
  'manager',
  'staff',
  'isStaff',
  'finance_admin',
  'finance_manager',
  'finance_controller',
  'designatedSecondApprover',
];
const PROTECTED_EMAIL_ENV_KEYS = [
  'E2E_FINANCE_APPROVER_EMAIL',
  'E2E_FINANCE_RECORDER_EMAIL',
  'E2E_ADMIN_EMAIL',
  'SECOND_APPROVER_EMAIL',
];

const lower = (value) => String(value ?? '').trim().toLowerCase();

export function protectedEvidenceIdentityReason(user, env = process.env) {
  const email = lower(user?.email);
  if (email && email === CANONICAL_FOUNDER_EMAIL) return 'canonical Founder account';
  for (const key of PROTECTED_EMAIL_ENV_KEYS) {
    if (email && email === lower(env?.[key])) return `account configured as ${key}`;
  }
  const claims = user?.customClaims || {};
  for (const key of ['role', 'userRole', 'primaryRole']) {
    if (PROTECTED_ROLE_PATTERN.test(lower(claims[key]))) return 'account with a staff, Admin or Finance role';
  }
  if (PROTECTED_FLAGS.some((flag) => claims[flag] === true)) return 'account with staff, Admin or Finance claims';
  return '';
}

export function assertResettableEvidenceIdentity(user, { label = 'evidence identity', env = process.env } = {}) {
  const reason = protectedEvidenceIdentityReason(user, env);
  if (reason) {
    throw new Error(`Refusing to delete the ${label}: it resolves to a protected ${reason}. Fix the evidence email secret.`);
  }
}
