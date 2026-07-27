/**
 * gmail-otp-reader.ts
 *
 * Reads the most-recent OTP code from a Gmail inbox using the Gmail REST API
 * with OAuth 2.0 refresh-token flow.  Credentials are sourced exclusively from
 * process.env — Gmail OAuth secrets must stay in the consuming CI step env and
 * must not be persisted into .env.e2e or Playwright artifacts.
 *
 * Exported API:
 *   getLatestOtp(role, options) → Promise<string>
 *
 * role: 'owner' | 'broker'
 *
 * Required options:
 *   expectedSender    – exact From address the app sends OTPs from
 *   expectedRecipient – the mailbox address (E2E_*_MAILBOX_EMAIL)
 *   correlationId     – a value present in the email body that ties this
 *                       message to the specific OTP request (e.g. commission
 *                       document ID or a UUID generated before requesting OTP)
 *
 * Optional options:
 *   timeoutMs   – max wall-time to wait for the email   (default 60 000)
 *   pollMs      – interval between Gmail polls           (default 4 000)
 *   afterMs     – only consider emails sent AFTER this timestamp (ms since
 *                 epoch). MUST be captured before the OTP-request action.
 *                 (default: now - 30 s, which is intentionally narrow)
 *   subjectHint – additional subject keyword to filter   (default undefined)
 *
 * Security notes:
 *   - Error messages never include the raw response body from OAuth or Gmail.
 *   - Success logs include only the Gmail message ID, not email addresses.
 *   - The grant MUST include the gmail.readonly scope; gmail.metadata is not
 *     sufficient because this helper decodes the full message body.
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, outerSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  outerSignal?.addEventListener('abort', abort, { once: true });
  try {
    if (outerSignal?.aborted) controller.abort();
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', abort);
  }
}

async function exchangeRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<string> {
  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  });

  const res = await fetchWithTimeout(OAUTH_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  }, requestTimeoutMs, signal);

  if (!res.ok) {
    // Discard response body — it may echo client credentials.
    throw new Error(
      `[gmail-otp-reader] operation=token_exchange status=${res.status} category=oauth_failure`,
    );
  }

  const json: { access_token?: string } = await res.json();
  if (!json.access_token) {
    throw new Error(
      '[gmail-otp-reader] operation=token_exchange status=200 category=missing_access_token',
    );
  }
  return json.access_token;
}

async function listMessages(
  accessToken: string,
  query: string,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Array<{ id: string }>> {
  const url = `${GMAIL_BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=10`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, requestTimeoutMs, signal);

  if (!res.ok) {
    const category = res.status === 403 ? 'insufficient_scope_or_permission_denied'
                   : res.status === 401 ? 'invalid_or_expired_token'
                   : 'gmail_api_failure';
    throw new Error(
      `[gmail-otp-reader] operation=messages_list status=${res.status} category=${category}`,
    );
  }

  const json: { messages?: Array<{ id: string }> } = await res.json();
  return json.messages ?? [];
}

interface GmailMessageFull {
  id?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?:    { data?: string; size?: number; attachmentId?: string };
    parts?:   GmailMessagePart[];
  };
}

interface GmailMessagePart {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}

async function getFullMessage(
  accessToken: string,
  messageId: string,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<GmailMessageFull> {
  const url = `${GMAIL_BASE_URL}/messages/${messageId}?format=full`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, requestTimeoutMs, signal);

  if (!res.ok) {
    throw new Error(
      `[gmail-otp-reader] operation=messages_get status=${res.status} category=gmail_api_failure`,
    );
  }

  return res.json() as Promise<GmailMessageFull>;
}

async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${GMAIL_BASE_URL}/messages/${messageId}/attachments/${attachmentId}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, requestTimeoutMs, signal);
  if (!res.ok) {
    throw new Error(
      `[gmail-otp-reader] operation=attachments_get status=${res.status} category=gmail_api_failure`,
    );
  }
  const json: { data?: string } = await res.json();
  return json.data || '';
}

/** Decode a base64url-encoded string to UTF-8 text. */
function decodeBase64Url(encoded: string): string {
  const value = String(encoded || '');
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error('[gmail-otp-reader] operation=decode_body category=invalid_base64url');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  // Node 18+ has Buffer; fall back gracefully in non-Node environments.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  return atob(base64);
}

function sanitizeHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function partText(accessToken: string, messageId: string, part: GmailMessagePart, requestTimeoutMs: number, signal?: AbortSignal): Promise<string> {
  const raw = part.body?.data || (part.body?.attachmentId ? await getAttachment(accessToken, messageId, part.body.attachmentId, requestTimeoutMs, signal) : '');
  return raw ? decodeBase64Url(raw) : '';
}

/** Recursively extract body text from a Gmail message payload. Prefer text/plain with sanitized HTML fallback. */
async function extractTextParts(accessToken: string, messageId: string, payload: GmailMessageFull['payload'], requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal?: AbortSignal): Promise<string> {
  if (!payload) return '';
  const plain: string[] = [];
  const html: string[] = [];

  async function visit(part: GmailMessagePart): Promise<void> {
    const mimeType = String(part.mimeType || '').toLowerCase();
    if (part.body?.data || part.body?.attachmentId) {
      const decoded = await partText(accessToken, messageId, part, requestTimeoutMs, signal);
      if (mimeType === 'text/html') html.push(decoded);
      else if (!mimeType || mimeType === 'text/plain') plain.push(decoded);
    }
    for (const child of part.parts || []) await visit(child);
  }

  await visit(payload);
  return plain.length ? plain.join('\n') : html.map(sanitizeHtml).join('\n');
}

