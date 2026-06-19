import { readFileSync } from 'node:fs';

const app = readFileSync('apps/admin-panel/src/App.tsx', 'utf8');
const nav = readFileSync('apps/admin-panel/src/components/Navigation.tsx', 'utf8');
const login = readFileSync('apps/admin-panel/src/components/UnifiedLogin.tsx', 'utf8');
const auth = readFileSync('apps/admin-panel/src/context/AuthContext.tsx', 'utf8');
const adminPackage = JSON.parse(readFileSync('apps/admin-panel/package.json', 'utf8'));

const requiredLogin = [
  'signInWithRedirect',
  'browserLocalPersistence',
  'SIGN IN WITH GOOGLE',
  'ADMIN PORTAL',
  'auth/unauthorized-domain',
  'auth/operation-not-allowed',
];

for (const token of requiredLogin) {
  if (!login.includes(token)) throw new Error(`Admin login missing required token: ${token}`);
}

if (login.includes('signInWithPopup')) {
  throw new Error('Admin login must not use signInWithPopup. Use redirect SSO for production/mobile.');
}

const requiredAuth = [
  'ceo@bin-groups.com',
  'ceo@bin-group.com',
  'setDoc(doc(db, \'users\'',
  'ADMIN_ACCESS_DENIED',
  'ADMIN_PROFILE_LOOKUP_FAILED',
  'super_admin',
];

for (const token of requiredAuth) {
  if (!auth.includes(token)) throw new Error(`Admin auth gate missing required token: ${token}`);
}

const requiredRoutes = [
  "path=\"/dashboard\"",
  "path=\"/owners\"",
  "path=\"/tenants\"",
  "path=\"/tickets\"",
  "path=\"/technicians\"",
  "path=\"/manual-approvals\"",
  "path=\"/ops/whatsapp-triage\"",
  "path=\"/ops/rfq\"",
  "path=\"/ops/vendors\"",
  "path=\"/ops/data-governance\"",
  "path=\"/hr\"",
  "path=\"/audit\"",
];

for (const token of requiredRoutes) {
  if (!app.includes(token)) throw new Error(`Admin App route missing: ${token}`);
}

const requiredDirectOrPrebuildRoutes = [
  '/ops/bin-connect',
  '/ops/pilot-completion',
  '/ops/public-launch-command',
];

const prebuild = adminPackage.scripts?.prebuild || '';
for (const route of requiredDirectOrPrebuildRoutes) {
  if (!app.includes(route) && !prebuild.includes(route.includes('bin-connect') ? 'wire-bin-connect-admin-inbox.mjs' : route.includes('pilot-completion') ? 'wire-pilot-completion-routes.mjs' : 'wire-public-launch-command-center.mjs')) {
    throw new Error(`Admin route is neither directly wired nor prebuild-wired: ${route}`);
  }
}

const requiredNavigation = [
  'Dashboard',
  'BIN Connect Inbox',
  'Pilot Completion',
  'Public Launch Command',
  'WhatsApp Triage',
  'RFQ Trust Workflow',
  'Vendor Command',
  'PDPL Governance',
  'HR Command',
];

for (const token of requiredNavigation) {
  if (!nav.includes(token) && !prebuild.includes(token.includes('BIN Connect') ? 'wire-bin-connect-admin-inbox.mjs' : token.includes('Pilot') ? 'wire-pilot-completion-routes.mjs' : token.includes('Public Launch') ? 'wire-public-launch-command-center.mjs' : '')) {
    throw new Error(`Admin navigation missing: ${token}`);
  }
}

console.log('Admin dashboard access verification passed.');
