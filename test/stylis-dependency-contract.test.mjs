import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockfile = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

describe('Stylis dependency contract', () => {
  it('requires the validated Stylis and RTL plugin ranges', () => {
    assert.equal(manifest.dependencies.stylis, '^4.2.0');
    assert.equal(manifest.dependencies['stylis-plugin-rtl'], '^2.1.1');
  });

  it('keeps the lockfile root dependency ranges coherent with package.json', () => {
    const lockedDependencies = lockfile.packages?.['']?.dependencies;

    assert.equal(lockedDependencies?.stylis, manifest.dependencies.stylis);
    assert.equal(
      lockedDependencies?.['stylis-plugin-rtl'],
      manifest.dependencies['stylis-plugin-rtl'],
    );
  });

  it('contains a resolved Stylis 4.x package record', () => {
    const stylis = lockfile.packages?.['node_modules/stylis'];

    assert.match(stylis?.version ?? '', /^4\.\d+\.\d+$/);
    assert.match(
      stylis?.resolved ?? '',
      /^https:\/\/registry\.npmjs\.org\/stylis\/-\/stylis-4\.\d+\.\d+\.tgz$/,
    );
    assert.match(stylis?.integrity ?? '', /^sha512-/);
  });

  it('keeps stylis-plugin-rtl 2.1.1 bound to Stylis 4.x', () => {
    const rtlPlugin = lockfile.packages?.['node_modules/stylis-plugin-rtl'];

    assert.equal(rtlPlugin?.version, '2.1.1');
    assert.equal(rtlPlugin?.peerDependencies?.stylis, '4.x');
  });

  it('contains no Stylis 5.x dependency requirement', () => {
    const stylisRequirements = [];

    const collectRequirements = (value) => {
      if (!value || typeof value !== 'object') return;

      for (const [key, child] of Object.entries(value)) {
        if (key === 'stylis' && typeof child === 'string') {
          stylisRequirements.push(child);
        } else {
          collectRequirements(child);
        }
      }
    };

    collectRequirements(manifest);
    collectRequirements(lockfile);

    assert.ok(stylisRequirements.length > 0);
    assert.equal(
      stylisRequirements.some((requirement) => /(?:^|[~^<>=\s])5(?:\.|$)/.test(requirement)),
      false,
      `unexpected Stylis 5.x requirement: ${stylisRequirements.join(', ')}`,
    );
  });
});
