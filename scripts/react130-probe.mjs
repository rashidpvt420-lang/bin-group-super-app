import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:4173/';
const failOnAnyPageError = process.env.REACT130_FAIL_ON_ANY_PAGE_ERROR === 'true';

const pageErrors = [];
const reactPageErrors = [];
const consoleErrors = [];
const badResponses = [];

const reactFailurePattern = /Minified React error #130|React error #130|SOVEREIGN_FAILURE|System Interruption|Element type is invalid/i;
const benignNoisePattern = /auth\/|firebase|Firestore|Missing or insufficient permissions|permission-denied|unauthorized-domain|auth\/unauthorized-domain|keychain-keys/i;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('pageerror', (error) => {
  const text = error.stack || error.message || String(error);
  pageErrors.push(text);
  if (reactFailurePattern.test(text)) {
    reactPageErrors.push(text);
  }
});

page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' && reactFailurePattern.test(text)) {
    consoleErrors.push(`[${message.type()}] ${text}`);
  }
});

page.on('response', (response) => {
  const status = response.status();
  const responseUrl = response.url();

  if (status >= 400) {
    // GitHub Codespaces and browser-integrated auth can emit unrelated 401s.
    // Keep them visible, but do not classify them as React #130 failures.
    badResponses.push(`${status} ${responseUrl}`);
  }
});

let bodyText = '';
let navigationError = null;

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
} catch (error) {
  navigationError = error;
} finally {
  await browser.close();
}

const boundaryHit = reactFailurePattern.test(bodyText);
const badHttpFailures = badResponses.filter((entry) => !benignNoisePattern.test(entry));
const hardFailures = [
  ...(navigationError ? [navigationError.stack || navigationError.message || String(navigationError)] : []),
  ...reactPageErrors,
  ...consoleErrors,
  ...(boundaryHit ? ['React error boundary rendered in page body'] : []),
  ...badHttpFailures,
];

console.log('=== PAGE TITLE/BODY SAMPLE ===');
console.log(bodyText.slice(0, 1200));

console.log('\n=== PAGE ERRORS ===');
console.log(pageErrors.length ? pageErrors.join('\n---\n') : 'NO_PAGE_ERRORS');

console.log('\n=== REACT PAGE ERRORS ===');
console.log(reactPageErrors.length ? reactPageErrors.join('\n---\n') : 'NO_REACT_PAGE_ERRORS');

console.log('\n=== HTTP 4XX/5XX ===');
console.log(badResponses.length ? badResponses.join('\n') : 'NO_BAD_RESPONSES');

console.log('\n=== CONSOLE ERRORS ===');
console.log(consoleErrors.length ? consoleErrors.join('\n---\n') : 'NO_CONSOLE_ERRORS');

console.log('\n=== ERROR BOUNDARY ===');
console.log(boundaryHit ? 'FAIL_ERROR_BOUNDARY_RENDERED' : 'NO_ERROR_BOUNDARY_RENDERED');

if (failOnAnyPageError && pageErrors.length) {
  console.error('\nSTRICT_PAGE_ERROR_FAILURE');
  process.exit(1);
}

if (hardFailures.length) {
  console.error('\nREACT_130_PROBE_FAIL');
  console.error(hardFailures.join('\n---\n'));
  process.exit(1);
}

if (pageErrors.length) {
  console.warn('\nNON_BLOCKING_PAGE_ERRORS_DETECTED');
  console.warn('These are not React #130 or SovereignErrorBoundary failures. Run with REACT130_FAIL_ON_ANY_PAGE_ERROR=true to make them blocking.');
}

console.log('\nREACT_130_PROBE_PASS');
