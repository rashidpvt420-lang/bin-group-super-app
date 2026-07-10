import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, 'artifacts', 'route-consolidation');
const normalize = (value) => value.replaceAll('\\', '/');
const read = (path) => existsSync(resolve(ROOT, path)) ? readFileSync(resolve(ROOT, path), 'utf8') : '';

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, output);
    else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry))) output.push(normalize(relative(ROOT, full)));
  }
  return output;
}

function parseImports(source) {
  const imports = [];
  const pattern = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(source))) imports.push(match[1]);
  return imports;
}

function parseRoutes(source) {
  const routes = [];
  const pattern = /<Route\b([\s\S]*?)\/?>(?=\s*<|\s*\{|\s*\)|\s*$)/g;
  let match;
  while ((match = pattern.exec(source))) {
    const attrs = match[1];
    const pathMatch = attrs.match(/\bpath\s*=\s*(?:['"]([^'"]+)['"]|\{\s*['"]([^'"]+)['"]\s*\})/);
    if (!pathMatch) continue;
    const componentMatch = attrs.match(/\belement\s*=\s*\{\s*<([A-Za-z_$][\w$]*)/);
    routes.push({ path: pathMatch[1] || pathMatch[2], component: componentMatch?.[1] || null });
  }
  return routes;
}

function resolvedImportedFiles(appPath, imports) {
  const appDir = resolve(ROOT, appPath, '..');
  const resolved = new Set();
  for (const specifier of imports) {
    if (!specifier.startsWith('.')) continue;
    const candidate = resolve(appDir, specifier);
    for (const suffix of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
      const full = `${candidate}${suffix}`;
      if (existsSync(full) && statSync(full).isFile()) resolved.add(normalize(relative(ROOT, full)));
    }
  }
  return resolved;
}

const profileDefinitions = {
  owner: {
    app: 'src/owner/OwnerApp.tsx',
    pageDir: 'src/owner/pages',
    requiredRoutes: ['/dashboard', '/properties', '/contracts', '/financials', '/payment-proof', '/iban', '/profile', '/roi', '/units', '/tenants', '/property-passport', '/documents', '/renewals', '/inspections', '/community-operations', '/design-studio', '/complaint', '/tickets', '/ticket/:id', '/ai-intelligence', '/damage-estimate', '/p-l-report', '/contractor-marketplace', '/approvals', '/bin-connect', '/pilot-completion'],
    dashboardFiles: ['src/owner/pages/OwnerSimpleDashboardPage.tsx', 'src/owner/pages/OwnerDashboardResolvedPage.tsx'],
  },
  tenant: {
    app: 'src/tenant/TenantApp.tsx',
    pageDir: 'src/tenant/pages',
    requiredRoutes: ['/dashboard', '/unit', '/request', '/tickets', '/ticket/:id', '/chat', '/emergency', '/profile', '/documents', '/design-studio', '/gate-pass', '/amenities', '/payments', '/move-inspection', '/notices', '/keys', '/parcels', '/visitor-parking', '/marketplace', '/staff-directory', '/messages', '/community', '/renewals'],
    dashboardFiles: ['src/tenant/pages/TenantSimpleDashboardPage.tsx', 'src/tenant/pages/TenantDashboardPage.tsx'],
  },
  technician: {
    app: 'src/technician/TechnicianApp.tsx',
    pageDir: 'src/technician/pages',
    requiredRoutes: ['/dashboard', '/jobs', '/job/:id', '/proof-readiness', '/chat', '/map', '/history', '/profile', '/hr', '/offline', '/support', '/bin-connect', '/pilot-completion'],
    recommendedRoutes: ['/schedule', '/messages', '/performance', '/payroll', '/activity', '/documents', '/payments', '/safety', '/time-tracking', '/leaderboard'],
    dashboardFiles: ['src/technician/pages/TechnicianSimpleDashboardPage.tsx', 'src/technician/pages/TechnicianDashboardPage.tsx'],
  },
  broker: {
    app: 'src/broker/BrokerApp.tsx',
    pageDir: 'src/broker/pages',
    requiredRoutes: ['/dashboard', '/leads', '/leads/new', '/referrals', '/referrals/new', '/commissions', '/attribution', '/documents', '/profile'],
    recommendedRoutes: ['/submissions', '/withdrawals', '/agreement', '/onboarding', '/reports', '/earnings', '/payments', '/settings', '/bin-connect', '/pilot-completion'],
    dashboardFiles: ['src/broker/pages/BrokerSimpleDashboardPage.tsx', 'src/broker/pages/BrokerDashboardPage.tsx'],
  },
  admin: {
    app: 'apps/admin-panel/src/App.tsx',
    pageDir: 'apps/admin-panel/src/pages',
    requiredRoutes: ['/dashboard', '/owners', '/tenants', '/technicians', '/tickets', '/sos', '/payments', '/broker', '/broker-attributions', '/broker-commissions', '/document-vault', '/audit', '/reports', '/ops/public-launch-command'],
    dashboardFiles: ['apps/admin-panel/src/pages/dashboard/DashboardPage.tsx'],
  },
};

const profiles = {};
for (const [profile, definition] of Object.entries(profileDefinitions)) {
  const source = read(definition.app);
  const imports = parseImports(source);
  const importedFiles = resolvedImportedFiles(definition.app, imports);
  const routes = parseRoutes(source);
  const routePaths = routes.map((route) => route.path);
  const pageFiles = walk(resolve(ROOT, definition.pageDir)).sort();
  const unregisteredPages = pageFiles.filter((path) => !importedFiles.has(path) && !/\/index\.(ts|tsx|js|jsx)$/.test(path));
  const missingRequiredRoutes = definition.requiredRoutes.filter((path) => !routePaths.includes(path));
  const missingRecommendedRoutes = (definition.recommendedRoutes || []).filter((path) => !routePaths.includes(path));
  const dashboardEvidence = definition.dashboardFiles.map((path) => {
    const dashboard = read(path);
    return {
      path,
      exists: Boolean(dashboard),
      bytes: dashboard ? Buffer.byteLength(dashboard) : 0,
      firestoreReads: /(?:onSnapshot|getDocs|getDoc|getCountFromServer|httpsCallable)\s*\(/.test(dashboard),
      hardCodedSampleRisk: /Princess Tower|Marina Gate|Index Tower|Gate Tower|2450000|2520000/.test(dashboard),
      arabicAware: /useLanguage|lang\s*===\s*['"]ar|isRTL/.test(dashboard),
      errorState: /setError|severity=['"]error|error\s*&&/.test(dashboard),
      loadingState: /loading|CircularProgress|Skeleton|LinearProgress/.test(dashboard),
    };
  });

  profiles[profile] = {
    ...definition,
    routes,
    routePaths,
    pageFiles,
    importedPageFiles: [...importedFiles].filter((path) => path.startsWith(definition.pageDir)).sort(),
    unregisteredPages,
    missingRequiredRoutes,
    missingRecommendedRoutes,
    dashboardEvidence,
  };
}

const onboardingFiles = [
  'src/pages/PropertyOnboardingPage.tsx',
  'src/store/onboardingStore.ts',
  'src/store/onboardingPersistence.ts',
  'src/components/onboarding/CompanyProfileStep.tsx',
  'src/components/onboarding/AssetProfileStep.tsx',
  'src/components/onboarding/PropertyLocationStep.tsx',
  'src/components/onboarding/SystemsDataStep.tsx',
  'src/components/onboarding/CommercialTermsStep.tsx',
  'src/components/onboarding/ProofUploadStep.tsx',
  'src/components/onboarding/AccountCreationStep.tsx',
  'src/components/onboarding/ReviewBeforeSubmitStep.tsx',
  'src/components/onboarding/ContractSignatureStep.tsx',
  'src/components/onboarding/PaymentSummaryStep.tsx',
  'src/components/onboarding/PaymentSubmissionStep.tsx',
  'functions/ownerOnboarding.ts',
  'functions/ownerRegistrationRequest.ts',
  'functions/paymentTransactionApproval.ts',
  'functions/onboardingProofUpload.ts',
  'functions/stripePayment.ts',
];
const onboardingSources = Object.fromEntries(onboardingFiles.map((path) => [path, read(path)]));
const onboardingChecks = {
  allFilesExist: onboardingFiles.filter((path) => !onboardingSources[path]),
  safePersistenceInstalled: onboardingSources['src/pages/PropertyOnboardingPage.tsx'].includes('installSafeOnboardingPersistence'),
  restrictedAccountCreation: onboardingSources['src/components/onboarding/AccountCreationStep.tsx'].includes('submitPendingOwnerRegistration') && onboardingSources['src/components/onboarding/AccountCreationStep.tsx'].includes('dashboardLocked'),
  proofUploadAuthenticated: onboardingSources['functions/onboardingProofUpload.ts'].includes('assertOwner(request'),
  signedPackagePersistedBeforeStripe: onboardingSources['src/components/onboarding/PaymentSubmissionStep.tsx'].indexOf('submitOwnerOnboardingPaymentPackage') < onboardingSources['src/components/onboarding/PaymentSubmissionStep.tsx'].indexOf('createStripeCheckoutSession'),
  stripeAppCheck: onboardingSources['functions/stripePayment.ts'].includes('enforceAppCheck: true'),
  stripeKeepsAdminApproval: onboardingSources['functions/stripePayment.ts'].includes('ADMIN_VERIFICATION_REQUIRED') || onboardingSources['functions/stripePayment.ts'].includes('dashboardLocked'),
  adminPaymentCallable: onboardingSources['functions/paymentTransactionApproval.ts'].includes('adminApprovePayment'),
  paymentIdempotency: /idempot|already.*approved|duplicate/i.test(onboardingSources['functions/paymentTransactionApproval.ts']),
};

const collectionReferences = {};
for (const [profile, result] of Object.entries(profiles)) {
  const files = [result.app, ...result.pageFiles, ...result.dashboardFiles];
  const collections = new Set();
  for (const path of files) {
    const source = read(path);
    for (const match of source.matchAll(/collection\(\s*db\s*,\s*['"]([^'"]+)['"]/g)) collections.add(match[1]);
    for (const match of source.matchAll(/doc\(\s*db\s*,\s*['"]([^'"]+)['"]/g)) collections.add(match[1]);
  }
  collectionReferences[profile] = [...collections].sort();
}

const report = {
  generatedAt: new Date().toISOString(),
  profiles,
  onboarding: { files: onboardingFiles, checks: onboardingChecks },
  collectionReferences,
  totals: {
    profileRoutes: Object.values(profiles).reduce((sum, profile) => sum + profile.routes.length, 0),
    profilePageFiles: Object.values(profiles).reduce((sum, profile) => sum + profile.pageFiles.length, 0),
    unregisteredProfilePages: Object.values(profiles).reduce((sum, profile) => sum + profile.unregisteredPages.length, 0),
    missingRequiredRoutes: Object.values(profiles).reduce((sum, profile) => sum + profile.missingRequiredRoutes.length, 0),
    missingRecommendedRoutes: Object.values(profiles).reduce((sum, profile) => sum + profile.missingRecommendedRoutes.length, 0),
    dashboardsWithHardCodedSampleRisk: Object.values(profiles).flatMap((profile) => profile.dashboardEvidence).filter((item) => item.hardCodedSampleRisk).length,
  },
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'five-profile-workflow-audit.json'), JSON.stringify(report, null, 2));

const lines = [
  '# Five-Profile Workflow Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '## Totals',
  ...Object.entries(report.totals).map(([key, value]) => `- **${key}:** ${value}`),
  '',
];
for (const [profile, result] of Object.entries(profiles)) {
  lines.push(`## ${profile[0].toUpperCase()}${profile.slice(1)}`, '');
  lines.push(`- Routes: ${result.routes.length}`);
  lines.push(`- Page files: ${result.pageFiles.length}`);
  lines.push(`- Missing required routes: ${result.missingRequiredRoutes.length ? result.missingRequiredRoutes.join(', ') : 'None'}`);
  lines.push(`- Missing recommended routes: ${result.missingRecommendedRoutes.length ? result.missingRecommendedRoutes.join(', ') : 'None'}`);
  lines.push(`- Unregistered page files: ${result.unregisteredPages.length ? result.unregisteredPages.join(', ') : 'None'}`, '');
}
lines.push('## Onboarding Checks', '');
for (const [key, value] of Object.entries(onboardingChecks)) lines.push(`- **${key}:** ${Array.isArray(value) ? (value.length ? value.join(', ') : 'PASS') : value ? 'PASS' : 'FAIL'}`);
writeFileSync(join(OUTPUT_DIR, 'five-profile-workflow-audit.md'), `${lines.join('\n')}\n`);

console.log(JSON.stringify(report.totals, null, 2));