/** Get a header value (case-insensitive) from a message. */
function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
): string {
  return (headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function normalizeEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  const raw = (match ? match[1] : value).split(',')[0]?.trim().toLowerCase() || '';
  const [local, domain] = raw.split('@');
  if (!local || !domain) return raw;
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const normalizedLocal = normalizedDomain === 'gmail.com' ? local.split('+')[0].replace(/\./g, '') : local;
  return `${normalizedLocal}@${normalizedDomain}`;
}

function headerContainsAddress(header: string, expected: string): boolean {
  const normalizedExpected = normalizeEmailAddress(expected);
  return header
    .split(',')
    .map((entry) => normalizeEmailAddress(entry))
    .some((entry) => entry === normalizedExpected);
}

/** Extract the first 6-digit numeric code found in text. */
function extractOtpCode(text: string): string | null {
  const match = text.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface GmailOtpOptions {
  /**
   * The exact From address that the application sends OTP emails from.
   * Messages from other senders are ignored.
   */
  expectedSender: string;
  /**
   * The mailbox's own email address (E2E_*_MAILBOX_EMAIL).
   * Messages not addressed to this recipient are ignored.
   */
  expectedRecipient: string;
  /**
   * A value that must appear in the message body to confirm the OTP belongs
   * to this specific request (e.g. the payout commission document ID or a UUID
   * generated immediately before calling requestOtp). Prevents false matches
   * from parallel tests or unrelated stale OTPs.
   */
  correlationId: string;
  /**
   * Timestamp (ms since epoch) captured BEFORE the OTP-request action was
   * triggered. Only messages with internalDate >= afterMs are considered.
   * Default: Date.now() - 30_000 (30 s lookback, intentionally narrow).
   */
  afterMs?: number;
  /** Max wall-time in ms to wait for the email to arrive (default: 60 000). */
  timeoutMs?: number;
  /** Interval between Gmail API polls (default: 4 000). */
  pollMs?: number;
  /** Optional extra keyword to narrow the Gmail search query. */
  subjectHint?: string;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error('[gmail-otp-reader] operation=poll category=aborted'));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('[gmail-otp-reader] operation=poll category=aborted'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Polls the designated mailbox for a 6-digit OTP sent in the most-recent
 * matching email and returns the code as a string.
 *
 * The caller MUST capture `afterMs = Date.now()` BEFORE triggering the OTP
 * request in the UI, then pass that value here to avoid timestamp race
 * conditions when a message arrives quickly.
 *
 * @param role - 'owner' | 'broker'
 * @throws if credentials are missing or no matching OTP is found before timeout
 */
export async function getLatestOtp(
  role: 'owner' | 'broker',
  options: GmailOtpOptions,
): Promise<string> {
  const PREFIX = role.toUpperCase(); // 'OWNER' | 'BROKER'

  const clientId     = process.env[`E2E_${PREFIX}_MAILBOX_CLIENT_ID`]    ?? '';
  const clientSecret = process.env[`E2E_${PREFIX}_MAILBOX_CLIENT_SECRET`] ?? '';
  const refreshToken = process.env[`E2E_${PREFIX}_MAILBOX_REFRESH_TOKEN`] ?? '';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `[gmail-otp-reader] Missing OAuth credentials for ${PREFIX} mailbox. ` +
      `Ensure E2E_${PREFIX}_MAILBOX_CLIENT_ID, E2E_${PREFIX}_MAILBOX_CLIENT_SECRET, ` +
      `and E2E_${PREFIX}_MAILBOX_REFRESH_TOKEN are set in .env.e2e or CI secrets.`,
    );
  }

  if (!options.expectedSender || !options.expectedRecipient || !options.correlationId) {
    throw new Error(
      '[gmail-otp-reader] expectedSender, expectedRecipient, and correlationId are required. ' +
      'Capture afterMs = Date.now() before triggering the OTP request.',
    );
  }

  const timeoutMs  = options.timeoutMs ?? 60_000;
  const pollMs     = options.pollMs    ?? 4_000;
  // Intentionally narrow default: only look at messages from the last 30 s.
  // Callers must pass afterMs captured before the OTP-request click.
  const afterMs    = options.afterMs   ?? (Date.now() - 30_000);
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  // Build Gmail search query — narrow to subject + recipient to reduce results
  const subjectFilter = options.subjectHint
    ? `subject:(${options.subjectHint})`
    : 'subject:(verification code OR OTP OR payout)';
  const gmailQuery = `${subjectFilter} to:${options.expectedRecipient} is:unread`;

  const deadline  = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new Error('[gmail-otp-reader] operation=poll category=aborted');
    }
    try {
      const accessToken = await exchangeRefreshToken(clientId, clientSecret, refreshToken, requestTimeoutMs, options.signal);
      const messages    = await listMessages(accessToken, gmailQuery, requestTimeoutMs, options.signal);
      const matches: Array<{ code: string; messageId: string; internalDate: number }> = [];

      for (const msg of messages) {
        const full = await getFullMessage(accessToken, msg.id, requestTimeoutMs, options.signal);

        // 1. Timestamp gate — must be newer than afterMs
        if (Number(full.internalDate ?? '0') < afterMs) continue;

        // 2. Sender filter
        const from = getHeader(full.payload?.headers, 'From');
        if (!headerContainsAddress(from, options.expectedSender)) continue;

        // 3. Recipient filter
        const to          = getHeader(full.payload?.headers, 'To');
        const deliveredTo = getHeader(full.payload?.headers, 'Delivered-To');
        const recipientMatch =
          headerContainsAddress(to, options.expectedRecipient) ||
          headerContainsAddress(deliveredTo, options.expectedRecipient);
        if (!recipientMatch) continue;

        // 4. Decode full body
        const bodyText = await extractTextParts(accessToken, msg.id, full.payload, requestTimeoutMs, options.signal);

        // 5. Correlation ID must appear in the body
        if (!bodyText.includes(options.correlationId)) continue;

        // 6. Extract 6-digit OTP
        const code = extractOtpCode(bodyText);
        if (code) {
          matches.push({ code, messageId: msg.id, internalDate: Number(full.internalDate ?? '0') });
        }
      }

      if (matches.length === 1) {
        console.log(`[gmail-otp-reader] verification email matched for ${PREFIX} (msgId=${matches[0].messageId})`);
        return matches[0].code;
      }
      if (matches.length > 1) {
        throw new Error('[gmail-otp-reader] duplicate matching OTP messages found for the same correlation ID');
      }
      lastError = `No matching OTP found in ${messages.length} message(s) — will retry`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (/duplicate matching OTP messages/i.test(lastError)) throw err;
    }

    await abortableSleep(pollMs, options.signal);
  }

  throw new Error(
    `[gmail-otp-reader] Timed out after ${timeoutMs}ms waiting for ${PREFIX} OTP. ` +
    `Last status: ${lastError ?? 'no messages found'}`,
  );
}

export const __gmailOtpReaderTest = {
  decodeBase64Url,
  extractOtpCode,
  extractTextParts,
  getHeader,
  headerContainsAddress,
  normalizeEmailAddress,
  abortableSleep,
  sanitizeHtml,
};
