import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const mailDelivery = fs.readFileSync('functions/mailDelivery.ts', 'utf8');
const provisioning = fs.readFileSync('functions/adminUserProvisioning.ts', 'utf8');
const lifecycle = fs.readFileSync('functions/adminStaffLifecycle.ts', 'utf8');

test('staff Firebase action links bypass SendGrid click tracking', () => {
  assert.match(mailDelivery, /DIRECT_SECURITY_LINK_MAIL_TYPES/);
  assert.match(mailDelivery, /staff_account_invitation/);
  assert.match(mailDelivery, /staff_account_invitation_resend/);
  assert.match(mailDelivery, /["']X-SMTPAPI["']/);
  assert.match(mailDelivery, /clicktrack\s*:/);
  assert.match(mailDelivery, /enable:\s*0/);
  assert.match(mailDelivery, /enable_text:\s*false/);
  assert.match(mailDelivery, /headers,\s*\n\s*\}\)\)/);
});

test('initial and resent staff invitations keep the protected direct-link mail types', () => {
  assert.match(provisioning, /type:\s*["']staff_account_invitation["']/);
  assert.match(lifecycle, /type:\s*["']staff_account_invitation_resend["']/);
  assert.match(provisioning, /generateEmailVerificationLink\s*\(/);
  assert.match(provisioning, /generatePasswordResetLink\s*\(/);
  assert.match(lifecycle, /generateEmailVerificationLink\s*\(/);
  assert.match(lifecycle, /generatePasswordResetLink\s*\(/);
});

test('mail audit state records whether security-link tracking was disabled', () => {
  assert.match(mailDelivery, /linkTracking:\s*headers\s*\?\s*["']DISABLED_FOR_SECURITY_LINKS["']/);
  assert.doesNotMatch(mailDelivery, /console\.(?:log|info|warn|error)\([^\n]*(?:html|passwordResetLink|verificationLink)/);
});
