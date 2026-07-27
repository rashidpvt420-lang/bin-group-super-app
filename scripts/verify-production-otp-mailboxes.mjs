#!/usr/bin/env node
import { runProductionOtpMailboxPreflight } from './lib/production-otp-mailbox-preflight.mjs';

try {
  const result = await runProductionOtpMailboxPreflight();
  console.log(
    `[production-otp-mailbox-preflight] PASS mailboxes=${result.mailboxesVerified} ` +
    `sentinel_full=${result.sentinelFullMessagesVerified} peppers=${result.peppersVerified} secret_values_logged=false`,
  );
} catch (error) {
  console.error(`[production-otp-mailbox-preflight] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
