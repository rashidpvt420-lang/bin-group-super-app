import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const RUNTIME_ROOTS = [
  'src',
  'apps/admin-panel/src',
  'apps/owner-app/src',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SKIP_SEGMENTS = ['/test/', '/tests/', '/__tests__/', '/fixtures/', '/mocks/', '/mock/'];

const FORBIDDEN_RUNTIME_MARKERS = [
  { re: /mock data for/i, label: 'explicit mock data' },
  { re: /mocking data/i, label: 'runtime data mocking' },
  { re: /mocking real[- ]time/i, label: 'mocked real-time feed' },
  { re: /simple mock for demo/i, label: 'demo KPI fallback' },
  { re: /mocked for now/i, label: 'temporary mocked metric' },
  { re: /replace with firestore hook/i, label: 'unwired Firestore placeholder' },
  { re: /\bmockTasks\b/, label: 'mock task fixture' },
  { re: /\bmockResult\b/, label: 'mock runtime result' },
  { re: /simulate high-frequency computation/i, label: 'simulated quote computation' },
  { re: /['"]AED 12,000\+['"]/, label: 'hard-coded quote amount' },
  { re: /['"]AED 25,000\+['"]/, label: 'hard-coded quote amount' },
  { re: /\bSkyline Tower\b/i, label: 'known demo property' },
  { re: /\bPalm Villa 44\b/i, label: 'known demo property' },
  { re: /\bmarina_tower_2504\b/i, label: 'known demo property ID' },
  { re: /\brashid_holdings_77\b/i, label: 'known demo owner ID' },
  { re: /queueClearance\s*:\s*84\b/, label: 'fabricated queue-clearance default' },
  { re: /\|\|\s*84\b/, label: 'fabricated 84% KPI fallback' },
  { re: /avgVacancyDays\s*:\s*14\b/, label: 'fabricated vacancy duration' },
  { re: /trend\s*:\s*['"]\+12\.5%['"]/, label: 'fabricated property KPI trend' },
  { re: /trend\s*:\s*['"]-2\.1%['"]/, label: 'fabricated property KPI trend' },
  { re: /trend\s*:\s*['"]\+86['"]/, label: 'fabricated tenant trend' },
];

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.git'].includes(entry)) continue;
      walk(full, output);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(extname(full))) continue;
    const normalized = `/${full.replaceAll('\\', '/')}`;
    if (SKIP_SEGMENTS.some((segment) => normalized.includes(segment))) continue;
    output.push(full);
  }
  return output;
}

test('production runtime source contains no known demo/mock data markers', () => {
  const violations = [];
  for (const root of RUNTIME_ROOTS) {
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8');
      for (const marker of FORBIDDEN_RUNTIME_MARKERS) {
        if (marker.re.test(source)) violations.push(`${file}: ${marker.label}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Production runtime contains demo/mock data markers:\n${violations.map((item) => `- ${item}`).join('\n')}`,
  );
});

test('legacy quote entry cannot fabricate an official commercial result', () => {
  for (const path of ['src/components/QuotingWizard.tsx', 'apps/owner-app/src/components/QuotingWizard.tsx']) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /window\.location\.assign\(['"]\/onboarding['"]\)/);
    assert.match(source, /previewOwnerInspectionQuote/);
    assert.doesNotMatch(source, /mockResult|25000|12000|setTimeout\s*\(/);
  }
});

test('Phase 1 owner payment policy remains Cash/Cheque only', () => {
  const source = readFileSync('functions/paymentConfiguration.ts', 'utf8');
  assert.match(source, /PHASE1_METHODS\s*=\s*\[\s*["']CASH["']\s*,\s*["']CHEQUE["']\s*\]/);
  assert.match(source, /Bank Transfer and Card\/Stripe to remain disabled/i);
  assert.match(source, /must enable exactly Cash and Cheque/i);
});
