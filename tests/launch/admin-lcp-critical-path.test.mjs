import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin login boot avoids the shared barrel and renders before service-worker cleanup', async () => {
  const source = await read('apps/admin-panel/src/index.tsx');

  assert.doesNotMatch(source, /import\(['"]@bin\/shared['"]\)/);
  assert.match(source, /@bin\/shared\/lib\/sovereignAlerts/);
  assert.match(source, /webpackChunkName:\s*["']admin-app-shell["']/);
  assert.match(source, /webpackChunkName:\s*["']admin-error-boundary["']/);
  assert.match(source, /root\.render\(/);
  assert.match(source, /scheduleServiceWorkerCleanup\(\);/);

  const bootstrapIndex = source.indexOf('async function bootstrapAdmin()');
  assert.ok(bootstrapIndex >= 0, 'Admin bootstrap function must exist');
  const bootstrapSource = source.slice(bootstrapIndex);
  const renderIndex = bootstrapSource.indexOf('root.render(');
  const cleanupIndex = bootstrapSource.indexOf('scheduleServiceWorkerCleanup();');
  assert.ok(renderIndex >= 0 && cleanupIndex > renderIndex, 'service-worker maintenance must run after the React mount starts');
  assert.doesNotMatch(
    bootstrapSource.slice(0, renderIndex),
    /await\s+(?:scheduleServiceWorkerCleanup|navigator\.serviceWorker\.getRegistrations)\s*\(/,
  );
});

test('Admin authenticated pages and expensive PDF routes are lazy-loaded', async () => {
  const source = await read('apps/admin-panel/src/App.tsx');

  assert.match(source, /const\s+AdminLayout\s*=\s*lazy\(/);
  assert.match(source, /const\s+ReportsPage\s*=\s*lazy\(/);
  assert.match(source, /const\s+ProductionControlCenter\s*=\s*lazy\(/);
  assert.match(source, /const\s+InstitutionalReportsPanel\s*=\s*lazy\(/);
  assert.match(source, /<Suspense\s+fallback=/);

  assert.doesNotMatch(source, /import\s+ReportsPage\s+from/);
  assert.doesNotMatch(source, /import\s+ProductionControlCenter\s+from/);
  assert.doesNotMatch(source, /from\s+['"]@bin\/shared['"]/);
});

test('Admin webpack proves PDF, canvas, chart and report modules are outside login-critical chunks', async () => {
  const [webpackConfig, buildVerifier] = await Promise.all([
    read('apps/admin-panel/craco.config.js'),
    read('scripts/verify-admin-build-assets.mjs'),
  ]);

  assert.match(webpackConfig, /pdfVendor/);
  assert.match(webpackConfig, /jspdf\|jspdf-autotable\|html2canvas/);
  assert.match(webpackConfig, /name:\s*["']pdf-vendor["']/);
  assert.match(webpackConfig, /chartsVendor/);
  assert.match(webpackConfig, /recharts\|d3-/);
  assert.match(webpackConfig, /name:\s*["']charts-vendor["']/);
  assert.match(webpackConfig, /reportRoutes/);
  assert.match(webpackConfig, /name:\s*["']report-routes["']/);
  assert.equal((webpackConfig.match(/chunks:\s*["']async["']/g) || []).length >= 3, true);

  assert.match(webpackConfig, /class AdminAsyncBoundaryEvidencePlugin/);
  assert.match(webpackConfig, /Admin App module was not found in the emitted webpack chunk graph/);
  assert.match(webpackConfig, /leaked into login-critical chunk/);
  assert.match(webpackConfig, /admin-async-boundaries\.json/);
  for (const group of ['jspdfVendor', 'htmlCanvasVendor', 'chartsVendor', 'reportRoutes']) {
    assert.match(webpackConfig, new RegExp(`${group}:`));
  }

  assert.match(buildVerifier, /admin-async-boundaries\.json/);
  assert.match(buildVerifier, /manifestJavaScriptEntrypoints/);
  assert.match(buildVerifier, /requiredBoundaryGroups/);
  assert.match(buildVerifier, /group\.bootCriticalChunks\.length > 0/);
  assert.match(buildVerifier, /heavyModulesExcludedFromLoginCriticalChunks:\s*true/);
});

test('Admin static shell paints branded LCP content and defers recovery maintenance', async () => {
  const html = await read('apps/admin-panel/public/index.html');
  const css = await read('apps/admin-panel/src/index.css');
  const recovery = await read('apps/admin-panel/public/admin-init-recovery.js');

  assert.match(html, /class=["']loader-brand["']>BIN GROUP</);
  assert.match(html, /<script\s+defer\s+src=["']%PUBLIC_URL%\/admin-init-recovery\.js["']/);
  assert.match(html, /min-height:\s*100dvh/);
  assert.match(css, /--bin-bg-primary:\s*#020617/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(recovery, /textContent/);
  assert.doesNotMatch(recovery, /innerText/);
});

test('Admin shared alert bootstrap has a UI-free import path', async () => {
  const lightweight = await read('packages/shared/src/lib/sovereignAlerts.ts');
  const handler = await read('packages/shared/src/components/SovereignAlertHandler.tsx');

  assert.doesNotMatch(lightweight, /@mui|lucide-react|firebase/);
  assert.match(lightweight, /setupSovereignAlertInterceptor/);
  assert.match(handler, /from\s+['"]\.\.\/lib\/sovereignAlerts['"]/);
});
