import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const roots = ['src', 'apps/admin-panel/src'];
const ignore = [/\/__tests__\//, /\.test\./, /\.spec\./];
const extensions = new Set(['.tsx', '.jsx']);
const controls = [];
const failures = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) {
      const rel = path.relative(root, full).replaceAll('\\', '/');
      if (!ignore.some((re) => re.test('/' + rel))) inspect(rel, fs.readFileSync(full, 'utf8'));
    }
  }
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function textContent(openTag, after) {
  const close = after.match(/^([\s\S]{0,500}?)<\//);
  return close ? close[1].replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '=(["\x27])([^"\x27]+)\\1'));
  return m ? m[2].trim() : '';
}

function dynamicAttr(tag, name) {
  return new RegExp(name + '=\\{').test(tag);
}

function classify(tagName, tag) {
  if (tagName === 'a') return 'link';
  if (tagName === 'button' || tagName === 'Button' || tagName === 'IconButton') return 'button';
  if (/^(Switch|Checkbox|Radio)$/.test(tagName)) return 'toggle';
  if (/^(Select|MenuItem)$/.test(tagName)) return 'select';
  if (/^(TextField|input|textarea)$/.test(tagName)) return 'input';
  if (/onClick=/.test(tag)) return 'clickable';
  return 'interactive';
}

function inspect(file, source) {
  const re=/<(Button|IconButton|Switch|Checkbox|Radio|Select|MenuItem|TextField|button|a|input|textarea|Box|Paper|Card|ListItemButton)\b[^>]*(?:onClick=|onSubmit=|type=["']submit["']|href=|role=["']button["']|disabled=|aria-label=|data-testid=)[^>]*>/g;
  for (const match of source.matchAll(re)) {
    const tag = match[0];
    const tagName = match[1];
    const index = match.index ?? 0;
    const after = source.slice(index + tag.length);
    const staticLabel = attr(tag, 'aria-label') || attr(tag, 'title') || attr(tag, 'data-testid') || attr(tag, 'name') || textContent(tag, after);
    const hasDynamicLabel = dynamicAttr(tag, 'aria-label') || dynamicAttr(tag, 'title') || dynamicAttr(tag, 'data-testid');
    const hasAccessibleName = Boolean(staticLabel || hasDynamicLabel || /startIcon=|endIcon=/.test(tag) && textContent(tag, after));
    const mutating = /onClick=|onSubmit=|type=["']submit["']/.test(tag);
    const disabledGuard = /disabled=/.test(tag);
    const loadingSignal = /CircularProgress|loading|submitting|saving|busy|pending/i.test(tag + after.slice(0, 300));
    const kind = classify(tagName, tag);
    const row = {
      file, line: lineOf(source, index), kind,
      label: staticLabel || (hasDynamicLabel ? '<dynamic>' : ''),
      mutating, disabledGuard, loadingSignal,
    };
    controls.push(row);
    if ((kind === 'button' || kind === 'link' || kind === 'toggle' || kind === 'clickable') && !hasAccessibleName) {
      failures.push(`${file}:${row.line} ${kind} has no accessible/static/dynamic label, title, or test id`);
    }
    if (mutating && /type=["']submit["']/.test(tag) && !disabledGuard && !loadingSignal) {
      failures.push(`${file}:${row.line} submit control has no disabled/loading guard`);
    }
  }
}

for (const dir of roots) walk(path.resolve(root, dir));

if (!controls.length) failures.push('No interactive controls discovered.');

const outDir=path.resolve(root,'artifacts');
fs.mkdirSync(outDir,{recursive:true});
const matrixPath=path.join(outDir,'phase3-interactive-control-inventory.json');
fs.writeFileSync(matrixPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  controlCount: controls.length,
  byKind: Object.fromEntries([...new Set(controls.map(c=>c.kind))].map(k=>[k,controls.filter(c=>c.kind===k).length])),
  controls,
},null,2)+'\n');

console.log(`Phase 3 interactive controls discovered: ${controls.length}`);
console.log(`Inventory: ${path.relative(root,matrixPath)}`);
if (failures.length) {
  console.error('Phase 3 interactive-control inventory failed:');
  for (const failure of failures) console.error(' - '+failure);
  process.exit(1);
}
console.log('PASS — every discovered interactive control has an accessible identity and submit controls expose a pending/disabled guard.');
