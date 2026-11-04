import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_IMAGE_EDIT_MODEL,
  DEFAULT_IMAGE_ORCHESTRATOR_MODEL,
  buildImageEditTool,
  imageEditModel,
  imageOrchestratorModel,
} from '../functions/openaiImageModels.ts';
import { DEFAULT_DESIGN_PREVIEW_RATES, previewDesignQuote } from '../src/lib/designQuotePreview.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('render path never calls the shut-down gpt-image-1 model', async () => {
  assert.equal(DEFAULT_IMAGE_EDIT_MODEL, 'gpt-image-2.5-sunburst');
  assert.equal(DEFAULT_IMAGE_ORCHESTRATOR_MODEL, 'gpt-5.5');
  assert.equal(imageEditModel({}), DEFAULT_IMAGE_EDIT_MODEL);
  assert.equal(imageEditModel({ OPENAI_IMAGE_MODEL: 'gpt-image-1' }), DEFAULT_IMAGE_EDIT_MODEL);
  assert.equal(imageOrchestratorModel({ OPENAI_IMAGE_ORCHESTRATOR_MODEL: 'gpt-5' }), DEFAULT_IMAGE_ORCHESTRATOR_MODEL);
  assert.equal(imageEditModel({ OPENAI_IMAGE_MODEL: 'gpt-image-2.5-flare' }), 'gpt-image-2.5-flare');
  for (const file of ['functions/aiDesignStudio.ts', 'functions/aiDesignStudioCompat.ts']) {
    const source = await read(file);
    assert.doesNotMatch(source, /"gpt-image-1"/, file);
    assert.match(source, /tools: \[buildImageEditTool\(\)\]/, file);
    assert.match(source, /model: imageOrchestratorModel\(\)/, file);
  }
});

test('image edit tool keeps reference-bound edit and drops input_fidelity for GPT Image 2+', () => {
  const tool = buildImageEditTool({});
  assert.equal(tool.type, 'image_generation');
  assert.equal(tool.action, 'edit');
  assert.equal(tool.model, 'gpt-image-2.5-sunburst');
  assert.equal('input_fidelity' in tool, false);
  assert.equal(buildImageEditTool({ OPENAI_IMAGE_MODEL: 'gpt-image-1.5' }).input_fidelity, 'high');
});

test('client quote preview uses the same default rates as the server price list', async () => {
  const source = await read('functions/designPriceList.ts');
  const block = source.slice(source.indexOf('DEFAULT_DESIGN_RATES: DesignRates = {'), source.indexOf('};', source.indexOf('DEFAULT_DESIGN_RATES: DesignRates = {')));
  const serverRates = new Map([...block.matchAll(/(\w+): ([0-9.]+)/g)].map((m) => [m[1], Number(m[2])]));
  for (const [key, value] of Object.entries(DEFAULT_DESIGN_PREVIEW_RATES)) {
    assert.ok(serverRates.has(key), key);
    assert.equal(serverRates.get(key), value, key);
  }
});

test('245 sq ft Premium majlis preview matches the server formula, not the legacy 257,400', () => {
  const quote = previewDesignQuote({ dimensions: 245, finishTier: 'Premium', furnitureBudget: 15000 });
  // (180+95)*245 = 67,375 + 1,800 logistics + 15,000 furniture = 84,175; +8% contingency +12% margin
  assert.equal(quote.finalTotal, 101010);
  assert.equal(quote.mobilizationAmount, 15151.5);
  assert.notEqual(quote.finalTotal, 257400);
});

test('Design Studio page no longer previews with the legacy institutional engine', async () => {
  const page = await read('src/pages/DesignStudioPage.tsx');
  assert.doesNotMatch(page, /calculateDesignStudioQuote\(/);
  assert.match(page, /previewDesignQuote\(/);
});
