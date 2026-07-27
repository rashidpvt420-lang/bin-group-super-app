/**
 * gmail-otp-reader.ts
 *
 * Reads the most-recent OTP code from a Gmail inbox using the Gmail REST API
 * with OAuth 2.0 refresh-token flow.  Credentials are sourced exclusively from
 * process.env — the same secrets injected into .env.e2e by the CI workflow.
 *
 * Exported API:
 *   getLatestOtp(role, options?) → Promise<string>
 *
 * role: 'owner' | 'broker'
 *
 * Options:
 *   timeoutMs   – max wall-time to wait for the email   (default 60 000)
 *   pollMs      – interval between Gmail polls           (default 4 000)
 *   afterMs     – only consider emails sent AFTER this   (default: now - 5 min)
 *   subjectHint – additional subject keyword to filter   (default undefined)
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

async function exchangeRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
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
  const url = `${GMAIL_BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=5`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] messages.list failed: ${res.status} ${res.statusText}`);
  }

  const json: { messages?: Array<{ id: string; threadId: string }> } = await res.json();
  return json.messages ?? [];
}

async function getMessageSnippet(
  accessToken: string,
  messageId: string,
): Promise<{ snippet: string; internalDate: string }> {
  const url = `${GMAIL_BASE_URL}/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] messages.get failed: ${res.status} ${res.statusText}`);
  }

  const json: { snippet?: string; internalDate?: string } = await res.json();
  return {
    snippet:      json.snippet ?? '',
    internalDate: json.internalDate ?? '0',
  };
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
}

/**
 * Polls the designated mailbox for a 6-digit OTP sent in the most-recent
 * matching email and returns the code as a string.
 *
 * @param role - 'owner' | 'broker'
 * @throws if credentials are missing or no OTP is found before timeout
 */
export async function getLatestOtp(
  role: 'owner' | 'broker',
  options: GmailOtpOptions = {},
): Promise<string> {
  const PREFIX = role.toUpperCase(); // 'OWNER' | 'BROKER'

  const clientId     = process.env[`E2E_${PREFIX}_MAILBOX_CLIENT_ID`]     ?? '';
  const clientSecret = process.env[`E2E_${PREFIX}_MAILBOX_CLIENT_SECRET`]  ?? '';
  const refreshToken = process.env[`E2E_${PREFIX}_MAILBOX_REFRESH_TOKEN`]  ?? '';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `[gmail-otp-reader] Missing OAuth credentials for ${PREFIX} mailbox. ` +
      `Ensure E2E_${PREFIX}_MAILBOX_CLIENT_ID, E2E_${PREFIX}_MAILBOX_CLIENT_SECRET, ` +
      `and E2E_${PREFIX}_MAILBOX_REFRESH_TOKEN are set in .env.e2e or CI secrets.`,
    );
  }

  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs    = options.pollMs    ?? 4_000;
  const afterMs   = options.afterMs   ?? (Date.now() - 5 * 60 * 1_000);

  // Build Gmail search query
  const subjectFilter = options.subjectHint
    ? `subject:(${options.subjectHint})`
    : 'subject:(verification code OR OTP OR payout)';
  const gmailQuery = `${subjectFilter} is:unread`;

  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const accessToken = await exchangeRefreshToken(clientId, clientSecret, refreshToken);
      const messages    = await listMessages(accessToken, gmailQuery);

      for (const msg of messages) {
        const { snippet, internalDate } = await getMessageSnippet(accessToken, msg.id);

        if (Number(internalDate) < afterMs) {
          // Email is older than the test window — skip.
          continue;
        }

        const code = extractOtpCode(snippet);
        if (code) {
          console.log(`[gmail-otp-reader] OTP retrieved for ${PREFIX} (message ${msg.id})`);
          return code;
        }
      }

      lastError = `No OTP found in ${messages.length} message(s) — will retry`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `[gmail-otp-reader] Timed out after ${timeoutMs}ms waiting for ${PREFIX} OTP. ` +
    `Last status: ${lastError ?? 'no messages found'}`,
  );
}
