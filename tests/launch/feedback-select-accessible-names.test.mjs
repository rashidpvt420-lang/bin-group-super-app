import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('/feedback selects have accessible names (axe aria-input-field-name)', async () => {
  const s = await readFile('src/pages/public/PilotFeedbackPage.tsx', 'utf8');
  for (const [label, id] of [['Testing as', 'feedback-role'], ['Area tested', 'feedback-area'], ['Rating', 'feedback-rating']]) {
    assert.ok(s.includes(`<InputLabel id="${id}-label">${label}</InputLabel>`), label);
    assert.ok(s.includes(`<Select labelId="${id}-label" id="${id}" label="${label}"`), label);
  }
  assert.doesNotMatch(s, /<InputLabel>/);
});
