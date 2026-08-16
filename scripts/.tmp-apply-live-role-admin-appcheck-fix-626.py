from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker count: {count}")
    return source.replace(old, new, 1)


resolver = Path("scripts/resolve-admin-app-check-site-key.mjs")
source = resolver.read_text(encoding="utf-8")
source = replace_once(
    source,
    "const PLACEHOLDER_RE = /(?:REPLACE|undefined|null|VALIDATION_ONLY)/i;\n",
    """const PLACEHOLDER_RE = /(?:REPLACE|undefined|null|VALIDATION_ONLY)/i;
const PROTECTED_WORKFLOW_JOBS = Object.freeze([
  Object.freeze({ workflow: 'Firebase Production Deploy', job: 'deploy-firebase-production-stack' }),
  Object.freeze({ workflow: 'Live Role Smoke Tests', job: 'live-evidence' }),
  Object.freeze({ workflow: 'Admin Production Evidence', job: 'admin-operational-evidence' }),
]);
""",
    "protected workflow whitelist",
)
source = replace_once(
    source,
    """  if (clean(env.GITHUB_WORKFLOW) !== 'Firebase Production Deploy') {
    failures.push('the exact Firebase Production Deploy workflow');
  }
  if (clean(env.GITHUB_JOB) !== 'deploy-firebase-production-stack') {
    failures.push('the deploy-firebase-production-stack job');
  }
""",
    """  const workflow = clean(env.GITHUB_WORKFLOW);
  const job = clean(env.GITHUB_JOB);
  if (!PROTECTED_WORKFLOW_JOBS.some((entry) => entry.workflow === workflow && entry.job === job)) {
    failures.push('an explicitly authorized protected production workflow/job');
  }
""",
    "protected context guard",
)
resolver.write_text(source, encoding="utf-8")

live = Path(".github/workflows/live-role-smoke.yml")
source = live.read_text(encoding="utf-8")
source = replace_once(
    source,
    """      - name: Install dependencies
        run: bash scripts/npm-install-retry.sh

      - name: Download exact production deployment artifact
""",
    """      - name: Install dependencies
        run: bash scripts/npm-install-retry.sh

      - name: Resolve Admin App Check Enterprise site key for hosted verification
        run: node scripts/resolve-admin-app-check-site-key.mjs

      - name: Download exact production deployment artifact
""",
    "live evidence resolver step",
)
live.write_text(source, encoding="utf-8")

admin = Path(".github/workflows/admin-production-evidence.yml")
source = admin.read_text(encoding="utf-8")
source = replace_once(
    source,
    """  VITE_APP_CHECK_SITE_KEY: ${{ secrets.VITE_APP_CHECK_SITE_KEY }}
  FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
  GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID || 'bin-group-57c60' }}
""",
    """  VITE_APP_CHECK_SITE_KEY: ${{ secrets.VITE_APP_CHECK_SITE_KEY }}
  VITE_GOOGLE_MAPS_API_KEY: ${{ secrets.VITE_GOOGLE_MAPS_API_KEY }}
  VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
  VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
  VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
  VITE_FIREBASE_VAPID_KEY: ${{ secrets.VITE_FIREBASE_VAPID_KEY }}
  REACT_APP_ENABLE_FIREBASE_APPCHECK: 'true'
  REACT_APP_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
  REACT_APP_ADMIN_FIREBASE_APP_ID: 1:123413252227:web:285cb53bc26626d699f3b6
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
  REACT_APP_FIREBASE_AUTH_DOMAIN: bin-group-57c60.firebaseapp.com
  REACT_APP_FIREBASE_PROJECT_ID: bin-group-57c60
  REACT_APP_FIREBASE_STORAGE_BUCKET: bin-group-57c60.firebasestorage.app
  FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
  GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID || 'bin-group-57c60' }}
  DEPLOYMENT_ENVIRONMENT: production
""",
    "admin verifier expected client env",
)
source = replace_once(
    source,
    """      - name: Install dependencies
        run: bash scripts/npm-install-retry.sh

      - name: Download exact deployment evidence
""",
    """      - name: Install dependencies
        run: bash scripts/npm-install-retry.sh

      - name: Resolve Admin App Check Enterprise site key for hosted verification
        run: node scripts/resolve-admin-app-check-site-key.mjs

      - name: Download exact deployment evidence
""",
    "admin evidence resolver step",
)
admin.write_text(source, encoding="utf-8")

