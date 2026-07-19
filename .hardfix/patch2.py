from pathlib import Path

path = Path('scripts/verify-operational-readiness.mjs')
source = path.read_text()
old = "    workflowRunId: String(gate.workflowRunId || ''),\n    verifiedBy:"
new = "    workflowRunId: String(gate.workflowRunId || ''),\n    githubRepository: String(gate.githubRepository || ''),\n    verifiedBy:"
if old not in source:
    raise SystemExit('Missing readiness repository-binding anchor')
path.write_text(source.replace(old, new))

for name in ['scripts/write-pilot-incident-report.mjs', 'scripts/write-hard-launch-approval.mjs']:
    path = Path(name)
    source = path.read_text()
    source = source.replace("  AUTHORIZED_HARD_LAUNCH_ACTORS,\n", "")
    if "authorized-approvers.mjs" not in source:
        anchor = "} from './lib/hard-launch-gate.mjs';\n"
        if anchor not in source:
            raise SystemExit(f'Missing import anchor in {name}')
        source = source.replace(anchor, anchor + "import { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';\n")
    source = source.replace(
        "if (!AUTHORIZED_HARD_LAUNCH_ACTORS.includes(actor)) throw new Error(`Unauthorized actor: ${actor}`);",
        "requireAuthorizedApprover(actor);",
    )
    context_anchor = "if (githubRepository !== 'rashidpvt420-lang/bin-group-super-app') throw new Error('Unexpected GitHub repository');"
    context_replacement = context_anchor + "\nif (process.env.GITHUB_WORKFLOW !== 'Live Role Smoke Tests' || process.env.GITHUB_JOB !== 'hard-public-launch-clearance') throw new Error('Unexpected protected workflow context');\nif (!/^\\d+$/.test(githubRunId)) throw new Error('GITHUB_RUN_ID must be numeric');"
    if context_anchor not in source:
        raise SystemExit(f'Missing protected context anchor in {name}')
    source = source.replace(context_anchor, context_replacement)
    path.write_text(source)

Path('scripts/verify-hard-launch-approval.mjs').write_text("""#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  evaluateHardLaunchEligibility,
  hardLaunchStatusPath,
  readHardLaunchInputs,
  validateProtectedHardLaunchWorkflowContext,
} from './lib/hard-launch-gate.mjs';

const contextErrors = validateProtectedHardLaunchWorkflowContext(process.env);
if (contextErrors.length) {
  console.error('[hard-launch-status] REFUSED');
  for (const error of contextErrors) console.error(`- ${error}`);
  process.exit(1);
}

const root = process.cwd();
const commitSha = String(process.env.GITHUB_SHA || '').trim();
const inputs = readHardLaunchInputs(root);
const result = evaluateHardLaunchEligibility({ ...inputs, commitSha, root, env: process.env });
const output = hardLaunchStatusPath(root);
const status = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha,
  pilotEligible: result.pilotEligible,
  hardLaunchEligible: result.hardLaunchEligible,
  hardLaunchClaim: result.hardLaunchClaim,
  errors: result.errors,
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(status, null, 2)}\n`);
if (!result.hardLaunchEligible) {
  console.error('[hard-launch-status] NO-GO');
  for (const error of result.errors) console.error(`- ${error}`);
  console.error(`hardLaunchClaim=${result.hardLaunchClaim}`);
  process.exit(1);
}
console.log('[hard-launch-status] ELIGIBLE — prerequisites verified; signed final decision is still required');
console.log('hardLaunchClaim=false');
""")
