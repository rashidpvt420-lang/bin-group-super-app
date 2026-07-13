#!/usr/bin/env node
// Installs Husky git hooks for normal local development, while staying inert in
// CI and in managed environments that already configure a custom core.hooksPath
// (e.g. Cursor cloud agents). This must NEVER fail `npm install`.
import { execSync } from 'node:child_process';

function safe(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

try {
  // Skip in CI and when explicitly disabled.
  if (process.env.CI || process.env.HUSKY === '0') process.exit(0);
  // Skip when this is not a git work tree (e.g. installed as a dependency/tarball).
  if (safe('git rev-parse --is-inside-work-tree') !== 'true') process.exit(0);
  // Respect a pre-existing custom hooks path (managed dev environments / agents).
  // Only manage the hooks path when it is unset or already owned by Husky.
  const hooksPath = safe('git config core.hooksPath');
  if (hooksPath && !hooksPath.startsWith('.husky')) process.exit(0);

  execSync('husky', { stdio: 'inherit' });
} catch {
  // Hook setup is best-effort; never break installs because of it.
}
