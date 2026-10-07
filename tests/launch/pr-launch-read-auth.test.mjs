import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

// The live lock check must use authenticated read-only API access in every PR
// workflow that runs the complete launch suite; anonymous runners share limits.
test('PR full launch suites authenticate release-lock reads without write permissions', () => {
  for (const file of ['ci.yml', 'pr-validation.yml', 'current-main-expression-budget-repair.yml', 'current-main-firestore-verification.yml', 'play-integrity-pr-validation.yml']) {
    const workflow = YAML.parse(readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8'));
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps || []) {
        if (!step.run?.includes('npm run test:launch-honesty')) continue;
        const permissions = job.permissions || workflow.permissions;
        assert.equal(permissions.actions, 'read', `${file} must read release runs`);
        assert.equal(step.env?.GITHUB_TOKEN || job.env?.GITHUB_TOKEN || workflow.env?.GITHUB_TOKEN, '${{ github.token }}', `${file} must authenticate live release-lock checks`);
      }
    }
  }
});
