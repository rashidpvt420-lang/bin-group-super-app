import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const workflowPath = '.github/workflows/firebase-production-deploy.yml';
const scriptPath = 'scripts/one-time-stripe-secret-manager-workflow-fix.mjs';
const oneTimeWorkflowPath = '.github/workflows/one-time-stripe-secret-manager-workflow-fix.yml';

function replaceExactly(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

let workflow = readFileSync(workflowPath, 'utf8');
workflow = replaceExactly(
  workflow,
  `      - name: Authenticate to Google Cloud for live postdeploy proofs\n        uses: google-github-actions/auth@v2\n        with:\n          workload_identity_provider: \${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}\n          service_account: \${{ secrets.GCP_SERVICE_ACCOUNT }}\n          create_credentials_file: true\n          export_environment_variables: true\n\n      - name: Create E2E environment for live proofs\n`,
  `      - name: Authenticate to Google Cloud for live postdeploy proofs\n        uses: google-github-actions/auth@v2\n        with:\n          workload_identity_provider: \${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}\n          service_account: \${{ secrets.GCP_SERVICE_ACCOUNT }}\n          create_credentials_file: true\n          export_environment_variables: true\n\n      - name: Load Stripe live key from Google Secret Manager\n        id: stripe_secret\n        uses: google-github-actions/get-secretmanager-secrets@v3\n        with:\n          secrets: |-\n            stripe_secret_key:bin-group-57c60/STRIPE_SECRET_KEY\n\n      - name: Create E2E environment for live proofs\n`,
  'Stripe Secret Manager action insertion',
);
workflow = replaceExactly(
  workflow,
  `          STRIPE_SECRET_KEY: \${{ secrets.STRIPE_SECRET_KEY }}\n`,
  `          STRIPE_SECRET_KEY: \${{ steps.stripe_secret.outputs.stripe_secret_key }}\n`,
  'Stripe verifier environment binding',
);
writeFileSync(workflowPath, workflow);

unlinkSync(oneTimeWorkflowPath);
unlinkSync(scriptPath);
console.log('Bound Stripe live proof to Google Secret Manager and removed one-time files.');
