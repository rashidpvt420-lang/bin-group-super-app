import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// First executable tranche: enforce completed launch safeguards and keep the
// remaining profile/onboarding requirements visible as explicit TODO tests.
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const profileContracts = [
  {
    role: 'Owner',
    router: 'src/owner/OwnerApp.tsx',
    page: 'src/owner/pages/OwnerProfilePage.tsx',
    component: 'OwnerProfilePage',
  },
  {
    role: 'Tenant',
    router: 'src/tenant/TenantApp.tsx',
    page: 'src/tenant/pages/TenantProfilePage.tsx',
    component: 'TenantProfilePage',
  },
  {
    role: 'Technician',
    router: 'src/technician/TechnicianApp.tsx',
    page: 'src/technician/pages/TechnicianProfilePage.tsx',
    component: 'TechnicianProfilePage',
  },
  {
    role: 'Broker',
    router: 'src/broker/BrokerApp.tsx',
    page: 'src/broker/pages/BrokerProfilePage.tsx',
    component: 'BrokerProfilePage',
  },
];

test('Owner, Tenant, Technician and Broker expose protected profile routes', async () => {
  for (const contract of profileContracts) {
    const router = await read(contract.router);
    assert.match(router, new RegExp(`import\\s+${contract.component}\\s+from`), `${contract.role} profile component is not imported`);
    assert.match(
      router,
      new RegExp(`<Route\\s+path=["']\\/profile["']\\s+element=\\{<${contract.component}\\s*\\/>\\}`),
      `${contract.role} /profile route is not registered`,
    );
  }
});

test('all live profile pages retain bilingual, RTL, mobile and account-recovery contracts', async () => {
  for (const contract of profileContracts) {
    const source = await read(contract.page);
    assert.match(source, /useLanguage\(\)/, `${contract.role} profile does not use the language provider`);
    assert.match(source, /isRTL/, `${contract.role} profile does not consume RTL state`);
    assert.match(source, /lang\s*===\s*['"]ar['"]/, `${contract.role} profile has no Arabic branch`);
    assert.match(source, /direction:\s*isRTL\s*\?\s*['"]rtl['"]\s*:\s*['"]ltr['"]/, `${contract.role} profile does not set visual direction`);
    assert.match(source, /<Avatar\b/, `${contract.role} profile has no identity/avatar surface`);
    if (contract.role === 'Tenant') {
      assert.match(source, /TenantCorrectionPanel/, 'Tenant profile has no reviewed correction workflow');
      assert.match(source, /Verified identity and contact records are read-only/i, 'Tenant profile does not explain reviewed identity authority');
      assert.doesNotMatch(source, /\bsetDoc\s*\(/, 'Tenant profile must not directly persist reviewed identity fields');
      assert.doesNotMatch(source, /\bupdateProfile\s*\(/, 'Tenant profile must not directly mutate Firebase Auth identity');
    } else {
      assert.match(source, /handleSave/, `${contract.role} profile has no save workflow`);
    }
    assert.match(source, /sendPasswordResetEmail/, `${contract.role} profile has no account-recovery workflow`);
    assert.match(source, /xs=/, `${contract.role} profile has no mobile grid breakpoint`);
  }
});

test('Broker KYC submission is callable-only and never writes raw profile values directly', async () => {
  const source = await read('src/broker/pages/BrokerProfilePage.tsx');
  assert.match(source, /httpsCallable/);
  assert.match(source, /submitBrokerKycProfile/);
  assert.match(source, /private server-written KYC vault/i);
  assert.doesNotMatch(source, /\bsetDoc\s*\(/);
  assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
});

test('owner onboarding is account-first and browser persistence is minimal', async () => {
  const page = await read('src/pages/PropertyOnboardingPage.tsx');
  const store = await read('src/store/onboardingStore.ts');
  const stateMachine = await read('src/lib/onboardingStateMachine.ts');
  const asset = await read('src/components/onboarding/AssetProfileStep.tsx');

  const accountCase = page.indexOf('case 2: return <AccountCreationStep');
  const assetCase = page.indexOf('case 3: return <AssetProfileStep');
  assert.ok(accountCase >= 0 && assetCase > accountCase, 'Owner account creation must precede title-deed OCR and asset intake');

  const accountStage = page.indexOf("label('Account', 'الحساب')");
  const propertyStage = page.indexOf("label('Property', 'العقار')");
  assert.ok(accountStage >= 0 && propertyStage > accountStage, 'Visible onboarding stages must show Account before Property');

  assert.match(stateMachine, /account_created/);
  assert.match(store, /version:\s*4/);
  assert.match(store, /partialize:\s*\(state\)\s*=>\s*\(\{\s*step:\s*state\.step,\s*intakeId:\s*state\.intakeId,?\s*\}\)/s);
  for (const sensitive of ['password', 'kycUrls', 'paymentManifest', 'signatureName', 'ownerAccount', 'proofDocuments']) {
    const partializeBlock = store.slice(store.indexOf('partialize:'), store.indexOf('partialize:') + 240);
    assert.doesNotMatch(partializeBlock, new RegExp(`\\b${sensitive}\\b`), `${sensitive} must not be persisted`);
  }

  assert.doesNotMatch(asset, /1,850|\b1850\b/);
  assert.match(asset, /manual_review_required|ASSESSMENT_REQUIRED/i);
});

test.todo('Admin has a dedicated personal/security profile route separate from operational settings');
test.todo('Owner profile tests cover verified phone, KYC status, billing-identity matching and privacy controls');
test.todo('Tenant profile tests cover multiple active/historical units, lease lifecycle and unit-link correction');
test.todo('Technician profile tests cover credential expiry, duty restriction, GPS/device readiness and payroll setup');
test.todo('Broker tests cover document review, payout-account ownership, agreement hash, withdrawal MFA and payout history');
test.todo('Owner onboarding tests cover server quote authority, contract-plan mapping, annual-payment wording and multi-property portfolios');
test.todo('Arabic tests fail on untranslated Admin, Asset/Mosque, Location, Payment and shell-level copy');
