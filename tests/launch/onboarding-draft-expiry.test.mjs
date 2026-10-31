import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

let dir; let m; const mem = new Map();
test.before(async () => {
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  dir = mkdtempSync(join(tmpdir(), 'bin-draft-'));
  const outfile = join(dir, 's.mjs');
  await build({ entryPoints: ['src/store/onboardingStore.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  m = await import(pathToFileURL(outfile).href);
});
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('draft storage expires after TTL and removes the stale entry', () => {
  let t = 1_000_000;
  const s = m.expiringDraftStorage(() => t);
  s.setItem('k', '{"a":1}');
  assert.equal(s.getItem('k'), '{"a":1}');
  t += m.ONBOARDING_DRAFT_TTL_MS + 1;
  assert.equal(s.getItem('k'), null);
  assert.equal(mem.has('k'), false);
});

test('legacy unstamped drafts are discarded', () => {
  mem.set('legacy', '{"state":{"ownerAccount":{"email":"x"}},"version":5}');
  assert.equal(m.expiringDraftStorage().getItem('legacy'), null);
  assert.equal(mem.has('legacy'), false);
});

test('OTP verification id is not persisted; completion and sign-out clear the draft', () => {
  const store = readFileSync('src/store/onboardingStore.ts', 'utf8');
  assert.doesNotMatch(store, /contractOtpVerificationId: state\.contractOtpVerificationId/);
  assert.match(store, /storage: createJSONStorage\(\(\) => expiringDraftStorage\(\)\)/);
  assert.match(readFileSync('src/components/onboarding/InspectionSubmissionStep.tsx', 'utf8'), /persist\.clearStorage\(\)/);
  assert.match(readFileSync('src/components/PortalSessionControls.tsx', 'utf8'), /clearOnboardingSessionArtifacts\(\)/);
});
