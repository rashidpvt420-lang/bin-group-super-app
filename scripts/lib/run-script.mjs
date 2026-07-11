/**
 * Windows-safe script runner — always uses repo root as cwd.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyFirebaseAdminEnvSanitize,
  credentialStatus,
  sanitizeProcessEnvForFirebaseAdmin,
} from '../firebase-admin-bootstrap.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export { repoRoot };

function childEnv() {
  return sanitizeProcessEnvForFirebaseAdmin(process.env);
}

export function runNodeScript(scriptRel, args = [], { inherit = false } = {}) {
  const script = path.join(repoRoot, scriptRel);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: childEnv(),
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  return { ok: (result.status ?? 1) === 0, out, status: result.status ?? 1 };
}

export function runNpmScript(scriptName, { inherit = false } = {}) {
  const stdio = inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'];
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(cmd, ['run', scriptName], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio,
    env: childEnv(),
    shell: true,
    windowsHide: true,
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  if ((result.status ?? 1) !== 0 && !out.trim() && result.error) {
    return { ok: false, out: result.error.message, status: result.status ?? 1 };
  }
  return { ok: (result.status ?? 1) === 0, out, status: result.status ?? 1 };
}

export function hasFirebaseAdminCredentials() {
  applyFirebaseAdminEnvSanitize();
  return credentialStatus().ok;
}
