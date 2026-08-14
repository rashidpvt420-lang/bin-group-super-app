import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const workflows = readdirSync('.github/workflows')
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => `.github/workflows/${name}`);

const reviewedUploadArtifactRefs = new Map([
  ['ea165f8d65b6e75b540449e92b4886f43607fa02', '# v4'],
  ['043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', '# v7.0.1'],
]);

for (const workflow of workflows) {
  test(`${workflow} uses supported and immutable artifact actions`, () => {
    const source = readFileSync(workflow, 'utf8');
    assert.doesNotMatch(source, /actions\/checkout@(v1|v2|v3)\b/);
    assert.doesNotMatch(source, /actions\/setup-node@(v1|v2|v3)\b/);
    assert.doesNotMatch(source, /actions\/upload-artifact@(v1|v2|v3)\b/);
    assert.doesNotMatch(source, /actions\/download-artifact@(v1|v2|v3)\b/);
    assert.doesNotMatch(source, /actions\/upload-artifact@v4\b/);
    assert.doesNotMatch(source, /actions\/download-artifact@v4\b/);
    for (const match of source.matchAll(/actions\/upload-artifact@([^\s#]+)/g)) {
      const reviewedVersion = reviewedUploadArtifactRefs.get(match[1]);
      assert.ok(reviewedVersion, `${workflow} has unreviewed upload-artifact ref`);
      assert.ok(source.slice(match.index, match.index + 100).includes(reviewedVersion));
    }
    for (const match of source.matchAll(/actions\/download-artifact@([^\s#]+)/g)) {
      assert.equal(match[1], 'd3f86a106a0bac45b974a628896c90dbdf5c8093', `${workflow} has unreviewed download-artifact ref`);
      assert.match(source.slice(match.index, match.index + 80), /# v4/);
    }
  });
}
