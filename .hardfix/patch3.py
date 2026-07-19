from pathlib import Path

path = Path('scripts/publish-operational-application-evidence.mjs')
source = path.read_text()
source = source.replace(
    "import { PRODUCTION, sha256File } from './lib/launch-honesty.mjs';",
    "import { PRODUCTION, sha256File } from './lib/launch-honesty.mjs';\nimport { requireAuthorizedApprover } from './lib/authorized-approvers.mjs';",
)
source = source.replace(
    "if (process.env.GITHUB_ACTOR !== 'rashidpvt420-lang') fail('only the authorized founder may publish application evidence');",
    "try { requireAuthorizedApprover(process.env.GITHUB_ACTOR); } catch (error) { fail(error.message); }",
)
source = source.replace(
    "  evidenceReference: manifest.reference(proof),",
    "  evidenceReference: `https://github.com/${EXPECTED_REPOSITORY}/actions/runs/${runId}#${gate}` ,",
)
source = source.replace(
    "  verifiedBy: 'workflow',",
    "  githubRepository: EXPECTED_REPOSITORY,\n  verifiedBy: 'workflow',",
)
path.write_text(source)
