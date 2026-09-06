import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const diagnosisScript = await readFile(
  new URL('../../scripts/run-owner-production-diagnosis.sh', import.meta.url),
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
