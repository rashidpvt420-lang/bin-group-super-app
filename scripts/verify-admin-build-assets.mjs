#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const buildDirectory = path.join(repositoryRoot, 'apps', 'admin-panel', 'build');
const indexPath = path.join(buildDirectory, 'index.html');
const manifestPath = path.join(buildDirectory, 'asset-manifest.json');
const evidencePath = path.join(repositoryRoot, 'launch_package', 'admin-build-assets.json');

const fail = (message) => {
  console.error(`[admin-build-assets] FAIL: ${message}`);
  process.exit(1);
};

const normalizeAssetPath = (value) => String(value || '')
  .trim()
  .replace(/^\/+/, '')
  .split(/[?#]/, 1)[0]
  .replaceAll('\\', '/');

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
if (!existsSync(manifestPath)) fail(`missing ${manifestPath}`);

const indexHtml = readFileSync(indexPath, 'utf8');
if (!/<div\s+id=["']root["']/.test(indexHtml)) fail('index.html does not contain the React root element');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`asset-manifest.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const manifestEntrypoints = Array.isArray(manifest?.entrypoints)
  ? manifest.entrypoints.map(normalizeAssetPath).filter(Boolean)
  : [];
if (manifestEntrypoints.length === 0) fail('asset-manifest.json contains no entrypoints');
const manifestJavaScriptEntrypoints = manifestEntrypoints.filter((asset) => asset.endsWith('.js'));
if (manifestJavaScriptEntrypoints.length === 0) fail('asset-manifest.json contains no JavaScript entrypoints');

const scriptSources = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
  .map((match) => String(match[1] || '').trim())
  .filter(Boolean);
if (scriptSources.length === 0) fail('index.html contains no JavaScript bundle reference');

const entryAssets = [];
let mergedEntryJavaScript = '';
for (const source of scriptSources) {
  if (/^(?:https?:)?\/\//i.test(source)) fail(`external JavaScript bundle is not allowed: ${source}`);
  const relativeAsset = normalizeAssetPath(source);
  if (!relativeAsset.endsWith('.js')) fail(`non-JavaScript script source found: ${source}`);
  if (!manifestJavaScriptEntrypoints.includes(relativeAsset)) fail(`index.html script is not declared as a manifest entrypoint: ${relativeAsset}`);
  const assetPath = path.resolve(buildDirectory, relativeAsset);
  const relativeCheck = path.relative(buildDirectory, assetPath);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) fail(`script source escapes the Admin build directory: ${source}`);
  const verified = verifyJavaScriptAsset(assetPath);
  mergedEntryJavaScript += `\n${verified.content}`;
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

const manifestAssets = [...new Set([
  ...Object.values(manifest?.files || {}).map(normalizeAssetPath),
  ...manifestEntrypoints,
].filter(Boolean))];
const asyncHeavyChunks = {};
for (const [label, marker] of Object.entries({
  pdfVendor: 'pdf-vendor',
  chartsVendor: 'charts-vendor',
  reportRoutes: 'report-routes',
})) {
  const matchingAssets = manifestAssets.filter((asset) => asset.endsWith('.js') && asset.includes(marker));
  if (matchingAssets.length === 0) fail(`generated Admin manifest is missing the required ${label} async chunk (${marker})`);
  const leakedEntrypoints = matchingAssets.filter((asset) => manifestJavaScriptEntrypoints.includes(asset));
  if (leakedEntrypoints.length > 0) fail(`${label} leaked into initial Admin entrypoints: ${leakedEntrypoints.join(', ')}`);
  asyncHeavyChunks[label] = matchingAssets;
  console.log(`[admin-build-assets] PASS async-only ${label}=${matchingAssets.join(',')}`);
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

// Firebase Auth ships testing-related API symbol names in its SDK bundle. Their
// presence is not proof that application code invokes them. Source-level launch
// tests separately reject any use from Admin application/workflow code.
for (const marker of [
  'e2e-admin-mfa-factor',
  'bin-e2e-admin-mfa-test',
  'E2E test bypass approval',
  'GPS_DEBUG',
  'DEBUG UI status',
]) {
  if (mergedJavaScript.includes(marker)) fail(`forbidden application marker found in Admin chunks: ${marker}`);
}

mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  schemaVersion: 3,
  status: 'pass',
  buildDirectory: 'apps/admin-panel/build',
  indexPresent: true,
  manifestPresent: true,
  indexScriptAssetCount: entryAssets.length,
  indexScriptAssets: entryAssets,
  manifestEntrypointCount: manifestEntrypoints.length,
  manifestJavaScriptEntrypoints,
  generatedScriptAssetCount: generatedAssets.length,
  generatedScriptAssets: generatedAssets,
  asyncHeavyChunks,
  heavyChunksExcludedFromInitialEntrypoints: true,
  entryJavaScriptBytes: Buffer.byteLength(mergedEntryJavaScript),
  firebaseProjectId: 'bin-group-57c60',
  firebaseAdminAppIdSuffix: '285cb53bc26626d699f3b6',
  productionAppCheckRequired,
  appCheckSiteKeyFingerprint,
  sourceLevelUnsafeMfaChecksRequired: true,
  sensitiveValuesExcluded: true,
  hardLaunchClaim: false,
}, null, 2)}\n`);
console.log(`[admin-build-assets] PASS entries=${entryAssets.length} generated=${generatedAssets.length} heavy-chunks=async-only evidence=${path.relative(repositoryRoot, evidencePath)}`);
