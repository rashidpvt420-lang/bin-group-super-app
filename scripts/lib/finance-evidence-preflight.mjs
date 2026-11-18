// Read-only pre-flight for the Finance identities used by protected production evidence.
//
// The server money gate (functions/financeAdminMfa.ts requireMfaFinanceAdminActor) refuses any
// session whose LIVE custom claims lack an explicit Finance approver role or a financeAuthorizedAt
// grant younger than 24 hours. Evidence that reaches that gate with a stale or missing grant used
// to fail deep inside a 12-minute browser test. This pre-flight reads the same facts up front and
// fails fast with a BLOCKED message. It never writes, never refreshes a grant, never prints a
// secret, and never relaxes the 24-hour TTL: a grant that would expire during the run is refused.

export const FINANCE_APPROVER_ROLES = new Set(['finance_admin', 'finance_manager', 'finance_controller']);
export const FINANCE_AUTHORIZED_AT_CLAIM = 'financeAuthorizedAt';
// Must equal FINANCE_AUTHORIZATION_TTL_MS in functions/financeAdminMfa.ts (guarded by a launch test).
export const FINANCE_AUTHORIZATION_TTL_MS = 24 * 60 * 60 * 1000;
// The grant must stay valid for the whole protected evidence step (two attempts) after pre-flight.
export const FINANCE_EVIDENCE_MIN_REMAINING_MS = 2 * 60 * 60 * 1000;
const MAX_FUTURE_DRIFT_MS = 60 * 1000;

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

export function roleOfClaims(claims = {}) {
  return lower(claims.role || claims.userRole || claims.primaryRole);
}

export function claimsGrantFinanceApprover(claims = {}) {
  if (!claims || claims.suspended === true) return false;
  return FINANCE_APPROVER_ROLES.has(roleOfClaims(claims)) ||
    claims.finance_admin === true || claims.finance_manager === true || claims.finance_controller === true;
}

