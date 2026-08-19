import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/bank-pilot-dispatch.yml', import.meta.url),
  'utf8',
);

test('bank-pilot dispatcher serializes owner requests globally', () => {
  assert.match(workflow, /concurrency:\s*[\s\S]*group: bank-pilot-dispatch\s/);
  assert.doesNotMatch(workflow, /group: bank-pilot-dispatch-\$\{\{\s*github\.event\.pull_request\.number\s*\}\}/);
});

test('bank-pilot dispatcher refuses an active or successful exact-SHA production run before dispatch', () => {
  const guardIndex = workflow.indexOf('Refuse duplicate exact-SHA production deployment');
  const dispatchIndex = workflow.indexOf('firebase-production-dispatch-current-main.yml/dispatches');

  assert.ok(guardIndex >= 0, 'duplicate exact-SHA guard is missing');
  assert.ok(dispatchIndex > guardIndex, 'duplicate guard must execute before the production wrapper dispatch');
  assert.match(workflow, /firebase-production-deploy\.yml\/runs\?event=workflow_dispatch&branch=main&per_page=100/);
  assert.match(workflow, /\$2 == sha && \(\$3 != "completed" \|\| \$4 == "success"\)/);
  assert.match(workflow, /Exact-SHA production deployment already exists for \$RELEASE_SHA/);
  assert.match(workflow, /Refusing duplicate dispatch/);
});
