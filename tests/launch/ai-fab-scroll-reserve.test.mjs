import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI assistant FAB reserves bottom scroll space so it cannot cover the last content', async () => {
  const s = await readFile('src/components/SovereignAIChat.tsx', 'utf8');
  assert.match(s, /body\.style\.paddingBottom = `calc\(\$\{FAB_SIZE \+ 30 \+ EDGE_PADDING\}px \+ env\(safe-area-inset-bottom\)\)`/);
  assert.match(s, /return \(\) => \{ body\.style\.paddingBottom = previous; \}/);
});
