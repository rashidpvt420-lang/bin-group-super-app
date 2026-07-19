const ACTOR_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

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

export function isAuthorizedApprover(actor, env = process.env) {
  const candidate = String(actor || '').trim();
  if (!candidate) return false;
  return getAuthorizedApprovers(env).includes(candidate);
}

export function requireAuthorizedApprover(actor, env = process.env) {
  const actors = getAuthorizedApprovers(env);
  if (!actors.length) {
    throw new Error(`${AUTHORIZED_APPROVERS_ENV} must contain at least one protected GitHub actor.`);
  }
  const candidate = String(actor || '').trim();
  if (!actors.includes(candidate)) {
    throw new Error(`Unauthorized GitHub actor: ${candidate || '(missing)'}`);
  }
  return candidate;
}
