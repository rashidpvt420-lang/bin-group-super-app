import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const appPath = resolve(repoRoot, 'apps/admin-panel/src/App.tsx');
let app = readFileSync(appPath, 'utf8');
if (!app.includes("PublicLaunchCommandCenterPage")) {
  app = app.replace(
    "import PilotCompletionCommandPage from './pages/admin/PilotCompletionCommandPage';",
    "import PilotCompletionCommandPage from './pages/admin/PilotCompletionCommandPage';\nimport PublicLaunchCommandCenterPage from './pages/admin/PublicLaunchCommandCenterPage';"
  );
  app = app.replace(
    "<Route path=\"/ops/pilot-completion\" element={<ProtectedRoute adminOnly><PilotCompletionCommandPage /></ProtectedRoute>} />",
    "<Route path=\"/ops/pilot-completion\" element={<ProtectedRoute adminOnly><PilotCompletionCommandPage /></ProtectedRoute>} />\n                    <Route path=\"/ops/public-launch-command\" element={<ProtectedRoute adminOnly><PublicLaunchCommandCenterPage /></ProtectedRoute>} />"
  );
  writeFileSync(appPath, app);
  console.log('Wired public launch command center route.');
} else {
  console.log('Public launch command center route already wired.');
}

const navPath = resolve(repoRoot, 'apps/admin-panel/src/components/Navigation.tsx');
let nav = readFileSync(navPath, 'utf8');
if (!nav.includes("Public Launch Command")) {
  nav = nav.replace(
    "{ text: 'Pilot Completion', icon: <PendingActionsIcon />, path: '/ops/pilot-completion', color: binThemeTokens.gold },",
    "{ text: 'Pilot Completion', icon: <PendingActionsIcon />, path: '/ops/pilot-completion', color: binThemeTokens.gold },\n        { text: 'Public Launch Command', icon: <PendingActionsIcon />, path: '/ops/public-launch-command', color: binThemeTokens.gold },"
  );
  writeFileSync(navPath, nav);
  console.log('Wired public launch command center navigation.');
} else {
  console.log('Public launch command center navigation already wired.');
}
