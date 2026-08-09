const BILLING_FAILURE = /(?:this api method requires billing to be enabled|billing account associated|cloud billing (?:is )?not enabled)/i;
const PROJECT_WRITE_FAILURE = /(?:write access to project .* was denied|permission[_\s-]*denied|http error:\s*403)/i;

/**
 * Return a stable, non-secret diagnostic for Firebase deploy failures that
 * cannot be resolved by retrying the same command.
 */
export function classifyPermanentFirebaseDeploymentFailure(output) {
  const text = String(output || '');
  if (!text) return null;

  if (BILLING_FAILURE.test(text)) {
    return {
      code: 'PROJECT_BILLING_REQUIRED',
      message: 'Cloud Billing is not active for the Firebase project. Link bin-group-57c60 to an active billing account before retrying.',
    };
  }

  if (PROJECT_WRITE_FAILURE.test(text)) {
    return {
      code: 'PROJECT_WRITE_ACCESS_DENIED',
      message: 'The deployment identity does not have the required Google Cloud project write access. Correct IAM or project access before retrying.',
    };
  }

  return null;
}
