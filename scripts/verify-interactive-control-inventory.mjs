import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const auditDir = path.join(root, 'audit');
fs.mkdirSync(auditDir, { recursive: true });

const sourceRoots = ['src', 'apps/admin-panel/src', 'apps/owner-app/src'];
const ignoredParts = new Set(['__tests__', '__mocks__', 'node_modules', 'dist', 'build']);
const testRoots = ['tests/e2e', 'apps/admin-panel/src/__tests__'];
const canonicalControls = new Set([
  'Button', 'IconButton', 'Fab', 'ButtonBase', 'Tab', 'MenuItem', 'Switch', 'Checkbox',
  'Radio', 'Select', 'TextField', 'Autocomplete', 'SpeedDialAction', 'button', 'a', 'input',
  'select', 'textarea',
]);
const fieldControls = new Set(['Switch', 'Checkbox', 'Radio', 'Select', 'TextField', 'Autocomplete', 'input', 'select', 'textarea']);
const iconOnlyControls = new Set(['IconButton', 'Fab', 'SpeedDialAction']);
const mutatingWords = /\b(save|submit|approve|reject|delete|remove|create|invite|upload|verify|unlock|complete|close|send|assign|dispatch|claim|accept|update|pay|refund|publish|archive|restore|resubmit|confirm|revoke|rotate)\b/i;
const serverMutationPattern = /httpsCallable\s*\(|callFunction\s*\(|(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(|\.(?:set|update|delete)\s*\(|\bfetch\s*\(|\baxios\.(?:post|put|patch|delete)\s*\(/i;
const directClientWritePattern = /\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/;

function walk(dir, extensions = new Set(['.tsx', '.jsx'])) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, extensions));
    else if (extensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function roleFor(file) {
  if (file.startsWith('apps/admin-panel/')) return 'admin';
  if (file.includes('/owner/')) return 'owner';
  if (file.includes('/tenant/')) return 'tenant';
  if (file.includes('/technician/')) return 'technician';
  if (file.includes('/broker/')) return 'broker';
  if (file.includes('/auditor/')) return 'auditor';
  if (file.includes('/onboarding/')) return 'public-onboarding';
  if (file.includes('/public/')) return 'public';
  return 'shared';
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function jsxTagName(node, sourceFile) {
  const tag = node.tagName?.getText(sourceFile) || '';
  return tag.split('.').at(-1) || tag;
}

function attrsFor(node, sourceFile) {
  const map = new Map();
  for (const property of node.attributes?.properties || []) {
    if (!ts.isJsxAttribute(property)) continue;
    const name = property.name.getText(sourceFile);
    const init = property.initializer;
    if (!init) {
      map.set(name, { text: 'true', node: property });
    } else if (ts.isStringLiteral(init)) {
      map.set(name, { text: init.text, node: property });
    } else if (ts.isJsxExpression(init)) {
      map.set(name, { text: init.expression?.getText(sourceFile) || '', node: property, expression: init.expression });
    } else {
      map.set(name, { text: init.getText(sourceFile), node: property });
    }
  }
  return map;
}

function childLabel(node, sourceFile) {
  if (!ts.isJsxElement(node)) return { text: '', dynamic: false };
  const textParts = [];
  let dynamic = false;
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      const value = normalize(child.getText(sourceFile));
      if (value) textParts.push(value);
    } else if (ts.isJsxExpression(child) && child.expression) {
      dynamic = true;
    } else if (ts.isJsxElement(child)) {
      const nested = childLabel(child, sourceFile);
      if (nested.text) textParts.push(nested.text);
      dynamic ||= nested.dynamic;
    }
  }
  return { text: normalize(textParts.join(' ')), dynamic };
}

function collectFunctions(sourceFile) {
  const functions = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      functions.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return functions;
}

function referencedHandlers(expression) {
  const names = new Set();
  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) names.add(node.expression.text);
      if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) names.add(node.expression.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  if (expression) visit(expression);
  return [...names];
}

function handlerContext(attr, sourceFile, functions) {
  if (!attr?.expression) return '';
  const expression = attr.expression;
  if (ts.isIdentifier(expression)) {
    const target = functions.get(expression.text);
    return target ? target.getText(sourceFile) : expression.getText(sourceFile);
  }
  let context = expression.getText(sourceFile);
  for (const name of referencedHandlers(expression)) {
    const target = functions.get(name);
    if (target) context += '\n' + target.getText(sourceFile);
  }
  return context;
}

function handlerName(attr, sourceFile) {
  if (!attr?.expression) return '';
  if (ts.isIdentifier(attr.expression)) return attr.expression.text;
  const calls = referencedHandlers(attr.expression);
  return calls[0] || normalize(attr.expression.getText(sourceFile)).slice(0, 120);
}

function serverAction(context) {
  const callable = context.match(/httpsCallable\s*\([^,]+,\s*['"]([^'"]+)['"]/);
  if (callable) return callable[1];
  const direct = context.match(/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  return direct?.[1] || '';
}

function hasBusyGuard(attrs, context) {
  const disabled = attrs.get('disabled')?.text || '';
  if (disabled && disabled !== 'false') return true;
  return /\b(busy|loading|submitting|saving|processing|pending|isPending|inFlight|requesting)\b/i.test(disabled) ||
    /if\s*\([^)]*(?:busy|loading|submitting|saving|processing|pending|isPending|inFlight)[^)]*\)\s*return/i.test(context) ||
    /(?:setBusy|setLoading|setSubmitting|setSaving|setProcessing|setPending)\s*\(true\)/i.test(context);
}

function hasErrorHandling(context) {
  return /\bcatch\s*\(|setError\s*\(|setMessage\s*\(|enqueueSnackbar\s*\(|toast\.|showToast\s*\(|throw new Error|setAlert\s*\(/i.test(context);
}

function hasSuccessHandling(context) {
  return /setSuccess\s*\(|setMessage\s*\(|enqueueSnackbar\s*\(|toast\.|navigate\s*\(|setOpen\s*\(false\)|onSuccess\b|setAlert\s*\(|setDialogOpen\s*\(false\)/i.test(context);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

const e2eText = testRoots
  .filter((dir) => fs.existsSync(path.join(root, dir)))
  .flatMap((dir) => walk(path.join(root, dir), new Set(['.ts', '.tsx', '.js', '.jsx'])))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

const rows = [];
for (const fileAbs of sourceRoots.flatMap((dir) => walk(path.join(root, dir)))) {
  const file = relative(fileAbs);
  const source = fs.readFileSync(fileAbs, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = collectFunctions(sourceFile);

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = jsxTagName(opening, sourceFile);
      const attrs = attrsFor(opening, sourceFile);
      const hasClick = attrs.has('onClick');
      const hasChange = attrs.has('onChange');
      const hasSubmit = attrs.has('onSubmit');
      const hasHref = attrs.has('href') || attrs.has('to');
      const interactive = canonicalControls.has(tag) || hasClick || hasHref;

      if (interactive) {
        const line = sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile)).line + 1;
        const children = childLabel(node, sourceFile);
        const aria = normalize(attrs.get('aria-label')?.text || attrs.get('aria-labelledby')?.text);
        const labelProp = normalize(attrs.get('label')?.text);
        const title = normalize(attrs.get('title')?.text);
        const placeholder = normalize(attrs.get('placeholder')?.text);
        const name = normalize(attrs.get('name')?.text);
        const testId = normalize(attrs.get('data-testid')?.text);
        const value = normalize(attrs.get('value')?.text);
        const label = aria || labelProp || children.text || title || placeholder || name || value || (children.dynamic ? '(dynamic)' : '');

        const eventName = hasClick ? 'onClick' : hasSubmit ? 'onSubmit' : hasChange ? 'onChange' : '';
        const handlerAttr = attrs.get(eventName);
        const handler = handlerName(handlerAttr, sourceFile);
        const context = handlerContext(handlerAttr, sourceFile, functions);
        const buttonLike = !fieldControls.has(tag);
        const networkMutation = serverMutationPattern.test(context);
        const mutation = buttonLike && networkMutation && (mutatingWords.test(label + ' ' + handler) || /httpsCallable|callFunction|addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction/i.test(context));
        const action = mutation ? serverAction(context) : '';
        const busyGuard = mutation ? hasBusyGuard(attrs, context) : true;
        const errorHandling = mutation ? hasErrorHandling(context) : true;
        const successHandling = mutation ? hasSuccessHandling(context) : true;

        const surfaceRole = roleFor(file);
        const directClientWrite = directClientWritePattern.test(context) && !/httpsCallable\s*\(/.test(context);
        const privilegeSensitive =
          /\b(role|permission|admin|privilege|claim|paymentverified|dispatchready|unlock|payout|approve|reject)\b/i.test(label + ' ' + handler + ' ' + context);
        const privilegeRisk =
          directClientWrite &&
          privilegeSensitive &&
          surfaceRole !== 'admin';

        const anchors = [testId, aria, action, handler, children.text]
          .filter((token) => token && token !== '(dynamic)' && token.length >= 3);
        const e2eCovered = !mutation || anchors.some((anchor) => new RegExp(escapeRegExp(anchor), 'i').test(e2eText));

        const issues = [];
        if (iconOnlyControls.has(tag) && !aria && !title && !children.text && !children.dynamic) issues.push('icon-control-missing-accessible-label');
        if ((tag === 'button' || tag === 'Button' || tag === 'ButtonBase') && !label) issues.push('button-missing-accessible-label');
        if (mutation && !busyGuard) issues.push('mutation-missing-busy-guard');
        if (mutation && !errorHandling) issues.push('mutation-missing-error-path');
        if (mutation && !successHandling) issues.push('mutation-missing-success-path');
        if (mutation && !e2eCovered) issues.push('mutation-missing-e2e-anchor');
        if (privilegeRisk) issues.push('privileged-direct-client-write');

        rows.push({
          file,
          line,
          role: roleFor(file),
          tag,
          label: label || '(unresolved)',
          testId,
          handler: handler || '(native/inherited)',
          mutation: mutation ? 'yes' : 'no',
          serverAction: action,
          busyGuard: busyGuard ? 'yes' : 'no',
          successHandling: successHandling ? 'yes' : 'no',
          errorHandling: errorHandling ? 'yes' : 'no',
          e2eCovered: e2eCovered ? 'yes' : 'no',
          issues,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const unique = [];
const seen = new Set();
for (const row of rows) {
  const key = [row.file, row.line, row.tag, row.handler, row.label].join(':');
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}

const issueRows = unique.filter((row) => row.issues.length);
const csvHeaders = [
  'file','line','role','tag','label','test_id','handler','mutation','server_action',
  'busy_guard','success_handling','error_handling','e2e_covered','issues'
];
const csvEscape = (value) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const csvLines = [csvHeaders.join(',')];
for (const r of unique) {
  csvLines.push([
    r.file,r.line,r.role,r.tag,r.label,r.testId,r.handler,r.mutation,r.serverAction,
    r.busyGuard,r.successHandling,r.errorHandling,r.e2eCovered,r.issues.join('|')
  ].map(csvEscape).join(','));
}
fs.writeFileSync(path.join(auditDir, 'phase-3-interactive-control-inventory.csv'), csvLines.join('\n') + '\n');

const byRole = new Map();
for (const row of unique) byRole.set(row.role, (byRole.get(row.role) || 0) + 1);
const mutations = unique.filter((row) => row.mutation === 'yes');
const md = [
  '# Phase 3 Interactive Control Inventory',
  '',
  'TypeScript-AST inventory of discoverable interactive controls in canonical app sources.',
  '',
  '- Total controls: **' + unique.length + '**',
  '- Mutation-like controls: **' + mutations.length + '**',
  '- Controls with findings: **' + issueRows.length + '**',
  '',
  '## Controls by role/surface',
  '',
  '| Role/surface | Controls |',
  '| --- | ---: |',
  ...[...byRole.entries()].sort().map(([role, count]) => '| ' + role + ' | ' + count + ' |'),
  '',
  '## Required executable contract',
  '',
  '- Icon-only controls require an accessible label.',
  '- Mutation controls require duplicate-submit/busy protection, a success path, an error path, and an E2E evidence anchor.',
  '- Privileged surfaces may not perform direct client-side Firestore writes.',
  '- Runtime route E2E checks every visible control for accessible naming and actual enabled/disabled state on desktop and mobile Arabic.',
  '',
  '## Findings',
  '',
  ...(issueRows.length ? issueRows.map((row) => '- ' + row.file + ':' + row.line + ' — ' + row.tag + ' **' + row.label + '** — ' + row.issues.join(', ')) : ['No findings.']),
  '',
].join('\n');
fs.writeFileSync(path.join(auditDir, 'PHASE_3_INTERACTIVE_CONTROL_INVENTORY.md'), md);

console.log('Phase 3 interactive controls inventoried: ' + unique.length);
console.log('Mutation-like controls: ' + mutations.length);
console.log('Controls with findings: ' + issueRows.length);

if (issueRows.length) {
  console.error('\nPHASE 3 INTERACTIVE CONTROL AUDIT FAILED');
  for (const row of issueRows.slice(0, 250)) {
    console.error('- ' + row.file + ':' + row.line + ' ' + row.tag + ' "' + row.label + '" -> ' + row.issues.join(', '));
  }
  if (issueRows.length > 250) console.error('- ... ' + (issueRows.length - 250) + ' additional findings omitted; see audit matrix.');
  process.exit(1);
}

console.log('PHASE 3 INTERACTIVE CONTROL AUDIT PASSED');
