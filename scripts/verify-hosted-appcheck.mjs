#!/usr/bin/env node
/**
 * Quick sanity check: deployed main + admin bundles should initialize App Check when
 * production hosting is meant to pass credentialed E2E.
 */
const mainBase = String(process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app').replace(/\/+$/, '');
const adminBase = String(process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app').replace(/\/+$/, '');

async function checkBundle(base, label) {
  const res = await fetch(`${base}/`, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`[hosted-appcheck] ${label} failed to fetch ${base} status=${res.status}`);
    return false;
  }
  const html = await res.text();
  const asset =
    html.match(/\/assets\/index-[^"']+\.js/)?.[0] ||
    html.match(/\/static\/js\/main\.[^"']+\.js/)?.[0];
  if (!asset) {
    console.error(`[hosted-appcheck] ${label} could not find main JS asset in index.html`);
    return false;
  }

  const jsRes = await fetch(`${base}${asset}`);
  const js = await jsRes.text();
  const hasSiteKey =
    /6L[\w-]{30,}/.test(js) || /APP_CHECK_SITE_KEY|ReCaptchaV3Provider|initializeAppCheck/i.test(js);
  const hasExplicitDisable = /ENABLE_FIREBASE_APPCHECK.*?false/i.test(js);

  if (!hasSiteKey) {
    console.error(`[hosted-appcheck] FAIL ${label} bundle does not appear to initialize App Check.`);
    return false;
  }
  if (hasExplicitDisable) {
    console.warn(`[hosted-appcheck] WARN ${label} may have App Check disabled flags; verify Console enforcement.`);
  }
  console.log(`[hosted-appcheck] ok ${label} asset=${asset}`);
  return true;
}

let ok = true;
ok = (await checkBundle(mainBase, 'main')) && ok;
ok = (await checkBundle(adminBase, 'admin')) && ok;

if (!ok) {
  console.error('[hosted-appcheck] Rebuild and deploy the exact current main SHA through the protected production workflow.');
  process.exit(1);
}
