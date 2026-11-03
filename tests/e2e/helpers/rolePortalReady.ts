import { expect, type Page } from '@playwright/test';

/**
 * A role portal can remain on its identity bootstrap screen after a full
 * navigation while Firebase restores the persisted session, refreshes claims,
 * and verifies the user's own profile. Wait for that real UI state to resolve
 * instead of relying on short fixed sleeps in route audits.
 */
export async function waitForRolePortalReady(page: Page, context: string): Promise<void> {
  const authSpinner = page.getByText(/Authenticating BIN-Groups Identity/i).first();
  await expect(
    authSpinner,
    `${context}: role identity must resolve before page assertions`,
  ).toBeHidden({ timeout: 30_000 });
}
