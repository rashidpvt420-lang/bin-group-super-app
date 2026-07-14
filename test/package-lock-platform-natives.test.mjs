import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'package-lock.json');
const installRetryPath = path.join(root, 'scripts/npm-install-retry.sh');

function loadLockfile() {
  const raw = readFileSync(lockPath, 'utf8');
  const lock = JSON.parse(raw);
  assert.equal(typeof lock, 'object');
  assert.equal(lock, Object(lock));
  return lock;
}

function packageRecord(packages, name) {
  const key = `node_modules/${name}`;
  assert.ok(
    Object.prototype.hasOwnProperty.call(packages, key),
    `expected actual package record for ${key}`,
  );
  return packages[key];
}

function findPackageRecords(packages, name) {
  const suffix = `/node_modules/${name}`;
  const flat = `node_modules/${name}`;
  return Object.entries(packages).filter(([key]) => key === flat || key.endsWith(suffix));
}

describe('package-lock platform natives', () => {
  it('package-lock.json is valid JSON', () => {
    assert.ok(existsSync(lockPath));
    const lock = loadLockfile();
    assert.equal(typeof lock.lockfileVersion, 'number');
  });

  it('lockfileVersion is supported', () => {
    const lock = loadLockfile();
    assert.ok(
      lock.lockfileVersion === 2 || lock.lockfileVersion === 3,
      `unsupported lockfileVersion: ${lock.lockfileVersion}`,
    );
  });

  it('node_modules/rollup exists', () => {
    const { packages } = loadLockfile();
    const rollup = packageRecord(packages, 'rollup');
    assert.equal(typeof rollup.version, 'string');
    assert.ok(rollup.version.length > 0);
  });

  it('rollup declares expected optional native dependencies', () => {
    const { packages } = loadLockfile();
    const rollup = packageRecord(packages, 'rollup');
    const optional = rollup.optionalDependencies || {};
    assert.equal(typeof optional['@rollup/rollup-linux-x64-gnu'], 'string');
    assert.equal(typeof optional['@rollup/rollup-win32-x64-msvc'], 'string');
  });

  it('lock contains resolved @rollup/rollup-linux-x64-gnu and win32-x64-msvc records', () => {
    const { packages } = loadLockfile();
    for (const name of [
      '@rollup/rollup-linux-x64-gnu',
      '@rollup/rollup-win32-x64-msvc',
    ]) {
      const record = packageRecord(packages, name);
      assert.equal(typeof record.version, 'string');
      assert.equal(typeof record.resolved, 'string');
      assert.equal(typeof record.integrity, 'string');
      assert.match(record.resolved, /^https:\/\//);
      assert.ok(record.integrity.length > 0);
    }
  });

  it('native package versions match versions declared by rollup', () => {
    const { packages } = loadLockfile();
    const rollup = packageRecord(packages, 'rollup');
    const optional = rollup.optionalDependencies || {};
    for (const name of [
      '@rollup/rollup-linux-x64-gnu',
      '@rollup/rollup-win32-x64-msvc',
    ]) {
      const declared = String(optional[name]).replace(/^[~^]/, '');
      const record = packageRecord(packages, name);
      assert.equal(record.version, declared);
    }
  });

  it('linux rollup native has os=linux and cpu=x64 where present', () => {
    const { packages } = loadLockfile();
    const record = packageRecord(packages, '@rollup/rollup-linux-x64-gnu');
    if (record.os !== undefined) {
      assert.ok(Array.isArray(record.os));
      assert.ok(record.os.includes('linux'));
    }
    if (record.cpu !== undefined) {
      assert.ok(Array.isArray(record.cpu));
      assert.ok(record.cpu.includes('x64'));
    }
  });

  it('windows rollup native has os=win32 and cpu=x64 where present', () => {
    const { packages } = loadLockfile();
    const record = packageRecord(packages, '@rollup/rollup-win32-x64-msvc');
    if (record.os !== undefined) {
      assert.ok(Array.isArray(record.os));
      assert.ok(record.os.includes('win32'));
    }
    if (record.cpu !== undefined) {
      assert.ok(Array.isArray(record.cpu));
      assert.ok(record.cpu.includes('x64'));
    }
  });

  it('required linux and windows esbuild package records exist', () => {
    const { packages } = loadLockfile();
    const linuxRecords = findPackageRecords(packages, '@esbuild/linux-x64');
    const winRecords = findPackageRecords(packages, '@esbuild/win32-x64');
    assert.ok(linuxRecords.length >= 1, 'expected at least one @esbuild/linux-x64 record');
    assert.ok(winRecords.length >= 1, 'expected at least one @esbuild/win32-x64 record');

    for (const [, record] of [...linuxRecords, ...winRecords]) {
      assert.equal(typeof record.version, 'string');
      assert.equal(typeof record.resolved, 'string');
      assert.equal(typeof record.integrity, 'string');
    }

    // Top-level esbuild (if present) must match its declared optional native versions.
    const topEsbuild = packages['node_modules/esbuild'];
    if (topEsbuild?.optionalDependencies) {
      const optional = topEsbuild.optionalDependencies;
      if (optional['@esbuild/linux-x64']) {
        const declared = String(optional['@esbuild/linux-x64']).replace(/^[~^]/, '');
        assert.equal(packages['node_modules/@esbuild/linux-x64']?.version, declared);
      }
      if (optional['@esbuild/win32-x64']) {
        const declared = String(optional['@esbuild/win32-x64']).replace(/^[~^]/, '');
        assert.equal(packages['node_modules/@esbuild/win32-x64']?.version, declared);
      }
    }
  });

  it('npm-install-retry.sh is frozen-lockfile only and fail-closed', () => {
    assert.ok(existsSync(installRetryPath));
    const source = readFileSync(installRetryPath, 'utf8');

    assert.match(source, /npm\s+ci\b/);
    assert.match(source, /--include=optional/);
    assert.doesNotMatch(source, /\brm\s+[^\n]*package-lock\.json\b/);
    assert.doesNotMatch(source, /\bunlink\s+[^\n]*package-lock\.json\b/);
    assert.doesNotMatch(source, /\bnpm\s+install\b/);
    assert.match(source, /rollup\/dist\/native\.js/);
    assert.match(source, /Regenerate and review/i);
  });
});
