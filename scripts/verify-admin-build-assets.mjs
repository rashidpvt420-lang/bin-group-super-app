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
const boundaryEvidencePath = path.join(buildDirectory, 'admin-async-boundaries.json');
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

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

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

for (const requiredPath of [indexPath, manifestPath, boundaryEvidencePath]) {
  if (!existsSync(requiredPath)) fail(`missing ${requiredPath}`);
}

const indexHtml = readFileSync(indexPath, 'utf8');
if (!/<div\s+id=["']root["']/.test(indexHtml)) fail('index.html does not contain the React root element');

const scriptTags = [...indexHtml.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
const recoveryTag = scriptTags.find((tag) => /\bsrc\s*=\s*["'][^"']*admin-init-recovery\.js["']/i.test(tag));
if (!recoveryTag || !/\bdefer(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?(?=\s|>)/i.test(recoveryTag)) {
  fail('admin-init-recovery.js must remain a deferred same-origin bootstrap helper');
}

const manifest = readJson(manifestPath, 'asset-manifest.json');
const boundaryEvidence = readJson(boundaryEvidencePath, 'admin-async-boundaries.json');

const manifestEntrypoints = Array.isArray(manifest?.entrypoints)
  ? manifest.entrypoints.map(normalizeAssetPath).filter(Boolean)
  : [];
if (manifestEntrypoints.length === 0) fail('asset-manifest.json contains no entrypoints');
const manifestJavaScriptEntrypoints = manifestEntrypoints.filter((asset) => asset.endsWith('.js'));
if (manifestJavaScriptEntrypoints.length === 0) fail('asset-manifest.json contains no JavaScript entrypoints');

const scriptSources = scriptTags
  .map((tag) => tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || '')
  .map((source) => source.trim())
  .filter(Boolean);
if (scriptSources.length === 0) fail('index.html contains no JavaScript bundle reference');
const normalizedScriptSources = scriptSources.map(normalizeAssetPath);
for (const entrypoint of manifestJavaScriptEntrypoints) {
  if (!normalizedScriptSources.includes(entrypoint)) fail(`manifest JavaScript entrypoint is missing from index.html: ${entrypoint}`);
}

const entryAssets = [];
const manifestEntryAssets = [];
const staticBootstrapAssets = [];
let mergedEntryJavaScript = '';
for (const source of scriptSources) {
  if (/^(?:https?:)?\/\//i.test(source)) fail(`external JavaScript bundle is not allowed: ${source}`);
  const relativeAsset = normalizeAssetPath(source);
  if (!relativeAsset.endsWith('.js')) fail(`non-JavaScript script source found: ${source}`);

  const isManifestEntrypoint = manifestJavaScriptEntrypoints.includes(relativeAsset);
  const isAllowedStaticBootstrap = relativeAsset === 'admin-init-recovery.js';
  if (!isManifestEntrypoint && !isAllowedStaticBootstrap) {
    fail(`index.html script is neither a manifest entrypoint nor an approved static bootstrap helper: ${relativeAsset}`);
  }

  const assetPath = path.resolve(buildDirectory, relativeAsset);
  const relativeCheck = path.relative(buildDirectory, assetPath);
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) fail(`script source escapes the Admin build directory: ${source}`);
  const verified = verifyJavaScriptAsset(assetPath);
  mergedEntryJavaScript += `\n${verified.content}`;

  const assetEvidence = { path: relativeAsset, size: verified.size };
  entryAssets.push(assetEvidence);
  if (isManifestEntrypoint) manifestEntryAssets.push(assetEvidence);
  else staticBootstrapAssets.push(assetEvidence);
  console.log(`[admin-build-assets] PASS ${isManifestEntrypoint ? 'entry' : 'deferred-bootstrap'}=${relativeAsset} bytes=${verified.size}`);
}

if (boundaryEvidence?.schemaVersion !== 1 || boundaryEvidence?.status !== 'pass') {
  fail(`webpack async-boundary evidence did not pass: ${JSON.stringify(boundaryEvidence?.failures || [])}`);
}
if (boundaryEvidence?.appShellModuleFound !== true) fail('webpack evidence did not identify the Admin App shell chunk');

const requiredBoundaryGroups = ['jspdfVendor', 'htmlCanvasVendor', 'chartsVendor', 'reportRoutes'];
const asyncBoundaryGroups = {};
for (const groupName of requiredBoundaryGroups) {
  const group = boundaryEvidence?.groups?.[groupName];
  if (!group || !Array.isArray(group.chunks) || !Array.isArray(group.bootCriticalChunks)) {
    fail(`webpack evidence is missing boundary group: ${groupName}`);
  }
  if (group.bootCriticalChunks.length > 0) {
    fail(`${groupName} is present in login-critical chunks`);
  }
  asyncBoundaryGroups[groupName] = {
    present: group.present === true,
    moduleCount: Number(group.moduleCount || 0),
    chunkCount: group.chunks.length,
    chunkFiles: [...new Set(group.chunks.flatMap((chunk) => chunk.files || []))].sort(),
    excludedFromLoginCriticalChunks: true,
  };
  console.log(
    `[admin-build-assets] PASS async-boundary ${groupName} present=${group.present === true} modules=${Number(group.moduleCount || 0)} chunks=${group.chunks.length}`,
  );
}
if (asyncBoundaryGroups.reportRoutes.present !== true) fail('Admin report-route modules were not found in the emitted async chunk graph');

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
  schemaVersion: 4,
  status: 'pass',
  buildDirectory: 'apps/admin-panel/build',
  indexPresent: true,
  manifestPresent: true,
  asyncBoundaryEvidencePresent: true,
  indexScriptAssetCount: entryAssets.length,
  indexScriptAssets: entryAssets,
  manifestEntryAssetCount: manifestEntryAssets.length,
  manifestEntryAssets,
  staticBootstrapAssetCount: staticBootstrapAssets.length,
  staticBootstrapAssets,
  staticBootstrapDeferred: true,
  manifestEntrypointCount: manifestEntrypoints.length,
  manifestJavaScriptEntrypoints,
  generatedScriptAssetCount: generatedAssets.length,
  generatedScriptAssets: generatedAssets,
  asyncBoundaryGroups,
  heavyModulesExcludedFromLoginCriticalChunks: true,
  entryJavaScriptBytes: Buffer.byteLength(mergedEntryJavaScript),
  firebaseProjectId: 'bin-group-57c60',
  firebaseAdminAppIdSuffix: '285cb53bc26626d699f3b6',
  productionAppCheckRequired,
  appCheckSiteKeyFingerprint,
  sourceLevelUnsafeMfaChecksRequired: true,
  sensitiveValuesExcluded: true,
  hardLaunchClaim: false,
}, null, 2)}\n`);
console.log(`[admin-build-assets] PASS entries=${entryAssets.length} generated=${generatedAssets.length} webpack-boundaries=pass evidence=${path.relative(repositoryRoot, evidencePath)}`);
