// Provider acceptance is not handset delivery. Never log phone numbers,
// message contents, credentials, or untrusted provider response bodies.
export type SmsAttempt = {
  state: 'NOT_CONFIGURED' | 'INVALID_RECIPIENT' | 'PROVIDER_REJECTED' | 'PROVIDER_ACCEPTED' | 'PROVIDER_ERROR';
  deliveryConfirmed: false;
  httpStatus?: number;
};

export async function sendTwilioSMS(
  to: string,
  message: string,
  environment: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): Promise<SmsAttempt> {
  const sid = environment.TWILIO_ACCOUNT_SID;
  const token = environment.TWILIO_AUTH_TOKEN;
  const from = environment.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { state: 'NOT_CONFIGURED', deliveryConfirmed: false };
  if (!/^\+[1-9]\d{7,14}$/.test(to)) return { state: 'INVALID_RECIPIENT', deliveryConfirmed: false };
  try {
    const response = await request(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: message }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { state: 'PROVIDER_REJECTED', deliveryConfirmed: false, httpStatus: response.status };
    const result = await response.json() as { sid?: unknown; status?: unknown };
    if (typeof result.sid !== 'string' || !result.sid || ['failed', 'undelivered', 'canceled'].includes(String(result.status))) {
      return { state: 'PROVIDER_REJECTED', deliveryConfirmed: false, httpStatus: response.status };
    }
    return { state: 'PROVIDER_ACCEPTED', deliveryConfirmed: false, httpStatus: response.status };
  } catch {
    return { state: 'PROVIDER_ERROR', deliveryConfirmed: false };
  }
}
