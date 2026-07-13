import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  evaluatePlaywrightJsonRun,
  readPlaywrightJsonArtifact,
} from '../../scripts/lib/playwright-json-artifact.mjs';
import {
  revalidatePlaywrightArtifact,
  sha256File,
} from '../../scripts/lib/launch-honesty.mjs';

function makePassingReport({ passed = 2, specs = ['tests/e2e/business-owner.spec.ts'] } = {}) {
  return {
    stats: { expected: passed, unexpected: 0, skipped: 0, flaky: 0, interrupted: 0 },
    suites: specs.map((file, idx) => ({
      file,
      specs:
        idx === 0
          ? Array.from({ length: passed }, (_, i) => ({
              title: `t${i}`,
              file,
              tests: [{ status: 'passed', results: [{ status: 'passed' }] }],
            }))
          : [{ title: 'anchor', file, tests: [] }],
    })),
  };
}

function artifactRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'pw-json-artifact-'));
  mkdirSync(path.join(root, 'launch_package', 'artifacts'), { recursive: true });
  return root;
}

describe('playwright JSON artifact handling', () => {
  it('rejects missing report files fail-closed', () => {
    const root = artifactRoot();
    try {
      const reportPath = path.join(root, 'launch_package/artifacts/missing.json');
      const loaded = readPlaywrightJsonArtifact(reportPath);
      assert.equal(loaded.ok, false);
      assert.match(loaded.reason, /missing/i);

      const evaluation = evaluatePlaywrightJsonRun({ exitCode: 0, reportPath });
      assert.equal(evaluation.ok, false);
      assert.match(evaluation.reason, /missing/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects empty report files fail-closed', () => {
    const root = artifactRoot();
    try {
      const reportPath = path.join(root, 'launch_package/artifacts/empty.json');
      writeFileSync(reportPath, '   \n');
      const loaded = readPlaywrightJsonArtifact(reportPath);
      assert.equal(loaded.ok, false);
      assert.match(loaded.reason, /empty/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed report files fail-closed', () => {
    const root = artifactRoot();
    try {
      const reportPath = path.join(root, 'launch_package/artifacts/bad.json');
      writeFileSync(reportPath, 'not-json');
      const loaded = readPlaywrightJsonArtifact(reportPath);
      assert.equal(loaded.ok, false);
      assert.match(loaded.reason, /malformed/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('leading dotenv banner noise in a separate stdio log cannot contaminate the JSON artifact', () => {
    const root = artifactRoot();
    try {
      const report = makePassingReport({ passed: 2 });
      const reportPath = path.join(root, 'launch_package/artifacts/clean.json');
      const cleanJson = `${JSON.stringify(report)}\n`;
      writeFileSync(reportPath, cleanJson);

      const noisyStdio = [
        '◇ injected env (16) from .env.e2e // tip: auth for agents',
        '--- stdout ---',
        '{"suites":[],"stats":{}}',
      ].join('\n');
      writeFileSync(`${reportPath}.stdio.log`, noisyStdio);

      const loaded = readPlaywrightJsonArtifact(reportPath);
      assert.equal(loaded.ok, true);
      const text = readFileSync(reportPath, 'utf8');
      assert.doesNotMatch(text, /injected env/i);
      assert.equal(text.trim().startsWith('{'), true);

      const evaluation = evaluatePlaywrightJsonRun({ exitCode: 0, reportPath });
      assert.equal(evaluation.ok, true, evaluation.reason);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('revalidatePlaywrightArtifact accepts a clean standalone JSON artifact', () => {
    const root = artifactRoot();
    try {
      const report = makePassingReport({
        passed: 2,
        specs: ['tests/e2e/business-owner.spec.ts'],
      });
      const relative = 'launch_package/artifacts/business-owner.json';
      const abs = path.join(root, relative);
      writeFileSync(abs, `${JSON.stringify(report)}\n`);

      const record = {
        artifactPath: relative,
        artifactHash: sha256File(abs),
        passed: 2,
        failed: 0,
        skipped: 0,
        expectedSpecs: ['tests/e2e/business-owner.spec.ts'],
      };
      const check = revalidatePlaywrightArtifact(record, { root });
      assert.equal(check.ok, true, check.reason);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('revalidatePlaywrightArtifact rejects stdout-noise contaminated artifacts', () => {
    const root = artifactRoot();
    try {
      const report = makePassingReport({ passed: 2 });
      const relative = 'launch_package/artifacts/contaminated.json';
      const abs = path.join(root, relative);
      const contaminated = `◇ injected env (16) from .env.e2e\n${JSON.stringify(report)}\n`;
      writeFileSync(abs, contaminated);

      const record = {
        artifactPath: relative,
        artifactHash: sha256File(abs),
        passed: 2,
        failed: 0,
        skipped: 0,
        expectedSpecs: ['tests/e2e/business-owner.spec.ts'],
      };
      const check = revalidatePlaywrightArtifact(record, { root });
      assert.equal(check.ok, false);
      assert.match(check.reason, /malformed JSON/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('nonzero Playwright exit never records evidence-ready evaluation', () => {
    const root = artifactRoot();
    try {
      const report = makePassingReport({ passed: 2 });
      const reportPath = path.join(root, 'launch_package/artifacts/exit1.json');
      writeFileSync(reportPath, `${JSON.stringify(report)}\n`);

      const evaluation = evaluatePlaywrightJsonRun({ exitCode: 1, reportPath });
      assert.equal(evaluation.ok, false);
      assert.match(evaluation.reason, /exitCode=1/i);
      assert.equal(evaluation.artifactHash, undefined);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
