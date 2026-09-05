const clean = (value) => String(value ?? '').trim();

export function isProtectedBusinessEvidenceEnvironment(env = process.env) {
  return env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_WORKFLOW === 'Firebase Production Deploy'
    && clean(env.DEPLOYMENT_ENVIRONMENT).toLowerCase() === 'production'
    && clean(env.E2E_STRICT_LIVE).toLowerCase() === 'true';
}

export function resolveBusinessEvidenceAttempt(env = process.env) {
  const attempt = clean(env.BUSINESS_EVIDENCE_ATTEMPT);
  if (isProtectedBusinessEvidenceEnvironment(env)) {
    if (!/^[12]$/.test(attempt)) {
      throw new Error(
        '[business-evidence-scope] Protected production evidence requires BUSINESS_EVIDENCE_ATTEMPT=1 or 2.',
      );
    }
    return attempt;
  }

  if (!attempt) return 'local';
  if (!/^[A-Za-z0-9_-]+$/.test(attempt)) {
    throw new Error('[business-evidence-scope] BUSINESS_EVIDENCE_ATTEMPT contains unsupported characters.');
  }
  return attempt;
}

export function createBusinessEvidenceRunScope(env = process.env, {
  fallback = `${Date.now()}`,
  maxLength = 80,
} = {}) {
  if (!Number.isInteger(maxLength) || maxLength < 24 || maxLength > 150) {
    throw new Error('[business-evidence-scope] maxLength must be an integer from 24 through 150.');
  }

  const protectedEnvironment = isProtectedBusinessEvidenceEnvironment(env);
  const workflowRunId = clean(env.GITHUB_RUN_ID) || clean(fallback) || 'local';
  const workflowAttempt = clean(env.GITHUB_RUN_ATTEMPT) || '1';
  if (protectedEnvironment && !/^[1-9][0-9]*$/.test(workflowRunId)) {
    throw new Error('[business-evidence-scope] Protected production evidence requires a numeric GITHUB_RUN_ID.');
  }
  if (protectedEnvironment && !/^[1-9][0-9]*$/.test(workflowAttempt)) {
    throw new Error('[business-evidence-scope] Protected production evidence requires a numeric GITHUB_RUN_ATTEMPT.');
  }

  const businessAttempt = resolveBusinessEvidenceAttempt(env);
  const normalized = `${workflowRunId}-gha-${workflowAttempt}-business-${businessAttempt}`
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) throw new Error('[business-evidence-scope] Could not derive a non-empty evidence run scope.');
  return normalized.slice(-maxLength);
}
