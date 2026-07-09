import { readFileSync } from 'node:fs';

const mainApp = readFileSync('src/App.tsx', 'utf8');
const adminTerminal = readFileSync('src/admin/AdminTerminal.tsx', 'utf8');
const adminPanelApp = readFileSync('apps/admin-panel/src/App.tsx', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const requiredMainAppTokens = [
  '<TrustCenterPage />',
  'path="/trust"',
  'path="/trust-center"',
  'path="/admin/*"',
  'protectedRoute(ADMIN_STAFF_ROLES, <AdminTerminal />)',
  'canonical in-app command center',
];

for (const token of requiredMainAppTokens) {
  if (!mainApp.includes(token)) throw new Error(`Main app missing admin/trust route token: ${token}`);
}

const requiredAdminTerminalTokens = [
  'Unified Command Center',
  'getCountFromServer',
  "collection(db, 'users')",
  "collection(db, 'maintenanceTickets')",
  "collection(db, 'payment_transactions')",
  "collection(db, 'audit_logs')",
  'Five-profile smoke test script',
  'Verification Runbook',
  'No mandatory cross-domain bridge',
];

for (const token of requiredAdminTerminalTokens) {
  if (!adminTerminal.includes(token)) throw new Error(`In-app admin command center missing token: ${token}`);
}

const forbiddenAdminTerminalTokens = [
  'window.location.href = url.startsWith(ADMIN_PANEL_URL)',
  'withBridgeToken(targetUrl)',
  'mintAdminBridgeToken',
  'Opening Admin Command Center',
];

for (const token of forbiddenAdminTerminalTokens) {
  if (adminTerminal.includes(token)) throw new Error(`Admin route still contains bridge/dead-end token: ${token}`);
}

const adminPanelRedirectTokens = [
  'BIN GROUP Unified Access',
  'MAIN_APP_URL',
  '/admin/dashboard',
];

for (const token of adminPanelRedirectTokens) {
  if (!adminPanelApp.includes(token)) throw new Error(`Redirect-only admin panel missing token: ${token}`);
}

const requiredScripts = [
  'test:hard-launch-readiness',
  'test:mobile-store-readiness',
  'test:e2e:launch-audit',
];

for (const scriptName of requiredScripts) {
  if (!pkg.scripts?.[scriptName]) throw new Error(`Missing launch verification script: ${scriptName}`);
}

console.log('Admin dashboard access verification passed: /admin/* is now an in-app command center and the legacy panel is redirect-only.');
