const text = (value) => String(value ?? '').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeMessageId = (value) => text(value).replace(/^<|>$/g, '').toLowerCase();

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required for real Broker mailbox delivery evidence.`);
  return value;
}

async function jsonRequest(url, options, label) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) throw new Error(`${label} failed HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function gmailAccessToken() {
  const clientId = required('E2E_BROKER_GMAIL_CLIENT_ID');
  const clientSecret = required('E2E_BROKER_GMAIL_CLIENT_SECRET');
  const refreshToken = required('E2E_BROKER_GMAIL_REFRESH_TOKEN');
  const body = await jsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  }, 'Broker Gmail OAuth refresh');
  const accessToken = text(body.access_token);
  if (!accessToken) throw new Error('Broker Gmail OAuth refresh did not return an access token.');
  return accessToken;
}

function headerMap(payload = {}) {
  const values = Array.isArray(payload.headers) ? payload.headers : [];
  return Object.fromEntries(values.map((header) => [text(header.name).toLowerCase(), text(header.value)]));
}

async function listMessages(accessToken, query) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '20');
  const body = await jsonRequest(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 'Broker Gmail message search');
  return Array.isArray(body.messages) ? body.messages : [];
}

async function readMetadata(accessToken, id) {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set('format', 'metadata');
  for (const name of ['From', 'To', 'Subject', 'Message-ID', 'Date']) url.searchParams.append('metadataHeaders', name);
  return jsonRequest(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 'Broker Gmail message metadata');
}

export async function waitForBrokerMailboxReceipt({
  providerMessageId,
  brokerEmail,
  sentAfterMs,
  timeoutMs = 120_000,
}) {
  const expectedProviderId = normalizeMessageId(providerMessageId);
  const expectedRecipient = text(brokerEmail).toLowerCase();
  if (!expectedProviderId || !expectedRecipient) {
    throw new Error('providerMessageId and brokerEmail are required for Broker mailbox evidence.');
  }

  const accessToken = await gmailAccessToken();
  const afterUnix = Math.max(0, Math.floor(Number(sentAfterMs || Date.now() - 60_000) / 1000) - 60);
  const query = `from:ceo@bin-groups.com subject:"BIN GROUP payout verification code" after:${afterUnix}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const candidates = await listMessages(accessToken, query);
    for (const candidate of candidates) {
      const metadata = await readMetadata(accessToken, candidate.id);
      const headers = headerMap(metadata.payload || {});
      const mailboxMessageId = normalizeMessageId(headers['message-id']);
      const from = text(headers.from);
      const to = text(headers.to).toLowerCase();
      const subject = text(headers.subject);
      const receivedAt = Number(metadata.internalDate || 0);
      if (
        mailboxMessageId === expectedProviderId &&
        /ceo@bin-groups\.com/i.test(from) &&
        to.includes(expectedRecipient) &&
        subject === 'BIN GROUP payout verification code' &&
        receivedAt >= afterUnix * 1000
      ) {
        return {
          mailboxReceived: true,
          mailboxMessageId,
          providerMessageId: expectedProviderId,
          recipientVerified: true,
          brandedSenderVerified: true,
          subjectVerified: true,
          receivedAt: new Date(receivedAt).toISOString(),
          gmailThreadId: text(metadata.threadId),
        };
      }
    }
    await sleep(5_000);
  }

  throw new Error(`Broker mailbox did not receive provider message ${providerMessageId} before the evidence timeout.`);
}
