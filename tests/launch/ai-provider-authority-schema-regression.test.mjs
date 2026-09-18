import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  transformReviewedAiVerifierQuotaBoundary,
} from '../../scripts/run-frozen-release-evidence.mjs';

const verifier = readFileSync('scripts/verify-ai-live-evidence.mjs', 'utf8');
const publisher = readFileSync('scripts/publish-operational-provider-evidence.mjs', 'utf8');

test('reviewed AI adapter preserves the runtime non-authoritative boundary in provider samples', () => {
  const adapted = transformReviewedAiVerifierQuotaBoundary(verifier);

  assert.match(adapted, /clientContextAuthoritative: false,/);
  assert.doesNotMatch(adapted, /clientContextAuthoritative: data\.clientContextAuthoritative === false,/);
  assert.match(adapted, /data\.clientContextAuthoritative !== false/);
  assert.match(adapted, /data: \{ \.\.\.sensitiveProbe, provider: 'gemini' \}/);
  assert.match(publisher, /sample\.clientContextAuthoritative !== false/);
});

test('reviewed AI adapter rejects provider-authority source drift before adapting', () => {
  assert.throws(
    () => transformReviewedAiVerifierQuotaBoundary(
      verifier.replace(
        'clientContextAuthoritative: data.clientContextAuthoritative === false,',
        'clientContextAuthoritative: true,',
      ),
    ),
    /unreviewed isolated AI verifier/,
  );
});
