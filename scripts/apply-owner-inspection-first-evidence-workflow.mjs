#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const WORKFLOW_FILES = [
  '.github/workflows/firebase-production-deploy.yml',
  'launch_package/generated/firebase-production-deploy-phase1.yml',
];

export function patchOwnerEvidenceWorkflow(source, label = 'workflow') {
  if (source.includes('E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}')) {
    const count = source.split('E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}').length - 1;
    if (count !== 2) throw new Error(`${label}: expected exactly two Founder MFA bindings, found ${count}.`);
    return source;
  }

  let adminPasswordBindings = 0;
  const patched = source.replace(
    /^(      )E2E_ADMIN_PASSWORD: \$\{\{ secrets\.E2E_ADMIN_PASSWORD \}\}$/gm,
    (line, indent) => {
      adminPasswordBindings += 1;
      return [
        line,
        `${indent}E2E_FOUNDER_EMAIL: \${{ secrets.E2E_FOUNDER_EMAIL }}`,
        `${indent}E2E_FOUNDER_PASSWORD: \${{ secrets.E2E_FOUNDER_PASSWORD }}`,
        `${indent}E2E_FOUNDER_TOTP_SECRET: \${{ secrets.E2E_FOUNDER_TOTP_SECRET }}`,
        `${indent}E2E_REQUIRE_FOUNDER_MFA: 'true'`,
      ].join('\n');
    },
  );

  if (adminPasswordBindings !== 2) {
    throw new Error(`${label}: expected two job-level deploy/public E2E_ADMIN_PASSWORD anchors, found ${adminPasswordBindings}.`);
  }
  for (const required of [
    'Run current-commit five-role business evidence',
    'E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}',
    'E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',
    'E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',
    "E2E_REQUIRE_FOUNDER_MFA: 'true'",
  ]) {
    if (!patched.includes(required)) throw new Error(`${label}: missing required Owner evidence control: ${required}`);
  }
  return patched;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of WORKFLOW_FILES) {
    const source = readFileSync(file, 'utf8');
    const patched = patchOwnerEvidenceWorkflow(source, file);
    writeFileSync(file, patched);
    console.log(`[owner-inspection-first-workflow] patched ${file}`);
  }
}
