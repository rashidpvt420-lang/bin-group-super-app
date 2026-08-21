import { test, expect, type Page, type Response } from '@playwright/test';
import admin from 'firebase-admin';
import { createHmac, randomBytes } from 'node:crypto';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL = String(process.env.E2E_ADMIN_EMAIL || '').trim().toLowerCase();
const PASSWORD = String(process.env.E2E_ADMIN_PASSWORD || '').trim();
const TOTP_SECRET = String(process.env.E2E_FOUNDER_TOTP_SECRET || '').toUpperCase().replace(/[\s=-]/g, '');
const REAL_MFA_CODE = String(process.env.E2E_ADMIN_REAL_MFA_CODE || '').trim();
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app').replace(/\/+$/, '');
const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'bin-group-57c60';
const RUN = String(process.env.GITHUB_RUN_ID || `${Date.now()}-${randomBytes(3).toString('hex')}`).replace(/[^a-zA-Z0-9-]/g, '').slice(-36);
const STAFF_EMAIL = `e2e-hr-${RUN}@bin-groups.com`;
const STAFF_NAME = `E2E HR Lifecycle ${RUN}`;
let staffUid = '';

function mfaCode() {
  if (!TOTP_SECRET) return REAL_MFA_CODE;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of TOTP_SECRET) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function isPasswordResponse(response: Response) { return /accounts:signInWithPassword/.test(response.url()); }
function isMfaResponse(response: Response) { return /mfaSignIn:finalize/.test(response.url()); }

