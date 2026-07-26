#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';
const FOUNDER_ROLES = new Set(['ceo', 'super_admin']);
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

function roleOf(claims = {}) {
  const role = lower(claims.role || claims.userRole || claims.primaryRole);
  if (role) return role;
  if (claims.ceo === true) return 'ceo';
  if (claims.superAdmin === true || claims.super_admin === true) return 'super_admin';
  return '';
}

async function main() {
  const projectId = resolveFirebaseAdminProjectId();
  const configuredEmail = lower(process.env.E2E_FOUNDER_EMAIL || CANONICAL_FOUNDER_EMAIL);
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Founder TOTP readiness requires project ${EXPECTED_PROJECT_ID}.`);
  }
  if (configuredEmail !== CANONICAL_FOUNDER_EMAIL) {
    throw new Error(`E2E_FOUNDER_EMAIL must equal ${CANONICAL_FOUNDER_EMAIL}.`);
  }

  initializeFirebaseAdmin(admin, projectId);
  const auth = admin.auth();
  const user = await auth.getUserByEmail(configuredEmail);
  const claims = user.customClaims || {};
  const role = roleOf(claims);
  if (user.disabled || !user.emailVerified || !FOUNDER_ROLES.has(role)) {
    throw new Error('Canonical Founder Auth state or claims are not launch-ready.');
  }

  const factors = user.multiFactor?.enrolledFactors || [];
  const totpFactors = factors.filter((factor) => lower(factor.factorId) === 'totp');
  if (totpFactors.length !== 1) {
    throw new Error(`Canonical Founder must have exactly one enrolled TOTP factor; found ${totpFactors.length}.`);
  }

  let providerState = 'unknown';
  try {
    const projectConfig = await auth.projectConfigManager().getProjectConfig();
    const providerConfigs = projectConfig.multiFactorConfig?.providerConfigs || [];
    const totpProvider = providerConfigs.find((provider) => lower(provider.provider) === 'totp');
    providerState = lower(totpProvider?.state || 'unknown');
    if (totpProvider && providerState !== 'enabled') {
      throw new Error(`Identity Platform TOTP provider state is ${providerState}.`);
    }
  } catch (error) {
    if (String(error?.message || '').startsWith('Identity Platform TOTP provider state')) throw error;
    providerState = 'not-readable-by-current-service-account';
  }

  console.log(JSON.stringify({
    status: 'READY',
    projectId,
    founderEmail: CANONICAL_FOUNDER_EMAIL,
    role,
    emailVerified: true,
    disabled: false,
    totpFactorCount: 1,
    totpProviderState: providerState,
    secretRead: false,
    hardLaunchClaim: false,
  }));
}

main().catch((error) => {
  console.error(`[founder-totp-readiness] REFUSED: ${error instanceof Error ? error.message : 'readiness failed'}`);
  process.exit(1);
});
