import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const fields = await loadTsModules('functions/designPromptFields.ts');
const rules = readFileSync('firestore.rules', 'utf8');
const studio = readFileSync('functions/aiDesignStudio.ts', 'utf8');
const compat = readFileSync('functions/aiDesignStudioCompat.ts', 'utf8');
const page = readFileSync('src/pages/DesignRequestDetailPage.tsx', 'utf8');
const ownerPage = readFileSync('apps/owner-app/src/pages/DesignRequestDetailPage.tsx', 'utf8');
const adminPage = readFileSync('apps/admin-panel/src/pages/admin/DesignStudioAdminPage.tsx', 'utf8');

test('image prompt is split off the client design record', () => {
  const split = fields.splitDesignPrompt({
    id: 'req',
    conceptPrompt: 'SECRET PROVIDER PROMPT',
    concepts: [{ id: 'primary', optionLabel: 'Option 1', prompt: 'SECRET OPTION PROMPT' }],
  });
  assert.equal(split.hasPrompt, true);
  assert.equal(split.stored.conceptPrompt, 'SECRET PROVIDER PROMPT');
  assert.equal(split.stored.conceptPrompts[0].prompt, 'SECRET OPTION PROMPT');
  assert.equal(split.client.conceptPrompt, undefined);
  assert.equal(split.client.concepts[0].prompt, undefined);
  assert.equal(split.client.concepts[0].optionLabel, 'Option 1');
});

test('design records and client screens do not keep the raw image prompt', () => {
  const clientPayload = studio.slice(studio.indexOf('const requestPayload'), studio.indexOf('transaction.create(requestRef'));
  assert.doesNotMatch(clientPayload, /conceptPrompt|prompt:/);
  assert.match(studio, /collection\("design_generation_prompts"\)/);
  assert.doesNotMatch(compat, /outputMimeType: result\.mimeType,\s*prompt,/);
  assert.match(compat, /design_generation_prompts/);
  assert.match(page, /stripDesignPrompt\(/);
  assert.doesNotMatch(page, /conceptPrompt/);
  assert.match(ownerPage, /_conceptPrompt/);
  assert.match(adminPage, /written image prompt is not shown/);
  assert.match(rules, /match \/design_generation_prompts\/\{promptId\} \{[\s\S]*?allow read, create, update, delete: if false;/);
  assert.match(rules, /'design_generation_prompts'/);
});
