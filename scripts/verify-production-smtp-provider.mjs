#!/usr/bin/env node
import { runSmtpProviderPreflight } from './lib/smtp-provider-preflight.mjs';

try {
  const result = await runSmtpProviderPreflight();
  console.log(
    `[production-smtp-provider-readiness] PASS authVerified=${result.authVerified} ` +
    `sendAttempted=${result.sendAttempted} secretValuesLogged=${result.secretValuesLogged}`,
  );
} catch (error) {
  console.error(
    `[production-smtp-provider-readiness] FAIL ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
