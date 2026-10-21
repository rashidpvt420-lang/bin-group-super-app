import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('/about, /about-us, /company and /company-profile render the company profile page', async () => {
  const app = await readFile('src/App.tsx', 'utf8');
  assert.match(app, /import\('\.\/pages\/public\/CompanyProfilePage'\)/);
  for (const r of ['/company', '/company-profile', '/about', '/about-us']) {
    assert.ok(app.includes(`<Route path="${r}" element={publicOrPilot(<CompanyProfilePage />)} />`), r);
  }
  assert.doesNotMatch(app, /Navigate to="\/#company-profile"/);
});
