import { chromium } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:4173/';

const pageErrors = [];
const consoleErrors = [];
const badResponses = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('pageerror', (error) => {
  pageErrors.push(error.stack || error.message || String(error));
});

page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' || /Minified React error|React error #130|SOVEREIGN_FAILURE|System Interruption/i.test(text)) {
    consoleErrors.push(`[${message.type()}] ${text}`);
  }
});

page.on('response', (response) => {
  const status = response.status();
  if (status >= 400) {
    badResponses.push(`${status} ${response.url()}`);
  }
});

let bodyText = '';

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  bodyText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
} finally {
  await browser.close();
}

const boundaryHit = /System Interruption|SOVEREIGN_FAILURE|Minified React error #130|React error #130/i.test(bodyText);

console.log('=== PAGE TITLE/BODY SAMPLE ===');
console.log(bodyText.slice(0, 1200));

console.log('\n=== PAGE ERRORS ===');
console.log(pageErrors.length ? pageErrors.join('\n---\n') : 'NO_PAGE_ERRORS');

console.log('\n=== HTTP 4XX/5XX ===');
console.log(badResponses.length ? badResponses.join('\n') : 'NO_BAD_RESPONSES');

console.log('\n=== CONSOLE ERRORS ===');
console.log(consoleErrors.length ? consoleErrors.join('\n---\n') : 'NO_CONSOLE_ERRORS');

console.log('\n=== ERROR BOUNDARY ===');
console.log(boundaryHit ? 'FAIL_ERROR_BOUNDARY_RENDERED' : 'NO_ERROR_BOUNDARY_RENDERED');

if (pageErrors.length || badResponses.length || consoleErrors.length || boundaryHit) {
  process.exit(1);
}

console.log('\nREACT_130_PROBE_PASS');
