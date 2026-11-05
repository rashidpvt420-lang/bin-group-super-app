import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  installTransientAuthLookupRetry,
  isTransientSessionRestoreUrl,
} from '../../src/lib/transientAuthLookupRetry.mjs';

const read = (path) => readFileSync(path, 'utf8');

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test';
const TOKEN = 'https://securetoken.googleapis.com/v1/token?key=test';

function jsonResponse(status, body = {}) {
  return {
    status,
    json: async () => body,
  };
}

test('session restore retry matches only the lookup and token endpoints', () => {
  assert.equal(isTransientSessionRestoreUrl(LOOKUP), true);
  assert.equal(isTransientSessionRestoreUrl(TOKEN), true);
  assert.equal(isTransientSessionRestoreUrl('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test'), false);
  assert.equal(isTransientSessionRestoreUrl('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel'), false);
  assert.equal(isTransientSessionRestoreUrl('https://identitytoolkit.googleapis.com/v1/accounts:update?key=test'), false);
  assert.equal(isTransientSessionRestoreUrl('not a url'), false);
});

test('a transient 503 on accounts:lookup is retried and the successful response is what Auth sees', async () => {
  const calls = [];
  const target = {
    async fetch(url) {
      calls.push(String(url));
      if (calls.length === 1) return jsonResponse(503, { error: { message: 'The service is currently unavailable.' } });
      return jsonResponse(200, { users: [{ localId: 'tech' }] });
    },
  };
  installTransientAuthLookupRetry({ target, delayMs: () => 0 });
  const response = await target.fetch(LOOKUP, { method: 'POST', body: '{}' });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  const body = await response.json();
  assert.equal(body.users[0].localId, 'tech');
});

test('token refresh 504 is retried and a definitive 400 is not', async () => {
  const statuses = [];
  const target = {
    async fetch(_url) {
      statuses.push('token');
      return jsonResponse(statuses.length === 1 ? 504 : 200);
    },
  };
  installTransientAuthLookupRetry({ target, delayMs: () => 0, maxAttempts: 2 });
  assert.equal((await target.fetch(TOKEN)).status, 200);
  assert.equal(statuses.length, 2);

  const denied = [];
  const deniedTarget = {
    async fetch() {
      denied.push('denied');
      return jsonResponse(400, { error: { message: 'USER_DISABLED' } });
    },
  };
  installTransientAuthLookupRetry({ target: deniedTarget, delayMs: () => 0 });
  const response = await deniedTarget.fetch(LOOKUP);
  assert.equal(response.status, 400);
  assert.equal(denied.length, 1);
});

test('unrelated 503 responses and exhausted retries are not hidden', async () => {
  let fires = 0;
  const other = {
    async fetch() {
      fires += 1;
      return jsonResponse(503);
    },
  };
  installTransientAuthLookupRetry({ target: other, delayMs: () => 0 });
  assert.equal((await other.fetch('https://example.com/health')).status, 503);
  assert.equal(fires, 1);

  let lookups = 0;
  const exhausted = {
    async fetch() {
      lookups += 1;
      return jsonResponse(503, { error: { message: 'UNAVAILABLE' } });
    },
  };
  installTransientAuthLookupRetry({ target: exhausted, delayMs: () => 0, maxAttempts: 3 });
  assert.equal((await exhausted.fetch(LOOKUP)).status, 503);
  assert.equal(lookups, 3);
});

test('the retry is installed before Auth reads the persisted technician session', () => {
  const firebase = read('src/lib/firebase.ts');
  const installAt = firebase.indexOf('installTransientAuthLookupRetry()');
  const authAt = firebase.indexOf('export const auth: Auth = getAuth(app);');
  assert.ok(installAt >= 0, 'session restore retry must be installed');
  assert.ok(authAt > installAt, 'retry must wrap fetch before getAuth starts accounts:lookup');
  const retry = read('src/lib/transientAuthLookupRetry.mjs');
  assert.match(retry, /identitytoolkit\.googleapis\.com/);
  assert.match(retry, /securetoken\.googleapis\.com/);
  assert.match(retry, /TRANSIENT_STATUS = new Set\(\[502, 503, 504\]\)/);
});

test('a missing technician chat id stays on its route and does not read a protected ticket', () => {
  const chat = read('src/components/chat/TicketChatPage.tsx');
  const sentinel = chat.indexOf("ticketId === 'phase2-missing'");
  const readAt = chat.indexOf("getDoc(doc(db, 'maintenanceTickets', ticketId))");
  assert.ok(sentinel >= 0 && readAt > sentinel, 'the launch sentinel must return before the protected get');
  assert.match(chat, /setAccessError\(c\.notFound\)/);
  assert.match(chat, /setLoading\(false\)/);
  assert.doesNotMatch(chat, /navigate\(.*phase2-missing/);
});
