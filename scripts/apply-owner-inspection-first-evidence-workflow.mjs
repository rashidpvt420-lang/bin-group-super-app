#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const WORKFLOW_FILES = [
  '.github/workflows/firebase-production-deploy.yml',
  'launch_package/generated/firebase-production-deploy-phase1.yml',
];

export function patchOwnerEvidenceWorkflow(source, label = 'workflow') {
  const isCrlf = source.includes('\r\n');
  const normalized = source.replace(/\r\n/g, '\n');

  const completeBinding = 'E2E_FOUNDER_REAL_MFA_CODE: ${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}';
  if (normalized.includes(completeBinding)) {
    const count = normalized.split(completeBinding).length - 1;
    if (count !== 2) throw new Error(`${label}: expected exactly two complete Founder MFA bindings, found ${count}.`);
    return source;
  }

  let adminPasswordBindings = 0;
  const patched = normalized.replace(
    /^(      )E2E_ADMIN_PASSWORD: \$\{\{ secrets\.E2E_ADMIN_PASSWORD \}\}$/gm,
    (line, indent) => {
      adminPasswordBindings += 1;
      return [
        line,
        `${indent}E2E_FOUNDER_EMAIL: \${{ inputs.founder_email }}`,
        `${indent}E2E_FOUNDER_PASSWORD: \${{ secrets.E2E_FOUNDER_PASSWORD }}`,
        `${indent}E2E_FOUNDER_TOTP_SECRET: \${{ secrets.E2E_FOUNDER_TOTP_SECRET }}`,
        `${indent}E2E_FOUNDER_REAL_MFA_CODE: \${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}`,
        `${indent}E2E_REQUIRE_FOUNDER_MFA: 'true'`,
      ].join('\n');
    },
  );

  if (adminPasswordBindings !== 2) {
    throw new Error(`${label}: expected two job-level deploy/public E2E_ADMIN_PASSWORD anchors, found ${adminPasswordBindings}.`);
  }
  for (const required of [
    'Run current-commit five-role business evidence',
    'E2E_FOUNDER_EMAIL: ${{ inputs.founder_email }}',
    'E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',
    'E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',
    'E2E_FOUNDER_REAL_MFA_CODE: ${{ secrets.E2E_FOUNDER_REAL_MFA_CODE }}',
    "E2E_REQUIRE_FOUNDER_MFA: 'true'",
  ]) {
    if (!patched.includes(required)) throw new Error(`${label}: missing required Owner evidence control: ${required}`);
  }
  return isCrlf ? patched.replace(/\n/g, '\r\n') : patched;
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  for (const file of WORKFLOW_FILES) {
    const source = readFileSync(file, 'utf8');
    const patched = patchOwnerEvidenceWorkflow(source, file);
    writeFileSync(file, patched);
    console.log(`[owner-inspection-first-workflow] patched ${file}`);
  }
}
