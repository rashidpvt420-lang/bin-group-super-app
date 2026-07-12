#!/usr/bin/env node

/**
 * Integration Script: Hard-Launch Approval Gate
 * 
 * This script integrates the hard-launch approval gate into the production workflow.
 * 
 * Usage:
 *   npm run hard-launch:approval-gate
 * 
 * Requirements:
 * - hardLaunchApproved flag in launch-proof-gates.json
 * - founderAuthorization object with email, name, authorizedAt, signature
 * - No active incidents in production-incidents.json
 * - Matching commit SHA in production-deployment.json
 * 
 * This is a fail-closed gate. All checks must pass before deployment is authorized.
 */

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const scriptPath = resolve('scripts/hard-launch-approval-gate.mjs');

const proc = spawn('node', [scriptPath], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

proc.on('exit', (code) => {
  process.exit(code);
});
