import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const scriptPath = path.join(root, 'scripts', 'fix-hard-launch-external-blockers.ps1');
const script = fs.readFileSync(scriptPath, 'utf8');

const compromisedFingerprint = '431AEC82D731F2A6ED2521AC529722FCB4A51614AC857A20AB96DA2D767BEE91';

function mustContain(pattern, message) {
  assert.match(script, pattern, message);
}

test('external remediation enables protected main with signed commits and always-on CI checks', () => {
  mustContain(/branches\/\$Branch\/protection[^\n]*-Method PUT/, 'must update branch protection through the GitHub API');
  mustContain(/required_signatures[^\n]*-Method POST/, 'must enable signed-commit protection');
  mustContain(/required_status_checks\s*=\s*@\{/, 'must configure required status checks');
  mustContain(/strict\s*=\s*\$true/, 'required status checks must be strict');
  mustContain(/enforce_admins\s*=\s*\$true/, 'branch protection must apply to admins');
  mustContain(/allow_force_pushes\s*=\s*\$false/, 'force pushes must remain disabled');
  mustContain(/allow_deletions\s*=\s*\$false/, 'branch deletion must remain disabled');
  mustContain(/required_conversation_resolution\s*=\s*\$true/, 'review conversations must be resolved');
  for (const check of [
    'Install, build, and test',
    'Install, typecheck, lint, and build',
  ]) {
    assert.ok(script.includes(`'${check}'`), `missing required protected check: ${check}`);
  }
  assert.doesNotMatch(script, /\$RequiredChecks\s*=\s*@\([\s\S]*?'audit'/, 'optional five-profile audit must not be a required branch context');
});

test('external remediation creates replacement Android material outside the repo and rotates production secrets', () => {
  mustContain(/\.bin-group\/android-signing/, 'default signing output must live under the user home directory');
  mustContain(/Refusing to generate Android signing material inside the Git repository/, 'must reject repository-local key generation');
  mustContain(/-keyalg RSA/, 'replacement key must use RSA');
  mustContain(/-keysize 4096/, 'replacement key must use a strong RSA key size');
  mustContain(/-sigalg SHA256withRSA/, 'replacement key must use SHA-256 with RSA');
  const jksStoreTypeUsages = script.match(/-storetype JKS/g) ?? [];
  assert.equal(jksStoreTypeUsages.length, 3, 'generation, certificate export, and key inspection must all force JKS');
  mustContain(/gh secret set -f \$secretBackupPath --env \$Environment --repo \$Repo/, 'must rotate environment secrets through GitHub CLI');
  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.ok(script.includes(`'${secret}'`), `missing Android secret rotation target: ${secret}`);
  }
});

test('external remediation permanently rejects the known compromised upload certificate', () => {
  assert.ok(script.includes(compromisedFingerprint), 'known compromised certificate fingerprint must be denylisted');
  mustContain(/Generated certificate unexpectedly matches the compromised upload certificate\. Stop\./, 'must fail closed if replacement key matches compromised certificate');
  mustContain(/googlePlayResetConfirmed/, 'rotation manifest must track Google Play reset confirmation');
  mustContain(/Do not declare hard-public GO until Play accepts the replacement upload certificate/, 'operator must not claim GO before Google Play reset');
});

test('external remediation does not print private secret values and verifies main did not drift', () => {
  assert.doesNotMatch(script, /Write-(?:Host|Output).*\$(?:storePassword|keyPassword|keystoreBase64)/i, 'must not print Android private secret values');
  mustContain(/Remove-Item Env:BIN_GROUP_ANDROID_STOREPASS/, 'store password environment variable must be cleared');
  mustContain(/Remove-Item Env:BIN_GROUP_ANDROID_KEYPASS/, 'key password environment variable must be cleared');
  mustContain(/moved during remediation/, 'must fail if main moves during remediation');
  mustContain(/commit\.verification\.verified -ne \$true/, 'must require a verified target commit before changing release governance');
});
