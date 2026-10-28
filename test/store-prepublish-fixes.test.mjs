import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { isNativeApp, GOOGLE_SIGNIN_UNSUPPORTED_CODE } from '../src/lib/nativePlatform.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => access(new URL(`../${path}`, import.meta.url)).then(() => true, () => false);

test('native detection is a safe boolean and the unsupported-environment code is the Firebase one', () => {
  assert.equal(typeof isNativeApp(), 'boolean');
  assert.equal(isNativeApp(), false); // plain Node/web: Google sign-in stays available
  assert.equal(GOOGLE_SIGNIN_UNSUPPORTED_CODE, 'auth/operation-not-supported-in-this-environment');
});

test('Google sign-in is hidden on the native app on login, sign-up and owner landing, and fails gracefully', async () => {
  const [login, create, landing] = await Promise.all([
    read('src/pages/LoginPage.tsx'), read('src/components/onboarding/AccountCreationStep.tsx'), read('src/pages/OwnerLandingPage.tsx'),
  ]);
  for (const [name, src] of [['LoginPage', login], ['AccountCreationStep', create], ['OwnerLandingPage', landing]]) {
    assert.match(src, /from '(\.\.\/)+lib\/nativePlatform'/, `${name} imports the native helper`);
  }
  assert.match(login, /\{!isNativeApp\(\) && \(/);
  assert.match(landing, /\{!isNativeApp\(\) && \(<>/);
  assert.match(create, /const showGoogle = !isNativeApp\(\)/);
  assert.match(create, /\{showGoogle && \(/);
  // graceful handling of the Firebase "not supported in this environment" error (no raw error, no redirect loop)
  assert.match(login, /auth\/operation-not-supported-in-this-environment/);
  assert.match(create, /auth\/operation-not-supported-in-this-environment/);
  const handleGoogle = login.slice(login.indexOf('const handleGoogleLogin'));
  assert.match(handleGoogle.slice(0, 400), /if \(isNativeApp\(\)\)/);
});

test('sign-up requires ticking the Terms/Privacy consent before any account can be created', async () => {
  const create = await read('src/components/onboarding/AccountCreationStep.tsx');
  assert.match(create, /const \[acceptedLegal, setAcceptedLegal\] = useState\(false\)/);
  assert.match(create, /if \(!acceptedLegal\) return legalConsentRequiredMessage;/, 'email/password creation is blocked in validation');
  assert.match(create, /if \(!acceptedLegal\) \{ setNotice\(\{ message: legalConsentRequiredMessage/, 'Google sign-up is blocked too');
  assert.match(create, /data-testid="owner-legal-consent"|'data-testid': 'owner-legal-consent'/);
  assert.match(create, /disabled=\{loading \|\| !acceptedLegal\}/, 'create button is disabled until consent');
  assert.ok(create.includes('href="/terms.html"') && create.includes('href="/privacy.html"'));
  assert.match(create, /validateCreate\(\)/);
});

test('login and sign-up screens link to Privacy and Terms (static pages, CSP-safe plain anchors)', async () => {
  const login = await read('src/pages/LoginPage.tsx');
  assert.match(login, /href="\/privacy\.html" data-testid="login-privacy-link"/);
  assert.match(login, /href="\/terms\.html" data-testid="login-terms-link"/);
});

test('legal HTML pages have a Back to app link and the privacy policy is accurate and current', async () => {
  for (const f of ['public/privacy.html', 'public/privacy-policy.html', 'public/terms.html', 'public/terms-of-service.html', 'public/delete-account.html']) {
    const html = await read(f);
    assert.match(html, /<a href="\/"[^>]*>&larr; Back to app<\/a>/, `${f} links back to the app`);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)|onclick=/i, `${f} stays CSP-safe (no inline script or handler)`);
  }
  const privacy = await read('public/privacy.html');
  assert.equal(await read('public/privacy-policy.html'), privacy);
  assert.match(privacy, /Last Updated: October 28, 2026/);
  for (const required of ['device location', 'Emirates ID', 'Identity and Business Documents', 'Messages and Chat', 'Broker Data', 'sign in with Google', 'AI Feature Inputs and Outputs', 'href="/delete-account"', 'within 30 days', 'support@bin-groups.com']) {
    assert.ok(privacy.includes(required), `privacy.html mentions ${required}`);
  }
  assert.doesNotMatch(privacy, /exclusively to technicians/);
  assert.doesNotMatch(privacy, /ceo@bin-groups\.com/);
});

test('the internal /pilot launch page is not a public route', async () => {
  const app = await read('src/App.tsx');
  assert.doesNotMatch(app, /<Route path="\/pilot" element=\{[^}]*PilotLaunchPage/);
  assert.match(app, /<Route path="\/pilot" element=\{<Navigate to="\/" replace \/>\} \/>/);
});

test('public support copy uses the support mailbox and no legacy domains', async () => {
  const [support, ownerSupport] = await Promise.all([read('src/pages/public/SupportPage.tsx'), read('apps/owner-app/src/pages/public/SupportPage.tsx')]);
  assert.ok(support.includes("email: 'support@bin-groups.com'"));
  assert.ok(ownerSupport.includes('support@bin-groups.com'));
  for (const src of [support, ownerSupport]) assert.doesNotMatch(src, /bin-group\.ae|bingroup\.ae|owner@bin-group\.com/);
});

test('mobile-app copy no longer claims an Android app is "coming soon" and invents no store URL', async () => {
  const files = ['src/pages/public/SimpleStartPage.tsx', 'src/pages/public/SupportPage.tsx', 'src/pages/public/PublicMarketingPage.tsx', 'src/lib/companyProfile.ts'];
  for (const f of files) {
    const src = await read(f);
    assert.doesNotMatch(src, /android app (is )?coming soon|coming soon/i, `${f} has no stale coming-soon copy`);
    assert.doesNotMatch(src, /play\.google\.com\/store|apps\.apple\.com/, `${f} does not invent a store listing URL`);
  }
});

test('Android manifest: no unused boot permission; camera and location hardware are optional', async () => {
  const manifest = await read('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /RECEIVE_BOOT_COMPLETED/);
  for (const feature of ['android.hardware.camera', 'android.hardware.location']) {
    assert.match(manifest, new RegExp(`<uses-feature android:name="${feature.replace(/\./g, '\\.')}" android:required="false" />`), feature);
  }
  assert.doesNotMatch(manifest, /uses-feature[^>]*android:required="true"/);
  assert.match(manifest, /ACCESS_FINE_LOCATION/); // permissions the app really uses are untouched
});

test('unused test-data script with hard-coded credentials is gone', async () => {
  assert.equal(await exists('src/scripts/setup_test_data.js'), false);
});

test('tenant invite page: native app skips the Google popup, shows a plain notice and an email sign-in path; web is unchanged', async () => {
  const src = await read('src/pages/TenantInvitePage.tsx');
  assert.match(src, /import \{ isNativeApp, GOOGLE_SIGNIN_UNSUPPORTED_CODE \} from '\.\.\/lib\/nativePlatform'/);
  // native + signed out => Google accept button is not rendered; email/password login link is, and returns to the invite
  assert.match(src, /const nativeNeedsEmailSignIn = isNativeApp\(\) && !auth\.currentUser;/);
  assert.match(src, /\{!nativeNeedsEmailSignIn && \(\s*<Button[^>]*onClick=\{handleAccept\}/);
  assert.match(src, /data-testid="tenant-invite-email-signin"/);
  assert.match(src, /href=\{emailSignInHref\}/);
  assert.match(src, /\/login\?returnTo=\$\{encodeURIComponent\(`\/tenant-invite\?token=\$\{token \|\| ''\}`\)\}/);
  // the popup is only reached when not native; the guard sits before signInWithPopup
  const accept = src.slice(src.indexOf('const handleAccept'));
  assert.ok(accept.indexOf('if (isNativeApp())') > -1 && accept.indexOf('if (isNativeApp())') < accept.indexOf('signInWithPopup('));
  // unsupported-environment error is a plain notice, not a raw Firebase error
  assert.match(src, /err\?\.code === GOOGLE_SIGNIN_UNSUPPORTED_CODE/);
  assert.match(src, /severity=\{error === copy\.googleUnavailable \? 'info' : 'error'\}/);
  assert.match(src, /Google sign-in is not available in this app\./);
  // web path intact: Google popup + acceptTenantInvitation callable are still used
  assert.match(src, /new GoogleAuthProvider\(\)/);
  assert.match(src, /await signInWithPopup\(auth, provider\)/);
  assert.match(src, /httpsCallable\(functions, 'acceptTenantInvitation'\)/);
  assert.match(src, /httpsCallable\(functions, 'validateTenantInvitation'\)/);
});
