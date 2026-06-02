import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hasFile = (file) => fs.existsSync(path.join(root, file));
const text = (file) => hasFile(file) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
const contains = (file, tokens) => tokens.every((token) => text(file).includes(token));

const rows = [];
function check(area, name, ok, note = '') {
  rows.push({ area, name, status: ok ? 'PASS' : 'FAIL', note });
}
function advisory(area, name, ok, note = '') {
  rows.push({ area, name, status: ok ? 'PASS' : 'WARN', note });
}

const app = text('src/App.tsx');
const lang = text('src/context/LanguageContext.tsx');
const adminDesignStudio = text('apps/admin-panel/src/pages/admin/DesignStudioAdminPage.tsx');
const functionsIndex = text('functions/index.ts');
const aiImageGenerationWired = (
  adminDesignStudio.includes("httpsCallable(functions, 'generateDesignConcept')") &&
  adminDesignStudio.includes('generatedImage') &&
  functionsIndex.includes('export const generateDesignConcept') &&
  functionsIndex.includes('GEMINI_API_KEY') &&
  functionsIndex.includes('generatedImage')
);

check('Core', 'package.json', hasFile('package.json'));
check('Core', 'firebase.json', hasFile('firebase.json'));
check('Core', 'firestore.rules', hasFile('firestore.rules'));
check('Core', 'storage.rules', hasFile('storage.rules'));
check('Profiles', 'Owner portal', hasFile('src/owner/OwnerApp.tsx'));
check('Profiles', 'Tenant portal', hasFile('src/tenant/TenantApp.tsx'));
check('Profiles', 'Technician portal', hasFile('src/technician/TechnicianApp.tsx'));
check('Profiles', 'Broker portal', hasFile('src/broker/BrokerApp.tsx'));
check('Profiles', 'Admin terminal', hasFile('src/admin/AdminTerminal.tsx'));
check('Routing', 'Protected owner route', app.includes('/owner/*'));
check('Routing', 'Protected tenant route', app.includes('/tenant/*'));
check('Routing', 'Protected technician route', app.includes('/technician/*'));
check('Routing', 'Protected broker route', app.includes('/broker/*'));
check('Routing', 'Protected admin route', app.includes('/admin/*'));
check('Arabic', 'Arabic language configured', lang.includes('ar'));
check('Arabic', 'RTL flag configured', lang.includes('isRTL'));
advisory('Arabic', 'Design Studio translated', contains('src/pages/DesignStudioPage.tsx', ['useLanguage']), 'Translate remaining hardcoded labels before full public launch.');
check('GPS', 'Tracking utility exists', hasFile('src/utils/liveTracking.ts'));
check('GPS', 'Tracking writes Firestore location', contains('src/utils/liveTracking.ts', ['watchPosition', 'technicianLocation', 'LIVE_TRACKING']));
check('GPS', 'Technician map exists', hasFile('src/technician/pages/TechnicianMapPage.tsx'));
check('GPS', 'Admin live map exists', hasFile('src/admin/pages/map/LiveMapPage.tsx'));
check('PDF', 'Contract PDF engine exists', hasFile('src/utils/bilingualContractPdf.ts'));
check('PDF', 'Mobile PDF fallback exists', contains('src/utils/bilingualContractPdf.ts', ['savePdfMobileSafe']));
check('PDF', 'Gate pass PDF exists', contains('src/admin/pages/map/LiveMapPage.tsx', ['jsPDF', 'GatePass']));
check('Push', 'Push service exists', hasFile('src/services/pushNotificationService.ts'));
check('Push', 'Push token persistence', contains('src/services/pushNotificationService.ts', ['fcmTokens', 'registerPushNotifications']));
advisory('Push', 'Messaging service worker', hasFile('public/firebase-messaging-sw.js'), 'Required for web push.');
check('AI Studio', 'Design studio exists', hasFile('src/pages/DesignStudioPage.tsx'));
check('AI Studio', 'Design records written', contains('src/pages/DesignStudioPage.tsx', ['design_requests', 'design_quotes', 'design_concepts']));
advisory('AI Studio', 'External AI image generation wired', aiImageGenerationWired, 'Admin Design Studio calls generateDesignConcept and backend returns generatedImage.');
check('HR', 'Technician HR page exists', hasFile('src/technician/pages/TechnicianHRPage.tsx'));
check('HR', 'Staff agreements allowed', text('firestore.rules').includes('staffAgreements'));
check('HR', 'Salary history allowed', text('firestore.rules').includes('salaryHistory'));
advisory('Play Store', 'Android project exists', hasFile('android') || hasFile('capacitor.config.ts'), 'Needed for native Play Store package.');
advisory('Play Store', 'Privacy route exists', app.includes('/privacy'));
advisory('Play Store', 'Terms route exists', app.includes('/terms'));

const pass = rows.filter((r) => r.status === 'PASS').length;
const warn = rows.filter((r) => r.status === 'WARN').length;
const fail = rows.filter((r) => r.status === 'FAIL').length;

const lines = [
  '# BIN GROUP Launch Readiness Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `PASS: ${pass}`,
  `WARN: ${warn}`,
  `FAIL: ${fail}`,
  '',
  '| Area | Check | Status | Note |',
  '|---|---|---:|---|',
  ...rows.map((r) => `| ${r.area} | ${r.name} | ${r.status} | ${r.note || ''} |`),
  '',
  fail === 0 ? 'No static blocking failures found. Complete manual device QA before public launch.' : 'Static blocking failures found. Fix FAIL items before public launch.',
];

fs.mkdirSync(path.join(root, 'audit'), { recursive: true });
fs.writeFileSync(path.join(root, 'audit', 'launch-readiness-report.md'), lines.join('\n'));
console.log(lines.join('\n'));


