// Capacity P0: admin/owner reporting lists are cursor-paged, counters are sharded,
// technician transactions retry, and minInstances stays off by default.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const AUDIT_PAGES = [
  'apps/admin-panel/src/pages/ops/StaffDirectoryPage.tsx',
  'apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx',
  'apps/admin-panel/src/pages/admin/ContractTerminationPage.tsx',
  'apps/admin-panel/src/pages/admin/AdminContractControlPage.tsx',
  'apps/admin-panel/src/pages/ops/KeyRegisterPage.tsx',
  'apps/admin-panel/src/pages/ops/AmenityControlPage.tsx',
  'apps/admin-panel/src/pages/ops/MarketplaceApprovalsPage.tsx',
  'apps/admin-panel/src/pages/sos/SOSFeedPage.tsx',
  'apps/admin-panel/src/pages/map/LiveMapPage.tsx',
  'apps/admin-panel/src/pages/admin/OrphanWarRoomPage.tsx',
  'apps/admin-panel/src/pages/tenants/TenantsManagementPage.tsx',
  'apps/admin-panel/src/components/reports/InstitutionalReportsPanel.tsx',
  'apps/admin-panel/src/pages/admin/GeoRepairCommandCenter.tsx',
  'apps/admin-panel/src/pages/owners/OwnerManagementPage.tsx',
  'apps/admin-panel/src/pages/admin/ProfitabilityPage.tsx',
  'apps/admin-panel/src/components/ops/PublicLaunchOpsPanel.tsx',
  'apps/admin-panel/src/pages/brokers/BrokerManagementPage.tsx',
  'src/pages/ReportingDashboard.tsx',
  'apps/owner-app/src/pages/ReportingDashboard.tsx',
];

test('admin list page size is 40 and stays between 25 and 50', () => {
  const hook = read('src/lib/usePagedCollection.ts');
  assert.match(hook, /export const ADMIN_LIST_PAGE_SIZE = 40/);
  assert.match(hook, /Math\.max\(25, Math\.min\(50,/);
  assert.match(hook, /getCountFromServer/);
  assert.match(hook, /startAfter/);
  const lists = read('src/lib/pagedQuery.ts');
  assert.match(lists, /export const LIST_PAGE_SIZE = 100/);
  assert.match(lists, /export const ADMIN_LIST_PAGE_SIZE = 40/);
});

test('audited admin and owner-reporting pages no longer open full-collection listeners', () => {
  const forbidden = [
    /onSnapshot\(\s*collection\(\s*db,\s*'[^']+'\s*\)\s*,/,
    /getDocs\(\s*collection\(\s*db,\s*'[^']+'\s*\)\s*\)/,
    /onSnapshot\(\s*query\(\s*collection\(\s*db,\s*'[^']+'\s*\)\s*\)\s*,/,
    /limit\(\s*1000\s*\)/,
  ];
  for (const path of AUDIT_PAGES) {
    const source = read(path);
    // The live map must keep a complete technicians listener with no silent cap.
    // That exception is locked by admin-map-ticket-lifecycle and hard-launch-source-blockers.
    const inspected = path.endsWith('LiveMapPage.tsx')
      ? source.replace(/onSnapshot\(\s*collection\(\s*db,\s*'technicians'\s*\)\s*,/g, '/* complete technicians listener */')
      : source;
    for (const pattern of forbidden) {
      assert.doesNotMatch(inspected, pattern, `${path} still has ${pattern}`);
    }
  }
});

test('reporting dashboards use paged count-backed reads', () => {
  assert.match(read('src/pages/ReportingDashboard.tsx'), /loadReportingCollection/);
  assert.match(read('apps/owner-app/src/pages/ReportingDashboard.tsx'), /loadReportingCollection/);
  assert.match(read('src/lib/loadReportingCollections.ts'), /REPORTING_PAGE_SIZE = 40/);
  assert.match(read('src/lib/loadReportingCollections.ts'), /REPORTING_READ_CAP = 300/);
  assert.match(read('src/lib/loadReportingCollections.ts'), /getCountFromServer/);
});

test('minInstances stays default 0 and App Check is kept on critical callables', () => {
  const scale = read('functions/functionScaleOptions.ts');
  assert.match(scale, /CRITICAL_FN_MIN_INSTANCES/);
  assert.match(scale, /default:\s*0/);
  assert.match(scale, /enforceAppCheck/);
  assert.doesNotMatch(scale, /enforceAppCheck:\s*false/);
  const dotenvExample = read('functions/.env.bin-group-57c60.example');
  assert.match(dotenvExample, /^CRITICAL_FN_MIN_INSTANCES=0$/m);
});

test('summary counters are sharded and the reconcile script refuses production', () => {
  const counters = read('functions/summaryCounters.ts');
  assert.match(counters, /applyAdminOpenTicketDelta/);
  assert.match(counters, /shards/);
  const math = read('functions/summaryCounterMath.ts');
  assert.match(math, /ADMIN_OPEN_TICKET_SHARD_COUNT = 20/);
  const script = read('scripts/reconcile-summary-counters.mjs');
  assert.match(script, /bin-group-57c60/);
  assert.match(script, /FIRESTORE_EMULATOR_HOST/);
});

test('technician transactions retry with backoff', () => {
  const retry = read('functions/runTransactionWithRetry.ts');
  assert.match(retry, /runTransactionWithRetry/);
  assert.match(retry, /ABORTED|contention/);
  const index = read('functions/index.ts');
  assert.match(index, /runTransactionWithRetry/);
  assert.match(index, /withCriticalScale/);
});
