import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFirebaseExtensionsDecommissionReport } from '../../scripts/audit-firebase-extensions-decommission.mjs';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

test('normalizes installed extension inventory without exporting configuration values', () => {
  const report = buildFirebaseExtensionsDecommissionReport({
    status: 'success',
    result: [
      {
        instanceId: 'send-email',
        extensionRef: 'firebase/firestore-send-email',
        extensionVersion: '0.2.4',
        state: 'ACTIVE',
        params: { SMTP_PASSWORD: 'must-not-be-copied' },
      },
    ],
  }, {
    projectId: 'bin-group-57c60',
    generatedAt: '2026-07-20T00:00:00.000Z',
  });

  assert.equal(report.status, 'MIGRATION_REQUIRED');
  assert.equal(report.activeExtensionCount, 1);
  assert.deepEqual(report.instances, [{
    instanceId: 'send-email',
    extensionRef: 'firebase/firestore-send-email',
    version: '0.2.4',
    state: 'ACTIVE',
    migrationCategory: 'SELF_MANAGED_EMAIL_FUNCTION',
  }]);
  assert.equal(JSON.stringify(report).includes('must-not-be-copied'), false);
  assert.equal(report.controls.rawExtensionConfigurationExported, false);
});

test('reports clear when no extension instance is installed', () => {
  const report = buildFirebaseExtensionsDecommissionReport({ status: 'success', result: [] }, {
    projectId: 'bin-group-57c60',
  });
  assert.equal(report.status, 'CLEAR');
  assert.equal(report.activeExtensionCount, 0);
});

test('refuses inventory from any project other than production', () => {
  assert.throws(
    () => buildFirebaseExtensionsDecommissionReport([], { projectId: 'other-project' }),
    /unexpected project/,
  );
});

test('protected workflow audits before any uninstall and requires replacement proof', async () => {
  const workflow = await read('.github/workflows/firebase-extensions-decommission.yml');
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /GITHUB_ACTOR.*rashidpvt420-lang/);
  assert.match(workflow, /ceo@bin-groups\.com/);
  assert.match(workflow, /AUDIT_FIREBASE_EXTENSIONS_BIN_GROUP/);
  assert.match(workflow, /UNINSTALL_MIGRATED_FIREBASE_EXTENSIONS_BIN_GROUP/);
  assert.match(workflow, /CONFIRM_SELF_MANAGED_REPLACEMENTS_VERIFIED/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /firebase-tools@15\.19\.1 ext:list/);
  assert.match(workflow, /firebase-tools@15\.19\.1 ext:uninstall/);
  assert.match(workflow, /--force/);
  assert.match(workflow, /Remove raw provider output/);
  assert.match(workflow, /rm -f launch_package\/firebase-extensions-\*\.raw\.json/);
  assert.ok(workflow.indexOf('Inventory installed Firebase Extensions') < workflow.indexOf('Uninstall verified migrated instances'));
});

test('repository guard blocks new manifests and install/update commands', async () => {
  const guard = await read('scripts/verify-no-firebase-extension-manifest.mjs');
  assert.match(guard, /firebase\.json/);
  assert.match(guard, /extensions\/ contains/);
  assert.match(guard, /ext:install/);
  assert.match(guard, /ext:configure/);
  assert.match(guard, /ext:update/);
  assert.match(guard, /--only extensions/);
});