/** Same accepted shapes as parseAuthorizationTimestampMs in functions/financeAdminMfa.ts. */
export function parseFinanceAuthorizedAtMs(value) {
  if (value === null || value === undefined) return null;
  if (typeof value?.toMillis === 'function') {
    try {
      const ms = value.toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null;
    } catch {
      return null;
    }
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof value === 'object') {
    const seconds = value._seconds ?? value.seconds;
    const nanos = value._nanoseconds ?? value.nanoseconds ?? 0;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      const ms = seconds * 1000 + Math.floor(nanos / 1e6);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function maskedIdentity(user) {
  const email = lower(user?.email);
  const domain = email.includes('@') ? email.split('@').pop() : 'unknown';
  return `uid=${text(user?.uid).slice(0, 6)}… domain=${domain}`;
}

/**
 * Pure assessment of one Finance evidence account (a firebase-admin UserRecord shape).
 * Returns { ok, failures[], summary } with no secret material.
 */
export function assessFinanceEvidenceAccount(user, {
  label,
  allowedRoles = FINANCE_APPROVER_ROLES,
  requiredModules = [],
  staffModules = null,
  nowMs = Date.now(),
  minRemainingMs = FINANCE_EVIDENCE_MIN_REMAINING_MS,
} = {}) {
  const failures = [];
  if (!user) {
    return { ok: false, failures: [`${label}: no Firebase Auth account exists for the configured email.`], summary: `${label}: missing` };
  }
  const claims = user.customClaims || {};
  const role = roleOfClaims(claims);
  if (user.disabled === true) failures.push(`${label}: the Firebase Auth account is disabled.`);
  if (user.emailVerified !== true) failures.push(`${label}: the account email is not verified.`);
  if (claims.suspended === true) failures.push(`${label}: the account is suspended.`);
  if (!claimsGrantFinanceApprover(claims)) {
    failures.push(`${label}: live claims carry no explicit Finance approver role (finance_admin, finance_manager or finance_controller). CEO, Super Admin and Admin never qualify.`);
  } else if (!allowedRoles.has(role)) {
    failures.push(`${label}: role ${role || '(none)'} is not allowed here; expected one of ${[...allowedRoles].join(', ')}.`);
  }
  const factors = Array.isArray(user?.multiFactor?.enrolledFactors) ? user.multiFactor.enrolledFactors : [];
  if (!factors.some((factor) => lower(factor?.factorId) === 'totp')) {
    failures.push(`${label}: no enrolled TOTP second factor.`);
  }

  let ageHours = null;
  const grantedMs = parseFinanceAuthorizedAtMs(claims[FINANCE_AUTHORIZED_AT_CLAIM]);
  if (grantedMs === null) {
    failures.push(`${label}: financeAuthorizedAt is missing or malformed. A new independent two-person Finance authorization is required before evidence can run.`);
  } else if (grantedMs > nowMs + MAX_FUTURE_DRIFT_MS) {
    failures.push(`${label}: financeAuthorizedAt is in the future (clock drift); the server refuses it.`);
  } else {
    const ageMs = nowMs - grantedMs;
    ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;
    if (ageMs >= FINANCE_AUTHORIZATION_TTL_MS) {
      failures.push(`${label}: financeAuthorizedAt is ${ageHours}h old; the 24h Finance authorization has expired. A new independent two-person Finance authorization is required.`);
    } else if (FINANCE_AUTHORIZATION_TTL_MS - ageMs < minRemainingMs) {
      failures.push(`${label}: financeAuthorizedAt is ${ageHours}h old and would expire during this evidence run (needs at least ${Math.round(minRemainingMs / 3_600_000)}h remaining). Re-authorize first.`);
    }
  }

  if (requiredModules.length) {
    const modules = new Set([
      ...(Array.isArray(claims.modules) ? claims.modules : []),
      ...(Array.isArray(staffModules) ? staffModules : []),
    ].map((value) => text(value)));
    const missing = requiredModules.filter((module) => !modules.has(module));
    if (missing.length) failures.push(`${label}: Admin panel modules missing for the Finance UI steps: ${missing.join(', ')}.`);
  }

  return {
    ok: failures.length === 0,
    failures,
    summary: `${label}: ${maskedIdentity(user)} role=${role || '(none)'} financeAuthorizedAgeHours=${ageHours === null ? 'n/a' : ageHours}`,
  };
}

async function findUserByEmail(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

/**
 * Read-only: looks up each account with getUserByEmail (and optionally the staffAccess modules
 * document) and throws `BLOCKED: …` when any account cannot pass the live server money gate.
 * accounts: [{ label, email, allowedRoles?, requiredModules?, distinctFrom?: string[] }]
 */
export async function requireFreshFinanceEvidenceAccounts({ auth, db = null, accounts, nowMs = Date.now(), log = console.log }) {
  const failures = [];
  const summaries = [];
  const seenUids = new Map();
  for (const account of accounts) {
    const email = lower(account.email);
    if (!email) {
      failures.push(`${account.label}: email is not configured.`);
      continue;
    }
    const user = await findUserByEmail(auth, email);
    let staffModules = null;
    if (user && db && account.requiredModules?.length) {
      const staffAccess = await db.collection('staffAccess').doc(user.uid).get().catch(() => null);
      staffModules = staffAccess?.exists ? staffAccess.data()?.modules : null;
    }
    const result = assessFinanceEvidenceAccount(user, { ...account, staffModules, nowMs });
    failures.push(...result.failures);
    summaries.push(result.summary);
    if (user) {
      const previous = seenUids.get(user.uid);
      if (previous) failures.push(`${account.label}: must be a different person from ${previous}; dual control needs two distinct Finance identities.`);
      seenUids.set(user.uid, account.label);
    }
  }
  for (const summary of summaries) log(`[finance-evidence-preflight] ${summary}`);
  if (failures.length) {
    throw new Error(`BLOCKED: Finance evidence pre-flight failed (read-only; nothing was changed).\n- ${failures.join('\n- ')}`);
  }
  log(`[finance-evidence-preflight] PASS accounts=${accounts.length} ttlHours=24 minRemainingHours=${Math.round(FINANCE_EVIDENCE_MIN_REMAINING_MS / 3_600_000)}`);
}
