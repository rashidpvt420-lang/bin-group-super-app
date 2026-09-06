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
 *   timeoutMs     – max wall-time to wait for the email   (default 60 000)
 *   pollMs        – interval between Gmail polls           (default 4 000)
 *   afterMs       – only consider emails sent AFTER this   (default: now - 5 min)
 *   subjectHint   – additional subject keyword to filter   (default undefined)
 *   correlationId – server-issued challenge correlation ID (default undefined)
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE_URL  = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function mailboxLocation(labelIds: string[] = []): string {
  if (labelIds.includes('SPAM')) return 'SPAM';
  if (labelIds.includes('TRASH')) return 'TRASH';
  return 'INBOX';
}

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
  query?: string,
): Promise<Array<{ id: string; threadId: string }>> {
  const queryParam = query ? `&q=${encodeURIComponent(query)}` : '';
  const url = `${GMAIL_BASE_URL}/messages?includeSpamTrash=true&maxResults=25${queryParam}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] messages.list failed: ${res.status} ${res.statusText}`);
  }

  const json: { messages?: Array<{ id: string; threadId: string }> } = await res.json();
  return json.messages ?? [];
}

function decodeBase64Url(raw: string): string {
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function collectTextFromParts(payload: any): string {
  if (!payload) return '';
  let text = '';
  if (payload.body?.data) {
    text += decodeBase64Url(payload.body.data) + ' ';
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      text += collectTextFromParts(part) + ' ';
    }
  }
  return text;
}

async function collectMessageBody(
  payload: any,
  accessToken: string,
  messageId: string,
): Promise<string> {
  if (!payload) return '';
  let text = '';
  const mimeType = String(payload.mimeType || '').toLowerCase();

  if (mimeType.startsWith('text/') && payload.body?.data) {
    text += decodeBase64Url(payload.body.data) + ' ';
  }

  const attachmentId = payload.body?.attachmentId;
  if (attachmentId) {
    try {
      const attachUrl = `${GMAIL_BASE_URL}/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`;
      const res = await fetch(attachUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const attachJson: any = await res.json();
        if (attachJson?.data) {
          text += decodeBase64Url(attachJson.data) + ' ';
        }
      }
    } catch {
      // Best-effort attachment extraction
    }
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      text += (await collectMessageBody(part, accessToken, messageId)) + ' ';
    }
  }

  if (!text.trim()) {
    text = collectTextFromParts(payload);
  }

  return text;
}

async function getMessageData(
  accessToken: string,
  messageId: string,
): Promise<{ snippet: string; internalDate: string; body: string; subject: string; labelIds: string[] }> {
  const url = `${GMAIL_BASE_URL}/messages/${messageId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`[gmail-otp-reader] messages.get failed: ${res.status} ${res.statusText}`);
  }

  const json: any = await res.json();
  const headers = Array.isArray(json.payload?.headers) ? json.payload.headers : [];
  const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '';
  const bodyText = await collectMessageBody(json.payload, accessToken, messageId);

  return {
    snippet:      json.snippet ?? '',
    internalDate: json.internalDate ?? '0',
    body:         bodyText,
    subject:      subjectHeader,
    labelIds:     Array.isArray(json.labelIds) ? json.labelIds : [],
  };
}

/** Extract the 6-digit numeric code found in text, prioritizing contextual OTP sentences. */
function extractOtpCode(text: string): string | null {
  const contextual = text.match(/(?:payout code is|code is|OTP is|verification code:?)\s*(\d{6})/i);
  if (contextual) return contextual[1];
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
  /** Server-issued challenge correlation ID for binding proof. */
  correlationId?: string;
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
  const correlationId = options.correlationId ? String(options.correlationId).trim() : '';

  // Build Gmail search query without read-status restrictions to avoid indexing lag and read-state mismatches
  const subjectFilter = options.subjectHint
    ? `subject:(${options.subjectHint})`
    : 'subject:(verification code OR OTP OR payout)';
  const gmailQuery = subjectFilter;

  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;
  let pollCount = 0;

  while (Date.now() < deadline) {
    pollCount++;
    try {
      const accessToken = await exchangeRefreshToken(clientId, clientSecret, refreshToken);

      // Primary search: query by subject filter
      let messages = await listMessages(accessToken, gmailQuery);

      // Fallback: if search query returns 0 (due to Gmail search indexing lag),
      // query newest messages directly with includeSpamTrash=true
      if (!messages.length) {
        messages = await listMessages(accessToken);
      }

      console.log(`[gmail-otp-reader] Poll #${pollCount} for ${PREFIX}: found ${messages.length} candidate message(s)`);

      let freshMessageCount = 0;
      let freshSpamMessageCount = 0;
      let freshTrashMessageCount = 0;

      for (const msg of messages) {
        const { snippet, internalDate, body, subject, labelIds } = await getMessageData(accessToken, msg.id);
        const msgDate = Number(internalDate);

        if (Number(internalDate) < afterMs) {
          // Email is older than the test window — skip.
          continue;
        }

        freshMessageCount++;
        const location = mailboxLocation(labelIds);
        if (location === 'SPAM') freshSpamMessageCount++;
        if (location === 'TRASH') freshTrashMessageCount++;

        // If subjectHint was specified and we did the unfiltered list, verify subject or snippet contains hint
        if (options.subjectHint) {
          const hint = options.subjectHint.toLowerCase();
          const matchHint = subject.toLowerCase().includes(hint) || snippet.toLowerCase().includes(hint) || body.toLowerCase().includes(hint);
          if (!matchHint) continue;
        }

        const content = `${subject} ${snippet} ${body}`;
        if (correlationId && !content.includes(correlationId)) {
          continue;
        }

        const code = extractOtpCode(content);
        if (code) {
          console.log(
            `[gmail-otp-reader] OTP ${code.slice(0, 2)}**** retrieved for ${PREFIX} in ${location} ` +
            `(fresh=${freshMessageCount}, spam=${freshSpamMessageCount}, trash=${freshTrashMessageCount}, ` +
            `message ${msg.id}, date=${new Date(msgDate).toISOString()})`,
          );
          return code;
        }
      }

      lastError = `No matching OTP in ${messages.length} message(s) (fresh=${freshMessageCount}, spam=${freshSpamMessageCount}) — will retry`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[gmail-otp-reader] Poll #${pollCount} error: ${lastError}`);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(
    `[gmail-otp-reader] Timed out after ${timeoutMs}ms waiting for ${PREFIX} OTP. ` +
    `Last status: ${lastError ?? 'no messages found'}`,
  );
}
