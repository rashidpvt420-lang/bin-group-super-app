type ConsoleArgs = unknown[];

type DiagnosticStage =
  | 'AUTH'
  | 'PROFILE_READ'
  | 'APP_CHECK_REFRESH'
  | 'APP_CHECK_INIT'
  | 'RUNTIME';

type AppCheckFailure = {
  stage: 'APP_CHECK_REFRESH' | 'APP_CHECK_INIT';
  code: string;
  at: number;
};

const DIAGNOSTIC_ELEMENT_ID = 'bin-android-runtime-diagnostic';
const APP_CHECK_ROOT_CAUSE_WINDOW_MS = 30_000;
let lastAppCheckFailure: AppCheckFailure | null = null;

const isNativeAndroid = (): boolean => {
  if (typeof window === 'undefined') return false;
  const runtime = (window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }).Capacitor;

  if (!runtime) return false;
  const platform = runtime.getPlatform?.() || '';
  const native = runtime.isNativePlatform?.() ?? platform !== 'web';
  return native && platform === 'android';
};

const safeCode = (value: unknown): string => {
  const raw = String(value || 'unknown');
  const sanitized = raw.replace(/[^a-zA-Z0-9_./:-]/g, '').slice(0, 96);
  return sanitized || 'unknown';
};

const codeFromError = (value: unknown): string => {
  if (!value || typeof value !== 'object') return safeCode(value);
  const record = value as Record<string, unknown>;
  return safeCode(record.code || record.name || 'unknown');
};

const rememberAppCheckFailure = (
  stage: AppCheckFailure['stage'],
  code: unknown,
): AppCheckFailure => {
  const failure = { stage, code: safeCode(code), at: Date.now() };
  lastAppCheckFailure = failure;
  return failure;
};

const recentAppCheckFailure = (): AppCheckFailure | null => {
  if (!lastAppCheckFailure) return null;
  return Date.now() - lastAppCheckFailure.at <= APP_CHECK_ROOT_CAUSE_WINDOW_MS
    ? lastAppCheckFailure
    : null;
};

const showDiagnostic = (stage: DiagnosticStage, code: unknown): void => {
  if (!isNativeAndroid() || typeof document === 'undefined') return;

  const safeStage = safeCode(stage);
  const safeErrorCode = safeCode(code);
  let node = document.getElementById(DIAGNOSTIC_ELEMENT_ID);

  if (!node) {
    node = document.createElement('div');
    node.id = DIAGNOSTIC_ELEMENT_ID;
    node.setAttribute('role', 'status');
    node.style.position = 'fixed';
    node.style.left = '12px';
    node.style.right = '12px';
    node.style.bottom = '12px';
    node.style.zIndex = '2147483647';
    node.style.padding = '12px 14px';
    node.style.borderRadius = '12px';
    node.style.background = '#111827';
    node.style.color = '#FFFFFF';
    node.style.fontFamily = 'monospace';
    node.style.fontSize = '12px';
    node.style.lineHeight = '1.45';
    node.style.boxShadow = '0 10px 30px rgba(0,0,0,0.30)';
    document.body.appendChild(node);
  }

  node.textContent = [
    'BIN GROUP Android diagnostic',
    `stage=${safeStage}`,
    `code=${safeErrorCode}`,
    'No credential or token data is shown.',
    'Take a screenshot and send it to support.',
  ].join('\n');
};

const inspectConsole = (args: ConsoleArgs): void => {
  const label = typeof args[0] === 'string' ? args[0] : '';

  if (label === '[AUTH_DIAGNOSTIC]') {
    const payload = args[1] && typeof args[1] === 'object'
      ? args[1] as Record<string, unknown>
      : {};
    showDiagnostic('AUTH', payload.code || 'auth/unknown');
    return;
  }

  if (label.includes('[ROLE-SYNC] Secure-session proof refresh failed')) {
    const failure = rememberAppCheckFailure(
      'APP_CHECK_REFRESH',
      codeFromError(args[args.length - 1]),
    );
    showDiagnostic(failure.stage, failure.code);
    return;
  }

  if (label.includes('[Firebase] App Check initialization failed')) {
    const failure = rememberAppCheckFailure(
      'APP_CHECK_INIT',
      codeFromError(args[args.length - 1]),
    );
    showDiagnostic(failure.stage, failure.code);
    return;
  }

  if (label.includes('[ROLE-SYNC] Own-profile verification failed')) {
    // A final Firestore PROFILE_READ error is downstream of App Check. If the
    // secure-session refresh just failed, preserve that deeper root cause instead
    // of overwriting the diagnostic with a generic permission-denied profile read.
    const appCheckRootCause = recentAppCheckFailure();
    if (appCheckRootCause) {
      showDiagnostic(appCheckRootCause.stage, appCheckRootCause.code);
    } else {
      showDiagnostic('PROFILE_READ', codeFromError(args[args.length - 1]));
    }
  }
};

export const installAndroidRuntimeDiagnostics = (): void => {
  // Install the console interceptor as early as possible, even before Capacitor's
  // native runtime object is guaranteed to be visible. Rendering still remains
  // Android-native-only because showDiagnostic() checks the platform at event time.
  if (typeof window === 'undefined' || typeof console === 'undefined') return;

  const globalKey = '__BIN_ANDROID_RUNTIME_DIAGNOSTICS_INSTALLED__';
  const marker = window as unknown as Record<string, unknown>;
  if (marker[globalKey] === true) return;
  marker[globalKey] = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: ConsoleArgs) => {
    try {
      inspectConsole(args);
    } catch {
      // Diagnostics must never interfere with authentication or application flow.
    }
    originalError(...args);
  };

  console.warn = (...args: ConsoleArgs) => {
    try {
      inspectConsole(args);
    } catch {
      // Diagnostics must never interfere with authentication or application flow.
    }
    originalWarn(...args);
  };
};

installAndroidRuntimeDiagnostics();
