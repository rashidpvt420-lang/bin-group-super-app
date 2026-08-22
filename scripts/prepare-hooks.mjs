#!/usr/bin/env node
// Installs Husky git hooks for normal local development, while staying inert in
// CI and in managed environments that already configure a custom core.hooksPath
// (e.g. Cursor cloud agents). This must NEVER fail `npm install`.
import { chmodSync, existsSync, lstatSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';

function safe(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function installLiveSmokePlaywrightShim() {
  if (process.env.GITHUB_WORKFLOW !== 'Live Role Smoke Tests') return;

  const binPath = path.resolve('node_modules/.bin/playwright');
  if (!existsSync(binPath)) {
    throw new Error('[prepare-hooks] Playwright CLI is missing after npm install.');
  }
  if (lstatSync(binPath).isSymbolicLink()) unlinkSync(binPath);

  const wrapper = `#!/usr/bin/env node\nimport { spawnSync } from 'node:child_process';\nimport path from 'node:path';\nconst args = process.argv.slice(2);\nconst root = process.cwd();\nconst helper = path.join(root, 'scripts', 'prepare-playwright-chromium.mjs');\nconst realCli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');\nconst isInstallWithDeps = args[0] === 'install' && args.includes('--with-deps') && args.includes('chromium');\nconst commandArgs = isInstallWithDeps ? [helper] : [realCli, ...args];\nconst result = spawnSync(process.execPath, commandArgs, { stdio: 'inherit', env: process.env });\nif (result.error) { console.error(result.error.message); process.exit(1); }\nprocess.exit(result.status ?? 1);\n`;
  writeFileSync(binPath, wrapper, 'utf8');
  chmodSync(binPath, 0o755);
  console.log('[prepare-hooks] Installed bounded Playwright Chromium shim for Live Role Smoke Tests.');
}

function prepareProtectedLiveEvidenceReplay() {
  if (process.env.GITHUB_WORKFLOW !== 'Live Role Smoke Tests' || process.env.GITHUB_JOB !== 'live-evidence') return;
  if (process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('[prepare-hooks] Live evidence replay preparation requires refs/heads/main.');
  }
  if (String(process.env.DEPLOYMENT_ENVIRONMENT || '').toLowerCase() !== 'production') {
    throw new Error('[prepare-hooks] Live evidence replay preparation requires DEPLOYMENT_ENVIRONMENT=production.');
  }
  if (String(process.env.PAYMENT_POLICY || '').toLowerCase() !== 'phase1-manual') {
    throw new Error('[prepare-hooks] Live evidence replay preparation requires PAYMENT_POLICY=phase1-manual.');
  }
  if (String(process.env.E2E_STRICT_LIVE || '').toLowerCase() !== 'true') {
    throw new Error('[prepare-hooks] Live evidence replay preparation requires E2E_STRICT_LIVE=true.');
  }

  // Keep Live Role Smoke evidence on the same deterministic replay contract as
  // Firebase Production Deploy. These scripts only patch the checked-out E2E
  // sources inside the ephemeral runner; they do not change production data or
  // weaken any assertion. This repairs Admin Staff Access drift and the Tenant /
  // Technician listener-convergence hardening before all-required evidence runs.
  const replayScripts = [
    'scripts/apply-five-role-business-evidence-fixes.mjs',
    'scripts/patch-protected-admin-staff-access-interaction.mjs',
    'scripts/harden-repeated-business-evidence.mjs',
  ];
  for (const script of replayScripts) {
    execFileSync(process.execPath, [script], { stdio: 'inherit', env: process.env });
  }
  console.log('[prepare-hooks] Applied protected five-role replay preparation for Live Role Smoke live-evidence.');
}

try {
  // CI normally skips Husky, but Live Role Smoke installs a narrow Playwright
  // shim so repeated evidence suites cannot repeatedly run unbounded apt work.
  if (process.env.CI) {
    installLiveSmokePlaywrightShim();
    prepareProtectedLiveEvidenceReplay();
    process.exit(0);
  }
  // Skip when explicitly disabled.
  if (process.env.HUSKY === '0') process.exit(0);
  // Skip when this is not a git work tree (e.g. installed as a dependency/tarball).
  if (safe('git rev-parse --is-inside-work-tree') !== 'true') process.exit(0);
  // Respect a pre-existing custom hooks path (managed dev environments / agents).
  // Only manage the hooks path when it is unset or already owned by Husky.
  const hooksPath = safe('git config core.hooksPath');
  if (hooksPath && !hooksPath.startsWith('.husky')) process.exit(0);

  execSync('husky', { stdio: 'inherit' });
} catch (error) {
  if (process.env.CI && process.env.GITHUB_WORKFLOW === 'Live Role Smoke Tests') {
    console.error(`[prepare-hooks] Live Role Smoke Playwright/evidence setup failed: ${error?.message || error}`);
    process.exit(1);
  }
  // Hook setup is best-effort; never break normal installs because of it.
}
