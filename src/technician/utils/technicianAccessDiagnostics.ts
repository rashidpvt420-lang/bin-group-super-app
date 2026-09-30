/**
 * Pure classifiers for Technician portal access failures.
 *
 * registerTechnicianDevice runs with enforceAppCheck=true. The Functions runtime
 * rejects a missing or invalid App Check token with `unauthenticated` before the
 * handler runs, so a `permission-denied` from that callable means App Check (and
 * therefore the Play Integrity attestation) already PASSED. Only the
 * APP_CHECK_APP_ID_MISMATCH reason is an integrity-identity problem; the other
 * permission-denied reasons are Technician account/profile state. The client must
 * not tell a Technician that Play Integrity failed when the server refused the
 * account itself.
 *
 * Firestore rules deny every Technician read when the Auth token carries
 * `suspended: true` (signedIn()), and the assigned-jobs list additionally needs an
 * approved technicians/{uid} profile, so a `permission-denied` jobs listener error
 * is an account-activation problem, not a connectivity problem.
 */

export type TechnicianRegistrationFailureKind =
  | 'DEVICE_ROTATION'
  | 'ACCOUNT_INACTIVE'
  | 'ACCOUNT_REFUSED'
  | 'INTEGRITY';

export type TechnicianRegistrationFailure = {
  kind: TechnicianRegistrationFailureKind;
  message: string;
  diagnostic: string;
};

export const TECHNICIAN_ACCOUNT_INACTIVE_CODE = 'technician/account-inactive';

const ACCOUNT_INACTIVE_REASONS = new Set([
  'TECHNICIAN_ACCOUNT_DISABLED_OR_SUSPENDED',
  'TECHNICIAN_PROFILE_SUSPENDED',
  'TECHNICIAN_ROLE_REQUIRED',
]);

export const TECHNICIAN_ACCOUNT_INACTIVE_MESSAGE =
  'This Technician account is not active yet (onboarding activation is pending or the account is suspended). ' +
  'Device registration, physical arrival evidence and assigned jobs stay locked until BIN GROUP HR/Admin completes activation. ' +
  'Sign out and sign in again after activation.';

const ACCOUNT_REFUSED_MESSAGE =
  'The server refused Technician device registration for this account. Google Play Integrity was accepted; ' +
  'ask BIN GROUP HR/Admin to confirm this Technician account is active and approved.';

const DEVICE_ROTATION_MESSAGE =
  'This Technician account is bound to another installation. Ask an authorised administrator to use the controlled device re-registration process.';

const INTEGRITY_MESSAGE =
  'This Android installation could not be verified through Google Play Integrity. Physical arrival evidence is blocked.';

export const safeDiagnosticCode = (error: any): string => {
  const candidates = [
    error?.code,
    error?.details?.code,
    error?.cause?.code,
  ];
  for (const value of candidates) {
    const code = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    if (/^[A-Z0-9_-]{2,80}$/.test(code)) return code;
  }
  return '';
};

const safeReason = (error: any): string => {
  const reason = String(error?.details?.reason || '').trim().toUpperCase();
  return /^[A-Z0-9_]{2,80}$/.test(reason) ? reason : '';
};

const withDiagnostic = (message: string, diagnostic: string) =>
  diagnostic ? `${message} Diagnostic: ${diagnostic}` : message;

export function isTechnicianAccountInactiveClaims(claims: Record<string, unknown> | null | undefined): boolean {
  return Boolean(claims) && claims?.suspended === true;
}

export function classifyTechnicianRegistrationFailure(error: any): TechnicianRegistrationFailure {
  const code = String(error?.code || '').toLowerCase();
  const reason = safeReason(error);
  const diagnosticCode = safeDiagnosticCode(error);
  const diagnostic = reason && diagnosticCode ? `${diagnosticCode}__${reason}` : (diagnosticCode || reason);

  if (code.includes('failed-precondition')) {
    return { kind: 'DEVICE_ROTATION', message: DEVICE_ROTATION_MESSAGE, diagnostic };
  }
  if (code === TECHNICIAN_ACCOUNT_INACTIVE_CODE || ACCOUNT_INACTIVE_REASONS.has(reason)) {
    return { kind: 'ACCOUNT_INACTIVE', message: withDiagnostic(TECHNICIAN_ACCOUNT_INACTIVE_MESSAGE, diagnostic), diagnostic };
  }
  if (code.endsWith('permission-denied') && reason !== 'APP_CHECK_APP_ID_MISMATCH') {
    // Older deployed servers send no reason. permission-denied is only reachable
    // after the App Check gate accepted the token, so this is not an integrity failure.
    return { kind: 'ACCOUNT_REFUSED', message: withDiagnostic(ACCOUNT_REFUSED_MESSAGE, diagnostic), diagnostic };
  }
  return { kind: 'INTEGRITY', message: withDiagnostic(INTEGRITY_MESSAGE, diagnostic), diagnostic };
}

export type TechnicianJobsLoadFailureKind = 'ACCOUNT_ACCESS' | 'QUERY_INDEX' | 'CONNECTION';

export function classifyTechnicianJobsLoadError(error: any): { kind: TechnicianJobsLoadFailureKind; key: string; fallback: string } {
  const code = String(error?.code || '').toLowerCase();
  if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) {
    return {
      kind: 'ACCOUNT_ACCESS',
      key: 'tech.jobs.load_error_account',
      fallback:
        'Assigned jobs are locked for this account. The Technician account must be activated and approved by BIN GROUP HR/Admin before dispatch assignments can be shown.',
    };
  }
  if (code.endsWith('failed-precondition')) {
    return {
      kind: 'QUERY_INDEX',
      key: 'tech.jobs.load_error_service',
      fallback: 'Assigned jobs could not be loaded because the jobs service is not ready. Contact dispatch.',
    };
  }
  return {
    kind: 'CONNECTION',
    key: 'tech.jobs.load_error',
    fallback: 'Assigned jobs could not be loaded. Check your connection or contact dispatch.',
  };
}
