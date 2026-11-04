// Transpile a small set of pure TS modules (and their relative imports) to a temp dir
// so node:test can import them without a build step.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

export async function loadTsModules(entry, deps = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-mod-'));
  for (const file of [entry, ...deps]) {
    const src = fs.readFileSync(file, 'utf8');
    let out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    out = out.replace(/from "(\.\/[^"]+)"/g, (_m, p) => `from "${p}.mjs"`);
    fs.writeFileSync(path.join(dir, path.basename(file).replace(/\.tsx?$/, '.mjs')), out);
  }
  return import(path.join(dir, path.basename(entry).replace(/\.tsx?$/, '.mjs')));
}
