// Classify why the protected Owner quotation (previewOwnerInspectionQuote) could not be issued.
//
// Live incident 2026-09-30 21:41 GST (prod 0b2ac993): every call returned HTTP 401 with
// Cloud Functions logging verifications { auth: VALID, app: MISSING }. The Owner's Firebase Auth
// session was fine; the browser had no App Check token (the public bundle's reCAPTCHA site key is
// rejected by Google as "Invalid site key"), and enforceAppCheck rejects such calls as
// "unauthenticated". The page mapped every unauthenticated/permission-denied error to
// "Your secure Owner session has expired", sent the Owner to sign in again (which cannot fix App
// Check) and the Owner ended on the dashboard.
//
// This module has no imports so it can be unit-tested in isolation.

export type OwnerQuoteFailureKind =
    | 'session_expired'   // Firebase Auth session missing or could not be refreshed: sign in again helps.
    | 'security_check'    // App Check token missing/invalid: signing in again does NOT help.
    | 'account_not_ready' // Server rejected the verified Owner account state (role/verification/suspension).
    | 'failed';           // Anything else (validation, server error, network).

export type OwnerQuoteFailureInput = {
    /** Error code from the Functions SDK, e.g. "functions/unauthenticated". */
    code?: unknown;
    /** True when auth.currentUser.getIdToken(true) succeeded just before the call. */
    idTokenRefreshed: boolean;
    /** False when the App Check SDK could not produce a token; null when App Check is not initialised/unknown. */
    appCheckTokenOk: boolean | null;
};

export function classifyOwnerQuoteFailure(input: OwnerQuoteFailureInput): OwnerQuoteFailureKind {
    const code = String(input.code || '').toLowerCase();
    const unauthenticated = code.includes('unauthenticated');
    const permissionDenied = code.includes('permission-denied');
    if (!input.idTokenRefreshed) return 'session_expired';
    if (input.appCheckTokenOk === false) return 'security_check';
    // With a freshly refreshed ID token, a 401 "unauthenticated" from an enforceAppCheck callable
    // means the App Check token was rejected, not that the Owner's session expired.
    if (unauthenticated) return 'security_check';
    if (permissionDenied) return 'account_not_ready';
    return 'failed';
}

/** Only an expired/unrestorable Firebase Auth session should offer "Sign in again". */
export function ownerQuoteFailureOffersSignIn(kind: OwnerQuoteFailureKind): boolean {
    return kind === 'session_expired';
}

/** A retry on the same page can help once the security check or a transient failure clears. */
export function ownerQuoteFailureOffersRetry(kind: OwnerQuoteFailureKind): boolean {
    return kind === 'security_check' || kind === 'failed';
}
