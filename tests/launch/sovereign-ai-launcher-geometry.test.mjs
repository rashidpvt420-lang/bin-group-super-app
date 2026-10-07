import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the production geometry directly, without importing Firebase or
// requiring a signed-in session. Drawer size and BIN Connect placement use
// different breakpoints: sm (600px) versus md (900px).
const sourcePath = process.env.UI_AUDIT_ROOT
  ? `${process.env.UI_AUDIT_ROOT}/src/components/SovereignAIChat.tsx`
  : new URL('../../src/components/SovereignAIChat.tsx', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const geometry = source.slice(source.indexOf('type FabPosition'), source.indexOf('const roleData'));
function clamp(width, height, position, reserveBinConnect = true) {
  const context = { window: { innerWidth: width, innerHeight: height } };
  runInNewContext(ts.transpileModule(`${geometry}\nglobalThis.clamp = clampFabPosition;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.clamp(position, {
    reserveBinConnect,
    isMobile: width < 600,
    isBinConnectCompact: width < 900,
  });
}

for (const width of [390, 599, 600, 768, 899, 900, 1280]) {
  test(`AI clears BIN Connect at ${width}px after restoring or dragging into its corner`, () => {
    const height = 800;
    const right = width < 900 ? 16 : 26;
    const bottom = width < 900 ? 74 : 28;
    const connect = { x: width - right - 56, y: height - bottom - 56 };
    for (const position of [connect, { x: width - 86, y: height - 86 }]) {
      const result = clamp(width, height, position);
      const clear = result.x + 56 + 14 <= connect.x || connect.x + 56 + 14 <= result.x ||
        result.y + 56 + 14 <= connect.y || connect.y + 56 + 14 <= result.y;
      assert.ok(clear, `overlap at ${width}px: AI ${JSON.stringify(result)} / BIN Connect ${JSON.stringify(connect)}`);
    }
  });
}

test('public launcher placement does not reserve a signed-in BIN Connect corner', () => {
  const result = clamp(768, 800, { x: 682, y: 714 }, false);
  assert.equal(result.x, 682);
  assert.equal(result.y, 714);
});

function activateAfterGesture(detail) {
  const handler = source.slice(source.indexOf('  const handleFabClick ='), source.indexOf('  const renderContent'));
  const context = {
    suppressClickRef: { current: true },
    setOpen: () => { context.open = true; },
    open: false,
  };
  runInNewContext(ts.transpileModule(`${handler}\nglobalThis.click = handleFabClick;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  context.click({ detail, preventDefault() {}, stopPropagation() {} });
  return context;
}

test('cancelled gesture does not swallow the next native keyboard click', () => {
  assert.equal(activateAfterGesture(0).open, true);
});

test('completed drag suppresses its synthesized pointer click but allows the next click', () => {
  const context = activateAfterGesture(1);
  assert.equal(context.open, false);
  context.click({ detail: 1 });
  assert.equal(context.open, true);
});


test('closed drawer cannot intercept page controls on mobile WebKit or desktop', () => {
  const guards = source.match(/pointerEvents: open \? 'auto' : 'none'/g) || [];
  assert.ok(guards.length >= 4, 'both drawer modal roots and papers must disable pointer events while closed');
});
