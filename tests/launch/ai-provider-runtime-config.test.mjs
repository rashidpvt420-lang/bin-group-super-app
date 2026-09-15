import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../functions/aiAssistant.ts', import.meta.url), 'utf8');

test('Gemini defaults use current stable 3.x candidates and bounded thinking', () => {
  assert.match(source, /"gemini-3\.6-flash"/);
  assert.match(source, /"gemini-3\.5-flash"/);
  assert.doesNotMatch(source, /
s*"gemini-2\.5-flash",/);
  assert.match(source, /model\.startsWith\("gemini-2\.5-"\)[\s\S]*thinkingBudget: 0[\s\S]*thinkingLevel: "low"/);
  assert.match(source, /generationConfig: \{ maxOutputTokens: 700, thinkingConfig \}/);
});

test('OpenAI 429 handling is not weakened by the Gemini repair', () => {
  assert.match(source, /new OpenAI\(\{ apiKey, timeout: timeoutMs, maxRetries: 0 \}\)/);
  assert.match(source, /status === 429 \|\| code\.includes\("rate_limit"\)\) return "rate-limited"/);
});
