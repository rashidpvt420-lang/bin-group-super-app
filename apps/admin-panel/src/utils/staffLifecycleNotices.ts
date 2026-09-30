// Result and error messages for the canonical staff lifecycle dialog.
// The dialog reloads the staff record after every protected write. The notice
// is built here and set only AFTER that reload, so the reload can never wipe it.

export type StaffNotice = { severity: 'success' | 'error' | 'warning' | 'info'; message: string };

const CHECKLIST_LABELS: Record<string, string> = {
  profileComplete: 'Profile complete',
  documentsComplete: 'Documents complete',
  contractComplete: 'Contract complete',
  deviceReady: 'Technician device ready',
  activationApproved: 'Activation approved',
};

const stageLabel = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ');

export function onboardingSaveNotice(displayName: string, result: any, role?: string): StaffNotice {
  const name = String(displayName || 'Staff member');
  const data = result && typeof result === 'object' ? result : {};
  if (data.success !== true) {
    return {
      severity: 'error',
      message: `${name}: onboarding was not confirmed by the server. Nothing was changed. Reload and try again.`,
    };
  }
  if (data.active === true) {
    const technicianNote = String(role || '').toLowerCase() === 'technician'
      ? ' On the Technician app they must sign out and sign in again; device registration and assigned jobs then unlock.'
      : '';
    return {
      severity: 'success',
      message: `Saved. ${name} is now ACTIVE and portal access is enabled. Their existing sessions were signed out.${technicianNote}`,
    };
  }
  const checklist = data.checklist && typeof data.checklist === 'object' ? data.checklist : {};
  const missing = Object.keys(CHECKLIST_LABELS)
    .filter((key) => key in checklist && checklist[key] !== true)
    .map((key) => CHECKLIST_LABELS[key]);
  const emailNote = data.emailVerified === false ? ' The email address is not verified yet.' : '';
  return {
    severity: 'warning',
    message: `Saved at stage ${stageLabel(data.stage)}. ${name} stays suspended with no portal access until every item is ticked` +
      `${missing.length ? ` (still missing: ${missing.join(', ')})` : ''}.${emailNote}`,
  };
}

const CODE_HINTS: Record<string, string> = {
  'permission-denied': 'You do not have authority for this action, or your admin MFA session is required.',
  unauthenticated: 'Your admin session or App Check verification expired. Reload the page and sign in again.',
  'failed-precondition': 'The server refused this change for the current staff state.',
  'invalid-argument': 'The server rejected the submitted values.',
  'not-found': 'This staff record no longer exists.',
  unavailable: 'The server could not be reached. Check your connection and try again.',
  'deadline-exceeded': 'The server took too long to respond. Check the staff record before retrying.',
  internal: 'The server hit an internal error. Nothing is confirmed as saved.',
};

export function staffOperationErrorMessage(action: string, error: any): string {
  const code = String(error?.code || '').replace(/^functions\//, '').toLowerCase();
  const serverMessage = String(error?.message || '')
    .replace(/^FirebaseError:\s*/i, '')
    .trim();
  const hint = CODE_HINTS[code] || 'The protected staff operation failed.';
  const detail = serverMessage && serverMessage.toLowerCase() !== code ? ` Server: ${serverMessage}` : '';
  return `${action} failed${code ? ` (${code})` : ''}. ${hint}${detail}`.slice(0, 480);
}
