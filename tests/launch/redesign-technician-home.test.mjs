// R3 of the 2026-10-21 redesign: technician home shows the real next job first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('src/technician/pages/TechnicianSimpleDashboardPage.tsx', 'utf8');
const hook = await readFile('src/technician/hooks/useTechnicianHomeJobs.ts', 'utf8');
const util = await readFile('src/technician/utils/technicianHomeJobs.ts', 'utf8');
const app = await readFile('src/technician/TechnicianApp.tsx', 'utf8');
const strip = await readFile('src/technician/components/TechnicianSyncStatusStrip.tsx', 'utf8');
const detail = await readFile('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');

test('home order: next job card, then duty toggle, then job list', () => {
  const a = home.indexOf('data-testid="technician-next-job-navigate"');
  const b = home.indexOf('<TechnicianDutyAvailabilityCard isRTL={isRTL} />');
  const c = home.indexOf('<ListRow key={job.id}');
  assert.ok(a > 0 && b > a && c > b, `order ${a} ${b} ${c}`);
  assert.match(home, /jobAddress\(next\)/);
  assert.match(home, /navigateUrl\(next, getTicketJobLocation\(next\)\)/);
});

test('old explainer and jargon copy is gone from the home and shell', () => {
  for (const s of ['TECHNICIAN SIMPLE MODE', 'Start with jobs, map, and proof', 'Main field actions', 'Completion rule', 'server-assigned', 'CanonicalNextActions', 'RoleQuickActionsPanel']) assert.ok(!home.includes(s), s);
  assert.ok(!app.includes('FIELD NODE'), 'FIELD NODE header');
  assert.ok(!strip.includes('server-backed'), 'sync jargon');
  assert.ok(!strip.includes('Mission'), 'sync jargon');
});

test('home reads only the identity-bound assignment query and never writes', () => {
  assert.match(hook, /where\('assignedTechnicianId', '==', user\.uid\)/);
  assert.doesNotMatch(hook + home, /updateDoc|setDoc|addDoc|httpsCallable/);
  assert.match(home, /ErrorState/);
  assert.match(home, /value=\{loading \|\| error \? null : doneToday\}/);
});

test('accept/start only opens the job, where the existing gates run', () => {
  assert.match(home, /navigate\(`\/technician\/job\/\$\{job\.id\}`\)/);
  assert.match(util, /destination=\$\{encodeURIComponent\(address\)\}/);
});

test('evidence rules live inside the job as steps; close gate unchanged', () => {
  assert.match(detail, /<JobEvidenceSteps /);
  assert.match(detail, /const canComplete = closeBlockers\.length === 0;/);
  assert.match(detail, /nextStatus === 'COMPLETED' && closeBlockers\.length > 0/);
});

test('sync banner hides when everything is sent', () => {
  assert.match(strip, /if \(online && total === 0\) return null;/);
});
