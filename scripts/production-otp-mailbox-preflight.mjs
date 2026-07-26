#!/usr/bin/env node

/**
 * Validates E2E Mailbox credentials using OAuth 2.0 and the Gmail API.
 * Ensures the credentials in the environment actually map to the 
 * correct E2E_OWNER_EMAIL and E2E_BROKER_EMAIL identities.
 */

async function exchangeRefreshTokenForAccessToken(clientId, clientSecret, refreshToken) {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to exchange refresh token: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchGmailProfile(accessToken) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch Gmail profile: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  return data.emailAddress;
}

export async function verifyOtpMailboxes() {
  const mailboxes = [
    {
      role: 'Owner',
      expectedEmail: process.env.E2E_OWNER_EMAIL,
      clientId: process.env.E2E_OWNER_MAILBOX_CLIENT_ID,
      clientSecret: process.env.E2E_OWNER_MAILBOX_CLIENT_SECRET,
      refreshToken: process.env.E2E_OWNER_MAILBOX_REFRESH_TOKEN,
    },
    {
      role: 'Broker',
      expectedEmail: process.env.E2E_BROKER_EMAIL,
      clientId: process.env.E2E_BROKER_MAILBOX_CLIENT_ID,
      clientSecret: process.env.E2E_BROKER_MAILBOX_CLIENT_SECRET,
      refreshToken: process.env.E2E_BROKER_MAILBOX_REFRESH_TOKEN,
    }
  ];

  const failures = [];

  for (const mailbox of mailboxes) {
    const { role, expectedEmail, clientId, clientSecret, refreshToken } = mailbox;

    if (!expectedEmail || !clientId || !clientSecret || !refreshToken) {
      failures.push(`Missing E2E_${role.toUpperCase()} environment variables for mailbox verification`);
      continue;
    }

    try {
      const accessToken = await exchangeRefreshTokenForAccessToken(clientId, clientSecret, refreshToken);
      const emailAddress = await fetchGmailProfile(accessToken);

      if (emailAddress.toLowerCase() !== expectedEmail.toLowerCase()) {
        failures.push(`${role} mailbox mismatch: Expected ${expectedEmail}, got ${emailAddress}`);
      } else {
        console.log(`Verified OTP Mailbox access for ${role}: ${emailAddress}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during mailbox check';
      failures.push(`${role} mailbox verification failed: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`OTP Mailbox verification failed:\n  ${failures.join('\n  ')}`);
  }

  console.log('OTP Mailbox secrets preflight passed. Active mailboxes match expected environment identities.');
}

const isMainModule = (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`);

if (isMainModule) {
  verifyOtpMailboxes().catch((error) => {
    console.error(`\n[production-otp-mailbox-preflight] ${error.message}\n`);
    process.exit(1);
  });
}
