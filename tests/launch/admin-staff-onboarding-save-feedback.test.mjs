// Regression (2026-09-30 20:43-20:46 GST): SAVE ONBOARDING activated the Technician (three
// adminUpdateStaffOnboarding POST 200s), but the dialog showed no confirmation. invoke() set the
// success notice and then awaited load(), whose first statements were setLoading(true) and
// setNotice(null): the form blanked and the success message was wiped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const dialog = read('apps/admin-panel/src/pages/admin/StaffLifecycleDetailsDialog.tsx');
const noticesSource = read('apps/admin-panel/src/utils/staffLifecycleNotices.ts');

function load(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}
const n = load(noticesSource);

const activeResult = {
  success: true, uid: 'x', stage: 'ACTIVE', active: true, emailVerified: true, refreshTokensRevoked: true,
  checklist: { profileComplete: true, documentsComplete: true, contractComplete: true, deviceReady: true, activationApproved: true },
};

test('01 activation success is explicit and tells the Technician to sign in again', () => {
  const notice = n.onboardingSaveNotice('rashid', activeResult, 'technician');
  assert.equal(notice.severity, 'success');
  assert.match(notice.message, /rashid is now ACTIVE/);
  assert.match(notice.message, /sign out and sign in again/);
  assert.doesNotMatch(n.onboardingSaveNotice('ops', activeResult, 'operations_admin').message, /Technician app/);
});

test('02 a partial checklist save is a warning that names the missing boxes', () => {
  const notice = n.onboardingSaveNotice('rashid', {
    success: true, stage: 'EMAIL_VERIFIED', active: false, emailVerified: true,
    checklist: { profileComplete: false, documentsComplete: false, contractComplete: false, deviceReady: false, activationApproved: true },
  }, 'technician');
  assert.equal(notice.severity, 'warning');
  assert.match(notice.message, /stage EMAIL VERIFIED/);
  assert.match(notice.message, /stays suspended/);
  assert.match(notice.message, /Profile complete, Documents complete, Contract complete, Technician device ready/);
  assert.doesNotMatch(notice.message, /missing:[^)]*Activation approved/);
});

test('03 an unconfirmed server response is an error, not a silent success', () => {
  assert.equal(n.onboardingSaveNotice('rashid', undefined).severity, 'error');
  assert.equal(n.onboardingSaveNotice('rashid', { success: false }).severity, 'error');
});

test('04 callable errors show the action, the code, a hint and the server message', () => {
  const failed = n.staffOperationErrorMessage('Onboarding save', {
    code: 'functions/failed-precondition',
    message: 'Suspended or offboarded staff cannot be activated through onboarding.',
    details: { reason: 'X' },
  });
  assert.match(failed, /^Onboarding save failed \(failed-precondition\)\./);
  assert.match(failed, /Server: Suspended or offboarded staff cannot be activated/);
  assert.doesNotMatch(failed, /\[object Object\]/);
  assert.match(n.staffOperationErrorMessage('Onboarding save', { code: 'functions/permission-denied', message: 'permission-denied' }), /MFA/);
  assert.match(n.staffOperationErrorMessage('Onboarding save', { code: 'functions/unauthenticated', message: 'Unauthenticated' }), /App Check/);
  assert.match(n.staffOperationErrorMessage('Onboarding save', new Error('network down')), /^Onboarding save failed\. The protected staff operation failed\. Server: network down/);
});

test('05 invoke publishes the result only after the background reload', () => {
  const start = dialog.indexOf('const invoke = async (');
  const end = dialog.indexOf('const saveProfile', start);
  assert.ok(start >= 0 && end > start);
  const body = dialog.slice(start, end);
  const reload = body.indexOf('await load({ background: true })');
  const publish = body.lastIndexOf('setNotice(result)');
  assert.ok(reload >= 0, 'post-save reload must be a background reload');
  assert.ok(publish > reload, 'the result notice must be set after the reload');
  assert.match(body, /setToast\(result\)/);
  assert.match(body, /staffOperationErrorMessage\(action, error\)/);
});

test('06 a background reload neither blanks the form nor clears the notice', () => {
  const start = dialog.indexOf('const load = useCallback(');
  const body = dialog.slice(start, dialog.indexOf('useEffect(() => { void load(); }, [load]);', start));
  assert.match(body, /if \(!options\.background\) \{\s*setLoading\(true\);\s*setNotice\(null\);\s*\}/);
  assert.match(body, /if \(!options\.background\) setLoading\(false\)/);
});

test('07 SAVE ONBOARDING uses the server result for its message and a toast is rendered', () => {
  assert.match(dialog, /onboardingSaveNotice\(staff\.displayName, data, staff\.role\)/);
  assert.match(dialog, /data-testid="staff-lifecycle-toast"/);
  assert.match(dialog, /data-testid="staff-lifecycle-notice"/);
});
