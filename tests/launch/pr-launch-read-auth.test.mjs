import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

// Verify the real workflow callers of the unchanged live release-lock test.
// Anonymous hosted runners share API limits; this step needs authenticated reads.
for (const file of ['ci.yml', 'pr-validation.yml', 'current-main-expression-budget-repair.yml', 'current-main-firestore-verification.yml', 'play-integrity-pr-validation.yml']) {
  test(`${file}: full launch suite authenticates read-only release-lock lookup`, () => {
    const workflow = YAML.parse(readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8'));
    let callers = 0;
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps || []) {
        if (!step.run?.includes('npm run test:launch-honesty')) continue;
        callers++;
        const permissions = job.permissions || workflow.permissions;
        assert.equal(permissions.actions, 'read', `${file} must read release runs`);
        assert.equal(step.env?.GITHUB_TOKEN || job.env?.GITHUB_TOKEN || workflow.env?.GITHUB_TOKEN, '${{ github.token }}', `${file} must authenticate live API checks`);
      }
    }
    assert.ok(callers > 0, `${file} must retain its full launch suite`);
  });
}
