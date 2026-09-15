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
  assert.equal((workflow.match(/::add-mask::\$key/g) || []).length, 2);

  assert.match(workflow, /Redacted Gemini probe HTTP status/);
  assert.match(workflow, /Redacted Gemini probe API status/);
  assert.match(workflow, /Redacted Gemini probe model: gemini-3\.6-flash/);
  assert.match(workflow, /Redacted OpenAI probe HTTP status/);
  assert.match(workflow, /Redacted OpenAI probe category/);
  assert.match(workflow, /Redacted OpenAI probe model: gpt-4\.1-mini/);

  assert.doesNotMatch(workflow, /cat\s+"?\$body|console\.log\(doc\)|console\.log\(JSON\.stringify/);
  assert.doesNotMatch(workflow, /error\?\.message|error\.message|response\.body|response\.text/);
});

test('AI provider direct probes use bounded network timeouts and discard response bodies', async () => {
  const workflow = await readWorkflow();

  assert.equal((workflow.match(/--connect-timeout 10 --max-time 25/g) || []).length, 2);
  assert.match(workflow, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.6-flash:generateContent/);
  assert.match(workflow, /api\.openai\.com\/v1\/chat\/completions/);
  assert.equal((workflow.match(/rm -f "\$body"/g) || []).length, 2);

  for (const category of ['ok', 'auth', 'rate-limited', 'invalid-request', 'server-error', 'network-error', 'other-http']) {
    assert.match(workflow, new RegExp(category));
  }
});
