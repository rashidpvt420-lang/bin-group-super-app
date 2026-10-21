import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('/ai-design-studio is a public explainer with a sign-in CTA, not a demo redirect', async () => {
  const [app, page] = await Promise.all([readFile('src/App.tsx', 'utf8'), readFile('src/pages/public/PublicAIDesignStudioPage.tsx', 'utf8')]);
  assert.ok(app.includes('<Route path="/ai-design-studio" element={publicOrPilot(<PublicAIDesignStudioPage />)} />'));
  assert.doesNotMatch(app, /demo=ai-design/);
  assert.match(page, /\/login\?returnTo=\/design-studio/);
  assert.match(page, /estimate from BIN GROUP price list rates, not a supplier quotation/);
  assert.match(page, /component="main"/);
});
