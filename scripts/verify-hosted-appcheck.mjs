#!/usr/bin/env node
/**
 * Quick sanity check: deployed main-app bundle should initialize App Check when
 * production hosting is meant to pass credentialed E2E.
 */
const base = String(process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app').replace(/\/+$/, '');

const res = await fetch(`${base}/`, { redirect: 'follow' });
if (!res.ok) {
  console.error(`[hosted-appcheck] failed to fetch ${base} status=${res.status}`);
  process.exit(1);
}
const html = await res.text();
const asset = html.match(/\/assets\/index-[^"']+\.js/)?.[0];
if (!asset) {
  console.error('[hosted-appcheck] could not find main JS asset in index.html');
  process.exit(1);
}

const jsRes = await fetch(`${base}${asset}`);
const js = await jsRes.text();
const hasSiteKey = /6L[\w-]{30,}/.test(js) || /APP_CHECK_SITE_KEY|ReCaptchaV3Provider|initializeAppCheck/i.test(js);
const hasExplicitDisable = /ENABLE_FIREBASE_APPCHECK.*?false/i.test(js);

if (!hasSiteKey) {
  console.error('[hosted-appcheck] FAIL deployed main bundle does not appear to initialize App Check.');
  console.error('[hosted-appcheck] Rebuild with: npm run build:live && redeploy hosting before credentialed E2E.');
  process.exit(1);
}
if (hasExplicitDisable) {
  console.warn('[hosted-appcheck] WARN bundle may have App Check disabled flags; verify Console enforcement manually.');
}

console.log(`[hosted-appcheck] ok asset=${asset}`);
