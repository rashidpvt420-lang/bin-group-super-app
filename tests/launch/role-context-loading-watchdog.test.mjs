import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const roleContextSource = readFileSync(
  new URL('../../src/context/RoleContext.tsx', import.meta.url),
  'utf8',
);

test('role refresh cannot strand an already verified portal in the global loading fallback', () => {
  assert.match(
    roleContextSource,
    /const shouldBlockPortal = !user \|\| !role;/,
    'refreshRole must distinguish first-time identity verification from a refresh of an already verified role',
  );
  assert.match(
    roleContextSource,
    /if \(shouldBlockPortal\) \{\s*setLoading\(true\);/s,
    'refreshRole may only raise the global blocking loader when no verified user/role is available',
  );
  assert.match(
    roleContextSource,
    /const refreshTimeoutId = shouldBlockPortal\s*\? window\.setTimeout\(/s,
    'every blocking refresh must have its own watchdog instead of relying on the one-shot provider boot timer',
  );
  assert.match(
    roleContextSource,
    /\[AUTH_DIAG\] Role refresh timeout\. Releasing blocker fail-closed\./,
    'a timed-out blocking refresh must leave an auditable fail-closed diagnostic',
  );
  assert.match(
    roleContextSource,
    /setStatus\('profile_unavailable'\);/,
    'blocking refresh timeout must fail closed to profile_unavailable',
  );
});
