import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reconciler = readFileSync('scripts/reconcile-hard-public-evidence.mjs', 'utf8');

function reconcilerRequiredPrivacyWording() {
  const anchor = reconciler.indexOf("readFileSync(path.join(root, 'public', 'privacy-policy.html')");
  assert.ok(anchor > 0, 'reconciler must read the frozen-release privacy policy');
  const listStart = reconciler.indexOf('for (const requiredText of [', anchor);
  const listEnd = reconciler.indexOf(']) {', listStart);
  assert.ok(listStart > anchor && listEnd > listStart, 'reconciler required-wording list must be present');
  const list = [...reconciler.slice(listStart, listEnd).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(list.length >= 9, 'reconciler required-wording list must not shrink silently');
  return list;
}

test('static privacy pages contain every string the hard-clearance reconciler requires', () => {
  const required = reconcilerRequiredPrivacyWording();
  for (const page of ['public/privacy-policy.html', 'public/privacy.html']) {
    const html = readFileSync(page, 'utf8');
    for (const text of required) {
      assert.ok(html.includes(text), `${page} is missing reconciler wording: ${text}`);
    }
  }
});

test('privacy pages name the AI subprocessors the backend actually calls', () => {
  const functionsSources = ['functions/index.ts', 'functions/aiAssistant.ts', 'functions/propertyDescriptionAnalyzer.ts']
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  assert.match(functionsSources, /api\.openai\.com/);
  assert.match(functionsSources, /generativelanguage\.googleapis\.com/);
  assert.match(reconciler, /gemini/i);
  assert.match(reconciler, /openai/i);
  for (const page of ['public/privacy-policy.html', 'public/privacy.html']) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<strong>OpenAI:<\/strong>/);
    assert.match(html, /<strong>Google Gemini \(Google\):<\/strong>/);
    assert.match(html, /<strong>Google Maps:<\/strong>/);
  }
});
