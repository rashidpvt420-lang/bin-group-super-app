/**
 * Gate 12 — SMTP secret format check (prefix/shape only; never prints secret values).
 */
import { execSync } from 'node:child_process';

const PROJECT = 'bin-group-57c60';

function readSecret(name) {
  return execSync(`gcloud secrets versions access latest --secret=${name} --project=${PROJECT}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikePersonalPasswordInHost(value) {
  return looksLikeEmail(value) || /^Rashood@/i.test(value);
}

const checks = [
  {
    name: 'SMTP_HOST',
    validate: (v) => {
      if (!v) return { ok: false, detail: 'empty' };
      if (looksLikePersonalPasswordInHost(v)) return { ok: false, detail: 'looks like email/password — must be smtp.sendgrid.net (or your SMTP hostname)' };
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return { ok: false, detail: `${v.slice(0, 12)}… (invalid hostname)` };
      return { ok: true, detail: v };
    },
  },
  {
    name: 'SMTP_PORT',
    validate: (v) => {
      const port = Number(v);
      if (!Number.isFinite(port) || port <= 0) return { ok: false, detail: 'must be 587 or 465' };
      if (![465, 587, 2525].includes(port)) return { ok: false, detail: `${port} (prefer 587 for SendGrid)` };
      return { ok: true, detail: String(port) };
    },
  },
  {
    name: 'SMTP_USER',
    validate: (v) => {
      if (!v) return { ok: false, detail: 'empty — SendGrid uses literal "apikey"' };
      if (looksLikeEmail(v)) return { ok: false, detail: 'must be "apikey" for SendGrid, not an email address' };
      if (v.toLowerCase() !== 'apikey') return { ok: false, detail: `${v.slice(0, 8)}… (expected "apikey" for SendGrid)` };
      return { ok: true, detail: 'apikey' };
    },
  },
  {
    name: 'SMTP_PASS',
    validate: (v) => {
      if (!v) return { ok: false, detail: 'empty — paste SendGrid API key (SG....)' };
      if (looksLikeEmail(v)) return { ok: false, detail: 'looks like email — use SendGrid API key starting with SG.' };
      if (v.startsWith('SG.')) return { ok: true, detail: 'SG.*' };
      if (v.length >= 20 && !v.includes('@')) return { ok: true, detail: 'non-email secret (verify it is SendGrid API key)' };
      return { ok: false, detail: `${v.slice(0, 6)}… (unrecognized — use SendGrid API key SG....)` };
    },
  },
  {
    name: 'SMTP_FROM',
    validate: (v) => {
      if (!v) return { ok: false, detail: 'empty — use BIN GROUP <ceo@bin-groups.com>' };
      if (!v.includes('@')) return { ok: false, detail: 'must include sender email in angle brackets' };
      if (!/BIN\s*GROUP/i.test(v)) return { ok: false, detail: 'should include BIN GROUP branded display name' };
      return { ok: true, detail: v.replace(/<[^>]+>/, '<…>') };
    },
  },
];

let failed = 0;
console.log('\n=== Gate 12 SMTP Secrets Format Check ===\n');

for (const check of checks) {
  try {
    const value = readSecret(check.name);
    const result = check.validate(value);
    if (result.ok) console.log(`[PASS] ${check.name} — ${result.detail}`);
    else {
      console.log(`[FAIL] ${check.name} — ${result.detail}`);
      failed += 1;
    }
  } catch (err) {
    console.log(`[FAIL] ${check.name} — ${err.message}`);
    failed += 1;
  }
}

if (failed) {
  console.log('\nFix SMTP secrets before npm run test:gate12:smtp:');
  console.log('  firebase functions:secrets:set SMTP_HOST   # smtp.sendgrid.net');
  console.log('  firebase functions:secrets:set SMTP_PORT   # 587');
  console.log('  firebase functions:secrets:set SMTP_USER   # apikey');
  console.log('  firebase functions:secrets:set SMTP_PASS   # SG.... SendGrid API key');
  console.log('  firebase functions:secrets:set SMTP_FROM   # BIN GROUP <ceo@bin-groups.com>');
  process.exit(1);
}

console.log('\nSMTP secret formats: PASS — run npm run test:gate12:smtp after functions deploy.');
process.exit(0);
