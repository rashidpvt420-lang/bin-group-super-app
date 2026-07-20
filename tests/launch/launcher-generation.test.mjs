import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function pngDimensions(path) {
  const file = readFileSync(path);
  assert.deepEqual([...file.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} must be a PNG`);
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

function expectSquare(path, size) {
  assert.deepEqual(pngDimensions(path), { width: size, height: size }, `${path} must be ${size}x${size}`);
}

test('launcher generator produces complete PWA, Android, and iOS asset sets', () => {
  execFileSync(process.execPath, ['scripts/generate-launcher-assets.mjs'], { stdio: 'pipe' });

  expectSquare('public/icons/bin-group-launcher-192.png', 192);
  expectSquare('public/icons/bin-group-launcher-512.png', 512);
  expectSquare('public/icons/bin-group-launcher-maskable-512.png', 512);
  expectSquare('public/icons/apple-touch-icon.png', 180);
  expectSquare('public/icons/favicon-32.png', 32);

  const androidDensities = {
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  };
  for (const [density, size] of Object.entries(androidDensities)) {
    expectSquare(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`, size);
    expectSquare(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`, size);
  }

  expectSquare('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024);
});

test('every root application build regenerates launcher assets before Vite runs', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(packageJson.scripts?.prebuild, 'node scripts/generate-launcher-assets.mjs');
  assert.match(packageJson.scripts?.mobile?.toString?.() ?? '', /^$/);
  assert.match(packageJson.scripts?.['mobile:sync'] ?? '', /npm run build/);
});