async function login(page: Page) {
  await page.goto(`${ADMIN_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('admin-login-email')).toBeVisible({ timeout: 30_000 });
  const passwordResponse = page.waitForResponse(isPasswordResponse, { timeout: 30_000 });
  await page.getByTestId('admin-login-email').fill(EMAIL);
  await page.getByTestId('admin-login-password').fill(PASSWORD);
  await page.getByTestId('admin-login-submit').click();
  expect((await passwordResponse).status()).toBeLessThan(400);
  await expect(page.getByTestId('admin-mfa-signin-challenge')).toBeVisible({ timeout: 30_000 });
  const factor = page.getByTestId('admin-mfa-factor-select');
  if (await factor.isVisible().catch(() => false)) {
    for (const option of await factor.locator('option').all()) {
      if (/authenticator/i.test(await option.innerText())) {
        const value = await option.getAttribute('value');
        if (value) await factor.selectOption(value);
        break;
      }
    }
  }
  await page.getByTestId('admin-mfa-send-signin-code').click();
  await expect(page.getByTestId('admin-mfa-signin-code')).toBeVisible({ timeout: 30_000 });
  const remaining = 30_000 - (Date.now() % 30_000);
  if (TOTP_SECRET && remaining < 10_000) await page.waitForTimeout(remaining + 250);
  await page.getByTestId('admin-mfa-signin-code').fill(mfaCode());
  const mfaResponse = page.waitForResponse(isMfaResponse, { timeout: 20_000 }).catch(() => null);
  await page.getByTestId('admin-mfa-resolve-signin').click();
  const response = await mfaResponse;
  if (response) expect(response.status()).toBeLessThan(400);
  await page.waitForURL(`${ADMIN_BASE_URL}/dashboard`, { timeout: 45_000 });
}

async function deleteQuery(collectionName: string, field: string, value: string) {
  const snapshot = await admin.firestore().collection(collectionName).where(field, '==', value).limit(500).get();
  if (snapshot.empty) return;
  const batch = admin.firestore().batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

async function cleanup() {
  if (!admin.apps.length) return;
  let user: admin.auth.UserRecord | null = null;
  try { user = await admin.auth().getUserByEmail(STAFF_EMAIL); } catch (error: any) { if (error?.code !== 'auth/user-not-found') throw error; }
  const uid = staffUid || user?.uid || '';
  if (uid) {
    await Promise.all([
      ...['users','staffAccess','hrProfiles','private_hr_profiles','technicians'].map((name) => admin.firestore().collection(name).doc(uid).delete().catch(() => undefined)),
      deleteQuery('staff_attendance', 'staffId', uid).catch(() => undefined),
      deleteQuery('staff_leave_requests', 'staffId', uid).catch(() => undefined),
      deleteQuery('hr_staff_documents', 'staffId', uid).catch(() => undefined),
      deleteQuery('mail', 'targetUid', uid).catch(() => undefined),
      deleteQuery('audit_logs', 'targetId', uid).catch(() => undefined),
    ]);
    const [files] = await admin.storage().bucket().getFiles({ prefix: `hrDocuments/${uid}/` });
    await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true }).catch(() => undefined)));
  }
  if (user) await admin.auth().deleteUser(user.uid).catch(() => undefined);
}

const canRun = Boolean(EMAIL && PASSWORD && (/^[A-Z2-7]{16,}$/.test(TOTP_SECRET) || /^\d{6}$/.test(REAL_MFA_CODE)));

test.describe('Admin staff lifecycle live navigation and operations', () => {
  test.skip(!canRun, 'Protected Admin credentials are required for live lifecycle verification.');
  test.beforeAll(async () => {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID, storageBucket: 'bin-group-57c60.firebasestorage.app' });
    await cleanup().catch(() => undefined);
  });
  test.afterAll(async () => { await cleanup(); });

  test('Founder can navigate and execute every HR lifecycle control on a synthetic staff account', async ({ page }) => {
    test.setTimeout(360_000);
    const appCheck = await attachAuthenticatedAppCheckMonitor(page);
    await appCheck.assertTokenFingerprint();
    await login(page);
    await page.goto(`${ADMIN_BASE_URL}/hr`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-staff-access-route')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('admin-hr-tabs')).toBeVisible();

    await page.getByTestId('admin-open-secure-staff-access').click();
    await expect(page.getByTestId('admin-staff-access-page')).toBeVisible();
    await page.getByTestId('admin-add-staff').click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Full Name').fill(STAFF_NAME);
    await createDialog.getByLabel('Email Address').fill(STAFF_EMAIL);
    await createDialog.getByLabel('Department').fill('Operations');
    await createDialog.getByRole('button', { name: /CREATE & SEND INVITATION/i }).click();
    await expect(createDialog).not.toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => {
      try { const user = await admin.auth().getUserByEmail(STAFF_EMAIL); staffUid = user.uid; return Boolean(user.uid); } catch { return false; }
    }, { timeout: 45_000 }).toBe(true);

    await page.getByRole('tab', { name: 'STAFF REGISTRY' }).click();
    const row = page.getByTestId(`hr-staff-row-${staffUid}`);
    await expect(row).toContainText(STAFF_EMAIL, { timeout: 30_000 });
    await row.getByTestId(`open-staff-lifecycle-${staffUid}`).click();
    await expect(page.getByTestId('admin-staff-lifecycle-dialog')).toBeVisible();

    await page.getByTestId('staff-lifecycle-profile-tab').click();
    await expect(page.getByTestId('staff-profile-panel')).toBeVisible();
    await page.getByLabel('Emirate / Zone').fill('Abu Dhabi');
    await page.getByTestId('save-staff-profile').click();
    await expect(page.getByText(/profile and employment package updated/i)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('staff-lifecycle-onboarding-tab').click();
    await page.getByTestId('resend-staff-invitation').click();
    await expect(page.getByText(/invitation re-issued/i)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('staff-lifecycle-attendance-tab').click();
    await page.getByTestId('record-staff-attendance').click();
    await expect(page.getByText(/attendance record saved/i)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('staff-lifecycle-leave-tab').click();
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel('Start').fill(today);
    await page.getByLabel('End').fill(today);
    await page.getByTestId('create-staff-leave').click();
    await expect(page.getByText(/leave request created/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'APPROVE', exact: true }).first().click();
    await expect(page.getByText(/leave approved/i)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('staff-lifecycle-documents-tab').click();
    await page.getByTestId('staff-document-file').setInputFiles({ name: 'e2e-contract.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% E2E HR contract\n%%EOF') });
    await page.getByTestId('upload-staff-document').click();
    await expect(page.getByText(/document uploaded and registered/i)).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('staff-lifecycle-payroll-tab').click();
    await expect(page.getByTestId('staff-payroll-kpi-panel')).toBeVisible();
    await expect(page.getByText(/KPI is calculated only from real attendance/i)).toBeVisible();

    await page.getByTestId('staff-lifecycle-audit-tab').click();
    await page.getByTestId('staff-offboarding-reason').fill('Protected E2E lifecycle cleanup');
    await page.getByTestId('offboard-staff').click();
    await expect(page.getByText(/sessions revoked and history preserved/i)).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await admin.auth().getUser(staffUid)).disabled, { timeout: 30_000 }).toBe(true);
  });
});
