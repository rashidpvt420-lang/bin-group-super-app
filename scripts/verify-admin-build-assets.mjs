#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

function collectJavaScript(directory, output = []) {
  if (!existsSync(directory)) return output;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScript(target, output);
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(target);
  }
  return output;
}

function verifyJavaScriptAsset(assetPath) {
  if (!existsSync(assetPath)) fail(`missing JavaScript asset: ${assetPath}`);
  const size = statSync(assetPath).size;
  if (size <= 0) fail(`Admin JavaScript asset is empty: ${assetPath}`);
  const content = readFileSync(assetPath, 'utf8');
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(content)) fail(`Admin JavaScript asset contains HTML fallback content: ${assetPath}`);
  return { size, content };
}

if (!existsSync(indexPath)) fail(`missing ${indexPath}`);
const indexHtml = readFileSync(indexPath, 'utf8');
if (!/<div\s+id=["']root["']/.test(indexHtml)) fail('index.html does not contain the React root element');

const scriptSources = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((match) => String(match[1] || '').trim())
  .filter(Boolean);
if (scriptSources.length === 0) fail('index.html contains no JavaScript bundle reference');

const entryAssets = [];
for (const source of scriptSources) {
  if (/^(?:https?:)?\/\//i.test(source)) fail(`external JavaScript bundle is not allowed: ${source}`);
  const relativeAsset = source.replace(/^\/+/, '').split(/[?#]/, 1)[0];
  if (!relativeAsset.endsWith('.js')) fail(`non-JavaScript script source found: ${source}`);
  const assetPath = path.resolve(buildDirectory, relativeAsset);
  const relativeCheck = path.relative(buildDirectory, assetPath);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) fail(`script source escapes the Admin build directory: ${source}`);
  const verified = verifyJavaScriptAsset(assetPath);
  entryAssets.push({ path: relativeAsset, size: verified.size });
  console.log(`[admin-build-assets] PASS entry=${relativeAsset} bytes=${verified.size}`);
}

const generatedPaths = collectJavaScript(path.join(buildDirectory, 'static', 'js')).sort();
if (generatedPaths.length === 0) fail('Admin build contains no generated JavaScript files under static/js');

const generatedAssets = [];
let mergedJavaScript = '';
for (const assetPath of generatedPaths) {
  const verified = verifyJavaScriptAsset(assetPath);
  const relativeAsset = path.relative(buildDirectory, assetPath).replaceAll(path.sep, '/');
  mergedJavaScript += `\n${verified.content}`;
  generatedAssets.push({ path: relativeAsset, size: verified.size });
  console.log(`[admin-build-assets] PASS generated=${relativeAsset} bytes=${verified.size}`);
}

for (const marker of [
  'bin-group-57c60',
  'bin-group-57c60.firebaseapp.com',
  '1:123413252227:web:285cb53bc26626d699f3b6',
]) {
  if (!mergedJavaScript.includes(marker)) fail(`built Admin chunks are missing Firebase marker: ${marker}`);
}

const productionAppCheckRequired = String(process.env.REACT_APP_ENABLE_FIREBASE_APPCHECK || '').trim() === 'true';
const siteKey = String(process.env.REACT_APP_APP_CHECK_SITE_KEY || '').trim();
let appCheckSiteKeyFingerprint = null;
if (productionAppCheckRequired) {
  if (!siteKey || /REPLACE|PLACEHOLDER|process\.env/i.test(siteKey) || siteKey.length < 20) fail('protected production build requested App Check but no plausible Admin site key was supplied');
  if (!mergedJavaScript.includes(siteKey)) fail('protected production App Check site key was not embedded in the Admin chunks');
  appCheckSiteKeyFingerprint = createHash('sha256').update(siteKey).digest('hex');
  console.log(`[admin-build-assets] PASS protected App Check fingerprint=${appCheckSiteKeyFingerprint.slice(0, 12)}…`);
}

for (const marker of [
  'e2e-admin-mfa-factor',
  'bin-e2e-admin-mfa-test',
  'appVerificationDisabledForTesting',
  'testPhoneNumbers',
  'E2E test bypass approval',
  'GPS_DEBUG',
  'DEBUG UI status',
]) {
  if (mergedJavaScript.includes(marker)) fail(`forbidden recovery marker found in Admin chunks: ${marker}`);
}

mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  schemaVersion: 2,
  status: 'pass',
  buildDirectory: 'apps/admin-panel/build',
  indexPresent: true,
  indexScriptAssetCount: entryAssets.length,
  indexScriptAssets: entryAssets,
  generatedScriptAssetCount: generatedAssets.length,
  generatedScriptAssets: generatedAssets,
  firebaseProjectId: 'bin-group-57c60',
  firebaseAdminAppIdSuffix: '285cb53bc26626d699f3b6',
  productionAppCheckRequired,
  appCheckSiteKeyFingerprint,
  unsafeMfaTestPathsExcluded: true,
  sensitiveValuesExcluded: true,
  hardLaunchClaim: false,
}, null, 2)}\n`);
console.log(`[admin-build-assets] PASS entries=${entryAssets.length} generated=${generatedAssets.length} evidence=${path.relative(repositoryRoot, evidencePath)}`);
