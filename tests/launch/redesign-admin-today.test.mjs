// R6 of the 2026-10-21 redesign: admin opens on "Today" (alerts, numbers, queues); internals are collapsed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile('src/admin/AdminTerminal.tsx', 'utf8');

test('Today block comes before the collapsed system details', () => {
  const today = src.indexOf('data-testid="admin-today"');
  const system = src.indexOf('data-testid="admin-system-details"');
  assert.ok(today > 0 && system > today);
});

test('internal coverage, launch authority and runbook live inside the accordion', () => {
  const system = src.indexOf('data-testid="admin-system-details"');
  const close = src.indexOf('</Accordion>', system);
  for (const s of ['Canonical Admin Coverage', 'Public Launch Authority', 'Verification Runbook']) {
    const i = src.indexOf(s);
    assert.ok(i > system && i < close, s);
  }
});

test('queues reuse the existing operations tools (no new authority)', () => {
  assert.match(src, /<ListRow key=\{action\.label\}[^>]*onClick=\{\(\) => openOperationsTool\(action\.path\)\}/);
  assert.match(src, /value=\{loading \? null : metricValue\('openTickets'\)\}/);
});
