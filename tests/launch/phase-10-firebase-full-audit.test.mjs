import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const read = (file) => readFileSync(file, 'utf8');

const login = read('src/pages/LoginPage.tsx');
const ownerLogin = read('apps/owner-app/src/pages/LoginPage.tsx');
const adminLogin = read('apps/admin-panel/src/components/UnifiedLogin.tsx');
const mfaEnroll = read('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx');
const mfaChallenge = read('apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx');
const mfaRecovery = read('functions/adminMfaRecovery.ts');
const adminSecurity = read('functions/adminSecurityProfile.ts');
const adminProvisioning = read('functions/adminUserProvisioning.ts');
const publicRole = read('functions/publicRoleAssignment.ts');
const ownerOnboarding = read('functions/ownerOnboarding.ts');
const rootFirebase = read('src/lib/firebase.ts');
const ownerFirebase = read('apps/owner-app/src/lib/firebase.ts');
const adminFirebase = read('apps/admin-panel/src/lib/firebase.ts');
const functionDefaults = read('functions/functionGlobalOptions.ts');
const runtimeAll = read('functions/runtimeAll.ts');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const iosDelegate = read('ios/App/App/AppDelegate.swift');
const iosBridge = read('ios/App/App/FirebaseAppCheckBridgePlugin.swift');
const iosController = read('ios/App/App/MainViewController.swift');
const iosEntitlements = read('ios/App/App/App.entitlements');
const iosProject = read('ios/App/App.xcodeproj/project.pbxproj');
const androidBridge = read('android/app/src/main/java/ae/bingroups/superapp/FirebaseAppCheckBridgePlugin.java');
const productionVerifier = read('scripts/verify-phase10-firebase-production-config.mjs');
const productionWorkflow = read('.github/workflows/firebase-production-deploy.yml');
const iosReleaseWorkflow = read('.github/workflows/ios-app-store-release.yml');

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) files.push(...walk(file));
    else if (stat.isFile() && file.endsWith('.ts')) files.push(file);
  }
  return files;
}

