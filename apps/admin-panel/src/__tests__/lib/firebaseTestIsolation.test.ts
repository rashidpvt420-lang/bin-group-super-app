// Under Jest the Admin Firebase module must never be configured for production: a test that
// renders a page without mocking lib/firebase used to open real listeners against bin-group-57c60.
const mockInitializeApp = jest.fn((config: unknown) => ({ name: '[DEFAULT]', options: config }));

jest.mock('firebase/app', () => ({
  initializeApp: (config: unknown) => mockInitializeApp(config),
  getApps: () => [],
  getApp: () => { throw new Error('getApp should not be used when no app exists'); },
}));

// The SDK services only need to be constructible; nothing here talks to a backend.
const mockSdkModule = () => new Proxy({}, {
  get: (_target, prop) => (prop === '__esModule' ? true : jest.fn(() => ({ mocked: String(prop) }))),
});
jest.mock('firebase/firestore', () => mockSdkModule());
jest.mock('firebase/auth', () => mockSdkModule());
jest.mock('firebase/functions', () => mockSdkModule());
jest.mock('firebase/storage', () => mockSdkModule());
jest.mock('firebase/messaging', () => mockSdkModule());
jest.mock('firebase/app-check', () => mockSdkModule());

describe('Admin Firebase configuration under Jest', () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = originalEnv; jest.resetModules(); mockInitializeApp.mockClear(); });

  test('uses an isolated demo- project even when production values are in the environment', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      REACT_APP_FIREBASE_PROJECT_ID: 'bin-group-57c60',
      REACT_APP_FIREBASE_AUTH_DOMAIN: 'bin-group-57c60.firebaseapp.com',
    };
    jest.isolateModules(() => { require('../../lib/firebase'); });
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    const config = mockInitializeApp.mock.calls[0][0] as Record<string, string>;
    expect(config.projectId).toMatch(/^demo-/);
    for (const value of Object.values(config)) expect(String(value)).not.toContain('bin-group-57c60');
  });
});
