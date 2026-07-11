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

function resolveNpmCli() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(repoRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function runNpmScript(scriptName, { inherit = false } = {}) {
  const stdio = inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'];
  const npmCli = resolveNpmCli();
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, 'run', scriptName], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio,
        env: childEnv(),
        windowsHide: true,
      })
    : process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', 'run', scriptName], {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio,
          env: childEnv(),
          windowsHide: true,
        })
      : spawnSync('npm', ['run', scriptName], {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio,
          env: childEnv(),
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
