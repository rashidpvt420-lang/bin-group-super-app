import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const generator = await readFile(
  new URL('../../scripts/generate-android-signing-package.py', import.meta.url),
  'utf8',
);
const gitignore = await readFile(new URL('../../.gitignore', import.meta.url), 'utf8');

test('Android signing generator defaults to a private directory outside the repository', () => {
  assert.match(generator, /BIN_GROUP_PRIVATE_SIGNING_DIR/);
  assert.match(generator, /Path\.home\(\) \/ "\.bin-group-private" \/ "android-signing-package"/);
  assert.doesNotMatch(generator, /package_dir\s*=\s*Path\(["']android_signing_package["']\)/);
});

test('Android signing generator refuses repository-local output and existing packages', () => {
  assert.match(generator, /Refusing to write Android signing material inside the Git repository/);
  assert.match(generator, /Refusing to overwrite an existing Android signing package/);
  assert.match(generator, /is_inside\(package_dir, root\)/);
});

test('Android signing artifacts are ignored by git', () => {
  assert.match(gitignore, /^android_signing_package\/$/m);
  assert.match(gitignore, /^staff-os-staging-\*\/$/m);
});
