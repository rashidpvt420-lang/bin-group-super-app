import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner ROI uses shared financial truth and never presents collection rate as investment yield', () => {
  const source = read('src/owner/pages/OwnerRoiPage.tsx');
  assert.match(source, /useOwnerFinancialTruthData/);
  assert.match(source, /resolveOwnerFinancialTruth/);
  assert.match(source, /truth\.grossYield\.value/);
  assert.match(source, /truth\.netYield\.value/);
  assert.match(source, /Rent Collection Rate/);
  assert.match(source, /Operational collection performance, not investment yield/);
  assert.match(source, /summary\.managementFees/);
  assert.doesNotMatch(source, /0\.08/);
  assert.doesNotMatch(source, /MANAGEMENT FEES \(8%\)/);
  assert.doesNotMatch(source, /Management fees are fixed at 8%/);
});

test('Owner P&L uses canonical five-percent financial truth and canonical Owner ticket binding', () => {
  const source = read('src/owner/pages/OwnerPLReportPage.tsx');
  assert.match(source, /MANAGEMENT_FEE_RATE = 0\.05/);
  assert.match(source, /summarizeOwnerPassportFinancials/);
  assert.match(source, /where\('ownerId', '==', user\.uid\)/);
  assert.doesNotMatch(source, /where\('ownerEmail', '==', email\)/);
  assert.doesNotMatch(source, /0\.08/);
  assert.doesNotMatch(source, /Management Fee \(8%\)/);
  assert.match(source, /Management Fee \(5%\)/);
});

test('Owner payment proof reads all supported Owner bindings and stays read-only', () => {
  const source = read('src/owner/components/OwnerPaymentProofReviewPanel.tsx');
  assert.match(source, /where\('ownerId', '==', user\.uid\)/);
  assert.match(source, /where\('ownerUid', '==', user\.uid\)/);
  assert.match(source, /where\('ownerEmail', '==', email\)/);
  assert.match(source, /direction: isRTL \? 'rtl' : 'ltr'/);
  assert.match(source, /bgcolor: '#FFFFFF'/);
  assert.doesNotMatch(source, /\baddDoc\s*\(/);
  assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
  assert.doesNotMatch(source, /\bsetDoc\s*\(/);
});

test('Owner inspection mutations are callable-backed, RTL-aware and same-frame duplicate safe', () => {
  const source = read('src/owner/pages/OwnerInspectionsPage.tsx');
  assert.match(source, /updateOwnerHandoverInspection/);
  assert.match(source, /mutationInFlightRef\.current/);
  assert.match(source, /useRef\(false\)/);
  assert.match(source, /direction: isRTL \? 'rtl' : 'ltr'/);
  assert.match(source, /disabled=\{Boolean\(busyId\)\}/);
  assert.doesNotMatch(source, /\baddDoc\s*\(/);
  assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
});

test('Owner review queue uses the same callable and same-frame lock as Inspections', () => {
  const source = read('src/owner/pages/OwnerReviewQueuePage.tsx');
  assert.match(source, /updateOwnerHandoverInspection/);
  assert.match(source, /mutationInFlightRef\.current/);
  assert.match(source, /useRef\(false\)/);
  assert.match(source, /direction: isRTL \? 'rtl' : 'ltr'/);
  assert.match(source, /disabled=\{Boolean\(busy\)\}/);
  assert.doesNotMatch(source, /\baddDoc\s*\(/);
  assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
});
