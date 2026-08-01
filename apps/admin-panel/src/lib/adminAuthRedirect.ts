const DEFAULT_ADMIN_DESTINATION = '/dashboard';
const ADMIN_LOGIN_PATH = '/login';
const SAFE_ORIGIN = 'https://bin-admin.invalid';

const hasControlCharacters = (value: string): boolean => Array.from(value).some((character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
});

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
    hasControlCharacters(candidate)
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
