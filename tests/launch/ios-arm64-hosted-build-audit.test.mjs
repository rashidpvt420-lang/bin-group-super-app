import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ios-apple-silicon-arm64.yml', 'utf8');
const readinessDoc = readFileSync('docs/IOS_APPLE_SILICON_READINESS.md', 'utf8');

test('iOS build uses a native Apple Silicon GitHub-hosted runner', () => {
  assert.match(workflow, /runs-on:\s*macos-26\b/);
  assert.match(workflow, /runner_arch="\$\(uname -m\)"/);
  assert.match(workflow, /runner_arch"\s*!=\s*"arm64"/);
  assert.doesNotMatch(workflow, /runs-on:\s*\[[^\]]*self-hosted/i);
  assert.doesNotMatch(workflow, /runs-on:\s*macos-(?:15|26)-intel\b/i);
});

test('iOS build requires Xcode 26 or newer and an arm64 simulator destination', () => {
  assert.match(workflow, /xcode_major\s*<\s*26/);
  assert.match(workflow, /-destination 'generic\/platform=iOS Simulator'/);
  assert.match(workflow, /ARCHS=arm64/);
  assert.match(workflow, /ONLY_ACTIVE_ARCH=YES/);
  assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
});

test('compiled executable is inspected and Intel slices are rejected', () => {
  assert.match(workflow, /lipo -archs/);
  assert.match(workflow, /binary_archs"\s*!=\s*"arm64"/);
  assert.match(workflow, /x86_64 slice is prohibited/);
});

test('workflow installs locked pods and builds the committed Capacitor workspace', () => {
  assert.match(workflow, /npm ci --include=optional --legacy-peer-deps/);
  assert.match(workflow, /npm run verify:ios-apple-silicon/);
  assert.match(workflow, /npx cap copy ios/);
  assert.match(workflow, /pod install --deployment/);
  assert.match(workflow, /-workspace ios\/App\/App\.xcworkspace/);
  assert.match(workflow, /-scheme App/);
});

test('arm64 evidence is commit-bound and retained as an artifact', () => {
  assert.match(workflow, /"commitSha": os\.environ\["GITHUB_SHA"\]/);
  assert.match(workflow, /"workflowRunId": os\.environ\["GITHUB_RUN_ID"\]/);
  assert.match(workflow, /"binarySha256": os\.environ\["BINARY_SHA256"\]/);
  assert.match(workflow, /ios-arm64-build-evidence-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /retention-days:\s*30/);
});

test('workflow runs for pull requests, main pushes, and manual verification', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\[main\]/);
});

test('operator documentation identifies the protected hosted workflow', () => {
  assert.match(readinessDoc, /iOS Apple Silicon arm64 Build/);
  assert.match(readinessDoc, /macos-26/);
  assert.match(readinessDoc, /arm64-only/i);
  assert.match(readinessDoc, /ios-arm64-build-evidence/i);
});
