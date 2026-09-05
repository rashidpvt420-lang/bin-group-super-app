import { setTimeout as delay } from 'node:timers/promises';

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

/**
 * Work around firebase-tools' catch-all PATCH -> POST fallback. A failed update
 * does not mean the release is absent. Keep the CLI's authentication, ruleset
 * upload, target selection and success handling; only narrow this fallback.
 */
export function createRulesReleaseRecovery({
  updateRelease,
  createRelease,
  wait = delay,
  log = console.log,
}) {
  if (typeof updateRelease !== 'function' || typeof createRelease !== 'function') {
    throw new Error('[rules-release] Unsupported Firebase CLI Rules API; refusing deployment');
  }

  async function retryTransient(operation, method) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!TRANSIENT_STATUSES.has(error?.status) || attempt === MAX_ATTEMPTS) throw error;
        const delayMs = 2_000 * attempt;
        log(`[rules-release] ${method} HTTP ${error.status}; retry ${attempt + 1}/${MAX_ATTEMPTS} in ${delayMs}ms`);
        await wait(delayMs);
      }
    }
  }

  return async function updateOrCreateRelease(projectId, rulesetName, releaseName) {
    // Capture the exact CLI-selected identity; never delete or rename a release.
    const update = () => updateRelease(projectId, rulesetName, releaseName);
    const create = () => createRelease(projectId, rulesetName, releaseName);
    try {
      return await retryTransient(update, 'PATCH');
    } catch (error) {
      if (error?.status !== 404) throw error;
    }

    try {
      return await retryTransient(create, 'POST');
    } catch (error) {
      if (error?.status !== 409) throw error;
      // Another request may have created the release, including a POST whose
      // response was lost. A conflict is NOT success: this exact update must pass.
      log('[rules-release] Release exists after create; verifying the requested ruleset with PATCH');
      return retryTransient(update, 'PATCH');
    }
  };
}
