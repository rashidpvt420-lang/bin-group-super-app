// Google Play compliance: public no-login account-deletion page, in-app deletion request, privacy
// cross-link, and a minimal Android permission set (no broad storage/media permissions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('public /delete-account page covers every Play account-deletion requirement', () => {
  const html = read('public/delete-account.html');
  for (const required of [
    'BIN GROUP',
    'All Kind Building Projects Contracting L.L.C S.P.C',
    'Al Ain',
    'ceo@bin-groups.com',
    'Request account deletion',
    'Identity verification',
    '30 days',
    'What is deleted',
    'What may be retained',
  ]) assert.ok(html.includes(required), `delete-account.html must mention: ${required}`);
  assert.doesNotMatch(html, /<form|type="password"|firebase|__BIN_GROUPS_AUTH/i, 'the page must be static and need no login');
});

test('/delete-account is routed publicly, outside auth, and has a sitemap entry', () => {
  const app = read('src/App.tsx');
  assert.match(app, /<Route path="\/delete-account" element=\{<LegalRedirect to="\/delete-account\.html" \/>\} \/>/);
  const legal = read('src/pages/public/LegalRedirect.tsx');
  assert.match(legal, /window\.location\.replace\('\/delete-account\.html'\)/);
  assert.match(read('public/sitemap.xml'), /https:\/\/bin-groups\.com\/delete-account\.html/);
  assert.doesNotMatch(read('public/robots.txt'), /Disallow: \/delete-account/);
});

test('both privacy pages link to the deletion page and stay identical', () => {
  const privacy = read('public/privacy.html');
  assert.match(privacy, /href="\/delete-account"/);
  assert.equal(read('public/privacy-policy.html'), privacy);
});

test('in-app deletion request records a per-user request and never deletes data', () => {
  const page = read('src/pages/AccountPrivacyRequestPage.tsx');
  assert.match(page, /doc\(db, 'accountDeletionRequests', user\.uid\)/);
  assert.match(page, /status: 'pending_review'/);
  assert.match(page, /serverTimestamp\(\)/);
  assert.doesNotMatch(page, /deleteDoc|deleteUser|httpsCallable|\bupdateDoc\b/);
  const rules = read('firestore.rules');
  const block = rules.slice(rules.indexOf('match /accountDeletionRequests/{requestId}'));
  const body = block.slice(0, block.indexOf('\n    }\n'));
  assert.match(body, /requestId == request\.auth\.uid/);
  assert.match(body, /request\.resource\.data\.userId == request\.auth\.uid/);
  assert.match(body, /allow update: if isAdmin\(\)/);
  assert.match(body, /allow delete: if isAdmin\(\)/);
});

test('every signed-in role can reach the deletion request from the header', () => {
  assert.match(read('src/components/PortalHeaderMenu.tsx'), /navigate\('\/account-privacy'\)/);
  const controls = read('src/components/PortalSessionControls.tsx');
  assert.match(controls, /navigate\('\/account-privacy'\)/);
  assert.match(read('src/App.tsx'), /path="\/account-privacy"/);
});

test('Android manifest declares no broad storage/media permissions but keeps camera and location', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');
  for (const removed of ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_VISUAL_USER_SELECTED', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE']) {
    assert.ok(!manifest.includes(`android.permission.${removed}`), `${removed} must not be declared`);
  }
  for (const kept of ['CAMERA', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS', 'INTERNET']) {
    assert.ok(manifest.includes(`android.permission.${kept}`), `${kept} must remain declared`);
  }
});

test('the app picks files with the system picker, so storage permissions stay unnecessary', () => {
  const pkg = JSON.parse(read('package.json'));
  const walk = (dir) => readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(tsx?|jsx?)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const offenders = walk('src').filter((f) => /from ['"]@capacitor\/(camera|filesystem)['"]|import\(['"]@capacitor\/(camera|filesystem)['"]\)/.test(read(f)));
  assert.deepEqual(offenders, [], 'source must not use plugins that need storage/media permissions');
  // Direct dependency on a plugin that needs storage access would invalidate this reasoning.
  assert.ok(!('@capacitor-community/media' in { ...pkg.dependencies, ...pkg.devDependencies }));
});
