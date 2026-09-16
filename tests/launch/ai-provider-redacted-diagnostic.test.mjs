import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = '../../.github/workflows/ai-provider-redacted-diagnostic.yml';
const readWorkflow = () => readFile(new URL(workflowPath, import.meta.url), 'utf8');

test('AI provider diagnostic remains protected, exact-SHA bound and redacted', async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /environment:\s*hard-public-launch/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /\[\[ "\$GITHUB_SHA" == "\$TARGET_SHA" \]\]/);
  assert.match(workflow, /DIAGNOSE_AI_PROVIDER_REDACTED/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS/);
  assert.match(workflow, /google-github-actions\/auth@[0-9a-f]{40}/);

  assert.match(workflow, /--secret=GEMINI_API_KEY/);
  assert.match(workflow, /--secret=OPENAI_API_KEY/);
  assert.match(workflow, /::add-mask::\$gemini_key/);
  assert.match(workflow, /::add-mask::\$openai_key/);

  assert.match(workflow, /Redacted Gemini probe HTTP status/);
  assert.match(workflow, /Redacted Gemini probe API status/);
  assert.match(workflow, /Redacted Gemini probe model/);
  assert.match(workflow, /Redacted OpenAI probe HTTP status/);
  assert.match(workflow, /Redacted OpenAI probe category/);
  assert.match(workflow, /Redacted OpenAI 429 cause/);
  assert.match(workflow, /Redacted OpenAI probe model/);

  assert.doesNotMatch(workflow, /console\.log\(payload\)|console\.log\(JSON\.stringify\(payload/);
  assert.doesNotMatch(workflow, /console\.log\([^\n]*(providerCode|providerType)/);
  assert.doesNotMatch(workflow, /Redacted OpenAI probe error (code|type)/);
  assert.doesNotMatch(workflow, /error\?\.message|error\.message|response\.text\(/);
  assert.doesNotMatch(workflow, /payload\?\.error\?\.message/);
});

test('AI provider probes keep credentials out of URLs and command arguments', async () => {
  const workflow = await readWorkflow();

  assert.doesNotMatch(workflow, /\bcurl\b/);
  assert.match(workflow, /GEMINI_DIAGNOSTIC_KEY="\$gemini_key" node --input-type=module/);
  assert.match(workflow, /OPENAI_DIAGNOSTIC_KEY="\$openai_key" node --input-type=module/);
  assert.match(workflow, /'x-goog-api-key': apiKey/);
  assert.match(workflow, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(workflow, /generativelanguage\.googleapis\.com\/v1beta\/models\/\$\{encodeURIComponent\(model\)\}:generateContent/);
  assert.match(workflow, /api\.openai\.com\/v1\/chat\/completions/);
  assert.doesNotMatch(workflow, /generativelanguage\.googleapis\.com[^\n]*\?(?:key|api_key)=/i);
  assert.doesNotMatch(workflow, /https?:\/\/[^\s'"`\\]*\$(?:gemini_key|openai_key|key)/);
  assert.doesNotMatch(workflow, /-H\s+["'][^"']*(?:gemini_key|openai_key|\$key)/);
});

test('AI provider probes remain bounded and emit fixed classifications only', async () => {
  const workflow = await readWorkflow();

  assert.equal((workflow.match(/setTimeout\(\(\) => controller\.abort\(\), 10_000\)/g) || []).length, 2);
  assert.equal((workflow.match(/clearTimeout\(timeout\)/g) || []).length, 2);
  assert.match(workflow, /const allowedStatuses = new Set/);

  for (const category of ['ok', 'auth', 'rate-limited', 'invalid-request', 'server-error', 'network-error', 'other-http']) {
    assert.match(workflow, new RegExp(category));
  }

  for (const fixedCause of ['quota-or-billing', 'request-rate-limit', 'unclassified-429', 'not-applicable']) {
    assert.match(workflow, new RegExp(fixedCause));
  }

  for (const providerCode of [
    'credit_balance_exhausted',
    'organization_usage_limit_exceeded',
    'organization_spend_limit_exceeded',
    'project_spend_limit_exceeded',
    'rate_limit_exceeded',
    'insufficient_quota',
    'rate_limit_error',
  ]) {
    assert.match(workflow, new RegExp(providerCode));
  }

  assert.match(workflow, /limitCause = 'quota-or-billing'/);
  assert.match(workflow, /limitCause = 'request-rate-limit'/);
  assert.match(workflow, /limitCause = 'unclassified-429'/);
  assert.doesNotMatch(workflow, /\$\{providerCode\}|\$\{providerType\}/);
});
