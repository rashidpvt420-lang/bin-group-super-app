import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexSource = await readFile(new URL('../../apps/admin-panel/src/index.tsx', import.meta.url), 'utf8');
const packageSource = JSON.parse(await readFile(new URL('../../apps/admin-panel/package.json', import.meta.url), 'utf8'));
const verifierSource = await readFile(new URL('../../scripts/verify-admin-build-assets.mjs', import.meta.url), 'utf8');

test('Admin installs bootstrap failure handling before loading the application graph', () => {
  assert.doesNotMatch(indexSource, /import\s+App\s+from\s+['"]\.\/App['"]/);
  assert.doesNotMatch(indexSource, /import\s+ErrorBoundary\s+from/);
  const errorHandlerIndex = indexSource.indexOf('window.onerror =');
  const dynamicAppImport = /import\(\s*\/\*\s*webpackChunkName:\s*["']admin-app-shell["']\s*\*\/\s*['"]\.\/App['"]\s*\)/.exec(indexSource);
  const dynamicAppImportIndex = dynamicAppImport?.index ?? -1;
  assert.ok(errorHandlerIndex >= 0, 'Admin must install window.onerror');
  assert.ok(dynamicAppImportIndex > errorHandlerIndex, 'Admin application graph must load after bootstrap error handling');
  assert.match(indexSource, /data-testid=\"admin-bootstrap-error\"/);
  assert.match(indexSource, /Promise\.allSettled\(registrations\.map/);
});

test('every Admin build verifies index entries and all generated JavaScript chunks', () => {
  assert.equal(packageSource.scripts.postbuild, 'node ../../scripts/verify-admin-build-assets.mjs');
  assert.match(verifierSource, /index\.html contains no JavaScript bundle reference/);
  assert.match(verifierSource, /missing JavaScript asset/);
  assert.match(verifierSource, /JavaScript asset is empty/);
  assert.match(verifierSource, /contains HTML fallback content/);
  assert.match(verifierSource, /collectJavaScript/);
  assert.match(verifierSource, /generated JavaScript files under static\/js/);
  assert.match(verifierSource, /built Admin chunks are missing Firebase marker/);
  assert.match(verifierSource, /protected production build requested App Check/);
  assert.match(verifierSource, /protected production App Check site key was not embedded in the Admin chunks/);
  assert.match(verifierSource, /admin-async-boundaries\.json/);
  assert.match(verifierSource, /heavyModulesExcludedFromLoginCriticalChunks: true/);
  assert.match(verifierSource, /sourceLevelUnsafeMfaChecksRequired: true/);
  assert.match(verifierSource, /sensitiveValuesExcluded: true/);
  assert.match(verifierSource, /hardLaunchClaim: false/);
});
