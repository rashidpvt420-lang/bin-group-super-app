import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storage = readFileSync('storage.rules', 'utf8').replace(/\r\n?/g, '\n');
const firestore = readFileSync('firestore.rules', 'utf8').replace(/\r\n?/g, '\n');

const helperBody = (source, name) => {
  const start = source.indexOf(`function ${name}() {`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf('\n    }', start);
  return source.slice(start, end + 6);
};

test('N-05: Storage Admin authority requires the same second-factor claim as Firestore', () => {
  const secondFactorClaim = "request.auth.token.get('firebase', {}).get('sign_in_second_factor', null) != null";
  assert.ok(helperBody(firestore, 'hasAdminSecondFactor').includes(secondFactorClaim));
  const storageHelper = helperBody(storage, 'hasAdminSecondFactor');
  assert.ok(storageHelper.includes(secondFactorClaim), 'Storage must test the identical second-factor claim');
  assert.match(storageHelper, /isAuth\(\)/, 'second factor helper must also require a signed-in, unsuspended user');
});

test('N-05: isAdmin() cannot be satisfied without the second factor', () => {
  const isAdmin = helperBody(storage, 'isAdmin');
  assert.match(isAdmin, /return hasAdminSecondFactor\(\) &&/);
  // Every Admin-tier role/claim alternative stays inside the second-factor conjunction.
  assert.match(isAdmin, /hasAdminSecondFactor\(\) && isAuth\(\) && \(/);
});

test('N-05: no Storage rule grants Admin authority by claim or role outside isAdmin()', () => {
  const outside = storage.replace(helperBody(storage, 'isAdmin'), '');
  assert.doesNotMatch(outside, /token\.get\('(ceo|admin|isAdmin)'/);
  assert.doesNotMatch(outside, /hasAnyRole\(\['(admin|super_admin|ceo)'/i);
});

test('N-05: HR-role tier is untouched', () => {
  assert.match(storage, /function isHrRole\(\) \{\n      return isAdmin\(\) \|\| hasAnyRole\(\['hr_admin', 'hr_manager', 'hr_staff'\]\);/);
});
