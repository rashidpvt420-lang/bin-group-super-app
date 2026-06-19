import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const rootPatches = [
  {
    path: 'src/owner/OwnerApp.tsx',
    importAfter: "import BinConnectChatBox from '../components/BinConnectChatBox';",
    importLine: "import PilotCompletionPage from '../components/PilotCompletionPage';",
    routeAnchor: '                <Route path="/bin-connect" element={<BinConnectInboxPage role="owner" />} />',
    routeLine: '                <Route path="/pilot-completion" element={<PilotCompletionPage role="owner" />} />',
  },
  {
    path: 'src/tenant/TenantApp.tsx',
    importAfter: "import BinConnectChatBox from '../components/BinConnectChatBox';",
    importLine: "import PilotCompletionPage from '../components/PilotCompletionPage';",
    routeAnchor: '                <Route path="/bin-connect" element={<BinConnectInboxPage role="tenant" dark />} />',
    routeLine: '                <Route path="/pilot-completion" element={<PilotCompletionPage role="tenant" dark />} />',
  },
  {
    path: 'src/technician/TechnicianApp.tsx',
    importAfter: "import BinConnectChatBox from '../components/BinConnectChatBox';",
    importLine: "import PilotCompletionPage from '../components/PilotCompletionPage';",
    routeAnchor: '                <Route path="/bin-connect" element={<BinConnectInboxPage role="technician" />} />',
    routeLine: '                <Route path="/pilot-completion" element={<PilotCompletionPage role="technician" />} />',
  },
  {
    path: 'src/broker/BrokerApp.tsx',
    importAfter: "import BinConnectChatBox from '../components/BinConnectChatBox';",
    importLine: "import PilotCompletionPage from '../components/PilotCompletionPage';",
    routeAnchor: '        <Route path="/bin-connect" element={<BinConnectInboxPage role="broker" />} />',
    routeLine: '        <Route path="/pilot-completion" element={<PilotCompletionPage role="broker" />} />',
  },
];

function patchFile(patch) {
  const fullPath = resolve(repoRoot, patch.path);
  let file = readFileSync(fullPath, 'utf8');
  let changed = false;
  if (!file.includes(patch.importLine)) {
    file = file.replace(patch.importAfter, `${patch.importAfter}\n${patch.importLine}`);
    changed = true;
  }
  if (!file.includes(patch.routeLine)) {
    file = file.replace(patch.routeAnchor, `${patch.routeAnchor}\n${patch.routeLine}`);
    changed = true;
  }
  if (changed) {
    writeFileSync(fullPath, file);
    console.log(`Wired pilot completion route in ${patch.path}`);
  } else {
    console.log(`Pilot completion route already wired in ${patch.path}`);
  }
}

for (const patch of rootPatches) patchFile(patch);

const adminAppPath = resolve(repoRoot, 'apps/admin-panel/src/App.tsx');
let adminApp = readFileSync(adminAppPath, 'utf8');
if (!adminApp.includes("PilotCompletionCommandPage")) {
  adminApp = adminApp.replace(
    "import BinConnectInboxPage from './pages/admin/BinConnectInboxPage';",
    "import BinConnectInboxPage from './pages/admin/BinConnectInboxPage';\nimport PilotCompletionCommandPage from './pages/admin/PilotCompletionCommandPage';"
  );
  adminApp = adminApp.replace(
    "<Route path=\"/ops/bin-connect\" element={<ProtectedRoute adminOnly><BinConnectInboxPage /></ProtectedRoute>} />",
    "<Route path=\"/ops/bin-connect\" element={<ProtectedRoute adminOnly><BinConnectInboxPage /></ProtectedRoute>} />\n                    <Route path=\"/ops/pilot-completion\" element={<ProtectedRoute adminOnly><PilotCompletionCommandPage /></ProtectedRoute>} />"
  );
  writeFileSync(adminAppPath, adminApp);
  console.log('Wired admin pilot completion route.');
} else {
  console.log('Admin pilot completion route already wired.');
}

const adminNavPath = resolve(repoRoot, 'apps/admin-panel/src/components/Navigation.tsx');
let adminNav = readFileSync(adminNavPath, 'utf8');
if (!adminNav.includes("Pilot Completion")) {
  adminNav = adminNav.replace(
    "{ text: 'BIN Connect Inbox', icon: <PendingActionsIcon />, path: '/ops/bin-connect', color: binThemeTokens.gold },",
    "{ text: 'BIN Connect Inbox', icon: <PendingActionsIcon />, path: '/ops/bin-connect', color: binThemeTokens.gold },\n        { text: 'Pilot Completion', icon: <PendingActionsIcon />, path: '/ops/pilot-completion', color: binThemeTokens.gold },"
  );
  writeFileSync(adminNavPath, adminNav);
  console.log('Wired admin pilot completion navigation.');
} else {
  console.log('Admin pilot completion navigation already wired.');
}
