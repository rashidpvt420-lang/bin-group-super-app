#!/usr/bin/env node
/**
 * Validate that the admin panel build/runtime targets Firebase project bin-group-57c60.
 * Does not print full API keys.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const EXPECTED = {
  projectId: 'bin-group-57c60',
  authDomain: 'bin-group-57c60.firebaseapp.com',
  appIdSuffix: '285cb53bc26626d699f3b6',
  storageBucket: 'bin-group-57c60.firebasestorage.app',
};

const args = process.argv.slice(2);
function argValue(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return '';
  return String(args[idx + 1] || '').trim();
}

const siteUrl = argValue('url') || process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app';
const localBuildDir = argValue('build') || path.resolve('apps/admin-panel/build');
const sourceFile = path.resolve('apps/admin-panel/src/lib/firebase.ts');

function mask(value) {
  const text = String(value || '');
  if (text.length < 12) return '(short)';
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function isPlausible(key, value) {
  if (!value || value.includes('REPLACE') || value.includes('REACT_APP') || value.includes('process.env')) return false;
  if (key === 'projectId') return value === 'bin-group-57c60' || /^[a-z0-9-]+$/.test(value);
  if (key === 'authDomain') return /\.firebaseapp\.com$/.test(value);
  if (key === 'storageBucket') return /\.(firebasestorage\.app|appspot\.com)$/.test(value);
  if (key === 'apiKey') return /^AIza[0-9A-Za-z\-_]{20,}$/.test(value);
  if (key === 'appId') return /^1:\d+:web:[a-z0-9]+$/i.test(value);
  if (key === 'messagingSenderId') return /^\d{6,}$/.test(value);
  return true;
}

function extractConfig(text) {
  const found = {};
  // Literal regexes only — Codacy/Semgrep rejects RegExp(non-literal).
  const literalPatterns = {
    apiKey: [
      /apiKey\s*:\s*["']([^"']+)["']/g,
      /["']apiKey["']\s*:\s*["']([^"']+)["']/g,
    ],
    authDomain: [
      /authDomain\s*:\s*["']([^"']+)["']/g,
      /["']authDomain["']\s*:\s*["']([^"']+)["']/g,
    ],
    projectId: [
      /projectId\s*:\s*["']([^"']+)["']/g,
      /["']projectId["']\s*:\s*["']([^"']+)["']/g,
    ],
    storageBucket: [
      /storageBucket\s*:\s*["']([^"']+)["']/g,
      /["']storageBucket["']\s*:\s*["']([^"']+)["']/g,
    ],
    messagingSenderId: [
      /messagingSenderId\s*:\s*["']([^"']+)["']/g,
      /["']messagingSenderId["']\s*:\s*["']([^"']+)["']/g,
    ],
    appId: [
      /appId\s*:\s*["']([^"']+)["']/g,
      /["']appId["']\s*:\s*["']([^"']+)["']/g,
    ],
  };

  for (const [key, patterns] of Object.entries(literalPatterns)) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1];
        if (isPlausible(key, value)) found[key] = value;
      }
    }

    // CRA minified fallback: projectId:TS(... )||"bin-group-57c60"
    let from = 0;
    const needle = `${key}:`;
    while (from < text.length) {
      const idx = text.indexOf(needle, from);
      if (idx === -1) break;
      const window = text.slice(idx, idx + 400);
      const orMatch = window.match(/\|\|\s*["']([^"']+)["']/);
      if (orMatch && isPlausible(key, orMatch[1])) found[key] = orMatch[1];
      from = idx + needle.length;
    }
  }

  // Direct project / app id needles as last resort
  if (!found.projectId && text.includes('bin-group-57c60')) found.projectId = 'bin-group-57c60';
  if (!found.authDomain) {
    const m = text.match(/bin-group-57c60\.firebaseapp\.com/);
    if (m) found.authDomain = m[0];
  }
  if (!found.appId) {
    const m = text.match(/1:123413252227:web:[a-z0-9]+/i);
    if (m) found.appId = m[0];
  }
  if (!found.storageBucket) {
    const m = text.match(/bin-group-57c60\.(?:firebasestorage\.app|appspot\.com)/);
    if (m) found.storageBucket = m[0];
  }
  if (!found.apiKey) {
    const m = text.match(/AIza[0-9A-Za-z\-_]{20,}/);
    if (m) found.apiKey = m[0];
  }
  if (!found.messagingSenderId) {
    const m = text.match(/\b123413252227\b/);
    if (m) found.messagingSenderId = m[0];
  }
  return found;
}

function assertConfig(label, config, failures) {
  console.log(`[admin-firebase] ${label}`);
  for (const [key, value] of Object.entries(config)) {
    const shown = key === 'apiKey' || key === 'appId' ? mask(value) : value;
    console.log(`  ${key}=${shown}`);
  }
  if (config.projectId && config.projectId !== EXPECTED.projectId) {
    failures.push(`${label}: projectId=${config.projectId} expected=${EXPECTED.projectId}`);
  }
  if (config.authDomain && config.authDomain !== EXPECTED.authDomain) {
    failures.push(`${label}: authDomain mismatch`);
  }
  if (config.appId && !String(config.appId).includes(EXPECTED.appIdSuffix)) {
    failures.push(`${label}: appId does not match intended web app …${EXPECTED.appIdSuffix}`);
  }
  if (config.storageBucket && config.storageBucket.includes('admin-panel-id')) {
    failures.push(`${label}: storage/app placeholder still present`);
  }
  if (JSON.stringify(config).includes('REPLACE_WITH') || JSON.stringify(config).includes('REPLACE_ME')) {
    failures.push(`${label}: placeholder Firebase config embedded`);
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function collectLocalJs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const failures = [];

if (existsSync(sourceFile)) {
  const source = readFileSync(sourceFile, 'utf8');
  const sourceConfig = extractConfig(source);
  assertConfig('admin-source', sourceConfig, failures);
  if (!source.includes(EXPECTED.projectId)) {
    failures.push('admin source does not reference bin-group-57c60');
  }
} else {
  failures.push(`missing admin firebase source: ${sourceFile}`);
}

const localFiles = collectLocalJs(localBuildDir);
const buildExplicitlyRequested = args.includes('--build');
if (localFiles.length) {
  let merged = {};
  for (const file of localFiles.slice(0, 40)) {
    const text = readFileSync(file, 'utf8');
    Object.assign(merged, extractConfig(text));
  }
  if (Object.keys(merged).length) {
    assertConfig('admin-local-build', merged, failures);
    if (!merged.projectId) {
      failures.push('admin-local-build: missing projectId in built bundle');
    }
    if (!merged.apiKey) {
      failures.push('admin-local-build: missing apiKey in built bundle (REACT_APP_FIREBASE_API_KEY not embedded)');
    }
    if (!merged.appId) {
      failures.push('admin-local-build: missing appId in built bundle (REACT_APP_FIREBASE_APP_ID not embedded)');
    }
    if (!merged.authDomain) {
      failures.push('admin-local-build: missing authDomain in built bundle');
    }
    if (!merged.storageBucket) {
      failures.push('admin-local-build: missing storageBucket in built bundle');
    }
    if (!merged.messagingSenderId) {
      failures.push('admin-local-build: missing messagingSenderId in built bundle');
    }
  } else if (buildExplicitlyRequested) {
    failures.push(
      `admin-local-build: no REACT_APP_FIREBASE_* / Firebase config literals found in ${localBuildDir} (fail closed for explicit --build)`,
    );
  } else {
    console.warn('[admin-firebase] local build present but no Firebase config literals found (may be split oddly)');
  }
} else if (buildExplicitlyRequested) {
  failures.push(`admin-local-build: build directory empty or missing at ${localBuildDir}`);
} else {
  console.warn(`[admin-firebase] local build not found at ${localBuildDir} — will validate live URL if reachable`);
}

try {
  console.log(`[admin-firebase] fetching live admin site ${siteUrl}`);
  const html = await fetchText(siteUrl);
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|mjs))["']/g)].map((m) => new URL(m[1], siteUrl).toString());
  const liveConfig = {};
  for (const assetUrl of assetUrls.slice(0, 30)) {
    try {
      const text = await fetchText(assetUrl);
      Object.assign(liveConfig, extractConfig(text));
    } catch (err) {
      console.warn(`[admin-firebase] skip asset ${assetUrl}: ${err.message}`);
    }
  }
  if (!Object.keys(liveConfig).length) {
    failures.push('live admin site: could not extract Firebase config from bundles');
  } else {
    assertConfig('admin-live', liveConfig, failures);
  }
} catch (err) {
  console.warn(`[admin-firebase] live fetch skipped/failed: ${err.message}`);
  failures.push(`live admin fetch failed: ${err.message}`);
}

if (failures.length) {
  console.error('\n[admin-firebase] FAIL');
  for (const item of failures) console.error(`- ${item}`);
  console.error('\nDiagnosis guide:');
  console.error('- Wrong projectId/appId in live bundle → stale hosting or wrong CI env (REACT_APP_FIREBASE_* not injected).');
  console.error('- Correct projectId/appId but auth/invalid-credential in UI while REST/Admin SDK works → password drift / missing PASSWORD_PROVIDER (do not rotate repeatedly until project match is proven).');
  console.error('- Source fallbacks match bin-group-57c60; compare with live extract above.');
  process.exit(1);
}

console.log('[admin-firebase] PASS — admin build/runtime targets bin-group-57c60');
process.exit(0);
