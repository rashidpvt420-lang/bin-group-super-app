#!/usr/bin/env node
/**
 * Compute VALIDATED_ARTIFACT_DIGEST for the built main+admin hosting artifacts.
 * Prints sha256:<hex> and optionally appends to $GITHUB_ENV.
 */
import { appendFileSync } from 'node:fs';
import { computeValidatedArtifactDigest } from './lib/launch-gate-common.mjs';

try {
  const digest = computeValidatedArtifactDigest(process.cwd());
  console.log(digest);
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `VALIDATED_ARTIFACT_DIGEST=${digest}\n`);
  }
  process.exit(0);
} catch (err) {
  console.error(`[artifact-digest] FAIL: ${err.message}`);
  process.exit(1);
}
