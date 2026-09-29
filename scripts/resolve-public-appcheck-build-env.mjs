const DEBUG_TOKEN_ASSIGNMENT_RE = /(?:VITE_)?FIREBASE_APPCHECK_DEBUG_TOKEN\s*=/;

const clean = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized || /REPLACE|undefined|^null$/i.test(normalized)) return '';
  return normalized;
};

export function parseEnvFile(source) {
  const values = {};
  for (const line of String(source || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

/**
 * Production public web builds take the reCAPTCHA Enterprise site key from
 * FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY (or the production env file written
 * from that secret). Debug tokens are never forwarded into the web build.
 */
export function resolvePublicAppCheckBuildEnv({
  env = {},
  mode = 'production',
  productionEnv = '',
} = {}) {
  const failures = [];
  const fileValues = parseEnvFile(productionEnv);
  if (mode === 'production' && DEBUG_TOKEN_ASSIGNMENT_RE.test(productionEnv)) {
    failures.push('Production environment file must not assign an App Check debug token.');
  }

  const appCheckEnabled = clean(env.VITE_ENABLE_FIREBASE_APPCHECK) === 'true'
    || fileValues.VITE_ENABLE_FIREBASE_APPCHECK === 'true';
  const enterpriseKey = clean(env.FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY);
  const fileSiteKey = clean(fileValues.VITE_APP_CHECK_SITE_KEY);
  const fileProvider = clean(fileValues.VITE_APP_CHECK_PROVIDER).toLowerCase();
  const productionDeploy = clean(env.GITHUB_WORKFLOW) === 'Firebase Production Deploy';
  const useEnterpriseSource = mode === 'production' && (
    productionDeploy || Boolean(enterpriseKey) || fileProvider === 'enterprise'
  );

  let siteKey = '';
  let provider = clean(env.VITE_APP_CHECK_PROVIDER).toLowerCase();
  if (useEnterpriseSource) {
    siteKey = enterpriseKey || fileSiteKey;
    provider = 'enterprise';
  } else if (mode === 'production') {
    siteKey = clean(env.VITE_APP_CHECK_SITE_KEY) || fileSiteKey;
    provider = provider || fileProvider || 'v3';
  } else {
    siteKey = clean(env.VITE_APP_CHECK_SITE_KEY) || fileSiteKey;
    provider = provider || fileProvider;
  }

  if (mode === 'production' && appCheckEnabled && !siteKey) {
    failures.push('App Check is enabled but no site key is present.');
  }

  return {
    failures,
    siteKey,
    provider,
    stripDebugToken: mode === 'production',
  };
}
