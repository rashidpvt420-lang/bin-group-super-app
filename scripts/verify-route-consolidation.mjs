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

const mainAppPath = 'src/App.tsx';
const ownerAppPath = 'src/owner/OwnerApp.tsx';
const tenantAppPath = 'src/tenant/TenantApp.tsx';
const technicianAppPath = 'src/technician/TechnicianApp.tsx';
const brokerAppPath = 'src/broker/BrokerApp.tsx';
const adminTerminalPath = 'src/admin/AdminTerminal.tsx';
const operationalAdminPath = 'apps/admin-panel/src/App.tsx';
const legacyOwnerPath = 'apps/owner-app/src/App.tsx';
const launchRegisterPath = 'launch_package/hard-launch-readiness.json';

const mainApp = read(mainAppPath);
const ownerApp = read(ownerAppPath);
const tenantApp = read(tenantAppPath);
const technicianApp = read(technicianAppPath);
const brokerApp = read(brokerAppPath);
const adminTerminal = read(adminTerminalPath);
const operationalAdmin = read(operationalAdminPath);
const legacyOwner = read(legacyOwnerPath);
const launchRegisterRaw = read(launchRegisterPath);

assertContains(mainAppPath, mainApp, '<Route path="/admin/*" element={protectedRoute(ADMIN_STAFF_ROLES, <AdminTerminal />)} />', 'main app admin entry must remain the protected launch/evidence handoff');
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
assertContains(technicianAppPath, technicianApp, '<Route path="/jobs" element={<TechnicianJobsPage />} />', 'technician lifecycle must use the canonical jobs surface');

assertContains(brokerAppPath, brokerApp, '<Route path="/" element={<BrokerSimpleDashboardPage />} />', 'broker root starts with simple dashboard');
assertContains(brokerAppPath, brokerApp, '<Route path="/dashboard/full" element={<BrokerDashboardPage />} />', 'full broker dashboard remains available under an explicit full route');
assertContains(brokerAppPath, brokerApp, '<Route path="/attribution" element={<BrokerAttributionProofPage />} />', 'broker attribution proof route must stay registered');
assertContains(brokerAppPath, brokerApp, '<Route path="/leads/new" element={<BrokerLeadsPage openFormByDefault={true} />} />', 'broker lead creation must use one canonical form route');

assertContains(adminTerminalPath, adminTerminal, 'Canonical Admin Coverage', 'main app admin handoff must retain launch evidence coverage');
assertContains(adminTerminalPath, adminTerminal, 'Route consolidation guard', 'admin runbook must include the route consolidation test');
assertContains(adminTerminalPath, adminTerminal, 'CANONICAL_SLA_POLICY', 'admin launch dashboard must use the same SLA source as tenant workflow');
assertContains(adminTerminalPath, adminTerminal, 'system_health/admin_summaries', 'hard launch gates must remain tied to evidence, not static green UI');
assertContains(adminTerminalPath, adminTerminal, 'LEGACY_ADMIN_PANEL_URL', 'main app admin handoff must retain a link to the dedicated operational admin application');

assertContains(operationalAdminPath, operationalAdmin, 'DashboardPage', 'dedicated admin application must own the operational dashboard');
assertContains(operationalAdminPath, operationalAdmin, 'OwnerManagementPage', 'dedicated admin application must own owner operations');
assertContains(operationalAdminPath, operationalAdmin, 'TenantsManagementPage', 'dedicated admin application must own tenant operations');
assertContains(operationalAdminPath, operationalAdmin, 'TicketsManagementPage', 'dedicated admin application must own ticket operations');
assertContains(operationalAdminPath, operationalAdmin, 'TechniciansManagementPage', 'dedicated admin application must own technician operations');
assertContains(operationalAdminPath, operationalAdmin, '<Route path="/manual-approvals"', 'dedicated admin application must expose payment approval operations');
assertContains(operationalAdminPath, operationalAdmin, '<Route path="/document-vault"', 'dedicated admin application must expose document operations');
assertContains(operationalAdminPath, operationalAdmin, '<Route path="/audit"', 'dedicated admin application must expose audit operations');
assertNotContains(operationalAdminPath, operationalAdmin, 'LegacyAdminRedirectShell', 'operational admin application must not be replaced by a redirect-only shell');
assertNotContains(operationalAdminPath, operationalAdmin, 'window.location.replace', 'operational admin application must authenticate and render locally');
assertNotContains(operationalAdminPath, operationalAdmin, 'setTimeout', 'admin authentication must not use a false boot-release timer');

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

notes.push('[route-consolidation] Canonical route owners:');
notes.push('  - Main public/role app shell: src/App.tsx');
notes.push('  - Owner portal: src/owner/OwnerApp.tsx');
notes.push('  - Tenant portal: src/tenant/TenantApp.tsx');
notes.push('  - Technician portal: src/technician/TechnicianApp.tsx');
notes.push('  - Broker portal: src/broker/BrokerApp.tsx');
notes.push('  - Main-app admin launch/evidence handoff: src/admin/AdminTerminal.tsx');
notes.push('  - Dedicated operational admin application: apps/admin-panel/src/App.tsx');
notes.push('  - Legacy owner app: manual handoff only');

for (const note of notes) console.log(note);

if (failures.length > 0) {
  console.error('\n[route-consolidation] Result: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\n[route-consolidation] Result: PASS — route ownership is explicit and duplicate ownership is blocked.');
