import fs from 'node:fs/promises';

const site = process.argv[2] || 'https://bin-group-57c60.web.app';
const envPath = process.argv[3] || '.env.local';

const requiredMap = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

function absoluteUrl(base, maybePath) {
  return new URL(maybePath, base).toString();
}

function extractAssetUrls(html) {
  const urls = [];
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|mjs|css))["']/g)) {
    urls.push(match[1]);
  }
  return unique(urls);
}

function extractValues(bundleText) {
  const found = {};
  for (const key of Object.keys(requiredMap)) {
    const patterns = [
      new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`, 'g'),
      new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`, 'g'),
    ];
    for (const pattern of patterns) {
      for (const match of bundleText.matchAll(pattern)) {
        const value = match[1];
        if (value && value !== 'undefined' && value !== 'null') found[key] = value;
      }
    }
  }
  return found;
}

function envBody(config) {
  const lines = [];
  for (const [firebaseKey, envKey] of Object.entries(requiredMap)) {
    lines.push(`${envKey}=${config[firebaseKey] || ''}`);
  }
  lines.push('VITE_FIREBASE_VAPID_KEY=');
  lines.push('');
  return lines.join('\n');
}

console.log(`[env-extract] Reading production site: ${site}`);
const html = await fetchText(site);
const assetUrls = extractAssetUrls(html).map((url) => absoluteUrl(site, url));

if (!assetUrls.length) {
  throw new Error('No production JS/CSS assets found in index HTML.');
}

console.log(`[env-extract] Found ${assetUrls.length} assets. Searching Firebase config literals...`);
const config = {};
for (const assetUrl of assetUrls) {
  if (!assetUrl.endsWith('.js') && !assetUrl.endsWith('.mjs')) continue;
  try {
    const text = await fetchText(assetUrl);
    Object.assign(config, extractValues(text));
  } catch (error) {
    console.warn(`[env-extract] Skipped ${assetUrl}: ${error.message}`);
  }
}

const missing = Object.keys(requiredMap).filter((key) => !config[key]);
if (missing.length) {
  console.error('[env-extract] FIREBASE_ENV_EXTRACT_FAIL');
  console.error(`Missing values: ${missing.join(', ')}`);
  console.error('Production bundle may also be missing Firebase env values. Use Firebase Console or firebase login to obtain the Web App config.');
  process.exit(1);
}

await fs.writeFile(envPath, envBody(config), { mode: 0o600 });
console.log(`[env-extract] Wrote ${envPath}`);
for (const [firebaseKey, envKey] of Object.entries(requiredMap)) {
  const value = config[firebaseKey];
  console.log(`${envKey}=present (${String(value).slice(0, 8)}...)`);
}
console.log('FIREBASE_ENV_EXTRACT_PASS');
