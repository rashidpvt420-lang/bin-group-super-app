import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner renewals render real canonical renewal-watch data instead of a placeholder', () => {
  const source = read('src/owner/pages/PortfolioRenewalsPage.tsx');
  assert.match(source, /collection\(db, 'contract_renewal_watch'\)/);
  assert.match(source, /where\('ownerId', '==', user\.uid\)/);
  assert.match(source, /Open Contract/);
  assert.match(source, /Open Documents/);
  assert.match(source, /Open Renewal PDF/);
  assert.doesNotMatch(source, /No active renewal record is linked yet\.\s*<\/Typography>\s*<\/CardContent>/);
});

test('Owner approval mutations are server-authoritative and same-tick duplicate safe', () => {
  const source = read('src/owner/pages/OwnerApprovalCenterPage.tsx');
  assert.match(source, /submitOwnerApprovalDecision/);
  assert.match(source, /ownerReviewTicketCompletion/);
  assert.match(source, /mutationInFlightRef\.current/);
  assert.doesNotMatch(source, /\baddDoc\s*\(/);
  assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
  assert.match(source, /disabled=\{Boolean\(submittingId\)\}/);
});

test('Owner financials use the light RTL-aware shell and remain read-only client-side', () => {
  const source = read('src/owner/pages/OwnerFinancialsPage.tsx');
  assert.match(source, /direction: isRTL \? 'rtl' : 'ltr'/);
  assert.match(source, /bgcolor: '#FFFFFF'/);
  assert.match(source, /binThemeTokens\.textPrimary/);
  assert.match(source, /binThemeTokens\.textSecondary/);
  assert.doesNotMatch(source, /rgba\(255,255,255/);
  assert.doesNotMatch(source, /bgcolor: '#0f172a'/);
  assert.doesNotMatch(source, /\baddDoc\s*\(/);
  assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
  assert.match(source, /useOwnerFinancialTruthData/);
  assert.match(source, /where\('ownerUid', '==', user\.uid\)/);
});
