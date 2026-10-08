import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const diagnosisScript = await readFile(
  new URL('../../scripts/run-owner-production-diagnosis.sh', import.meta.url),
  'utf8',
);
const automaticWorkflow = await readFile(
  new URL('../../.github/workflows/firebase-production-failure-diagnostics.yml', import.meta.url),
  'utf8',
);

test('production diagnosis explicitly allows terminal log bytes then sanitizes before publication', () => {
  const rawFetch = diagnosisScript.indexOf(
    'gh api --allow-escape-sequences "repos/$REPOSITORY/actions/jobs/$job_id/logs"',
  );
  const sanitizer = diagnosisScript.indexOf('sanitize-production-diagnostic-log.mjs');
  const issueComment = diagnosisScript.indexOf('issues/$ISSUE_NUMBER/comments');

  assert.ok(rawFetch >= 0, 'job-log fetch must opt into GitHub CLI escape-sequence output');
  assert.ok(sanitizer > rawFetch, 'raw terminal output must be sanitized after retrieval');
  assert.ok(issueComment > sanitizer, 'only sanitized/normalized evidence may reach the issue comment');
  assert.match(diagnosisScript, /rawJobLogUploaded:\s*false/);
  assert.match(diagnosisScript, /fullArtifactLogRedacted:\s*true/);
  assert.match(diagnosisScript, /personalIdentifiersRedacted:\s*true/);
  assert.doesNotMatch(diagnosisScript, /continue-on-error:\s*true/);
});


test('automatic Firebase failure diagnostics allow terminal bytes only before sanitization', () => {
  const rawFetch = automaticWorkflow.indexOf(
    'gh api --allow-escape-sequences "repos/$REPOSITORY/actions/jobs/$job_id/logs"',
  );
  const sanitizer = automaticWorkflow.indexOf('sanitize-production-diagnostic-log.mjs');
  const artifactUpload = automaticWorkflow.indexOf('Upload redacted production failure evidence');
  const issueComment = automaticWorkflow.indexOf('Record sanitized failure in canonical pilot issue');

  assert.ok(rawFetch >= 0, 'automatic diagnostics must opt into terminal log bytes');
  assert.ok(sanitizer > rawFetch, 'automatic diagnostics must sanitize after log retrieval');
  assert.ok(artifactUpload > sanitizer, 'only sanitized evidence may be uploaded');
  assert.ok(issueComment > sanitizer, 'only sanitized evidence may be posted to the issue');
  assert.match(automaticWorkflow, /rawJobLogUploaded:\s*false/);
  assert.match(automaticWorkflow, /fullArtifactLogRedacted:\s*true/);
});
