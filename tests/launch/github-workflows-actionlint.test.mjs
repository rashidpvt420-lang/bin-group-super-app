import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ACTIONLINT_VERSION = '1.7.7';

function platformArchive() {
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  if (process.platform === 'win32') return { ext: 'zip', name: `actionlint_${ACTIONLINT_VERSION}_windows_${arch}.zip`, exe: 'actionlint.exe' };
  if (process.platform === 'darwin') return { ext: 'tar.gz', name: `actionlint_${ACTIONLINT_VERSION}_darwin_${arch}.tar.gz`, exe: 'actionlint' };
  return { ext: 'tar.gz', name: `actionlint_${ACTIONLINT_VERSION}_linux_${arch}.tar.gz`, exe: 'actionlint' };
}

async function ensureActionlintBinary() {
  const existing = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['actionlint'], { encoding: 'utf8' });
  if (existing.status === 0) return 'actionlint';

  const archive = platformArchive();
  const toolDir = path.join(os.tmpdir(), `bin-group-actionlint-${ACTIONLINT_VERSION}-${process.platform}-${process.arch}`);
  const exePath = path.join(toolDir, archive.exe);
  if (existsSync(exePath)) return exePath;

  mkdirSync(toolDir, { recursive: true });
  const url = `https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${archive.name}`;
  const response = await fetch(url);
  assert.equal(response.status, 200, `failed to download ${url}`);
  const archivePath = path.join(toolDir, archive.name);
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));

  const extract = spawnSync('tar', ['-xf', archivePath, '-C', toolDir], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(extract.status, 0, [extract.stdout.trim(), extract.stderr.trim()].filter(Boolean).join('\n'));
  assert.ok(existsSync(exePath), `actionlint binary missing after extraction: ${exePath}`);
  return exePath;
}

test('all GitHub workflow YAML files pass actionlint', async () => {
  const workflowDir = path.resolve('.github', 'workflows');
  const workflowFiles = readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => path.join(workflowDir, name));

  assert.ok(workflowFiles.length > 0, 'workflow files must exist');

  const actionlint = await ensureActionlintBinary();
  const result = spawnSync(actionlint, workflowFiles, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
  });

  assert.equal(result.status, 0, [
    result.stdout.trim(),
    result.stderr.trim(),
  ].filter(Boolean).join('\n'));
});
