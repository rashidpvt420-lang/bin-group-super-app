import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const notes = [];

function read(relativePath) {
  const absolutePath = path.resolve(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assertContains(file, content, needle, reason) {
  if (!content.includes(needle)) failures.push(`${file}: missing ${needle} — ${reason}`);
}

function assertNotContains(file, content, needle, reason) {
  if (content.includes(needle)) failures.push(`${file}: must not contain ${needle} — ${reason}`);
}

function assertRegex(file, content, regex, reason) {
  if (!regex.test(content)) failures.push(`${file}: failed ${regex} — ${reason}`);
}

const mainAppPath = 'src/App.tsx';
const ownerAppPath = 'src/owner/OwnerApp.tsx';
const tenantAppPath = 'src/tenant/TenantApp.tsx';
const technicianAppPath = 'src/technician/TechnicianApp.tsx';
const brokerAppPath = 'src/broker/BrokerApp.tsx';
const adminTerminalPath = 'src/admin/AdminTerminal.tsx';
const legacyAdminPath = 'apps/admin-panel/src/App.tsx';
const legacyOwnerPath = 'apps/owner-app/src/App.tsx';
const launchRegisterPath = 'launch_package/hard-launch-readiness.json';

const mainApp = read(mainAppPath);
const ownerApp = read(ownerAppPath);
const tenantApp = read(tenantAppPath);
const technicianApp = read(technicianAppPath);
const brokerApp = read(brokerAppPath);
const adminTerminal = read(adminTerminalPath);
const legacyAdmin = read(legacyAdminPath);
const legacyOwner = read(legacyOwnerPath);
const launchRegisterRaw = read(launchRegisterPath);

assertContains(mainAppPath, mainApp, '<Route path="/admin/*" element={protectedRoute(ADMIN_STAFF_ROLES, <AdminTerminal />)} />', 'admin must resolve through the canonical in-app AdminTerminal');
assertContains(mainAppPath, mainApp, '<Route path="/owner/*" element={protectedRoute([\'owner\', \'ceo\'], <OwnerApp />)} />', 'owner portal must resolve through src/owner/OwnerApp.tsx');
assertContains(mainAppPath, mainApp, '<Route path="/tenant/*" element={protectedRoute([\'tenant\'], <TenantApp />)} />', 'tenant portal must resolve through src/tenant/TenantApp.tsx');
assertContains(mainAppPath, mainApp, '<Route path="/technician/*" element={protectedRoute([\'technician\'], <TechnicianApp />)} />', 'technician portal must resolve through src/technician/TechnicianApp.tsx');
assertContains(mainAppPath, mainApp, '<Route path="/broker/*" element={protectedRoute([\'broker\'], <BrokerApp />)} />', 'broker portal must resolve through src/broker/BrokerApp.tsx');
assertContains(mainAppPath, mainApp, '<Route path="/owner-dashboard" element={<Navigate to="/owner/dashboard" replace />} />', 'legacy owner-dashboard path must not point to a second owner dashboard file');
assertContains(mainAppPath, mainApp, '<Route path="/dashboard" element={<Navigate to="/owner/dashboard" replace />} />', 'generic dashboard must not create another owner dashboard surface');

assertContains(ownerAppPath, ownerApp, '<Route path="/" element={<OwnerSimpleDashboardPage />} />', 'owner root starts with simple dashboard');
assertContains(ownerAppPath, ownerApp, '<Route path="/dashboard" element={<OwnerSimpleDashboardPage />} />', 'owner dashboard starts with simple dashboard');
assertContains(ownerAppPath, ownerApp, '<Route path="/dashboard/full" element={<OwnerDashboardPage />} />', 'full owner dashboard remains available under an explicit full route');
assertContains(ownerAppPath, ownerApp, '<Route path="/legacy-units" element={<OwnerUnitsPage />} />', 'old owner units file must be explicitly named legacy instead of competing with the canonical unit registry');

assertContains(tenantAppPath, tenantApp, '<Route path="/" element={<TenantSimpleDashboardPage />} />', 'tenant root starts with simple dashboard');
assertContains(tenantAppPath, tenantApp, '<Route path="/dashboard/full" element={<TenantDashboardPage />} />', 'full tenant dashboard remains available under an explicit full route');
assertContains(tenantAppPath, tenantApp, '<Route path="/renewals" element={<TenantRenewalsPage />} />', 'tenant renewals route must stay registered for public launch workflow');

assertContains(technicianAppPath, technicianApp, '<Route path="/" element={<TechnicianSimpleDashboardPage />} />', 'technician root starts with simple dashboard');
assertContains(technicianAppPath, technicianApp, '<Route path="/dashboard/full" element={<TechnicianDashboardPage />} />', 'full technician dashboard remains available under an explicit full route');
assertContains(technicianAppPath, technicianApp, '<Route path="/proof-readiness" element={<TechnicianProofReadinessPage />} />', 'technician proof readiness must stay registered');

assertContains(brokerAppPath, brokerApp, '<Route path="/" element={<BrokerSimpleDashboardPage />} />', 'broker root starts with simple dashboard');
assertContains(brokerAppPath, brokerApp, '<Route path="/dashboard/full" element={<BrokerDashboardPage />} />', 'full broker dashboard remains available under an explicit full route');
assertContains(brokerAppPath, brokerApp, '<Route path="/attribution" element={<BrokerAttributionProofPage />} />', 'broker attribution proof route must stay registered');

assertContains(adminTerminalPath, adminTerminal, 'Canonical Admin Coverage', 'admin dashboard must show merged operational coverage, not only a static bridge');
assertContains(adminTerminalPath, adminTerminal, 'Route consolidation guard', 'admin runbook must include the route consolidation test');
assertContains(adminTerminalPath, adminTerminal, 'CANONICAL_SLA_POLICY', 'admin dashboard must use the same SLA source as tenant workflow');
assertContains(adminTerminalPath, adminTerminal, 'system_health/admin_summaries', 'hard launch gates must remain tied to evidence, not static green UI');

assertContains(legacyAdminPath, legacyAdmin, 'LegacyAdminRedirectShell', 'legacy admin app must be handoff-only');
assertNotContains(legacyAdminPath, legacyAdmin, 'setTimeout', 'legacy admin app must not auto-redirect or hide login issues');
assertNotContains(legacyAdminPath, legacyAdmin, 'window.location.replace', 'legacy admin app must be a manual operator handoff');
assertNotContains(legacyAdminPath, legacyAdmin, 'DashboardPage', 'legacy admin app must not import a second admin dashboard implementation');

assertContains(legacyOwnerPath, legacyOwner, 'LegacyOwnerRedirectShell', 'legacy owner app must be handoff-only');
assertNotContains(legacyOwnerPath, legacyOwner, 'TenantSOSPage', 'legacy owner app must not own tenant routes');
assertNotContains(legacyOwnerPath, legacyOwner, 'TechnicianPortalPage', 'legacy owner app must not own technician routes');
assertNotContains(legacyOwnerPath, legacyOwner, 'BrokerPortalPage', 'legacy owner app must not own broker routes');
assertNotContains(legacyOwnerPath, legacyOwner, 'DashboardPage from', 'legacy owner app must not import a second owner dashboard implementation');

try {
  const launchRegister = JSON.parse(launchRegisterRaw);
  const gates = Array.isArray(launchRegister.hardLaunchGates) ? launchRegister.hardLaunchGates : [];
  const externallyPending = gates.filter((gate) => gate.required !== false && gate.status === 'external_verification_required');
  if (externallyPending.length > 0 && launchRegister.decision === 'PUBLIC_LAUNCH_READY') {
    failures.push(`${launchRegisterPath}: decision cannot be PUBLIC_LAUNCH_READY while ${externallyPending.length} required external gates still need production proof`);
  }
  notes.push(`[route-consolidation] Launch decision: ${launchRegister.decision || 'MISSING'}`);
  notes.push(`[route-consolidation] External production gates still pending: ${externallyPending.length}`);
} catch (error) {
  failures.push(`${launchRegisterPath}: invalid JSON (${error.message})`);
}

notes.push('[route-consolidation] Canonical role route owners:');
notes.push('  - Main app shell: src/App.tsx');
notes.push('  - Owner portal: src/owner/OwnerApp.tsx');
notes.push('  - Tenant portal: src/tenant/TenantApp.tsx');
notes.push('  - Technician portal: src/technician/TechnicianApp.tsx');
notes.push('  - Broker portal: src/broker/BrokerApp.tsx');
notes.push('  - Admin command center: src/admin/AdminTerminal.tsx');
notes.push('  - Legacy admin-panel and owner-app: manual handoff only');

for (const note of notes) console.log(note);

if (failures.length > 0) {
  console.error('\n[route-consolidation] Result: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\n[route-consolidation] Result: PASS — duplicate route ownership is blocked.');
