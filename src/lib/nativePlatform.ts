import { Capacitor } from '@capacitor/core';

/**
 * True when the app runs inside the installed Android/iOS shell (Capacitor).
 * Browser Google sign-in (popup/redirect) is not supported in that WebView, so
 * Google sign-in controls are hidden there and email + password is used instead.
 */
export const isNativeApp = (): boolean => {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

export const GOOGLE_SIGNIN_UNSUPPORTED_CODE = 'auth/operation-not-supported-in-this-environment';
