import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const appPath = resolve(repoRoot, 'apps/admin-panel/src/App.tsx');
const navPath = resolve(repoRoot, 'apps/admin-panel/src/components/Navigation.tsx');

let app = readFileSync(appPath, 'utf8');
if (!app.includes("BinConnectInboxPage")) {
  app = app.replace(
    "import DataGovernanceAuditPage from './pages/admin/DataGovernanceAuditPage';",
    "import DataGovernanceAuditPage from './pages/admin/DataGovernanceAuditPage';\nimport BinConnectInboxPage from './pages/admin/BinConnectInboxPage';"
  );
  app = app.replace(
    "<Route path=\"/ops/whatsapp-triage\" element={<ProtectedRoute adminOnly><WhatsAppTriageQueuePage /></ProtectedRoute>} />",
    "<Route path=\"/ops/whatsapp-triage\" element={<ProtectedRoute adminOnly><WhatsAppTriageQueuePage /></ProtectedRoute>} />\n                    <Route path=\"/ops/bin-connect\" element={<ProtectedRoute adminOnly><BinConnectInboxPage /></ProtectedRoute>} />"
  );
  writeFileSync(appPath, app);
  console.log('Wired BIN Connect admin route.');
} else {
  console.log('BIN Connect admin route already wired.');
}

let nav = readFileSync(navPath, 'utf8');
if (!nav.includes("BIN Connect Inbox")) {
  nav = nav.replace(
    "{ text: 'WhatsApp Triage', icon: <PendingActionsIcon />, path: '/ops/whatsapp-triage', color: binThemeTokens.gold },",
    "{ text: 'WhatsApp Triage', icon: <PendingActionsIcon />, path: '/ops/whatsapp-triage', color: binThemeTokens.gold },\n        { text: 'BIN Connect Inbox', icon: <PendingActionsIcon />, path: '/ops/bin-connect', color: binThemeTokens.gold },"
  );
  writeFileSync(navPath, nav);
  console.log('Wired BIN Connect admin navigation.');
} else {
  console.log('BIN Connect admin navigation already wired.');
}
