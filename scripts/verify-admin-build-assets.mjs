#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const buildDirectory = path.join(repositoryRoot, 'apps', 'admin-panel', 'build');
const indexPath = path.join(buildDirectory, 'index.html');
const evidencePath = path.join(repositoryRoot, 'launch_package', 'admin-build-assets.json');

const fail = (message) => {
  console.error(`[admin-build-assets] FAIL: ${message}`);
  process.exit(1);
};

if (!existsSync(indexPath)) fail(`missing ${indexPath}`);
const indexHtml = readFileSync(indexPath, 'utf8');
if (!/<div\s+id=["']root["']/.test(indexHtml)) fail('index.html does not contain the React root element');

const scriptSources = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((match) => String(match[1] || '').trim())
  .filter(Boolean);
if (scriptSources.length === 0) fail('index.html contains no JavaScript bundle reference');

const verifiedAssets = [];
let mergedJavaScript = '';
for (const source of scriptSources) {
  if (/^(?:https?:)?\/\//i.test(source)) fail(`external JavaScript bundle is not allowed: ${source}`);
  const relativeAsset = source.replace(/^\/+/, '').split(/[?#]/, 1)[0];
  if (!relativeAsset.endsWith('.js')) fail(`non-JavaScript script source found: ${source}`);
  const assetPath = path.resolve(buildDirectory, relativeAsset);
  const relativeCheck = path.relative(buildDirectory, assetPath);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) fail(`script source escapes the Admin build directory: ${source}`);
  if (!existsSync(assetPath)) fail(`index.html references missing asset: ${assetPath}`);
  const size = statSync(assetPath).size;
  if (size <= 0) fail(`Admin JavaScript asset is empty: ${assetPath}`);
  const content = readFileSync(assetPath, 'utf8');
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(content)) fail(`Admin JavaScript asset contains HTML fallback content: ${assetPath}`);
  mergedJavaScript += `\n${content}`;
  verifiedAssets.push({ path: relativeAsset, size });
  console.log(`[admin-build-assets] PASS asset=${relativeAsset} bytes=${size}`);
}

for (const marker of [
  'bin-group-57c60',
  'bin-group-57c60.firebaseapp.com',
  '1:123413252227:web:285cb53bc26626d699f3b6',
]) {
  if (!mergedJavaScript.includes(marker)) fail(`built Admin bundle is missing Firebase marker: ${marker}`);
}

const productionAppCheckRequired = String(process.env.REACT_APP_ENABLE_FIREBASE_APPCHECK || '').trim() === 'true';
const siteKey = String(process.env.REACT_APP_APP_CHECK_SITE_KEY || '').trim();
let appCheckSiteKeyFingerprint = null;
if (productionAppCheckRequired) {
  if (!siteKey || /REPLACE|PLACEHOLDER|process\.env/i.test(siteKey) || siteKey.length < 20) fail('protected production build requested App Check but no plausible Admin site key was supplied');
  if (!mergedJavaScript.includes(siteKey)) fail('protected production App Check site key was not embedded in the Admin bundle');
  appCheckSiteKeyFingerprint = createHash('sha256').update(siteKey).digest('hex');
  console.log(`[admin-build-assets] PASS protected App Check fingerprint=${appCheckSiteKeyFingerprint.slice(0, 12)}…`);
}

const forbiddenBundleMarkers = [
  'REPLACE_ME',
  'REPLACE_WITH',
  'e2e-admin-mfa-factor',
  'bin-e2e-admin-mfa-test',
  'appVerificationDisabledForTesting',
  'testPhoneNumbers',
  'E2E test bypass approval',
  'GPS_DEBUG',
  'DEBUG UI status',
];
for (const marker of forbiddenBundleMarkers) {
  if (mergedJavaScript.includes(marker)) fail(`forbidden recovery marker found in Admin bundle: ${marker}`);
}

mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  schemaVersion: 1,
  status: 'pass',
  buildDirectory: 'apps/admin-panel/build',
  indexPresent: true,
  scriptAssetCount: verifiedAssets.length,
  scriptAssets: verifiedAssets,
  firebaseProjectId: 'bin-group-57c60',
  firebaseAdminAppIdSuffix: '285cb53bc26626d699f3b6',
  productionAppCheckRequired,
  appCheckSiteKeyFingerprint,
  unsafeMfaTestPathsExcluded: true,
  sensitiveValuesExcluded: true,
  hardLaunchClaim: false,
}, null, 2)}\n`);
console.log(`[admin-build-assets] PASS scripts=${verifiedAssets.length} evidence=${path.relative(repositoryRoot, evidencePath)}`);
