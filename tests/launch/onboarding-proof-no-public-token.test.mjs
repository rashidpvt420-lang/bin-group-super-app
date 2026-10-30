import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('onboarding proof fallback never mints a permanent tokenised download URL', () => {
  const s = readFileSync('functions/onboardingProofUpload.ts', 'utf8');
  assert.doesNotMatch(s, /firebaseStorageDownloadTokens|alt=media&token=|_download_tokens|downloadUrl/);
  assert.match(s, /enforceAppCheck: true/);
  assert.match(s, /return \{ success: true, storagePath,/);
  const c = readFileSync('src/components/onboarding/PaymentSubmissionStep.tsx', 'utf8');
  assert.doesNotMatch(c, /data\.downloadUrl/);
});
