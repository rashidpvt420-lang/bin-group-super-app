import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('public privacy and terms routes serve the reviewed static legal documents', async () => {
  const [app, redirect, privacy, terms, privacyAlias, termsAlias] = await Promise.all([
    read('src/App.tsx'),
    read('src/pages/public/LegalRedirect.tsx'),
    read('public/privacy-policy.html'),
    read('public/terms-of-service.html'),
    read('public/privacy.html'),
    read('public/terms.html'),
  ]);

  assert.match(app, /path="\/privacy" element=\{<LegalRedirect to="\/privacy\.html" \/>\}/);
  assert.match(app, /path="\/privacy-policy" element=\{<LegalRedirect to="\/privacy-policy\.html" \/>\}/);
  assert.match(app, /path="\/terms" element=\{<LegalRedirect to="\/terms\.html" \/>\}/);
  assert.match(app, /path="\/terms-of-service" element=\{<LegalRedirect to="\/terms-of-service\.html" \/>\}/);
  assert.doesNotMatch(app, /element=\{<PrivacyPage/);
  assert.doesNotMatch(app, /element=\{<TermsPage/);

  assert.match(redirect, /window\.location\.replace\('\/privacy-policy\.html'\)/);
  assert.match(redirect, /window\.location\.replace\('\/privacy\.html'\)/);
  assert.match(redirect, /window\.location\.replace\('\/terms-of-service\.html'\)/);
  assert.match(redirect, /window\.location\.replace\('\/terms\.html'\)/);

  for (const doc of [privacy, privacyAlias]) {
    assert.match(doc, /<h1>Privacy Policy<\/h1>/);
    assert.match(doc, /All Kind Building Projects Contracting L\.L\.C S\.P\.C/);
    assert.match(doc, /src="\/boot-init\.js"/);
    assert.doesNotMatch(doc, />Title<|>Desc<|>Contact Info</);
  }
  for (const doc of [terms, termsAlias]) {
    assert.match(doc, /<h1>Terms of Service<\/h1>/);
    assert.match(doc, /United Arab Emirates/);
    assert.match(doc, /src="\/boot-init\.js"/);
    assert.doesNotMatch(doc, />Title<|>Desc<|>Contact Info</);
  }
});
