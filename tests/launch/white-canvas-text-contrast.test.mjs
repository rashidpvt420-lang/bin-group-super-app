import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(p, 'utf8');
const slice = (s, from, len = 900) => { const i = s.indexOf(from); assert.ok(i >= 0, from); return s.slice(i, i + len); };
const WHITE = /color[=:]\s*["'{]?\s*['"]?(#FFF\b|#fff\b|#FFFFFF|rgba\(255,\s*255,\s*255)/;

test('owner ticket unauthorized/not-found states are readable on the white canvas', async () => {
  const s = await read('src/owner/pages/OwnerTicketDetailPage.tsx');
  assert.doesNotMatch(slice(s, 'if (unauthorized) return', 700), WHITE);
  assert.doesNotMatch(slice(s, 'if (!ticket) return', 800), WHITE);
});

test('owner complaint header is readable', async () => {
  const s = await read('src/owner/pages/OwnerComplaintPage.tsx');
  assert.doesNotMatch(slice(s, 'aria-label="Back" onClick={() => navigate(-1)}', 600), WHITE);
});

test('onboarding review title, subtitle and Back are readable on cream', async () => {
  const s = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.doesNotMatch(slice(s, "textAlign: 'center', mb: 5", 400), WHITE);
  assert.doesNotMatch(slice(s, "onClick={onBack}", 400), WHITE);
});

test('tenant inspection success screen is readable', async () => {
  const s = await read('src/tenant/pages/TenantMoveInspectionPage.tsx');
  assert.doesNotMatch(slice(s, "if (state.step === 'done')", 700), WHITE);
});
