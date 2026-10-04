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
