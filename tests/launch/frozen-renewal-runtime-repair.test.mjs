import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  ".github/workflows/repair-frozen-renewal-pdf-runtime.yml",
  "utf8",
);

test("frozen renewal repair is owner-dispatched and exact-release pinned", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /test "\$GITHUB_ACTOR" = "rashidpvt420-lang"/);
  assert.match(
    workflow,
    /FROZEN_RELEASE_SHA: 2ecfad30cc48f3004fc78f2db86a655e94215a15/,
  );
  assert.match(workflow, /ORIGINAL_PDF_ENGINE_SHA256: [a-f0-9]{64}/);
  assert.match(workflow, /REPAIRED_PDF_ENGINE_SHA256: [a-f0-9]{64}/);
});

test("frozen renewal repair changes only the explicit production bucket binding", () => {
  assert.match(workflow, /source\.split\(before\)\.length !== 2/);
  assert.match(
    workflow,
    /storage\.bucket\('bin-group-57c60\.firebasestorage\.app'\)/,
  );
  assert.match(
    workflow,
    /test "\$\(git diff --name-only\)" = "functions\/pdfEngine\.ts"/,
  );
  assert.match(
    workflow,
    /Compiled PDF engine does not bind the production Storage bucket/,
  );
});

test("frozen renewal repair deploys only the scheduled and callable renewal functions", () => {
  assert.match(
    workflow,
    /--only functions:runContractRenewalWatch,functions:rebuildContractRenewalWatch/,
  );
  assert.doesNotMatch(workflow, /firebase deploy(?![\s\S]*--only)/);
  assert.doesNotMatch(workflow, /hosting:/);
  assert.match(workflow, /allTrafficOnLatestRevision/);
});
