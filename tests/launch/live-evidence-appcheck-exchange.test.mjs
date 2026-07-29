import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const evidenceRunners = [
  'scripts/run-owner-onboarding-production-evidence.mjs',
  'scripts/run-broker-production-evidence.mjs',
];

test('live owner and broker evidence runners use the production App Check exchange contract', () => {
  for (const scriptPath of evidenceRunners) {
    const source = readFileSync(scriptPath, 'utf8');

    assert.match(
      source,
      /https:\/\/content-firebaseappcheck\.googleapis\.com\/v1\/projects\/\$\{PROJECT_ID\}\/apps\/\$\{encodeURIComponent\(APP_ID\)\}:exchangeDebugToken/,
      `${scriptPath} must use the content App Check exchange endpoint`,
    );
    assert.match(source, /url\.searchParams\.set\('key', API_KEY\)/, `${scriptPath} must bind the API key via URLSearchParams`);
    assert.match(source, /Referer:\s*WEB_REFERER/, `${scriptPath} must send the production web referer for restricted API keys`);
    assert.match(source, /body:\s*JSON\.stringify\(\{\s*debugToken:\s*appCheckDebugToken\s*\}\)/, `${scriptPath} must use the content API debugToken payload shape`);
    assert.doesNotMatch(source, /https:\/\/firebaseappcheck\.googleapis\.com\/v1\/projects/, `${scriptPath} must not use the legacy empty-referrer-prone endpoint`);
    assert.doesNotMatch(source, /debug_token/, `${scriptPath} must not use the legacy debug_token payload shape`);
  }
});
