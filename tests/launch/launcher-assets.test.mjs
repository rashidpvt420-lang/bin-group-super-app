import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fileUrl = (path) => new URL(`../../${path}`, import.meta.url);
const read = (path) => readFile(fileUrl(path), 'utf8');
const readBinary = (path) => readFile(fileUrl(path));

async function assertPng(path, width, height) {
  const asset = await readBinary(path);
  assert.deepEqual([...asset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} must be a PNG`);
  assert.equal(asset.readUInt32BE(16), width, `${path} width`);
  assert.equal(asset.readUInt32BE(20), height, `${path} height`);
}

test('PWA launcher uses generated raster assets with vector and monochrome fallbacks', async () => {
  const manifest = JSON.parse(await read('public/manifest.json'));
  const index = await read('index.html');

  assert.equal(manifest.theme_color, '#050816');
  assert.equal(manifest.background_color, '#050816');
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.length >= 5);

  const findIcon = (src) => manifest.icons.find((icon) => icon.src === src);
  assert.deepEqual(findIcon('/icons/bin-group-launcher-192.png'), {
    src: '/icons/bin-group-launcher-192.png', type: 'image/png', sizes: '192x192', purpose: 'any',
  });
  assert.deepEqual(findIcon('/icons/bin-group-launcher-512.png'), {
    src: '/icons/bin-group-launcher-512.png', type: 'image/png', sizes: '512x512', purpose: 'any',
  });
  assert.deepEqual(findIcon('/icons/bin-group-launcher-maskable-512.png'), {
    src: '/icons/bin-group-launcher-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable',
  });
  assert.ok(findIcon('/icons/bin-group-launcher.svg'));
  assert.ok(findIcon('/icons/bin-group-launcher-monochrome.svg'));

  for (const icon of manifest.icons) {
    assert.doesNotMatch(icon.src, /logo\.png/);
    if (icon.type === 'image/png') {
      const [width, height] = icon.sizes.split('x').map(Number);
      await assertPng(`public${icon.src}`, width, height);
    } else {
      assert.equal(icon.type, 'image/svg+xml');
      const asset = await read(`public${icon.src}`);
      assert.match(asset, /^<svg\b/);
      assert.match(asset, /viewBox="0 0 512 512"/);
    }
  }

  await assertPng('public/icons/favicon-32.png', 32, 32);
  await assertPng('public/icons/apple-touch-icon.png', 180, 180);
  assert.match(index, /rel="icon" type="image\/png" sizes="32x32" href="\/icons\/favicon-32\.png"/);
  assert.match(index, /rel="icon" type="image\/svg\+xml" href="\/icons\/bin-group-launcher\.svg"/);
  assert.match(index, /rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon\.png"/);
  assert.match(index, /rel="mask-icon" href="\/icons\/bin-group-launcher-monochrome\.svg"/);
  assert.match(index, /name="theme-color" content="#050816"/);
  assert.doesNotMatch(index, /rel="icon"[^>]+logo\.png/);
});

test('Android launcher uses adaptive vector, themed icon, and a valid splash transition', async () => {
  const manifest = await read('android/app/src/main/AndroidManifest.xml');
  const adaptive = await read('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
  const adaptiveRound = await read('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml');
  const themed = await read('android/app/src/main/res/mipmap-anydpi-v33/ic_launcher.xml');
  const themedRound = await read('android/app/src/main/res/mipmap-anydpi-v33/ic_launcher_round.xml');
  const foreground = await read('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
  const monochrome = await read('android/app/src/main/res/drawable/ic_launcher_monochrome.xml');
  const palette = await read('android/app/src/main/res/values/ic_launcher_background.xml');
  const styles = await read('android/app/src/main/res/values/styles.xml');

  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  assert.match(manifest, /android\.intent\.category\.LAUNCHER/);

  for (const source of [adaptive, adaptiveRound, themed, themedRound]) {
    assert.match(source, /@color\/ic_launcher_background/);
    assert.match(source, /@drawable\/ic_launcher_foreground/);
    assert.doesNotMatch(source, /@mipmap\/ic_launcher_foreground/);
  }
  assert.match(themed, /<monochrome android:drawable="@drawable\/ic_launcher_monochrome"/);
  assert.match(themedRound, /<monochrome android:drawable="@drawable\/ic_launcher_monochrome"/);
  assert.match(foreground, /@color\/ic_launcher_gold/);
  assert.match(monochrome, /android:fillColor="#000000"/);
  assert.match(palette, /<color name="ic_launcher_background">#050816<\/color>/);
  assert.match(styles, /windowSplashScreenBackground/);
  assert.match(styles, /windowSplashScreenAnimatedIcon/);
  assert.match(styles, /postSplashScreenTheme/);
});
