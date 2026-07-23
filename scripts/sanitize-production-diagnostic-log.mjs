#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PROVIDER_ID = /\b(?:sk|rk|pk|whsec|cs_live|evt)_[A-Za-z0-9_]+\b/g;
const FIREBASE_UID = /\b[A-Za-z0-9_-]{28}\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER = /(authorization\s*[:=]\s*bearer\s+|bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const COOKIE_HEADER = /((?:set-)?cookie\s*:)\s*[^\r\n]+/gi;
const QUERY_SECRET = /([?&](?:token|access_token|id_token|refresh_token|api[_-]?key|key|debug_token|appcheck[_-]?token)=)[^&\s]+/gi;
const SECRET_KEY = String.raw`(?:password|passphrase|token|secret|api[_-]?key|appcheck(?:[_-]?debug)?[_-]?token|refresh[_-]?token|id[_-]?token)`;
const IDENTIFIER_KEY = String.raw`(?:uid|user[_-]?id|account[_-]?id|firebase[_-]?uid)`;
const OTP_KEY = String.raw`(?:otp|one[- ]time(?: password| code)?|verification code|mfa code)`;
const JSON_VALUE = String.raw`(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,\s}\]]+)`;
const JSON_SECRET = new RegExp(`((["']?)${SECRET_KEY}\\2\\s*:\\s*)${JSON_VALUE}`, 'gi');
const JSON_IDENTIFIER = new RegExp(`((["']?)${IDENTIFIER_KEY}\\2\\s*:\\s*)${JSON_VALUE}`, 'gi');
const JSON_OTP = new RegExp(`((["']?)${OTP_KEY}\\2\\s*:\\s*)${JSON_VALUE}`, 'gi');
const NAMED_SECRET = new RegExp(`(${SECRET_KEY}\\s*[=:]\\s*)[^\\s,;]+`, 'gi');
const NAMED_IDENTIFIER = new RegExp(`(${IDENTIFIER_KEY}\\s*[=:]\\s*)[A-Za-z0-9_-]+`, 'gi');
const OTP = new RegExp(`(${OTP_KEY}\\s*[=:]\\s*)\\d{4,10}`, 'gi');

export function sanitizeProductionDiagnosticLog(value) {
  return String(value ?? '')
    .replace(ANSI_ESCAPE, '')
    .replace(EMAIL, '<redacted-email>')
    .replace(BEARER, '$1<redacted-secret>')
    .replace(COOKIE_HEADER, '$1 <redacted-secret>')
    .replace(QUERY_SECRET, '$1<redacted-secret>')
    .replace(JSON_SECRET, '$1"<redacted-secret>"')
    .replace(JSON_IDENTIFIER, '$1"<redacted-id>"')
    .replace(JSON_OTP, '$1"<redacted-secret>"')
    .replace(NAMED_SECRET, '$1<redacted-secret>')
    .replace(NAMED_IDENTIFIER, '$1<redacted-id>')
    .replace(OTP, '$1<redacted-secret>')
    .replace(JWT, '<redacted-secret>')
    .replace(PROVIDER_ID, '<redacted-provider-id>')
    .replace(UUID, '<redacted-id>')
    .replace(FIREBASE_UID, '<redacted-id>');
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/sanitize-production-diagnostic-log.mjs <input> <output>');
  }

  const raw = await readFile(inputPath, 'utf8');
  const sanitized = sanitizeProductionDiagnosticLog(raw);
  await writeFile(outputPath, sanitized.endsWith('\n') ? sanitized : `${sanitized}\n`, 'utf8');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
