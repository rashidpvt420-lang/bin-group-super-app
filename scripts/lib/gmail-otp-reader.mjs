import { createHash } from 'node:crypto';

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const GMAIL_TRANSPORT_ATTEMPTS = 3;
const GMAIL_TRANSPORT_RETRY_DELAY_MS = 250;

function abortError(label) {
  const error = new Error(`${label} was aborted.`);
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal, label) {
  if (signal?.aborted) throw abortError(label);
}

function normalizeBase64Url(value) {
  return text(value).replace(/=+$/g, '');
}

export function decodeGmailBase64Url(value, label = 'Gmail MIME body') {
  const raw = text(value);
  if (!raw || !/^[A-Za-z0-9_-]+={0,2}$/.test(raw) || /=/.test(raw.slice(0, -2))) {
    throw new Error(`${label} is not valid base64url.`);
  }
  const normalized = normalizeBase64Url(raw);
  if (normalized.length % 4 === 1) {
    throw new Error(`${label} has an invalid base64url length.`);
  }
  const buffer = Buffer.from(normalized, 'base64url');
  if (buffer.toString('base64url') !== normalized) {
    throw new Error(`${label} failed strict base64url round-trip validation.`);
  }
  return buffer.toString('utf8');
}

function normalizeMessageId(value) {
  return lower(value).replace(/^<|>$/g, '');
}

function headerValue(message, name) {
  const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
  return text(headers.find((entry) => lower(entry?.name) === lower(name))?.value);
}

function headerEmails(message, names) {
  const values = names.map((name) => headerValue(message, name)).filter(Boolean).join(',');
  return [...new Set((values.match(emailPattern) || []).map((entry) => lower(entry)))];
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function gmailJson(fetchImpl, url, options, label) {
  throwIfAborted(options?.signal, label);
  let response;
  for (let attempt = 1; attempt <= GMAIL_TRANSPORT_ATTEMPTS; attempt += 1) {
    try {
      response = await fetchImpl(url, options);
      break;
    } catch {
      if (options?.signal?.aborted) throw abortError(label);
      if (attempt === GMAIL_TRANSPORT_ATTEMPTS) {
        throw new Error(
          `${label} failed before an HTTP response after ${GMAIL_TRANSPORT_ATTEMPTS} transport attempts.`,
        );
      }
      await sleep(GMAIL_TRANSPORT_RETRY_DELAY_MS * attempt, options?.signal, label);
    }
  }
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return body;
}

async function collectMimeText({
  payload,
  messageId,
  accessToken,
  fetchImpl,
  signal,
  label,
}) {
  if (!payload || typeof payload !== 'object') return '';
  const chunks = [];
  const mimeType = lower(payload.mimeType);
  const ownData = text(payload.body?.data);
  if (ownData) {
    const decoded = decodeGmailBase64Url(ownData, `${label} ${mimeType || 'body'}`);
    chunks.push(mimeType === 'text/html' ? stripHtml(decoded) : decoded);
  }
  const attachmentId = text(payload.body?.attachmentId);
  if (attachmentId) {
    const attachment = await gmailJson(
      fetchImpl,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal },
      `${label} attachment read`,
    );
    const decoded = decodeGmailBase64Url(attachment.data, `${label} attachment`);
    chunks.push(mimeType === 'text/html' ? stripHtml(decoded) : decoded);
  }
  for (const part of Array.isArray(payload.parts) ? payload.parts : []) {
    chunks.push(await collectMimeText({
      payload: part,
      messageId,
      accessToken,
      fetchImpl,
      signal,
      label,
    }));
  }
  return chunks.filter(Boolean).join('\n');
}

function sleep(ms, signal, label) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal, label);
    const timer = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(abortError(label));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export async function exchangeGmailAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = globalThis.fetch,
  signal,
  label = 'Gmail mailbox',
}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const credentials = {
    clientId: text(clientId),
    clientSecret: text(clientSecret),
    refreshToken: text(refreshToken),
  };
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error(`${label} OAuth credentials are incomplete.`);
  }
  const result = await gmailJson(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    signal,
  }, `${label} OAuth exchange`);
  const accessToken = text(result.access_token);
  if (!accessToken) throw new Error(`${label} OAuth exchange returned no access token.`);
  return accessToken;
}

