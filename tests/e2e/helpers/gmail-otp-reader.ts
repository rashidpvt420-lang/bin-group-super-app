/**
 * gmail-otp-reader.ts
 *
 * Reads the most-recent OTP code from a Gmail inbox using the Gmail REST API
 * with OAuth 2.0 refresh-token flow. Credentials are sourced exclusively from
 * process.env — the same secrets injected into .env.e2e by the CI workflow.
 *
 * Exported API:
 *   getLatestOtp(role, options?) → Promise<string>
 *
 * role: 'owner' | 'broker'
 *
 * Options:
 *   timeoutMs     – max wall-time to wait for the email   (default 60 000)
 *   pollMs        – interval between Gmail polls           (default 4 000)
 *   afterMs       – only consider emails sent AFTER this   (default: now - 5 min)
 *   subjectHint   – additional subject keyword to filter   (default undefined)
 *   correlationId – require this server-issued reference in the message
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessagePayload {
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

async function exchangeRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    // Do not include the response body — it may echo secrets.
    throw new Error(`[gmail-otp-reader] Token exchange failed: ${res.status} ${res.statusText}`);
  }

  const json: { access_token?: string } = await res.json();
  if (!json.access_token) {
    throw new Error('[gmail-otp-reader] Token exchange response missing access_token');
  }
  return json.access_token;
}

async function listMessages(
  accessToken: string,
  query: string,
): Promise<Array<{ id: string; threadId: string }>> {
  // Gmail excludes Spam and Trash from messages.list unless includeSpamTrash is
  // explicitly enabled. Production delivery evidence must observe a fresh OTP
  // regardless of mailbox classification; freshness/correlation below remain
  // fail-closed, so widening folder visibility cannot make a stale code valid.
  const url = `${GMAIL_BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=10&includeSpamTrash=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] messages.list failed: ${res.status} ${res.statusText}`);
  }

  const json: { messages?: Array<{ id: string; threadId: string }> } = await res.json();
  return json.messages ?? [];
}

async function listRecentMessages(
  accessToken: string,
): Promise<Array<{ id: string; threadId: string }>> {
  // This fallback is used only when the caller supplied a server-issued
  // correlation ID. Freshness and exact correlation are still enforced below.
  const url = `${GMAIL_BASE_URL}/messages?maxResults=25&includeSpamTrash=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] recent messages.list failed: ${res.status} ${res.statusText}`);
  }

  const json: { messages?: Array<{ id: string; threadId: string }> } = await res.json();
  return json.messages ?? [];
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  try {
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

async function getAttachmentText(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const url = `${GMAIL_BASE_URL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] attachment read failed: ${res.status} ${res.statusText}`);
  }

  const json: { data?: string } = await res.json();
  return json.data ? decodeBase64Url(json.data) : '';
}

async function collectMessageBody(
  part: GmailMessagePart | undefined,
  accessToken: string,
  messageId: string,
): Promise<string> {
  if (!part) return '';
  const chunks: string[] = [];
  const mimeType = String(part.mimeType ?? '').toLowerCase();
  const isTextPart = !mimeType || mimeType.startsWith('text/');
  const bodyData = String(part.body?.data ?? '');
  const attachmentId = String(part.body?.attachmentId ?? '');

  // OTP mail is currently plain text, but parsing both text/plain and text/html
  // keeps the evidence reader resilient if the transactional template changes.
  if (bodyData && isTextPart) {
    const decoded = decodeBase64Url(bodyData);
    if (decoded) chunks.push(decoded);
  }

  // Gmail may move even a text MIME body behind body.attachmentId. Fetching the
  // attachment-backed text prevents format=full from becoming snippet-only in
  // practice for larger or provider-transformed transactional messages.
  if (attachmentId && isTextPart) {
    const decodedAttachment = await getAttachmentText(accessToken, messageId, attachmentId);
    if (decodedAttachment) chunks.push(decodedAttachment);
  }

  for (const child of part.parts ?? []) {
    const decodedChild = await collectMessageBody(child, accessToken, messageId);
    if (decodedChild) chunks.push(decodedChild);
  }

  return chunks.join('\n');
}

async function getMessageContent(
  accessToken: string,
  messageId: string,
): Promise<{ content: string; internalDate: string; labelIds: string[] }> {
  // Fetch the full MIME payload. Gmail snippets are intentionally abbreviated
  // and are not a reliable source of a security code for production evidence.
  const url = `${GMAIL_BASE_URL}/messages/${encodeURIComponent(messageId)}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] messages.get failed: ${res.status} ${res.statusText}`);
  }

  const json: GmailMessagePayload = await res.json();
  const snippet = String(json.snippet ?? '');
  const body = await collectMessageBody(json.payload, accessToken, messageId);
  return {
    content: [snippet, body].filter(Boolean).join('\n'),
    internalDate: String(json.internalDate ?? '0'),
    labelIds: Array.isArray(json.labelIds) ? json.labelIds.map((label) => String(label).toUpperCase()) : [],
  };
}

function mailboxLocation(labelIds: string[]): 'spam' | 'trash' | 'inbox' | 'other' {
  if (labelIds.includes('SPAM')) return 'spam';
  if (labelIds.includes('TRASH')) return 'trash';
  if (labelIds.includes('INBOX')) return 'inbox';
  return 'other';
}

/** Extract the first 6-digit numeric code found in text. */
function extractOtpCode(text: string): string | null {
  const match = text.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface GmailOtpOptions {
  /** Max wall-time in ms to wait for the email to arrive (default: 60 000). */
  timeoutMs?: number;
  /** Interval between Gmail API polls (default: 4 000). */
  pollMs?: number;
  /**
   * Only consider emails whose internalDate (ms since epoch) is >= this value.
   * Defaults to 5 minutes before the call starts, to avoid picking up stale codes.
   */
  afterMs?: number;
  /** Optional extra keyword to narrow the Gmail search query. */
  subjectHint?: string;
  /** Optional server-issued reference that must occur in the matching email. */
  correlationId?: string;
}

/**
 * Polls the designated mailbox for a 6-digit OTP sent in the most-recent
 * matching email and returns the code as a string.
 *
 * Freshness is enforced by Gmail internalDate instead of read/unread state.
 * A mail client, mobile notification, or inbox rule may mark a legitimate OTP
 * as read before CI polls it; read state must therefore never be a launch gate.
 * When a correlationId is supplied, a candidate must also contain the exact
 * server-issued reference so a prior fresh OTP can never satisfy a later challenge.
 * Spam and Trash are searched too, but those folders never bypass freshness or
 * correlation; their counts are emitted only as sanitized delivery diagnostics.
 *
 * @param role - 'owner' | 'broker'
 * @throws if credentials are missing or no OTP is found before timeout
 */
export async function getLatestOtp(
  role: 'owner' | 'broker',
  options: GmailOtpOptions = {},
): Promise<string> {
  const PREFIX = role.toUpperCase(); // 'OWNER' | 'BROKER'

  const clientId = process.env[`E2E_${PREFIX}_MAILBOX_CLIENT_ID`] ?? '';
  const clientSecret = process.env[`E2E_${PREFIX}_MAILBOX_CLIENT_SECRET`] ?? '';
  const refreshToken = process.env[`E2E_${PREFIX}_MAILBOX_REFRESH_TOKEN`] ?? '';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `[gmail-otp-reader] Missing OAuth credentials for ${PREFIX} mailbox. ` +
      `Ensure E2E_${PREFIX}_MAILBOX_CLIENT_ID, E2E_${PREFIX}_MAILBOX_CLIENT_SECRET, ` +
      `and E2E_${PREFIX}_MAILBOX_REFRESH_TOKEN are set in .env.e2e or CI secrets.`,
    );
  }

  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 4_000;
  const afterMs = options.afterMs ?? (Date.now() - 5 * 60 * 1_000);
  const correlationId = String(options.correlationId ?? '').trim();

  // Do not filter the query by Gmail read state. Freshness is already fail-closed
  // below and a real OTP can become read before CI observes it.
  const subjectFilter = options.subjectHint
    ? `subject:(${options.subjectHint})`
    : 'subject:(verification code OR OTP OR payout)';
  const gmailQuery = subjectFilter;

  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const accessToken = await exchangeRefreshToken(clientId, clientSecret, refreshToken);
      let messages = await listMessages(accessToken, gmailQuery);
      if (messages.length === 0 && correlationId) {
        messages = await listRecentMessages(accessToken);
      }
      let freshMessageCount = 0;
      let correlatedMessageCount = 0;
      let freshInboxMessageCount = 0;
      let freshSpamMessageCount = 0;
      let freshTrashMessageCount = 0;
      let freshOtherMessageCount = 0;

      for (const msg of messages) {
        const { content, internalDate, labelIds } = await getMessageContent(accessToken, msg.id);

        if (Number(internalDate) < afterMs) {
          // Email is older than the exact test window — skip it even if the
          // subject matches. This prevents stale OTP reuse after removing the
          // unreliable unread-state dependency.
          continue;
        }

        freshMessageCount += 1;
        const location = mailboxLocation(labelIds);
        if (location === 'inbox') freshInboxMessageCount += 1;
        else if (location === 'spam') freshSpamMessageCount += 1;
        else if (location === 'trash') freshTrashMessageCount += 1;
        else freshOtherMessageCount += 1;

        if (correlationId && !content.includes(correlationId)) continue;
        correlatedMessageCount += 1;

        const code = extractOtpCode(content);
        if (code) {
          console.log(`[gmail-otp-reader] OTP retrieved for ${PREFIX} (message ${msg.id}, mailbox=${location})`);
          return code;
        }
      }

      const mailboxSummary = `inbox=${freshInboxMessageCount}, spam=${freshSpamMessageCount}, trash=${freshTrashMessageCount}, other=${freshOtherMessageCount}`;
      lastError = `No OTP found in ${correlatedMessageCount} correlated fresh message(s) out of ${freshMessageCount} fresh / ${messages.length} matching message(s); fresh mailbox locations: ${mailboxSummary} — will retry`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `[gmail-otp-reader] Timed out after ${timeoutMs}ms waiting for ${PREFIX} OTP. ` +
    `Last status: ${lastError ?? 'no messages found'}`,
  );
}
