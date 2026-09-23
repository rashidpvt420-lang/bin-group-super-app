import test from 'node:test';
import assert from 'node:assert/strict';
import { canContinueOwnerReview } from '../../src/components/onboarding/reviewQuoteGate.ts';

const valid = () => ({
  authReady: true,
  quoteLoading: false,
  quoteError: '',
  signedInUid: 'owner-a',
  ownerUid: 'owner-a',
  quote: { quoteHash: 'hash-a', expiresAtMs: 2000 },
  quoteRequestKey: 'portfolio-a',
  persistedQuoteRequestKey: 'portfolio-a',
  verifiedQuoteKey: 'portfolio-a:hash-a',
  allPropertyPinsSaved: true,
  nowMs: 1000,
});

test('authenticated fresh server quote and complete property pins permit Review', () => {
  assert.equal(canContinueOwnerReview(valid()), true);
});

test('Review closes for stale, restored, cross-owner, loading, failed or incomplete quotes', () => {
  for (const change of [
    { authReady: false }, { quoteLoading: true }, { quoteError: 'network error' },
    { signedInUid: null }, { signedInUid: 'other-owner' },
    { quote: null }, { quote: { quoteHash: 'hash-a', expiresAtMs: 1000 } },
    { persistedQuoteRequestKey: 'older-portfolio' },
    { verifiedQuoteKey: null }, { verifiedQuoteKey: 'portfolio-a:older-hash' },
    { allPropertyPinsSaved: false },
  ]) {
    assert.equal(canContinueOwnerReview({ ...valid(), ...change }), false, JSON.stringify(change));
  }
});
