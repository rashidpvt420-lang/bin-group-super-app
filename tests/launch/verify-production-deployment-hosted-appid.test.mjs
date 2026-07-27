import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const verifier = await readFile(new URL('../../scripts/verify-production-deployment.mjs', import.meta.url), 'utf8');

test('production deployment verifier accepts expected hosted app id presence, not last crawled app id only', () => {
  assert.match(verifier, /const extractedAppIdMatched = String\(config\.appId \|\| ''\)\.includes\(PRODUCTION\.appIdSuffix\);/);
  assert.match(verifier, /const expectedAppIdMatched = runtimeSummary\.firebaseAppIdMatched === true \|\| extractedAppIdMatched;/);
  assert.match(verifier, /expected Firebase web app id is not embedded in hosted bundle/);
  assert.match(verifier, /expectedAppIdMatched &&\r?\n\s+runtimeSummary\.allRequiredMatched === true/);
  assert.doesNotMatch(verifier, /String\(config\.appId \|\| ''\)\.includes\(PRODUCTION\.appIdSuffix\) &&\r?\n\s+runtimeSummary\.allRequiredMatched === true/);
});
