import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/components/onboarding/ReviewBeforeSubmitStep.tsx', import.meta.url), 'utf8');

test('review screen maps canonical and legacy strategies to the correct plan labels', () => {
  assert.match(source, /reviewPlanKeyForStrategy/);
  assert.match(source, /strategy === ['"]fm_only['"] \|\| strategy === ['"]fm['"]/);
  assert.match(source, /strategy === ['"]pm_only['"] \|\| strategy === ['"]rent['"]/);
  assert.match(source, /return ['"]ifm['"]/);
  assert.match(source, /planKey === ['"]amc['"]/);
  assert.match(source, /planKey === ['"]pm['"]/);
  assert.match(source, /Property Management Only/);
  assert.doesNotMatch(source, /primaryProperty\?\.strategy === ['"]fm['"] \? ['"]amc['"] : \(primaryProperty\?\.strategy === ['"]rent['"] \? ['"]pm['"] : ['"]ifm['"]\)/);
});
