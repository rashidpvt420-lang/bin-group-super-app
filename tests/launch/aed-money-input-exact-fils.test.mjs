// parseExactAedAmount: AED input exact to the fils; sub-fils rejected, never rounded.
// normalizeAedMoney (functions/shared/aedMoney.ts) must match the blob pinned by the
// frozen release evidence (scripts/run-frozen-release-evidence.mjs).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../functions/shared/aedMoneyInput.ts', import.meta.url), 'utf8');

async function load() {
  const { default: ts } = await import('typescript');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

test('exact-fils inputs are accepted unchanged', async () => {
  const { parseExactAedAmount } = await load();
  for (const [input, expected] of [[7083.38, 7083.38], ['7083.38', 7083.38], ['7083.380', 7083.38], [0.1, 0.1], ['0.10', 0.1], [100, 100], ['100', 100], [0, 0], [-0, 0], [99999999.99, 99999999.99], [-12.5, -12.5]]) {
    assert.equal(parseExactAedAmount(input), expected, `input ${input}`);
  }
});

test('sub-fils and malformed inputs are rejected, not rounded', async () => {
  const { parseExactAedAmount } = await load();
  for (const input of [7083.385, '7083.385', 8500.555, 0.001, 1e-7, '100.0001', 0.1 + 0.2]) {
    assert.throws(() => parseExactAedAmount(input), (error) => error.reason === 'SUB_FILS', `input ${input}`);
  }
  for (const input of [NaN, Infinity, '', ' ', 'abc', '1,000.00', '1e3', null, undefined, {}, []]) {
    assert.throws(() => parseExactAedAmount(input), RangeError, `input ${String(input)}`);
  }
  assert.throws(() => parseExactAedAmount(1e21), (error) => error.reason === 'OUT_OF_RANGE');
});

test('aedMoney.ts matches the blob pinned by the frozen-release gate', () => {
  const pinned = readFileSync(new URL('../../scripts/run-frozen-release-evidence.mjs', import.meta.url), 'utf8');
  const expected = /'functions\/shared\/aedMoney\.ts': '([0-9a-f]{40})'/.exec(pinned)?.[1];
  assert.ok(expected);
  const actual = execFileSync('git', ['hash-object', 'functions/shared/aedMoney.ts'], { cwd: new URL('../..', import.meta.url) }).toString().trim();
  assert.equal(actual, expected);
});
