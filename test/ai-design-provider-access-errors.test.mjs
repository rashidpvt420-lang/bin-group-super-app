// AI Design shows a clear message when the image model rejects access or needs
// provider verification, instead of a generic stall (audit 2026-11-04, fix 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyImageProviderError, IMAGE_PROVIDER_FAILURE_MESSAGES } from '../functions/openaiImageModels.ts';
import { designErrorMessage } from '../src/lib/designStudioErrors.ts';

test('provider access / verification errors are classified as provider_access', () => {
  assert.equal(classifyImageProviderError({ status: 403, message: 'Your organization must be verified to use the model `gpt-image-2.5-sunburst`.' }), 'provider_access');
  assert.equal(classifyImageProviderError({ status: 400, error: { code: 'organization_verification_required' } }), 'provider_access');
  assert.equal(classifyImageProviderError({ status: 404, message: 'The model `x` does not exist or you do not have access to it.' }), 'provider_access');
  assert.equal(classifyImageProviderError({ status: 403, message: 'Forbidden' }), 'provider_access');
});

test('other provider failures get their own reasons', () => {
  assert.equal(classifyImageProviderError({ status: 401, message: 'Incorrect API key provided' }), 'provider_auth');
  assert.equal(classifyImageProviderError({ status: 429, code: 'insufficient_quota' }), 'provider_quota');
  assert.equal(classifyImageProviderError({ status: 404, message: 'The model `gpt-image-1` has been deprecated' }), 'provider_model_unavailable');
  assert.equal(classifyImageProviderError({ name: 'APIConnectionTimeoutError', message: 'Request timed out.' }), 'provider_timeout');
  assert.equal(classifyImageProviderError(new Error('socket hang up')), 'provider_other');
  for (const msg of Object.values(IMAGE_PROVIDER_FAILURE_MESSAGES)) assert.ok(msg.length <= 220);
});

test('client shows a clear user-facing message for a provider access error', () => {
  const msg = designErrorMessage({ code: 'functions/failed-precondition', message: IMAGE_PROVIDER_FAILURE_MESSAGES.provider_access, details: { reason: 'provider_access' } });
  assert.match(msg, /AI Design is paused/);
  assert.match(msg, /verification required/);
  assert.match(msg, /Nothing was charged/);
  assert.match(designErrorMessage({ code: 'functions/deadline-exceeded', details: { reason: 'provider_timeout' } }), /took too long/);
  // Unrelated failures keep their existing messages.
  assert.match(designErrorMessage({ code: 'functions/unauthenticated' }), /sign in/i);
  assert.match(designErrorMessage({ code: 'functions/failed-precondition', message: 'AI image generation is not configured in Firebase Functions secrets.' }), /not configured/);
});

test('server maps classified provider failures to specific callable errors with a logged reason', async () => {
  const src = await readFile(new URL('../functions/aiDesignStudio.ts', import.meta.url), 'utf8');
  assert.match(src, /const reason = classifyImageProviderError\(error\);/);
  assert.match(src, /console\.warn\("submitAIDesignRequest provider failure", \{ requestId, reason/);
  assert.match(src, /throw new HttpsError\(code, IMAGE_PROVIDER_FAILURE_MESSAGES\[reason\], \{ reason \}\);/);
  assert.match(src, /settleAiUsageQuota\(quota, false\)/);
});
