import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'src/config/uaeDominationBlueprint.ts',
  'src/components/RoleQuickActionsPanel.tsx',
  'src/components/OwnerApprovalCommandStrip.tsx',
  'src/components/TechnicianProofChecklist.tsx',
  'src/components/BrokerAttributionQuickStartCard.tsx',
  'src/components/PilotMetricsDashboard.tsx',
  'src/tenant/pages/TenantSimpleDashboardPage.tsx',
  'src/owner/pages/OwnerSimpleDashboardPage.tsx',
  'src/technician/pages/TechnicianSimpleDashboardPage.tsx',
  'src/broker/pages/BrokerSimpleDashboardPage.tsx',
  'src/owner/hooks/useOwnerCommandCounts.ts',
  'src/broker/hooks/useBrokerAttributionSignals.ts',
  'apps/admin-panel/src/pages/dashboard/AdminSimpleDashboardPage.tsx',
  'docs/LAUNCH_GATE_SINGLE_TRUTH.md',
  'docs/COLLECTION_NORMALIZATION_PLAN.md',
];

const checks = [
  {
    name: 'all required foundation files exist',
    run: () => requiredFiles.filter((file) => !exists(file)),
  },
  {
    name: 'tenant simple dashboard is default route',
    run: () => {
      const content = read('src/tenant/TenantApp.tsx');
      return content.includes('TenantSimpleDashboardPage') && content.includes('path="/dashboard" element={<TenantSimpleDashboardPage />}') ? [] : ['tenant dashboard route'];
    },
  },
  {
    name: 'owner simple dashboard is default route',
    run: () => {
      const content = read('src/owner/OwnerApp.tsx');
      return content.includes('OwnerSimpleDashboardPage') && content.includes('path="/dashboard" element={<OwnerSimpleDashboardPage />}') ? [] : ['owner dashboard route'];
    },
  },
  {
    name: 'technician simple dashboard is default route',
    run: () => {
      const content = read('src/technician/TechnicianApp.tsx');
      return content.includes('TechnicianSimpleDashboardPage') && content.includes('path="/dashboard" element={<TechnicianSimpleDashboardPage />}') ? [] : ['technician dashboard route'];
    },
  },
  {
    name: 'broker simple dashboard is default route',
    run: () => {
      const content = read('src/broker/BrokerApp.tsx');
      return content.includes('BrokerSimpleDashboardPage') && content.includes('path="/dashboard" element={<BrokerSimpleDashboardPage />}') ? [] : ['broker dashboard route'];
    },
  },
  {
    name: 'admin dashboard entry uses simple command page',
    run: () => {
      const content = read('apps/admin-panel/src/pages/dashboard/DashboardPage.tsx');
      return content.includes('AdminSimpleDashboardPage') ? [] : ['admin dashboard entry'];
    },
  },
  {
    name: 'tenant request uses canonical SLA helper',
    run: () => {
      const content = read('src/tenant/pages/TenantRequestPage.tsx');
      return content.includes('slaMinutesForPriority') && content.includes('canonicalSlaVersion') ? [] : ['tenant canonical SLA'];
    },
  },
  {
    name: 'owner simple mode uses live command counts',
    run: () => {
      const content = read('src/owner/pages/OwnerSimpleDashboardPage.tsx');
      return content.includes('useOwnerCommandCounts') ? [] : ['owner live command counts'];
    },
  },
];

const failures = [];
for (const check of checks) {
  const missing = check.run();
  if (missing.length) failures.push({ check: check.name, missing });
}

if (failures.length) {
  console.error('UAE domination foundation verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure.check}: ${failure.missing.join(', ')}`);
  }
  process.exit(1);
}

console.log('UAE domination foundation verification passed.');
