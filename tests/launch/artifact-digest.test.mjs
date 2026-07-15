import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { computeValidatedArtifactDigest } from '../../scripts/lib/launch-gate-common.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'artifact-digest-'));
  for (const dir of ['dist/assets', 'apps/admin-panel/build/static/js', 'functions/lib']) {
    mkdirSync(path.join(root, dir), { recursive: true });
  }
  const files = {
    'dist/index.html': '<main>app</main>',
    'dist/assets/app.js': 'app',
    'apps/admin-panel/build/index.html': '<main>admin</main>',
    'apps/admin-panel/build/static/js/main.js': 'admin',
    'functions/lib/runtimeAll.js': 'functions',
    'firebase.json': '{}',
    'firestore.rules': 'rules_version = "2";',
    'firestore.indexes.json': '{"indexes":[]}',
    'storage.rules': 'rules_version = "2";',
    'package-lock.json': '{}',
    'functions/package.json': '{}',
    'functions/package-lock.json': '{}',
  };
  for (const [relative, contents] of Object.entries(files)) {
    writeFileSync(path.join(root, relative), contents);
  }
  return root;
}

describe('complete deploy artifact digest', () => {
  it('fails closed when a required build directory is absent', () => {
    const root = fixture();
    try {
      rmSync(path.join(root, 'functions', 'lib'), { recursive: true, force: true });
      assert.throws(
        () => computeValidatedArtifactDigest(root),
        /missing functions[/\\]lib/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('hashes every asset beyond the former forty-file cutoff', () => {
    const root = fixture();
    try {
      for (let index = 0; index < 45; index += 1) {
        writeFileSync(path.join(root, 'dist', 'assets', `asset-${index}.js`), String(index));
      }
      const before = computeValidatedArtifactDigest(root);
      writeFileSync(path.join(root, 'dist', 'assets', 'asset-44.js'), 'changed');
      const after = computeValidatedArtifactDigest(root);
      assert.notEqual(after, before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds Firebase Functions bytes into the digest', () => {
    const root = fixture();
    try {
      const before = computeValidatedArtifactDigest(root);
      writeFileSync(path.join(root, 'functions', 'lib', 'runtimeAll.js'), 'changed-functions');
      const after = computeValidatedArtifactDigest(root);
      assert.notEqual(after, before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
