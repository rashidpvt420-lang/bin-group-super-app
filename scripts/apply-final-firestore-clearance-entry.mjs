import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

const currentMainDispatch = `    function canDispatchJobs() {
      return hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        (signedIn() && (
          request.auth.token.get('role', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('userRole', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('primaryRole', '') in ['operations_manager', 'dispatcher']
        ));
    }`;

const intermediateDispatch = `    function canDispatchJobs() {
      return isNotSuspended() && (
        hasAdminClaim() ||
        hasPermission('canDispatchJobs') ||
        (signedIn() && (
          request.auth.token.get('role', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('userRole', '') in ['operations_manager', 'dispatcher'] ||
          request.auth.token.get('primaryRole', '') in ['operations_manager', 'dispatcher']
        ))
      );
    }`;

if (rules.includes(currentMainDispatch)) {
  rules = rules.replace(currentMainDispatch, intermediateDispatch);
  fs.writeFileSync(rulesPath, rules, 'utf8');
  console.log('[entry] normalized current-main dispatch helper for final patch');
} else if (rules.includes(intermediateDispatch) || rules.includes('function hasDispatchAuthorityClaimOnly() {')) {
  console.log('[entry] dispatch helper already compatible with final patch');
} else {
  throw new Error('Unsupported canDispatchJobs baseline. Refusing a non-deterministic patch.');
}

await import('./apply-final-firestore-clearance-v2.mjs');
