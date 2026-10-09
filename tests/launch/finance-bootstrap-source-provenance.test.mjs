import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('protected dispatch forwards source PR into nested payload', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/firebase-production-dispatch-current-main.yml', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../../scripts/verify-production-workflow-env.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /--arg authorizationSourcePr /);
  assert.match(workflow, /authorization_source_pr:\$authorizationSourcePr/);
  assert.match(script, /dispatch\.deploymentPayload\?\.authorization_source_pr/);
  assert.doesNotMatch(script, /ownerRequestPr = String\(dispatch\.inputs\?/);
});
