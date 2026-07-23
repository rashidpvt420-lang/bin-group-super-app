import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHostedClientBundle } from '../../scripts/verify-hosted-client-config.mjs';

const MAIN_APP_ID = '1:123413252227:web:1111111111111111111111';
const ADMIN_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';

const env = {
  VITE_FIREBASE_APP_ID: MAIN_APP_ID,
  REACT_APP_ADMIN_FIREBASE_APP_ID: ADMIN_APP_ID,
};

test('main hosted bundle is checked against the main Firebase web app ID', () => {
  const summary = summarizeHostedClientBundle({
    site: 'main',
    assetCount: 1,
    texts: [`const appId=${JSON.stringify(MAIN_APP_ID)}`],
    env,
  });

  assert.equal(summary.firebaseAppIdMatched, true);
});

test('Admin hosted bundle is checked against the dedicated Admin Firebase web app ID', () => {
  const summary = summarizeHostedClientBundle({
    site: 'admin',
    assetCount: 1,
    texts: [`const appId=${JSON.stringify(ADMIN_APP_ID)}`],
    env,
  });

  assert.equal(summary.firebaseAppIdMatched, true);
});

test('Admin hosted bundle cannot satisfy verification with only the main app ID', () => {
  const summary = summarizeHostedClientBundle({
    site: 'admin',
    assetCount: 1,
    texts: [`const appId=${JSON.stringify(MAIN_APP_ID)}`],
    env,
  });

  assert.equal(summary.firebaseAppIdMatched, false);
});

test('Admin hosted verification uses the canonical public Admin app ID when no override is supplied', () => {
  const summary = summarizeHostedClientBundle({
    site: 'admin',
    assetCount: 1,
    texts: [`const appId=${JSON.stringify(ADMIN_APP_ID)}`],
    env: { VITE_FIREBASE_APP_ID: MAIN_APP_ID },
  });

  assert.equal(summary.firebaseAppIdMatched, true);
});
