import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const runtime = read('functions/runtime.ts');
const ocr = read('functions/titleDeedOcrV2.ts');
const mission = read('functions/missionGuidanceV2.ts');
const ownerProof = read('apps/owner-app/src/components/onboarding/ProofUploadStep.tsx');

test('runtime replaces legacy hard-failing AI provider callables with reviewed aliases', () => {
  assert.match(runtime, /processTitleDeedOCRV2 as processTitleDeedOCR/);
  assert.match(runtime, /getMissionGuidanceV2 as getMissionGuidance/);
  assert.match(runtime, /from "\.\/titleDeedOcrV2"/);
  assert.match(runtime, /from "\.\/missionGuidanceV2"/);
  assert.match(runtime, /export \* from "\.\/aiDesignStudio"/);
});

test('title deed OCR is App Check protected, user-scoped and never auto-verifies ownership', () => {
  assert.match(ocr, /defineSecret\("GEMINI_API_KEY"\)/);
  assert.match(ocr, /enforceAppCheck:\s*true/);
  assert.match(ocr, /temp_kyc\/\$\{uid\}\//);
  assert.match(ocr, /firebasestorage\.googleapis\.com/);
  assert.match(ocr, /storage\.googleapis\.com/);
  assert.match(ocr, /file\.download\(\)/);
  assert.match(ocr, /inlineData:/);
  assert.match(ocr, /responseMimeType: "application\/json"/);
  assert.match(ocr, /MANUAL_REVIEW_REQUIRED/);
  assert.match(ocr, /verificationState: "ADMIN_REVIEW_REQUIRED"/);
  assert.match(ocr, /autoVerified: false/);
  assert.match(ocr, /finally \{/);
  assert.match(ocr, /file\.delete\(\{ ignoreNotFound: true \}\)/);
  const protectedBodyStart = ocr.indexOf('const file = bucket.file(storagePath);');
  const outerTry = ocr.indexOf('try {', protectedBodyStart);
  const unconfiguredBranch = ocr.indexOf('if (!key)', outerTry);
  const cleanupFinally = ocr.lastIndexOf('} finally {');
  assert.ok(protectedBodyStart >= 0 && outerTry > protectedBodyStart, 'OCR temp-file lifecycle must start before provider selection');
  assert.ok(unconfiguredBranch > outerTry && cleanupFinally > unconfiguredBranch, 'missing-key return must remain inside the cleanup try/finally');
  assert.doesNotMatch(ocr, /fetch\(request\.data|fetch\(fileUrl|autoVerified: true/);
  assert.doesNotMatch(ocr, /legal validity.*verified/i);
});

test('Owner proof step uploads the real selected deed and contains no public sample bypass', () => {
  assert.match(ownerProof, /auth\.currentUser\?\.uid/);
  assert.match(ownerProof, /temp_kyc\/\$\{uid\}\//);
  assert.match(ownerProof, /uploadBytes\(fileReference, file/);
  assert.match(ownerProof, /storagePath: fileReference\.fullPath/);
  assert.match(ownerProof, /processTitleDeedOCR/);
  assert.match(ownerProof, /MANUAL_REVIEW_REQUIRED|response\.status === 'SUCCESS'/);
  assert.doesNotMatch(ownerProof, /bin-group-public\/sample-title-deed/);
  assert.doesNotMatch(ownerProof, /alert\(/);
});

test('mission guidance uses Gemini, OpenAI and a visible deterministic degraded mode', () => {
  assert.match(mission, /defineSecret\("GEMINI_API_KEY"\)/);
  assert.match(mission, /defineSecret\("OPENAI_API_KEY"\)/);
  assert.match(mission, /enforceAppCheck:\s*true/);
  assert.match(mission, /enforceAiUsageQuota/);
  assert.match(mission, /callGemini/);
  assert.match(mission, /callOpenAI/);
  assert.ok(mission.indexOf('callGemini') < mission.lastIndexOf('callOpenAI'), 'Gemini must be attempted before the OpenAI fallback');
  assert.match(mission, /fallbackGuidance/);
  assert.match(mission, /provider = "rule-based-fallback"/);
  assert.match(mission, /operationalStatus: degraded \? "degraded" : "live"/);
  assert.match(mission, /advisoryOnly: true/);
  assert.match(mission, /clientContextAuthoritative: false/);
  assert.match(mission, /Never approve payments, contracts, KYC, dispatch, staffing/);
  assert.doesNotMatch(mission, /Vertex/);
  assert.doesNotMatch(mission, /throw new HttpsError\("internal"/);
});
