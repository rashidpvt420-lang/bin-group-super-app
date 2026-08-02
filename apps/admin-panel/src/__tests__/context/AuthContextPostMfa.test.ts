import { readFileSync } from 'fs';
import { resolve } from 'path';

const authContextSource = readFileSync(
  resolve(__dirname, '../../context/AuthContext.tsx'),
  'utf8',
);

const unifiedLoginSource = readFileSync(
  resolve(__dirname, '../../components/UnifiedLogin.tsx'),
  'utf8',
);

describe('AuthContext post-MFA authorization contract', () => {
  test('exposes an explicit retryAuthorization operation and calls it after MFA resolution', () => {
    expect(authContextSource).toContain('retryAuthorization: () => Promise<void>');
    expect(authContextSource).toContain('const retryAuthorization = useCallback(async () =>');
    expect(unifiedLoginSource).toMatch(/onResolved=\{\(\) => \{[\s\S]*void retryAuthorization\(\);/);
  });

  test('forces one fresh token refresh inside the serialized fail-closed authorization path', () => {
    const authorizationFunction = authContextSource.slice(
      authContextSource.indexOf('const authorizeFirebaseUser'),
      authContextSource.indexOf('const retryAuthorization'),
    );
    const retryFunction = authContextSource.slice(
      authContextSource.indexOf('const retryAuthorization'),
      authContextSource.indexOf('useEffect(() =>', authContextSource.indexOf('const retryAuthorization')),
    );

    expect(authorizationFunction).toMatch(/await timeout\(getIdTokenResult\(firebaseUser, true\)/);
    expect(retryFunction).toContain('await authorizeFirebaseUser(currentUser);');
    expect(retryFunction).not.toContain('getIdTokenResult(currentUser, true)');
    expect(authContextSource).toContain("throw new Error('INVALID_ADMIN_CLAIMS')");
    expect(authContextSource).toContain("throw new Error('ADMIN_MFA_REQUIRED')");
  });

  test('authorization failure retains the Firebase session instead of silently signing out', () => {
    const authorizationFunction = authContextSource.slice(
      authContextSource.indexOf('const authorizeFirebaseUser'),
      authContextSource.indexOf('const retryAuthorization'),
    );
    expect(authorizationFunction).not.toContain('await signOut(auth)');
    expect(authorizationFunction).not.toContain('void signOut(auth)');
    expect(authorizationFunction).toContain("setStatus('failed')");
  });

  test('a null auth callback does not erase an already-visible authorization failure', () => {
    expect(authContextSource).toMatch(/if \(!firebaseUser\) \{[\s\S]*if \(statusRef\.current !== 'failed'\) \{[\s\S]*setError\(null\);/);
  });

  test('failed retained sessions expose retry and explicit reset without rendering another credential submission', () => {
    expect(unifiedLoginSource).toContain('const retainedFailedSession');
    expect(unifiedLoginSource).toContain('data-testid="admin-retry-authorization"');
    expect(unifiedLoginSource).toContain('data-testid="admin-reset-failed-session"');
    expect(unifiedLoginSource).toContain('isAuthenticated || auth.currentUser');
  });
});
