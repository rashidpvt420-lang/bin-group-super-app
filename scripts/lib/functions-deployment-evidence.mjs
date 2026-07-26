export const FUNCTIONS_DEPLOYMENT_STRATEGY = 'sequential-export-batches';

const FUNCTION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function validateFunctionsDeploymentEvidence(evidence) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return ['functionsDeployment evidence is missing or malformed'];
  }

  if (evidence.strategy !== FUNCTIONS_DEPLOYMENT_STRATEGY) {
    failures.push(`functionsDeployment strategy must be ${FUNCTIONS_DEPLOYMENT_STRATEGY}`);
  }

  const functionCount = Number(evidence.functionCount);
  const batchCount = Number(evidence.batchCount);
  const batchSize = Number(evidence.batchSize);
  const cooldownSeconds = Number(evidence.cooldownSeconds);
  const names = evidence.deployedFunctions;

  if (!Number.isInteger(functionCount) || functionCount <= 0) {
    failures.push('functionsDeployment functionCount must be a positive integer');
  }
  if (!Number.isInteger(batchCount) || batchCount <= 0) {
    failures.push('functionsDeployment batchCount must be a positive integer');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 6) {
    failures.push('functionsDeployment batchSize must be an integer from 1 through 6');
  }
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 60 || cooldownSeconds > 300) {
    failures.push('functionsDeployment cooldownSeconds must be an integer from 60 through 300');
  }
  if (!Array.isArray(names) || names.length === 0) {
    failures.push('functionsDeployment deployedFunctions must be a non-empty array');
    return failures;
  }

  const normalizedNames = names.map((name) => String(name || ''));
  const invalidNames = normalizedNames.filter((name) => !FUNCTION_NAME_PATTERN.test(name));
  if (invalidNames.length > 0) {
    failures.push('functionsDeployment deployedFunctions contains invalid export names');
  }
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    failures.push('functionsDeployment deployedFunctions contains duplicates');
  }
  if (normalizedNames.join('\n') !== [...normalizedNames].sort().join('\n')) {
    failures.push('functionsDeployment deployedFunctions must be deterministically sorted');
  }
  if (Number.isInteger(functionCount) && normalizedNames.length !== functionCount) {
    failures.push('functionsDeployment functionCount does not match deployedFunctions length');
  }
  if (
    Number.isInteger(functionCount) && functionCount > 0 &&
    Number.isInteger(batchSize) && batchSize > 0 &&
    Number.isInteger(batchCount) &&
    batchCount !== Math.ceil(functionCount / batchSize)
  ) {
    failures.push('functionsDeployment batchCount does not match functionCount and batchSize');
  }

  return failures;
}
