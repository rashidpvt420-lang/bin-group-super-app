#!/usr/bin/env node

/**
 * Validates E2E Mailbox credentials using OAuth 2.0 and the Gmail API.
 * Ensures the credentials in the environment actually map to the
 * correct E2E_OWNER_MAILBOX_EMAIL and E2E_BROKER_MAILBOX_EMAIL identities,
 * and that the OAuth grant includes gmail.readonly read access against a
 * permanent harmless sentinel message.
 *
 * Error messages intentionally omit response bodies and raw email addresses
 * to prevent credential or identity leakage in CI logs.
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SENTINEL_TEXT = 'BIN_GROUP_E2E_MAILBOX_SENTINEL';

/** Exchange a refresh token for an access token. Throws with a redacted message on failure. */
async function exchangeRefreshTokenForAccessToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams();
  params.append('client_id',     clientId);
  params.append('client_secret', clientSecret);
  params.append('refresh_token', refreshToken);
  params.append('grant_type',    'refresh_token');

  const response = await fetch(OAUTH_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!response.ok) {
    // Deliberately discard response body — it may echo client_secret or grant details.
    throw new Error(
      `operation=token_exchange status=${response.status} category=oauth_failure`,
    );
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(
      'operation=token_exchange status=200 category=missing_access_token',
    );
  }
  return data.access_token;
}

/** Fetch the authenticated Gmail profile to confirm identity. */
async function fetchGmailProfile(accessToken) {
  const response = await fetch(`${GMAIL_BASE_URL}/profile`, {
    method:  'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept:        'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `operation=gmail_profile status=${response.status} category=gmail_api_failure`,
    );
  }

  const data = await response.json();
  if (!data.emailAddress) {
    throw new Error(
      'operation=gmail_profile status=200 category=missing_email_address',
    );
  }
  return data.emailAddress;
}

/**
 * Issue a messages.list request for the permanent harmless sentinel. Empty
 * results are a failure because an empty mailbox does not prove body read scope.
 */
async function probeMessagesListReadScope(accessToken, sentinelMessageId) {
  const url = `${GMAIL_BASE_URL}/messages?maxResults=10&q=${encodeURIComponent(SENTINEL_TEXT)}`;
  const response = await fetch(url, {
    method:  'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept:        'application/json',
    },
  });

  if (!response.ok) {
    // Classify error category without exposing body
    const category = response.status === 403 ? 'insufficient_scope_or_permission_denied'
                   : response.status === 401 ? 'invalid_or_expired_token'
                   : 'gmail_api_failure';
    throw new Error(
      `operation=messages_list status=${response.status} category=${category}`,
    );
  }
  const data = await response.json();
  const messages = Array.isArray(data.messages) ? data.messages : [];
  if (!messages.length) {
    throw new Error('operation=messages_list status=200 category=sentinel_absent');
  }
  if (!messages.some((message) => message?.id === sentinelMessageId)) {
    throw new Error('operation=messages_list status=200 category=sentinel_id_mismatch');
  }
}

function decodeBase64Url(encoded) {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(String(encoded || ''))) {
    throw new Error('operation=decode_body category=invalid_base64url');
  }
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  return Buffer.from(base64, 'base64').toString('utf8');
}

function extractText(payload) {
  if (!payload) return '';
  const plain = [];
  const html = [];
  const visit = (part) => {
    const mimeType = String(part?.mimeType || '').toLowerCase();
    if (part?.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (mimeType === 'text/html') html.push(decoded.replace(/<[^>]+>/g, ' '));
      else if (!mimeType || mimeType === 'text/plain') plain.push(decoded);
    }
    for (const child of part?.parts || []) visit(child);
  };
  visit(payload);
  return (plain.length ? plain : html).join('\n');
}

async function probeFullBodyReadScope(accessToken, sentinelMessageId) {
  const response = await fetch(`${GMAIL_BASE_URL}/messages/${encodeURIComponent(sentinelMessageId)}?format=full`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const category = response.status === 403 ? 'insufficient_scope_or_permission_denied'
      : response.status === 404 ? 'sentinel_absent'
      : response.status === 401 ? 'invalid_or_expired_token'
      : 'gmail_api_failure';
    throw new Error(`operation=messages_get_full status=${response.status} category=${category}`);
  }
  const data = await response.json();
  const text = extractText(data.payload);
  if (!text.includes(SENTINEL_TEXT)) {
    throw new Error('operation=messages_get_full status=200 category=sentinel_body_mismatch');
  }
}

export async function verifyOtpMailboxes() {
  const mailboxes = [
    {
      role:          'Owner',
      expectedEmail: process.env.E2E_OWNER_MAILBOX_EMAIL,
      clientId:      process.env.E2E_OWNER_MAILBOX_CLIENT_ID,
      clientSecret:  process.env.E2E_OWNER_MAILBOX_CLIENT_SECRET,
      refreshToken:  process.env.E2E_OWNER_MAILBOX_REFRESH_TOKEN,
      sentinelMessageId: process.env.E2E_OWNER_MAILBOX_SENTINEL_MESSAGE_ID,
    },
    {
      role:          'Broker',
      expectedEmail: process.env.E2E_BROKER_MAILBOX_EMAIL,
      clientId:      process.env.E2E_BROKER_MAILBOX_CLIENT_ID,
      clientSecret:  process.env.E2E_BROKER_MAILBOX_CLIENT_SECRET,
      refreshToken:  process.env.E2E_BROKER_MAILBOX_REFRESH_TOKEN,
      sentinelMessageId: process.env.E2E_BROKER_MAILBOX_SENTINEL_MESSAGE_ID,
    },
  ];

  const failures = [];

  for (const mailbox of mailboxes) {
    const { role, expectedEmail, clientId, clientSecret, refreshToken, sentinelMessageId } = mailbox;

    if (!expectedEmail || !clientId || !clientSecret || !refreshToken || !sentinelMessageId) {
      const ROLE_UC = role.toUpperCase();
      failures.push(
        `Missing variables for ${role} mailbox: ` +
        `E2E_${ROLE_UC}_MAILBOX_EMAIL, E2E_${ROLE_UC}_MAILBOX_CLIENT_ID, ` +
        `E2E_${ROLE_UC}_MAILBOX_CLIENT_SECRET, E2E_${ROLE_UC}_MAILBOX_REFRESH_TOKEN, ` +
        `E2E_${ROLE_UC}_MAILBOX_SENTINEL_MESSAGE_ID`,
      );
      continue;
    }

    try {
      const accessToken  = await exchangeRefreshTokenForAccessToken(clientId, clientSecret, refreshToken);
      const emailAddress = await fetchGmailProfile(accessToken);

      if (emailAddress.toLowerCase() !== expectedEmail.toLowerCase()) {
        // Do not print either address — log only that they diverged.
        failures.push(`${role} mailbox identity mismatch (expected vs actual addresses differ)`);
        continue;
      }

      // Confirm gmail.readonly is actually scoped in the grant.
      await probeMessagesListReadScope(accessToken, sentinelMessageId);
      await probeFullBodyReadScope(accessToken, sentinelMessageId);

      console.log(`[preflight] ${role} mailbox verified (profile + list + full-body sentinel passed)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      failures.push(`${role} mailbox verification failed: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`OTP Mailbox verification failed:\n  ${failures.join('\n  ')}`);
  }

  console.log('[preflight] OTP mailbox preflight passed — both mailboxes verified with read-scope confirmation.');
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  verifyOtpMailboxes().catch((error) => {
    console.error(`\n[production-otp-mailbox-preflight] ${error.message}\n`);
    process.exit(1);
  });
}
