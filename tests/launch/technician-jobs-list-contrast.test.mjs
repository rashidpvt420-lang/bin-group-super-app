// Technician white shell: the assigned-jobs list was written for the old dark theme. Category and
// requester text were color="#FFF" (invisible on the white Paper) and status/ETA/delivery chips used
// #3b82f6 / gold #C9A646 / #10b981 / #f59e0b text (2.1-3.7:1 on white).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../src/technician/pages/TechnicianJobsPage.tsx', import.meta.url), 'utf8');

function contrast(fgHex, bgHex = '#FFFFFF') {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fgHex), lum(bgHex)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

function paletteOf(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  assert.ok(start >= 0, `${name} palette defined`);
  const body = source.slice(start, source.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
}

test('jobs list text palette is >= 4.5:1 on white', () => {
  const palette = paletteOf(page, 'JOBS_READABLE');
  for (const key of ['ink', 'muted', 'gold', 'amber', 'blue', 'violet', 'green', 'red']) {
    assert.ok(palette[key], `${key} defined`);
    assert.ok(contrast(palette[key]) >= 4.5, `${key} ${palette[key]} = ${contrast(palette[key]).toFixed(2)}:1`);
  }
});

test('status colours come from the readable palette, not the old low-contrast literals', () => {
  const statusMap = page.slice(page.indexOf('const STATUS_COLOR'), page.indexOf('};', page.indexOf('const STATUS_COLOR')));
  for (const old of ["'#3b82f6'", "'#8b5cf6'", "'#10b981'", "'#ef4444'", 'binThemeTokens.gold']) {
    assert.ok(!statusMap.includes(old), `STATUS_COLOR no longer uses ${old}`);
  }
  assert.ok(statusMap.includes('IN_PROGRESS: JOBS_READABLE.green'));
});

test('job card has no white or dark-theme text on the white shell', () => {
  assert.ok(!page.includes('color="#FFF"'), 'no white Typography');
  assert.ok(!page.includes("'#FFF', textTransform"), 'priority text not white');
  assert.ok(!page.includes("bgcolor: 'rgba(22, 22, 24"), 'job card not dark');
  assert.ok(!page.includes("color: deliverySucceeded ? '#10b981' : '#f59e0b'"), 'delivery chip readable');
  const textOnly = page.split('\n').filter((line) => !line.includes('<CircularProgress')).join('\n');
  assert.ok(!/[^a-zA-Z]color: binThemeTokens\.gold[,\s}]/.test(textOnly), 'no 2.3:1 gold text (spinner and gold backgrounds are fine)');
  assert.ok(page.includes('data-testid="technician-assigned-job-card"'));
  assert.ok(page.includes("onClick={() => navigate(`/technician/job/${job.id}`)}"), 'OPEN JOB CARD stays wired');
});