test_file = Path("tests/launch/admin-app-check-evidence-resolution.test.mjs")
test_file.write_text(
    r"""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const resolver = read('scripts/resolve-admin-app-check-site-key.mjs');
const live = read('.github/workflows/live-role-smoke.yml');
const admin = read('.github/workflows/admin-production-evidence.yml');

function section(source, startMarker, endMarker = '') {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing section start: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert.ok(end > start, `missing section end: ${endMarker}`);
  return source.slice(start, end);
}

function assertOrdered(source, labels) {
  let previous = -1;
  for (const label of labels) {
    const current = source.indexOf(label, previous + 1);
    assert.ok(current >= 0, `missing required marker: ${label}`);
    assert.ok(current > previous, `marker out of order: ${label}`);
    previous = current;
  }
}

test('Admin Enterprise site-key resolver is restricted to explicit protected workflow/job pairs', () => {
  assert.match(resolver, /Firebase Production Deploy', job: 'deploy-firebase-production-stack/);
  assert.match(resolver, /Live Role Smoke Tests', job: 'live-evidence/);
  assert.match(resolver, /Admin Production Evidence', job: 'admin-operational-evidence/);
  assert.match(resolver, /PROTECTED_WORKFLOW_JOBS\.some/);
  assert.match(resolver, /DEPLOYMENT_ENVIRONMENT=production/);
  assert.match(resolver, /refs\/heads\/main/);
  assert.match(resolver, /GITHUB_ENV/);
});

test('Live Role resolves the Admin Enterprise key inside live-evidence before reconciliation', () => {
  const liveEvidence = section(live, '\n  live-evidence:\n', '\n  hard-public-launch-clearance:\n');
  assertOrdered(liveEvidence, [
    '- name: Authenticate Google Cloud',
    '- name: Install dependencies',
    '- name: Resolve Admin App Check Enterprise site key for hosted verification',
    '- name: Run every required live evidence suite',
  ]);
  assert.ok(
    liveEvidence.includes('run: node scripts/resolve-admin-app-check-site-key.mjs'),
    'live-evidence must invoke the protected Admin App Check resolver',
  );
  assert.ok(live.includes('DEPLOYMENT_ENVIRONMENT: production'));
});

test('Admin Production Evidence resolves the same key and supplies hosted verifier expectations', () => {
  const adminEvidence = section(admin, '\n  admin-operational-evidence:\n');
  assertOrdered(adminEvidence, [
    '- name: Authenticate Google Cloud',
    '- name: Install dependencies',
    '- name: Resolve Admin App Check Enterprise site key for hosted verification',
    '- name: Restore and verify deployment evidence',
  ]);
  assert.ok(
    adminEvidence.includes('run: node scripts/resolve-admin-app-check-site-key.mjs'),
    'Admin Production Evidence must invoke the protected Admin App Check resolver',
  );
  for (const required of [
    'VITE_GOOGLE_MAPS_API_KEY:',
    'VITE_FIREBASE_API_KEY:',
    'VITE_FIREBASE_APP_ID:',
    'VITE_FIREBASE_MESSAGING_SENDER_ID:',
    'VITE_FIREBASE_VAPID_KEY:',
    'REACT_APP_FIREBASE_API_KEY:',
    'REACT_APP_ADMIN_FIREBASE_APP_ID:',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID:',
    'DEPLOYMENT_ENVIRONMENT: production',
  ]) assert.ok(admin.includes(required), `missing Admin verifier environment: ${required}`);
});
""",
    encoding="utf-8",
)
