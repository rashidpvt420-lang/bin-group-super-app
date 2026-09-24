#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const scanRoots = ['src', 'apps/admin-panel/src'];
const outputDir = path.join(root, 'audit');
const csvPath = path.join(outputDir, 'phase-3-interactive-control-inventory.csv');
const markdownPath = path.join(outputDir, 'PHASE_3_INTERACTIVE_CONTROL_INVENTORY.md');

const nativeInteractiveTags = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary']);
const componentInteractiveNames = /(?:Button|IconButton|ButtonBase|Link|NavLink|MenuItem|ListItemButton|Tab|Tabs|Switch|Checkbox|Radio|Fab|SpeedDialAction|Select|TextField|Autocomplete)$/;
const interactiveRoles = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'checkbox',
  'radio',
  'combobox',
  'textbox',
]);
const mutationWords = /submit|save|approve|reject|delete|remove|create|add|request|pay|complete|assign|upload|send|confirm|update|resubmit|start|stop|duty|accept|activate|dispatch|publish|invite|verify/i;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (/\.(?:tsx|jsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function attr(opening, name) {
  return opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
}

function attrText(opening, name, sourceFile) {
  const property = attr(opening, name);
  if (!property || !ts.isJsxAttribute(property) || !property.initializer) return '';
  if (ts.isStringLiteral(property.initializer)) return property.initializer.text.trim();
  if (ts.isJsxExpression(property.initializer) && property.initializer.expression) {
    return property.initializer.expression.getText(sourceFile).trim();
  }
  return property.initializer.getText(sourceFile).trim();
}

function tagName(opening) {
  return opening.tagName.getText();
}

function descendantLabelSignal(node, sourceFile) {
  if (ts.isJsxSelfClosingElement(node)) return '';
  const element = node.parent;
  if (!ts.isJsxElement(element)) return '';
  for (const child of element.children) {
    if (ts.isJsxText(child) && child.getText(sourceFile).replace(/\s+/g, ' ').trim()) return 'text';
    if (ts.isJsxExpression(child) && child.expression) {
      const text = child.expression.getText(sourceFile).trim();
      if (text && text !== 'null' && text !== 'false') return `expression:${text.slice(0, 80)}`;
    }
  }
  return '';
}

function isInteractive(opening, sourceFile) {
  const tag = tagName(opening);
  const lowerTag = tag.toLowerCase();
  const role = attrText(opening, 'role', sourceFile).replace(/^['"]|['"]$/g, '').toLowerCase();
  const hasOnClick = Boolean(attr(opening, 'onClick'));
  const hasOnChange = Boolean(attr(opening, 'onChange'));
  const hasOnSubmit = Boolean(attr(opening, 'onSubmit'));
  const tabIndex = attrText(opening, 'tabIndex', sourceFile);
  return nativeInteractiveTags.has(lowerTag) ||
    componentInteractiveNames.test(tag) ||
    interactiveRoles.has(role) ||
    hasOnClick ||
    hasOnChange ||
    hasOnSubmit ||
    (tabIndex && tabIndex !== '-1');
}

function openingFor(node) {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) return node;
  return null;
}

const rows = [];
const parseFailures = [];

for (const scanRoot of scanRoots) {
  for (const absolute of walk(path.join(root, scanRoot))) {
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    const sourceText = fs.readFileSync(absolute, 'utf8');
    const sourceFile = ts.createSourceFile(
      absolute,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX,
    );

    if (sourceFile.parseDiagnostics.length) {
      parseFailures.push(...sourceFile.parseDiagnostics.map((diagnostic) => `${relative}: ${diagnostic.messageText}`));
    }

    function visit(node) {
      const opening = openingFor(node);
      if (opening && isInteractive(opening, sourceFile)) {
        const location = sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile));
        const tag = tagName(opening);
        const role = attrText(opening, 'role', sourceFile);
        const testId = attrText(opening, 'data-testid', sourceFile);
        const ariaLabel = attrText(opening, 'aria-label', sourceFile);
        const title = attrText(opening, 'title', sourceFile);
        const placeholder = attrText(opening, 'placeholder', sourceFile);
        const name = attrText(opening, 'name', sourceFile);
        const id = attrText(opening, 'id', sourceFile);
        const value = attrText(opening, 'value', sourceFile);
        const childLabel = descendantLabelSignal(opening, sourceFile);
        const labelSignal = ariaLabel || title || placeholder || name || value || childLabel || '';
        const handler =
          attrText(opening, 'onClick', sourceFile) ||
          attrText(opening, 'onSubmit', sourceFile) ||
          attrText(opening, 'onChange', sourceFile) ||
          '';
        const disabled =
          attrText(opening, 'disabled', sourceFile) ||
          attrText(opening, 'aria-disabled', sourceFile) ||
          '';
        const openingText = opening.getText(sourceFile);
        const mutationHint = mutationWords.test(`${labelSignal} ${handler} ${openingText}`);
        const loadingGuard = /loading|submitting|saving|processing|pending|busy|is[A-Z][A-Za-z]*(?:ing|Pending)/.test(
          `${disabled} ${openingText}`,
        );

        rows.push({
          file: relative,
          line: location.line + 1,
          tag,
          role,
          testId,
          id,
          labelSignal,
          handler,
          disabledSignal: disabled,
          mutationHint: mutationHint ? 'yes' : 'no',
          loadingGuard: loadingGuard ? 'yes' : 'no',
        });
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
}

rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

fs.mkdirSync(outputDir, { recursive: true });
const headers = ['file','line','tag','role','testId','id','labelSignal','handler','disabledSignal','mutationHint','loadingGuard'];
const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(
  csvPath,
  [headers.join(','), ...rows.map((row) => headers.map((header) => quote(row[header])).join(','))].join('\n') + '\n',
);

const sourceFiles = new Set(rows.map((row) => row.file));
const mutationRows = rows.filter((row) => row.mutationHint === 'yes');
const guardedMutations = mutationRows.filter((row) => row.loadingGuard === 'yes' || row.disabledSignal);
const labelledRows = rows.filter((row) => row.labelSignal || row.testId || row.id);
const hardRouteAudit = fs.readFileSync(path.join(root, 'tests/e2e/hard-launch-routes.spec.ts'), 'utf8');
const platformAudit = fs.readFileSync(path.join(root, 'tests/e2e/phase3-platform-shell.spec.ts'), 'utf8');
const launchHonesty = fs.readFileSync(path.join(root, 'scripts/lib/launch-honesty.mjs'), 'utf8');

const failures = [];
if (!rows.length) failures.push('No interactive controls were discovered.');
if (parseFailures.length) failures.push(`JSX parse failures: ${parseFailures.slice(0, 10).join(' | ')}`);
if (!hardRouteAudit.includes('auditInteractiveControls')) {
  failures.push('Hard-launch route E2E is not wired to the Phase 3 runtime control audit.');
}
if (!hardRouteAudit.includes('Phase 3')) {
  failures.push('Hard-launch route E2E is missing the Phase 3 control-audit marker.');
}
if (!platformAudit.includes('auditInteractiveControls')) {
  failures.push('Cross-platform Phase 3 shell audit is not wired to the runtime control audit.');
}
if (!launchHonesty.includes("'tests/e2e/hard-launch-routes.spec.ts'")) {
  failures.push('Protected launchAuditLive evidence no longer includes the hard-launch route audit.');
}

const coveragePercent = rows.length ? ((labelledRows.length / rows.length) * 100).toFixed(1) : '0.0';
const mutationGuardPercent = mutationRows.length
  ? ((guardedMutations.length / mutationRows.length) * 100).toFixed(1)
  : '100.0';

const markdown = `# Phase 3 — Interactive Control Inventory

Generated from the checked-out source tree. This is an executable source inventory paired with Playwright runtime checks; it is not a manual checklist.

- Interactive controls discovered: **${rows.length}**
- Source files containing controls: **${sourceFiles.size}**
- Controls with a static label/test identity signal: **${labelledRows.length} / ${rows.length} (${coveragePercent}%)**
- Mutation-like controls detected: **${mutationRows.length}**
- Mutation-like controls with a disabled/loading signal in the JSX opening element: **${guardedMutations.length} / ${mutationRows.length} (${mutationGuardPercent}%)**
- Runtime route coverage: **tests/e2e/hard-launch-routes.spec.ts**
- Cross-platform public shell coverage: **tests/e2e/phase3-platform-shell.spec.ts**
- Protected live evidence binding: **launchAuditLive**

The CSV artifact contains every discovered control with source line, role/label/test identity signals, handler expression, disabled signal, and mutation/loading classification. Runtime Playwright assertions fail on visible unlabeled controls, raw i18n labels, contradictory disabled semantics, invalid busy semantics, page-level mobile overflow, and Arabic/RTL regressions.

`;

fs.writeFileSync(markdownPath, markdown);

console.log(`[phase3-controls] controls=${rows.length} files=${sourceFiles.size} labelSignals=${labelledRows.length} mutations=${mutationRows.length} guardedMutations=${guardedMutations.length}`);
console.log(`[phase3-controls] wrote ${path.relative(root, csvPath)} and ${path.relative(root, markdownPath)}`);

if (failures.length) {
  for (const failure of failures) console.error(`[phase3-controls] ERROR: ${failure}`);
  process.exit(1);
}
