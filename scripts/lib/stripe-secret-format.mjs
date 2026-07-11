/**
 * Stripe Secret Manager format checks (prefix only — never log secret values).
 */
export function looksLikeCredentialLeak(value) {
  if (!value) return 'empty secret value';
  if (value.length < 10) {
    return 'contaminated — key is too short (< 10 characters)';
  }
  if (value.includes('@')) {
    return 'contaminated — value looks like an email/login, not a Stripe key';
  }
  if (value.includes('REPLACE_WITH_') || value.includes('REPLACE_ME') || value.includes('PLACEHOLDER')) {
    return 'contaminated — value is a placeholder';
  }
  if (!(/^sk_(live|test)_/.test(value) || value.startsWith('whsec_'))) {
    return 'contaminated — unrecognized format, must start with sk_live_, sk_test_, or whsec_';
  }
  if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && value.length >= 12 && !value.includes('_')) {
    return 'contaminated — value looks like a human password, not a Stripe API key';
  }
  return null;
}

export function validateStripeSecretName(secretName, raw) {
  const leak = looksLikeCredentialLeak(raw);
  if (leak) return { ok: false, detail: leak };

  const prefix = raw.slice(0, 8);
  if (secretName === 'STRIPE_SECRET_KEY') {
    if (raw.startsWith('sk_live_')) return { ok: true, detail: 'sk_live_*' };
    if (raw.startsWith('sk_test_')) {
      return { ok: false, detail: `${prefix}… (test key — switch to live before public launch)` };
    }
    return {
      ok: false,
      detail: `${prefix}… (unrecognized format — Stripe secret keys must start with sk_live_ for production)`,
    };
  }
  if (secretName === 'STRIPE_WEBHOOK_SECRET') {
    if (raw.startsWith('whsec_')) return { ok: true, detail: 'whsec_*' };
    return {
      ok: false,
      detail: `${prefix}… (expected whsec_* webhook signing secret from Stripe Dashboard)`,
    };
  }
  return { ok: false, detail: 'unknown secret' };
}
