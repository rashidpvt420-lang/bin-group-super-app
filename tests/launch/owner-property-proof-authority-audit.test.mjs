import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner activation requires approved property proof, not upload presence alone', async () => {
  const source = await read('functions/ownerProfileReadiness.ts');

  assert.match(source, /propertyProofReviewApproved/);
  assert.match(source, /record\.propertyProofApproved === true/);
  assert.match(source, /record\.propertyProofStatus/);
  assert.match(source, /record\.documentReviewStatus/);
  assert.doesNotMatch(
    source,
    /Boolean\(item\.documentUrls\?\.propertyProof\)/,
    'A property-proof upload must remain pending until an authoritative review is approved.',
  );
});
