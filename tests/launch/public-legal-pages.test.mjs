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

test('public legal pages are bilingual, withdraw the old fee and SOS wording, and use the founder-approved entity and commercial terms', async () => {
  const files = [
    'public/terms-of-service.html',
    'public/terms.html',
    'public/privacy-policy.html',
    'public/privacy.html',
    'public/delete-account.html',
  ];
  for (const path of files) {
    const doc = await read(path);
    assert.match(doc, /All Kind Building Projects Contracting L\.L\.C S\.P\.C, trading as BIN GROUP L\.L\.C - S\.P\.C/);
    assert.match(doc, /CN-5914744/);
    assert.match(doc, /Abu Dhabi/);
    assert.match(doc, /Arabic text prevails/);
    assert.match(doc, /يُعتد بالنص العربي/);
    assert.match(doc, /for counsel to confirm/);
    assert.doesNotMatch(doc, /automatically deducted from your monthly rental/i);
    assert.doesNotMatch(doc, /BIN CONSTRUCTION - GENERAL MAINTENANCE LLC/);
  }
  const terms = await read('public/terms-of-service.html');
  assert.match(terms, /13-month term/);
  assert.match(terms, /first month's management fee is AED 0/);
  assert.match(terms, /15% mobilisation/);
  assert.match(terms, /AED 50,000 per property contract/);
  assert.match(terms, /never suspended without separate written notice/);
  assert.match(terms, /days 1–7: 0%/);
  assert.match(terms, /Commercial Invoice/);
  assert.match(terms, /withdrawn|replace the previous public Terms/i);
  assert.match(terms, /two-strike SOS/);
  const privacy = await read('public/privacy-policy.html');
  assert.match(privacy, /active duty/);
  assert.match(privacy, /third-party AI processors/);
  assert.match(privacy, /10 years/);
  const deletion = await read('public/delete-account.html');
  assert.match(deletion, /10 years/);
  assert.match(deletion, /حذف الحساب/);
});
