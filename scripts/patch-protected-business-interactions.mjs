#!/usr/bin/env node

import {
  patchAdminProtectedInteractions as patchAdminProtectedInteractionsBase,
  patchTenantProtectedInteractions,
} from './patch-protected-business-interactions-base.mjs';

export { patchTenantProtectedInteractions };

function normalizeNewlines(value) {
  return String(value).replace(/\r\n/g, '\n');
}

function restoreNewlines(value, hadCrlf) {
  return hadCrlf ? value.replace(/\n/g, '\r\n') : value;
}

function replaceExactlyOnce(source, before, after, label) {
  const hadCrlf = source.includes('\r\n');
  const normalizedSource = normalizeNewlines(source);
  const normalizedBefore = normalizeNewlines(before);
  const normalizedAfter = normalizeNewlines(after);
  const first = normalizedSource.indexOf(normalizedBefore);
  if (first < 0) throw new Error(`${label}: expected source anchor was not found.`);
  if (normalizedSource.indexOf(normalizedBefore, first + normalizedBefore.length) >= 0) {
    throw new Error(`${label}: source anchor was not unique.`);
  }
  return restoreNewlines(
    `${normalizedSource.slice(0, first)}${normalizedAfter}${normalizedSource.slice(first + normalizedBefore.length)}`,
    hadCrlf,
  );
}

export function patchAdminProtectedInteractions(source, label = 'tests/e2e/business-admin.spec.ts') {
  let patched = patchAdminProtectedInteractionsBase(source, label);

  const staleStaffAccessClick = `    await page.getByTestId('admin-open-secure-staff-access').click();`;
  const currentStaffAccessClick = `    await page.getByRole('tab', { name: 'STAFF ACCESS', exact: true }).click();`;
  if (normalizeNewlines(patched).includes(normalizeNewlines(currentStaffAccessClick))) return patched;

  patched = replaceExactlyOnce(
    patched,
    staleStaffAccessClick,
    currentStaffAccessClick,
    `${label}: canonical Admin Staff Access tab`,
  );

  return patched;
}
