// Technician white shell: the default home's "Required job evidence" card rendered dark navy rows
// that looked like disabled buttons and gave no way into the jobs where evidence is captured, and
// the job page's PPE/safety confirmation labels were white text on a white Paper (invisible),
// as were the resolution-notes/materials field labels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const checklist = readFileSync(new URL('../../src/components/TechnicianProofChecklist.tsx', import.meta.url), 'utf8');
const jobDetail = readFileSync(new URL('../../src/technician/pages/TechnicianJobDetailPage.tsx', import.meta.url), 'utf8');

test('evidence checklist uses light informational rows readable on the white shell', () => {
  assert.doesNotMatch(checklist, /rgba\(15,\s*23,\s*42/, 'no dark navy rows');
  assert.doesNotMatch(checklist, /rgba\(255,\s*255,\s*255/, 'no white-alpha text or borders');
  assert.doesNotMatch(checklist, /color: '#fff'/i);
  assert.match(checklist, /bgcolor: item\.complete \? alpha\('#10b981', 0\.08\) : '#F8FAFC'/);
  assert.match(checklist, /color: item\.complete \? '#065F46' : '#1F2937'/);
});

test('static evidence card links to the assigned jobs where evidence is captured', () => {
  assert.match(checklist, /data-testid="proof-checklist-open-jobs"/);
  assert.match(checklist, /navigate\('\/technician\/jobs'\)/);
  assert.match(checklist, /\{!hasLiveProofData && \(/);
});

test('job page safety confirmations and field labels are visible', () => {
  assert.doesNotMatch(jobDetail, /<label htmlFor="(ppe|safety)" style=\{\{ color: '#FFF'/);
  assert.match(jobDetail, /<label htmlFor="ppe" style=\{\{ color: '#111827'/);
  assert.match(jobDetail, /<label htmlFor="safety" style=\{\{ color: '#111827'/);
  assert.doesNotMatch(jobDetail, /'& label': \{ color: 'rgba\(255,255,255,0\.5\)' \}/);
  assert.doesNotMatch(jobDetail, /'& \.MuiOutlinedInput-root': \{ color: '#FFF' \}/);
});

function contrastOnWhite(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05);
}

test('job page text palette is >= 4.5:1 on the white shell', () => {
  const block = jobDetail.slice(jobDetail.indexOf('const JOB_READABLE = {'), jobDetail.indexOf('} as const;', jobDetail.indexOf('const JOB_READABLE = {')));
  for (const key of ['ink', 'muted', 'gold', 'amber', 'green', 'violet']) {
    const m = block.match(new RegExp(`${key}: '(#[0-9A-Fa-f]{6})'`)); // eslint-disable-line security/detect-non-literal-regexp
    assert.ok(m, `${key} defined`);
    assert.ok(contrastOnWhite(m[1]) >= 4.5, `${key} ${m[1]} contrast ${contrastOnWhite(m[1]).toFixed(2)}`);
  }
});

test('job page render has no white or low-contrast text on the white shell', () => {
  const render = jobDetail.slice(jobDetail.lastIndexOf("    return (\n        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>"));
  assert.ok(render.length > 1000);
  assert.ok(!render.includes('color="#FFF"'), 'no white Typography');
  assert.ok(!render.includes("color: '#FFF', borderColor"), 'Call Tenant not white on white');
  assert.ok(!render.includes("color: 'rgba(255,255,255"), 'Contact Operations Base not white-alpha');
  assert.ok(!render.includes("bgcolor: 'rgba(15,23,42"), 'no dark navy panels in the white shell');
  assert.ok(!render.includes("color: '#10b981'"), 'no 2.5:1 green text');
  assert.ok(!render.includes("color: '#f59e0b'"), 'no 2.1:1 amber text');
  assert.doesNotMatch(render, /[^a-zA-Z]color: binThemeTokens\.gold,/, 'no 2.3:1 gold text (gold backgrounds with dark text are fine)');
  assert.ok(!render.includes("color: '#8b5cf6'"), 'no low-contrast violet');
  // Global chip CSS forces chip backgrounds to white, so the proof count must not be white text.
  assert.ok(render.includes('data-testid="technician-proof-count-chip"'));
  assert.ok(!/technician-proof-count-chip"[^\n]*[^a-zA-Z]color: '#FFFFFF'/.test(render), 'proof count is not white-on-white');
  assert.ok(render.includes("sx={{ color: JOB_READABLE.ink, borderColor: JOB_READABLE.control, fontWeight: 950 }}>{tx('tech.job.call_tenant'"));
  assert.ok(render.includes("sx={{ color: JOB_READABLE.ink, borderColor: JOB_READABLE.control, fontWeight: 950 }}>{tx('tech.job.contact_admin'"));
  assert.ok(render.includes("bgcolor: JOB_READABLE.green, color: '#FFFFFF'"), 'Complete button is white on #047857 (5.5:1)');
});
