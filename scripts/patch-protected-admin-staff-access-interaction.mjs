#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ADMIN_FILE = 'tests/e2e/business-admin.spec.ts';
const STALE_STAFF_ACCESS_CLICK = "    await page.getByTestId('admin-open-secure-staff-access').click();";
const CURRENT_STAFF_ACCESS_CLICK = "    await page.getByRole('tab', { name: 'STAFF ACCESS', exact: true }).click();";

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

export function patchAdminStaffAccessInteraction(source, label = ADMIN_FILE) {
  const staleCount = countOccurrences(source, STALE_STAFF_ACCESS_CLICK);
  const currentCount = countOccurrences(source, CURRENT_STAFF_ACCESS_CLICK);

  if (staleCount === 0 && currentCount === 1) return source;
  if (staleCount !== 1 || currentCount !== 0) {
    throw new Error(
      `[admin-staff-access-evidence] ${label}: expected exactly one retired Staff Access locator and no canonical locator, found stale=${staleCount} current=${currentCount}`,
    );
  }

  return source.replace(STALE_STAFF_ACCESS_CLICK, CURRENT_STAFF_ACCESS_CLICK);
}

function runCli() {
  const source = readFileSync(ADMIN_FILE, 'utf8');
  const patched = patchAdminStaffAccessInteraction(source);
  writeFileSync(ADMIN_FILE, patched, 'utf8');
  console.log('[admin-staff-access-evidence] canonical STAFF ACCESS tab locator applied for protected production replay');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
