// Staff / technician callables must enforce the same server-side MFA session as the admin-panel callables,
// but ONLY for admin / CEO claims. Technicians and ordinary staff must never be asked for MFA.
// (Behavioural allow/deny coverage lives in test/emulator-callables/staff-callable-mfa-and-email-verification.test.cjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const body = (src, startMarker) => {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced');
};

for (const [file, gate] of [['functions/staffOperatingSystem.ts', 'isCeoOrAdmin(token)'], ['functions/staffPdfReporting.ts', 'isCeoOrAdmin(token)']]) {
  test(`${file}: MFA is required for admin/CEO claims only, once, in the shared session helper`, () => {
    const src = read(file);
    assert.match(src, /import \{[^}]*requirePrivilegedMfaSession[^}]*\} from "\.\/adminMfaSession"/);
    const helper = body(src, 'async function assertStaffSession');
    assert.ok(helper.includes(`if (${gate})`), 'gate must be conditional on the admin/CEO claim');
    assert.match(helper, /await requirePrivilegedMfaSession\(auth\)/);
    assert.ok(helper.indexOf('requirePrivilegedMfaSession') < helper.indexOf('assertActiveAccount'), 'MFA is checked before the account lookup');
    assert.equal((src.match(/requirePrivilegedMfaSession\(/g) || []).length, 1, 'only the helper calls the MFA gate');
  });

  test(`${file}: every callable goes through the session helper (no bare assertActiveAccount left)`, () => {
    const src = read(file);
    // verifyReportPdfHash is intentionally public (hash verification) and has no staff session.
    const callables = (src.match(/onCall\((?!PUBLIC_CALLABLE_OPTIONS)/g) || []).length;
    const sessionCalls = (src.match(/await assertStaffSession\(/g) || []).length;
    const bareCalls = (src.match(/await assertActiveAccount\(/g) || []).length;
    assert.ok(callables > 0);
    assert.equal(bareCalls, 1, 'assertActiveAccount is only called from assertStaffSession');
    assert.ok(sessionCalls >= callables, `${sessionCalls} session checks for ${callables} callables`);
  });
}

test('secureTechnicianOperations: MFA applies to admin claims, never to technicians', () => {
  const src = read('functions/secureTechnicianOperations.ts');
  assert.match(src, /requirePrivilegedMfaSession/);
  const helper = body(src, 'async function requireMfaForAdminClaims');
  assert.match(helper, /if \(isAdmin\(auth\)\)/);
  assert.match(helper, /await requirePrivilegedMfaSession\(auth\)/);
  assert.doesNotMatch(helper, /technician/i, 'the technician path must not mention MFA');
  // runSecured wraps resume/accept/updateTicketLifecycle; the readiness callable calls the gate directly.
  assert.match(body(src, 'runSecured'), /await requireMfaForAdminClaims\(request\.auth\)/);
  assert.ok((src.match(/requireMfaForAdminClaims\(request\.auth\)/g) || []).length >= 2);
});

test('the MFA gate itself is unchanged: second factor + verified email + live Auth user check', () => {
  const src = read('functions/adminMfaSession.ts');
  assert.match(src, /sign_in_second_factor/);
  assert.match(src, /email_verified/);
});
