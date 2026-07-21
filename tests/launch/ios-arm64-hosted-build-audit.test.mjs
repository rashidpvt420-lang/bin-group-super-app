import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ios-apple-silicon-arm64.yml', 'utf8');
const canonicalCi = readFileSync('.github/workflows/ci.yml', 'utf8');
const buildRunner = readFileSync('scripts/run-ios-arm64-build.sh', 'utf8');
const readinessDoc = readFileSync('docs/IOS_APPLE_SILICON_READINESS.md', 'utf8');

test('iOS build uses a native Apple Silicon GitHub-hosted runner', () => {
  assert.match(workflow, /runs-on:\s*macos-26\b/);
  assert.match(canonicalCi, /ios-apple-silicon-arm64:[\s\S]*runs-on:\s*macos-26\b/);
  assert.match(buildRunner, /runner_arch="\$\(uname -m\)"/);
  assert.match(buildRunner, /runner_arch"\s*!=\s*"arm64"/);
  assert.doesNotMatch(`${workflow}\n${canonicalCi}`, /runs-on:\s*macos-(?:15|26)-intel\b/i);
});

test('build runner requires Xcode 26 or newer and an arm64 simulator destination', () => {
  assert.match(buildRunner, /xcode_major\s*<\s*26/);
  assert.match(buildRunner, /-destination 'generic\/platform=iOS Simulator'/);
  assert.match(buildRunner, /ARCHS=arm64/);
  assert.match(buildRunner, /ONLY_ACTIVE_ARCH=YES/);
  assert.match(buildRunner, /CODE_SIGNING_ALLOWED=NO/);
});

test('compiled executable is inspected and Intel slices are rejected', () => {
  assert.match(buildRunner, /lipo -archs/);
  assert.match(buildRunner, /binary_archs"\s*!=\s*"arm64"/);
  assert.match(buildRunner, /x86_64 slice is prohibited/);
});

test('build runner installs locked pods and builds the committed Capacitor workspace', () => {
  assert.match(buildRunner, /npm ci --include=optional --legacy-peer-deps/);
  assert.match(buildRunner, /npm run verify:ios-apple-silicon/);
  assert.match(buildRunner, /npx cap copy ios/);
  assert.match(buildRunner, /pod install --deployment/);
  assert.match(buildRunner, /-workspace ios\/App\/App\.xcworkspace/);
  assert.match(buildRunner, /-scheme App/);
});

test('arm64 evidence is commit-bound and retained as an artifact', () => {
  assert.match(buildRunner, /"commitSha": os\.environ\.get\("GITHUB_SHA"/);
  assert.match(buildRunner, /"workflowRunId": os\.environ\.get\("GITHUB_RUN_ID"/);
  assert.match(buildRunner, /"binarySha256": os\.environ\["BINARY_SHA256"\]/);
  assert.match(canonicalCi, /ios-arm64-build-evidence-\$\{\{ github\.sha \}\}/);
  assert.match(canonicalCi, /retention-days:\s*30/);
});

test('dedicated workflow supports direct and reusable execution', () => {
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\[main\]/);
});

test('canonical BIN GROUP CI runs the extracted arm64 build as a first-class job', () => {
  assert.match(canonicalCi, /ios-apple-silicon-arm64:/);
  assert.match(canonicalCi, /ios-apple-silicon-arm64:[\s\S]*bash scripts\/run-ios-arm64-build\.sh/);
  assert.match(canonicalCi, /ios-apple-silicon-arm64:[\s\S]*ios-arm64-build-evidence-\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(canonicalCi, /ios-apple-silicon-arm64:[\s\S]*continue-on-error:\s*true/);
});

test('operator documentation identifies the protected hosted workflow', () => {
  assert.match(readinessDoc, /iOS Apple Silicon arm64 Build/);
  assert.match(readinessDoc, /macos-26/);
  assert.match(readinessDoc, /arm64-only/i);
  assert.match(readinessDoc, /ios-arm64-build-evidence/i);
  assert.match(readinessDoc, /must pass the protected arm64 workflow before merge/i);
});
