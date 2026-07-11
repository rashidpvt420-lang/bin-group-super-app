/**
 * Load repo env files in stable order (.env.e2e first, then app secrets without override).
 * Uses direct file parsing so scripts work even when dotenvx/vestauth only hooks npm lifecycles.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(filePath, { override = false } = {}) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadProjectEnv({ includeE2e = true } = {}) {
  if (includeE2e) {
    for (const rel of ['.env.e2e', path.join('bin-group-super-app', '.env.e2e')]) {
      const full = path.join(repoRoot, rel);
      if (existsSync(full)) {
        parseEnvFile(full, { override: true });
        loadDotenv({ path: full });
        break;
      }
    }
  }

  for (const rel of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const full = path.join(repoRoot, rel);
    if (!existsSync(full)) continue;
    parseEnvFile(full, { override: false });
    loadDotenv({ path: full, override: false });
  }
}

export function resolveFirebaseWebApiKey() {
  return process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || '';
}

/** Firebase Web API keys with HTTP referrer restrictions require a Referer from an allowed origin. */
export function resolveFirebaseReferer() {
  const raw =
    process.env.FIREBASE_REST_REFERER ||
    process.env.E2E_BASE_URL ||
    process.env.E2E_ADMIN_BASE_URL ||
    'https://bin-group-57c60.web.app';
  try {
    const url = new URL(raw);
    return `${url.origin}/`;
  } catch {
    return 'https://bin-group-57c60.web.app/';
  }
}

export function firebaseRestHeaders() {
  return {
    'Content-Type': 'application/json',
    Referer: resolveFirebaseReferer(),
  };
}

export { repoRoot };
