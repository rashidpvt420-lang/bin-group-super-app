import { adminReturnToFromSearch, sanitizeAdminReturnTo } from '../../lib/adminAuthRedirect';

describe('adminAuthRedirect', () => {
  test('keeps a sanitized internal path with query and hash', () => {
    expect(sanitizeAdminReturnTo('/profile?tab=mfa#totp')).toBe('/profile?tab=mfa#totp');
    expect(adminReturnToFromSearch('?returnTo=%2Fprofile%3Ftab%3Dmfa%23totp')).toBe('/profile?tab=mfa#totp');
  });

  test.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    'javascript:alert(1)',
    'profile',
  ])('rejects an open-redirect candidate: %s', (candidate) => {
    expect(sanitizeAdminReturnTo(candidate)).toBe('/dashboard');
  });

  test.each([
    '/login',
    '/login?returnTo=/profile',
    '/login/retry',
  ])('rejects a login-loop destination: %s', (candidate) => {
    expect(sanitizeAdminReturnTo(candidate)).toBe('/dashboard');
  });

  test('uses the supplied fallback when returnTo is missing or invalid', () => {
    expect(adminReturnToFromSearch('', '/profile')).toBe('/profile');
    expect(adminReturnToFromSearch('?returnTo=%2F%2Fevil.example', '/profile')).toBe('/profile');
  });
});
