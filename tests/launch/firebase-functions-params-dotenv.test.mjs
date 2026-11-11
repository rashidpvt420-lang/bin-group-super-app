import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  PARAM_DOTENV_FILE,
  PARAM_EXAMPLE_FILE,
  PRODUCTION_PROJECT_ID,
  REQUIRED_PARAM_VALUES,
  definedDeployParams,
  resolveFunctionsDeployParams,
  writeFunctionsDeployParams,
} from '../../scripts/write-functions-deploy-params.mjs';

test('every defineInt/String/Boolean param has a committed production example value', () => {
  const params = definedDeployParams();
  const values = resolveFunctionsDeployParams();
  assert.ok(params.size > 0, 'expected at least one non-secret Functions param');
  assert.ok(
    params.has('CRITICAL_FN_MIN_INSTANCES'),
    'CRITICAL_FN_MIN_INSTANCES must stay declared as a Functions param',
  );
  assert.deepEqual(
    [...params].sort(),
    Object.keys(values).sort(),
    'the committed param example must stay aligned with defined Functions params',
  );
});

test('CRITICAL_FN_MIN_INSTANCES stays 0 and the real dotenv stays untracked', () => {
  const values = resolveFunctionsDeployParams();
  assert.equal(values.CRITICAL_FN_MIN_INSTANCES, '0');
  assert.equal(REQUIRED_PARAM_VALUES.CRITICAL_FN_MIN_INSTANCES, '0');
  assert.match(
    readFileSync('functions/functionScaleOptions.ts', 'utf8'),
    /defineInt\(\s*["']CRITICAL_FN_MIN_INSTANCES["']\s*,\s*\{\s*default:\s*0\s*\}\s*\)/,
  );
  assert.ok(existsSync(PARAM_EXAMPLE_FILE), `missing ${PARAM_EXAMPLE_FILE}`);
  assert.match(PARAM_EXAMPLE_FILE, /\.example$/);
  const gitCmd = process.platform === 'win32' ? 'git.exe' : 'git';
  // Use -q: -v exits 0 whenever a pattern matches, including a negation.
  const ignoredDotenv = spawnSync(gitCmd, ['check-ignore', '-q', PARAM_DOTENV_FILE]);
  assert.equal(
    ignoredDotenv.status,
    0,
    `${PARAM_DOTENV_FILE} must stay gitignored so real env files are not tracked`,
  );
  const ignoredExample = spawnSync(gitCmd, ['check-ignore', '-q', PARAM_EXAMPLE_FILE]);
  assert.equal(ignoredExample.status, 1, `${PARAM_EXAMPLE_FILE} must be committable`);
});

test('the writer materializes the gitignored production dotenv for non-interactive deploy', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'fn-params-'));
  const targetPath = path.join(tempDir, `.env.${PRODUCTION_PROJECT_ID}`);
  const result = writeFunctionsDeployParams({
    projectId: PRODUCTION_PROJECT_ID,
    targetPath,
  });
  assert.equal(result.values.CRITICAL_FN_MIN_INSTANCES, '0');
  assert.match(readFileSync(targetPath, 'utf8'), /^CRITICAL_FN_MIN_INSTANCES=0$/m);
  assert.throws(
    () => writeFunctionsDeployParams({ projectId: 'some-other-project', targetPath }),
    /unexpected project/,
  );
  assert.throws(
    () => resolveFunctionsDeployParams({
      examplePath: path.join(tempDir, 'empty.example'),
    }),
    /Missing Functions param example/,
  );
  const badExample = path.join(tempDir, 'bad.example');
  writeFileSync(badExample, 'CRITICAL_FN_MIN_INSTANCES=1\n');
  assert.throws(
    () => resolveFunctionsDeployParams({ examplePath: badExample }),
    /CRITICAL_FN_MIN_INSTANCES must stay 0/,
  );
});

test('protected production deploy writes Functions params before the first firebase deploy', () => {
  const deploy = readFileSync('scripts/deploy-firebase-production.mjs', 'utf8').replace(/\r\n?/g, '\n');
  assert.match(
    deploy,
    /import \{ writeFunctionsDeployParams \} from ['"]\.\/write-functions-deploy-params\.mjs['"]/,
  );
  const writeIndex = deploy.indexOf('writeFunctionsDeployParams({ projectId })');
  const secretIndex = deploy.indexOf('await verifyFirebaseProductionSecrets({ projectId, launchMode });');
  const deployIndex = deploy.indexOf("'firebase',\n      'deploy'");
  assert.ok(writeIndex > secretIndex, 'param dotenv must be written after secret preflight');
  assert.ok(deployIndex > writeIndex, 'param dotenv must be written before the first firebase deploy');
});
