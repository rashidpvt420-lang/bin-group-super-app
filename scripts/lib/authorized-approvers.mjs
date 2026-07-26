const ACTOR_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const TRUSTED_AUTOMATION_ACTOR = 'github-actions[bot]';

export const AUTHORIZED_APPROVERS_ENV = 'AUTHORIZED_FOUNDER_ACTORS';

export function parseAuthorizedApprovers(value) {
  const actors = [...new Set(
    String(value || '')
      .split(',')
      .map((actor) => actor.trim())
      .filter(Boolean),
  )];

  const invalid = actors.filter((actor) => !ACTOR_RE.test(actor));
  if (invalid.length) {
    throw new Error(`Invalid authorized GitHub actor value(s): ${invalid.join(', ')}`);
  }
  return actors;
}

export function getAuthorizedApprovers(env = process.env) {
  return parseAuthorizedApprovers(env?.[AUTHORIZED_APPROVERS_ENV]);
}

export function isTrustedProductionDeployAutomation(actor, env = process.env) {
  const candidate = String(actor || '').trim();
  const sourceRunId = String(env?.SOURCE_DEPLOY_RUN_ID || '').trim();
  const verifiedRunId = String(env?.TRUSTED_PRODUCTION_DEPLOY_RUN_ID || '').trim();
  return (
    candidate === TRUSTED_AUTOMATION_ACTOR &&
    env?.TRUSTED_PRODUCTION_DEPLOY_EVIDENCE === 'true' &&
    /^\d+$/.test(sourceRunId) &&
    sourceRunId === verifiedRunId
  );
}

export function isAuthorizedApprover(actor, env = process.env) {
  const candidate = String(actor || '').trim();
  if (!candidate) return false;
  return getAuthorizedApprovers(env).includes(candidate) || isTrustedProductionDeployAutomation(candidate, env);
}

export function requireAuthorizedApprover(actor, env = process.env) {
  const actors = getAuthorizedApprovers(env);
  if (!actors.length) {
    throw new Error(`${AUTHORIZED_APPROVERS_ENV} must contain at least one protected GitHub actor.`);
  }
  const candidate = String(actor || '').trim();
  if (!actors.includes(candidate) && !isTrustedProductionDeployAutomation(candidate, env)) {
    throw new Error(`Unauthorized GitHub actor: ${candidate || '(missing)'}`);
  }
  return candidate;
}