export async function verifyGmailMailboxAccess({
  accessToken,
  expectedMailboxEmail,
  fetchImpl = globalThis.fetch,
  signal,
  label = 'Gmail mailbox',
}) {
  const token = text(accessToken);
  const expectedEmail = lower(expectedMailboxEmail);
  if (!token || !expectedEmail.includes('@')) throw new Error(`${label} identity inputs are incomplete.`);
  const headers = { Authorization: `Bearer ${token}` };
  const profile = await gmailJson(
    fetchImpl,
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers, signal },
    `${label} profile verification`,
  );
  if (lower(profile.emailAddress) !== expectedEmail) {
    throw new Error(`${label} OAuth identity does not match the configured mailbox.`);
  }
  const list = await gmailJson(
    fetchImpl,
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1',
    { headers, signal },
    `${label} messages.list sentinel`,
  );
  const sentinelId = text(Array.isArray(list.messages) ? list.messages[0]?.id : '');
  if (!sentinelId) throw new Error(`${label} messages.list sentinel returned no readable message.`);
  const sentinel = await gmailJson(
    fetchImpl,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(sentinelId)}?format=full`,
    { headers, signal },
    `${label} messages.get full sentinel`,
  );
  await collectMimeText({
    payload: sentinel.payload,
    messageId: sentinelId,
    accessToken: token,
    fetchImpl,
    signal,
    label: `${label} sentinel`,
  });
  return {
    mailboxEmail: expectedEmail,
    profileVerified: true,
    listVerified: true,
    fullMessageVerified: true,
  };
}

export async function readGmailOtp({
  accessToken,
  expectedMailboxEmail,
  sender,
  recipient,
  subject,
  correlationId,
  providerMessageId = '',
  requestedAtMs,
  otpPattern,
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = 120000,
  pollIntervalMs = 5000,
  label = 'Gmail OTP',
}) {
  const token = text(accessToken);
  const expectedSender = lower(sender);
  const expectedRecipient = lower(recipient);
  const expectedSubject = text(subject);
  const expectedCorrelation = text(correlationId);
  const requestedAt = Number(requestedAtMs);
  if (!token || !expectedMailboxEmail || !expectedSender || !expectedRecipient || !expectedSubject || !expectedCorrelation) {
    throw new Error(`${label} matching inputs are incomplete.`);
  }
  if (!Number.isFinite(requestedAt) || requestedAt <= 0) throw new Error(`${label} requestedAtMs is invalid.`);
  if (!(otpPattern instanceof RegExp) || otpPattern.global) throw new Error(`${label} otpPattern must be a non-global RegExp.`);
  await verifyGmailMailboxAccess({
    accessToken: token,
    expectedMailboxEmail,
    fetchImpl,
    signal,
    label,
  });
  const deadline = Date.now() + timeoutMs;
  const query = `from:${expectedSender} to:${expectedRecipient} subject:"${expectedSubject.replaceAll('"', '')}" newer_than:1d`;
  while (Date.now() < deadline) {
    throwIfAborted(signal, label);
    const list = await gmailJson(
      fetchImpl,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
      `${label} message search`,
    );
    const matches = [];
    for (const candidate of Array.isArray(list.messages) ? list.messages : []) {
      const gmailMessageId = text(candidate?.id);
      if (!gmailMessageId) continue;
      const message = await gmailJson(
        fetchImpl,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}?format=full`,
        { headers: { Authorization: `Bearer ${token}` }, signal },
        `${label} message read`,
      );
      const internalDate = Number(message.internalDate || 0);
      if (!Number.isFinite(internalDate) || internalDate < requestedAt - 10000 || internalDate > Date.now() + 60000) continue;
      if (!headerEmails(message, ['From']).includes(expectedSender)) continue;
      if (!headerEmails(message, ['To', 'Cc', 'Bcc', 'Delivered-To']).includes(expectedRecipient)) continue;
      if (headerValue(message, 'Subject') !== expectedSubject) continue;
      const receivedProviderMessageId = normalizeMessageId(headerValue(message, 'Message-ID'));
      if (providerMessageId && receivedProviderMessageId !== normalizeMessageId(providerMessageId)) continue;
      const body = await collectMimeText({
        payload: message.payload,
        messageId: gmailMessageId,
        accessToken: token,
        fetchImpl,
        signal,
        label,
      });
      const correlationText = [
        headerValue(message, 'Subject'),
        headerValue(message, 'References'),
        headerValue(message, 'X-BIN-Correlation-ID'),
        body,
      ].join('\n');
      if (!correlationText.includes(expectedCorrelation)) continue;
      const otpMatch = body.match(otpPattern);
      if (!otpMatch?.[1]) continue;
      matches.push({
        otp: otpMatch[1],
        gmailMessageId,
        providerMessageId: receivedProviderMessageId,
        receivedAt: new Date(internalDate).toISOString(),
        messageIdHash: createHash('sha256').update(receivedProviderMessageId || gmailMessageId).digest('hex'),
      });
    }
    if (matches.length > 1) throw new Error(`${label} matched multiple messages; correlation evidence is ambiguous.`);
    if (matches.length === 1) return matches[0];
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), signal, label);
  }
  throw new Error(`${label} timed out without one unique correlated message.`);
}
