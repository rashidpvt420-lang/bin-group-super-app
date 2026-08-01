const DEFAULT_ADMIN_DESTINATION = '/dashboard';
const ADMIN_LOGIN_PATH = '/login';
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const SAFE_ORIGIN = 'https://bin-admin.invalid';

export const sanitizeAdminReturnTo = (
  rawReturnTo: string | null | undefined,
  fallback = DEFAULT_ADMIN_DESTINATION,
): string => {
  const candidate = String(rawReturnTo || '').trim();

  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    CONTROL_CHARACTERS.test(candidate)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, SAFE_ORIGIN);
    if (parsed.origin !== SAFE_ORIGIN) return fallback;

    const pathname = parsed.pathname || '/';
    if (pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`)) {
      return fallback;
    }

    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
};

export const adminReturnToFromSearch = (
  search: string,
  fallback = DEFAULT_ADMIN_DESTINATION,
): string => {
  const returnTo = new URLSearchParams(search).get('returnTo');
  return sanitizeAdminReturnTo(returnTo, fallback);
};
