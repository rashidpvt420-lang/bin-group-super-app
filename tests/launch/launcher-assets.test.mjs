import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('PWA launcher uses dedicated vector assets and store-compatible sizes', async () => {
  const manifest = JSON.parse(await read('public/manifest.json'));
  const index = await read('index.html');

  assert.equal(manifest.theme_color, '#050816');
  assert.equal(manifest.background_color, '#050816');
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.length >= 5);

  const purposes = new Set(manifest.icons.map((icon) => icon.purpose));
  const sizes = new Set(manifest.icons.map((icon) => icon.sizes));
  assert.ok(purposes.has('any'));
  assert.ok(purposes.has('maskable'));
  assert.ok(purposes.has('monochrome'));
  assert.ok(sizes.has('192x192'));
  assert.ok(sizes.has('512x512'));
  assert.ok(sizes.has('any'));

  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/svg+xml');
    assert.doesNotMatch(icon.src, /logo\.png/);
    const asset = await read(`public${icon.src}`);
    assert.match(asset, /^<svg\b/);
    assert.match(asset, /viewBox="0 0 512 512"/);
  }

  assert.match(index, /rel="icon" type="image\/svg\+xml" href="\/icons\/bin-group-launcher\.svg"/);
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
