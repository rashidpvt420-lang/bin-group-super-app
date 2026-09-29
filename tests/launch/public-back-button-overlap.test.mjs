import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('public homes and request-demo keep back navigation in document flow', async () => {
  const [nav, homes, demo] = await Promise.all([
    read('src/components/navigation/NavigationControl.tsx'),
    read('src/pages/public/PublicHomeDiscoveryPage.tsx'),
    read('src/pages/public/DemoVideosPage.tsx'),
  ]);

  assert.match(nav, /inFlowNavigationRoutes = new Set\(\['\/homes', '\/request-demo', '\/videos'\]\)/);
  assert.match(nav, /inFlowNavigationRoutes\.has\(location\.pathname\)/);
  assert.match(nav, /position: 'fixed'/);

  const homesBack = homes.slice(homes.indexOf('data-testid="public-home-back"'), homes.indexOf("copy('public.home.title'"));
  assert.match(homesBack, /position: 'static'/);
  assert.doesNotMatch(homesBack, /position: 'fixed'/);
  assert.match(homesBack, /alignSelf: 'flex-start'/);

  assert.match(demo, /data-testid="request-demo-home"/);
  assert.match(demo, /href="\/"/);
  const demoHeading = demo.slice(demo.indexOf('variant="h1"') - 80, demo.indexOf('variant="h1"') + 40);
  assert.doesNotMatch(demoHeading, /position:\s*'fixed'/);
});
