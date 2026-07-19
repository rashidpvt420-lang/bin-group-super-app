import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('AI Design Studio exports distinct legacy and compatibility callables', async () => {
  const [legacy, compat, runtime] = await Promise.all([
    read('functions/index.ts'),
    read('functions/aiDesignStudioCompat.ts'),
    read('functions/runtime.ts'),
  ]);

  assert.match(legacy, /export const generateDesignConcept = onCall/);
  assert.match(compat, /export const generateDesignConceptCompat = onCall/);
  assert.doesNotMatch(compat, /export const generateDesignConcept = onCall/);
  assert.match(runtime, /export \* from "\.\/index"/);
  assert.match(runtime, /export \* from "\.\/aiDesignStudioCompat"/);
});

test('AI Design Studio compatibility callable is fail-closed and reference-image bound', async () => {
  const source = await read('functions/aiDesignStudioCompat.ts');

  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /new Set\(\["admin", "super_admin", "ceo", "operations_admin"\]\)/);
  assert.doesNotMatch(source, /"owner", "tenant"/);
  assert.match(source, /MAX_REFERENCE_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(source, /hasExpectedImageSignature/);
  assert.match(source, /inputImageSha256/);
  assert.match(source, /type: "input_image"/);
  assert.match(source, /type: "image_generation"/);
  assert.match(source, /action: "edit"/);
  assert.match(source, /input_fidelity: "high"/);
  assert.doesNotMatch(source, /generatedImage = imageBase64/);
  assert.doesNotMatch(source, /provider = "fallback"/);
  assert.doesNotMatch(source, /\.slice\(0, 8_000_000\)/);
  assert.match(source, /throw new HttpsError\("failed-precondition"/);
  assert.match(source, /throw new HttpsError\("unavailable"/);
});

test('Admin AI Design Studio uses the hardened callable without client-side reference upload', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/DesignStudioAdminPage.tsx');

  assert.match(source, /MAX_REFERENCE_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(source, /generateDesignConceptCompat/);
  assert.match(source, /data\.live !== true/);
  assert.match(source, /data\.renderStatus !== 'AI_RENDER_COMPLETE'/);
  assert.doesNotMatch(source, /uploadBytes/);
  assert.doesNotMatch(source, /getDownloadURL/);
  assert.doesNotMatch(source, /from 'firebase\/storage'/);
  assert.doesNotMatch(source, /Maximum supported size is 50MB/);
});