test('Phase 10 Authentication covers public roles, OAuth, Apple, reset, disabled accounts and claims', () => {
  assert.match(publicRole, /PUBLIC_ROLES = new Set\(\["owner", "tenant", "technician", "broker"\]\)/);
  assert.match(publicRole, /enforceAppCheck:\s*true/);
  assert.match(publicRole, /setCustomUserClaims/);
  assert.match(ownerOnboarding, /enforceAppCheck:\s*true/);
  assert.match(ownerOnboarding, /email_verified/);

  for (const source of [login, ownerLogin]) {
    assert.match(source, /GoogleAuthProvider/);
    assert.match(source, /OAuthProvider\(['"]apple\.com['"]\)/);
    assert.match(source, /sendPasswordResetEmail/);
  }
  assert.match(login, /auth\/user-disabled|account.*disabled/i);
  assert.match(adminLogin, /MultiFactorResolver|multi-factor-auth-required/);
});

test('Phase 10 Admin and Founder authentication preserves MFA, TOTP, recovery and session revocation', () => {
  assert.match(mfaEnroll, /TotpMultiFactorGenerator/);
  assert.match(mfaEnroll, /multiFactor\(/);
  assert.match(mfaChallenge, /TotpMultiFactorGenerator|MultiFactorResolver/);
  assert.match(mfaRecovery, /enforceAppCheck:\s*true/);
  assert.match(mfaRecovery, /revokeRefreshTokens/);
  assert.match(adminSecurity, /revokeRefreshTokens/);
  assert.match(adminProvisioning, /revokeRefreshTokens/);
  assert.match(productionVerifier, /PHONE_SMS/);
  assert.match(productionVerifier, /totpProviderConfig/);
  assert.match(productionVerifier, /apple\.com/);
  assert.match(productionVerifier, /google\.com/);
});

test('Phase 10 Functions App Check policy loads before deployed function modules and no callable opts out', () => {
  assert.match(functionDefaults, /setGlobalOptions/);
  assert.match(functionDefaults, /enforceAppCheck:\s*true/);
  assert.ok(runtimeAll.indexOf('import "./functionGlobalOptions"') < runtimeAll.indexOf("export * from './runtime'"));

  const offenders = [];
  for (const file of walk('functions')) {
    const source = read(file);
    if (/enforceAppCheck:\s*false/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `No Firebase Function may explicitly disable App Check: ${offenders.join(', ')}`);
});

test('Phase 10 Firestore explicitly protects server-authority and owner inspection collections from wildcard Admin access', () => {
  assert.match(firestoreRules, /match \/owner_portfolio_quotes\/\{quoteId\}[\s\S]*allow read, create, update, delete: if false/);
  assert.match(firestoreRules, /match \/system_payment_config\/\{configId\}[\s\S]*allow read, create, update, delete: if false/);
  assert.match(firestoreRules, /match \/propertyInspections\/\{inspectionId\}[\s\S]*ownerReviewStatus[\s\S]*\['APPROVED', 'DISPUTED'\]/);
  for (const collection of ['owner_portfolio_quotes', 'system_payment_config', 'propertyInspections']) {
    const count = firestoreRules.split(`'${collection}'`).length - 1;
    assert.ok(count >= 3, `${collection} must be excluded from read/create/update-delete wildcard authority`);
  }
});

test('Phase 10 Storage keeps onboarding, KYC, contract, invoice, technician and HR evidence fail-closed', () => {
  assert.match(storageRules, /match \/owners\/\{ownerId\}\/\{allPaths=\*\*\}[\s\S]*allow create:[\s\S]*resource == null[\s\S]*allow update, delete: if false/);
  assert.match(storageRules, /match \/onboarding-proof\/\{userId\}\/\{intakeId\}\/\{docType\}\/\{fileName\}/);
  assert.match(storageRules, /request\.resource\.metadata\.ownerUid == userId/);
  assert.match(storageRules, /request\.resource\.metadata\.intakeId == intakeId/);
  assert.match(storageRules, /request\.resource\.metadata\.docType == docType/);
  assert.match(storageRules, /match \/maintenanceTickets\/\{ticketId\}\/proofPhotos\/\{fileName\}[\s\S]*resource == null/);
  assert.match(storageRules, /match \/maintenanceTickets\/\{ticketId\}\/completionPhotos\/\{fileName\}[\s\S]*allow write: if false/);
  assert.match(storageRules, /match \/contracts\/\{contractId\}\/\{allPaths=\*\*\}[\s\S]*allow write: if false/);
  assert.match(storageRules, /match \/invoices\/\{invoiceId\}\/\{allPaths=\*\*\}[\s\S]*allow write: if false/);
  assert.match(storageRules, /match \/kyc_documents\/\{documentId\}[\s\S]*allow read, write: if false/);
  assert.match(storageRules, /match \/privateHrDocuments\/\{staffId\}\/\{allPaths=\*\*\}[\s\S]*allow read, write: if false/);
});

test('Phase 10 Web App Check remains fail-closed in production across unified, Owner and Admin clients', () => {
  assert.match(rootFirebase, /App Check configuration is required for production builds/);
  assert.match(rootFirebase, /ReCaptchaEnterpriseProvider/);
  assert.match(ownerFirebase, /App Check is required for production Owner builds/);
  assert.match(ownerFirebase, /ReCaptchaEnterpriseProvider/);
  assert.match(adminFirebase, /ReCaptchaEnterpriseProvider/);
});

test('Phase 10 Android App Check remains native Play Integrity bridged into the Web SDK', () => {
  assert.match(rootFirebase, /play-integrity-native/);
  assert.match(rootFirebase, /CustomProvider/);
  assert.match(androidBridge, /FirebaseAppCheckBridge/);
  assert.match(androidBridge, /PlayIntegrityAppCheckProviderFactory|FirebaseAppCheck/);
});

test('Phase 10 iOS App Check uses native App Attest and bridges the token into the Web SDK', () => {
  assert.match(rootFirebase, /app-attest-native/);
  assert.match(rootFirebase, /isCapacitorIos/);
  assert.match(iosDelegate, /AppCheck\.setAppCheckProviderFactory/);
  assert.match(iosDelegate, /AppAttestProvider/);
  assert.match(iosDelegate, /DeviceCheckProvider/);
  assert.match(iosDelegate, /FirebaseApp\.configure/);
  assert.ok(
    iosDelegate.indexOf('AppCheck.setAppCheckProviderFactory') < iosDelegate.indexOf('FirebaseApp.configure'),
    'App Check provider factory must be installed before Firebase config',
  );
  assert.match(iosBridge, /AppCheck\.appCheck\(\)\.token\(forcingRefresh:/);
  assert.match(iosController, /registerPluginInstance\(FirebaseAppCheckBridgePlugin\(\)\)/);
  assert.match(iosEntitlements, /com\.apple\.developer\.devicecheck\.appattest-environment/);
  assert.match(iosEntitlements, /<string>production<\/string>/);
  assert.match(iosProject, /firebase-ios-sdk/);
  assert.match(iosProject, /version = 12\.19\.2/);
  assert.doesNotMatch(iosProject, /IPHONEOS_DEPLOYMENT_TARGET = 14\.0/);
  assert.match(iosProject, /IPHONEOS_DEPLOYMENT_TARGET = 15\.0/);
  assert.match(iosProject, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements/);
});

test('Phase 10 protected workflows verify live Firebase Auth providers and native iOS App Check without weakening launch gates', () => {
  assert.match(productionVerifier, /defaultSupportedIdpConfigs\/.*providerId|defaultSupportedIdpConfigs\//);
  assert.match(productionVerifier, /appAttestConfig/);
  assert.match(productionVerifier, /playIntegrityConfig/);
  assert.match(productionVerifier, /recaptchaEnterpriseConfig/);
  assert.match(productionVerifier, /recaptchaV3Config/);
  assert.match(productionVerifier, /identitytoolkit\.googleapis\.com/);
  assert.match(productionVerifier, /firestore\.googleapis\.com/);
  assert.match(productionVerifier, /firebasestorage\.googleapis\.com/);
  assert.match(productionVerifier, /enforcementMode !== 'ENFORCED'/);
  assert.match(productionVerifier, /authorizedDomains/);
  assert.match(productionWorkflow, /verify-phase10-firebase-production-config\.mjs/);
  assert.match(iosReleaseWorkflow, /inject-ios-firebase-config\.mjs/);
  assert.match(iosReleaseWorkflow, /verify-phase10-firebase-production-config\.mjs/);
});
