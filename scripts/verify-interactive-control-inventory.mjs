import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditDir = path.join(root, 'audit');
fs.mkdirSync(auditDir, { recursive: true });

const sourceRoots = ['src', 'apps/admin-panel/src', 'apps/owner-app/src'];
const ignoredParts = new Set(['__tests__', '__mocks__', 'node_modules', 'dist', 'build']);
const testRoots = ['tests/e2e', 'apps/admin-panel/src/__tests__'];
const controlTags = new Set([
  'Button', 'IconButton', 'Fab', 'ButtonBase', 'Tab', 'MenuItem', 'Switch', 'Checkbox',
  'Radio', 'Select', 'TextField', 'Autocomplete', 'SpeedDialAction', 'button', 'a', 'input',
  'select', 'textarea',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (['.tsx', '.jsx'].includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function rel(file) {
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

function prop(attrs, name) {
  const patterns = [
    new RegExp('\\b' + name + '\s*=\s*"([^"]*)"'),
    new RegExp("\\b" + name + "\s*=\s*'([^']*)'"),
    new RegExp('\\b' + name + '\s*=\s*\{([^}]*)\}'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(attrs);
    if (match) return match[1].trim();
  }
  return '';
}

function stripJsx(value) {
  return String(value || '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function handlerContext(source, handler) {
  if (!handler || !/^[A-Za-z_$][\w$]*$/.test(handler)) return '';
  const names = [
    '(?:const|let)\s+' + handler + '\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{',
    '(?:const|let)\s+' + handler + '\s*=\s*(?:async\s*)?[^=]*=>\s*\{',
    '(?:async\s+)?function\s+' + handler + '\s*\([^)]*\)\s*\{',
  ];
  for (const item of names) {
    const match = new RegExp(item).exec(source);
    if (match) return source.slice(match.index, Math.min(source.length, match.index + 7000));
  }
  return '';
}

function extractHandler(attrs, propName) {
  const value = prop(attrs, propName);
  if (!value) return '';
  const direct = value.match(/^([A-Za-z_$][\w$]*)$/);
  return direct ? direct[1] : value.slice(0, 240);
}

function hasServerMutation(text) {
  return /httpsCallable\s*\(|(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(|\.set\s*\(|\.update\s*\(|\.delete\s*\(/i.test(text);
}

function mutationToken(text) {
  const callable = text.match(/httpsCallable\s*\([^,]+,\s*['"]([^'"]+)['"]/);
  if (callable) return callable[1];
  const method = text.match(/\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  return method ? method[1] : '';
}

function isLikelyMutation(label, handler, context) {
  const joined = label + ' ' + handler + ' ' + context.slice(0, 1800);
  return hasServerMutation(context) || /\b(save|submit|approve|reject|delete|remove|create|invite|upload|verify|unlock|complete|close|send|assign|dispatch|claim|accept|start|stop|update|pay|refund|publish|archive|restore|resubmit|confirm)\b/i.test(joined);
}

function hasBusyGuard(attrs, context) {
  if (/\bdisabled\s*=/.test(attrs)) return true;
  return /if\s*\([^)]*(?:busy|loading|submitting|saving|processing|pending|isPending)[^)]*\)\s*return|(?:setBusy|setLoading|setSubmitting|setSaving|setProcessing)\s*\(true\)/i.test(context);
}

function hasErrorHandling(context) {
  return /\bcatch\s*\(|setError\s*\(|setMessage\s*\(|enqueueSnackbar\s*\(|toast\.|showToast\s*\(/i.test(context);
}

function hasSuccessHandling(context) {
  return /setSuccess\s*\(|setMessage\s*\(|enqueueSnackbar\s*\(|toast\.|navigate\s*\(|setOpen\s*\(false\)|onSuccess\b/i.test(context);
}

function directPrivilegeRisk(file, label, context) {
  const privileged = roleFor(file) === 'admin' || /\b(approve|reject|role|staff|permission|dispatch|payment|payout|unlock|verify|delete|admin|privilege|claim)\b/i.test(label);
  if (!privileged) return false;
  return /\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/.test(context) && !/httpsCallable\s*\(/.test(context);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

const e2eText = testRoots
  .filter((dir) => fs.existsSync(path.join(root, dir)))
  .flatMap((dir) => walk(path.join(root, dir)))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

const rows = [];
for (const fileAbs of sourceRoots.flatMap((dir) => walk(path.join(root, dir)))) {
  const file = rel(fileAbs);
  const source = fs.readFileSync(fileAbs, 'utf8');
  const re = /<([A-Za-z][A-Za-z0-9_.]*)\b([\s\S]*?)(?:\/>|>)/g;
  let match;
  while ((match = re.exec(source))) {
    const tag = match[1].split('.').at(-1);
    const attrs = match[2] || '';
    const hasClick = /\bonClick\s*=/.test(attrs);
    const hasChange = /\bonChange\s*=/.test(attrs);
    const hasSubmit = /\bonSubmit\s*=/.test(attrs);
    const hasHref = /\bhref\s*=/.test(attrs);
    const inputType = prop(attrs, 'type').replace(/['"]/g, '').toLowerCase();
    const nativeInputInteractive = tag === 'input' && ['button', 'submit', 'checkbox', 'radio', 'file'].includes(inputType);
    if (!controlTags.has(tag) && !hasClick && !hasChange && !hasSubmit && !hasHref) continue;
    if (tag === 'input' && !nativeInputInteractive && !hasChange) continue;

    const line = source.slice(0, match.index).split('\n').length;
    const aria = stripJsx(prop(attrs, 'aria-label'));
    const title = stripJsx(prop(attrs, 'title'));
    const testId = stripJsx(prop(attrs, 'data-testid'));
    const name = stripJsx(prop(attrs, 'name'));
    const placeholder = stripJsx(prop(attrs, 'placeholder'));
    const value = stripJsx(prop(attrs, 'value'));
    const after = source.slice(re.lastIndex, Math.min(source.length, re.lastIndex + 700));
    const closeRe = new RegExp('^([\s\S]*?)<\/' + tag + '>');
    const inlineText = stripJsx((after.match(closeRe) || [])[1] || '');
    const label = aria || inlineText || title || value || placeholder || name || testId;

    const handlerProp = hasClick ? 'onClick' : hasChange ? 'onChange' : hasSubmit ? 'onSubmit' : '';
    const handler = extractHandler(attrs, handlerProp);
    const context = handlerContext(source, handler) || attrs;
    const mutation = isLikelyMutation(label, handler, context);
    const serverAction = mutationToken(context);
    const busyGuard = hasBusyGuard(attrs, context);
    const errorHandling = hasErrorHandling(context);
    const successHandling = hasSuccessHandling(context);
    const privilegeRisk = directPrivilegeRisk(file, label, context);
    const anchors = [testId, aria, serverAction, label].filter((token) => token && token.length >= 3);
    const e2eCovered = anchors.some((anchor) => new RegExp(escapeRegExp(anchor), 'i').test(e2eText));

    const issues = [];
    if (['Button', 'IconButton', 'Fab', 'ButtonBase', 'Tab', 'button', 'a'].includes(tag) && !label) issues.push('missing-accessible-label');
    if (!hasClick && !hasChange && !hasSubmit && !hasHref && !(tag === 'button' && inputType === 'submit')) issues.push('missing-interaction');
    if (mutation && !busyGuard) issues.push('mutation-missing-busy-guard');
    if (mutation && !errorHandling) issues.push('mutation-missing-error-path');
    if (mutation && !successHandling) issues.push('mutation-missing-success-path');
    if (mutation && !e2eCovered) issues.push('mutation-missing-e2e-anchor');
    if (privilegeRisk) issues.push('privileged-direct-client-write');

    rows.push({
      file, line, role: roleFor(file), tag, label: label || '(dynamic/unresolved)',
      testId, handler: handler || '(inline/native)', mutation: mutation ? 'yes' : 'no',
      serverAction: serverAction || '', busyGuard: busyGuard ? 'yes' : 'no',
      successHandling: successHandling ? 'yes' : 'no', errorHandling: errorHandling ? 'yes' : 'no',
      e2eCovered: e2eCovered ? 'yes' : 'no', issues,
    });
  }
}

const unique = [];
const seen = new Set();
for (const row of rows) {
  const key = [row.file,row.line,row.tag,row.handler,row.label].join(':');
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}

const issueRows = unique.filter((row) => row.issues.length);
const csvHeaders = ['file','line','role','tag','label','test_id','handler','mutation','server_action','busy_guard','success_handling','error_handling','e2e_covered','issues'];
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
const mutations = unique.filter((r) => r.mutation === 'yes');
const md = [
  '# Phase 3 Interactive Control Inventory',
  '',
  'Executable source inventory for every discoverable button and interactive control in canonical app sources.',
  '',
  '- Total controls: **' + unique.length + '**',
  '- Mutation-like controls: **' + mutations.length + '**',
  '- Controls with findings: **' + issueRows.length + '**',
  '',
  '## Controls by role/surface',
  '',
  '| Role/surface | Controls |',
  '| --- | ---: |',
  ...[...byRole.entries()].sort().map(([role,count]) => '| ' + role + ' | ' + count + ' |'),
  '',
  '## Required executable contract',
  '',
  '- Visible controls require an accessible label or stable test id.',
  '- Mutation controls require a busy/double-submit guard, success path, error path, and an E2E evidence anchor.',
  '- Privileged surfaces may not perform direct client-side Firestore mutations.',
  '- Runtime Playwright coverage validates desktop/mobile/RTL/interactability and role boundaries.',
  '',
  '## Findings',
  '',
  ...(issueRows.length ? issueRows.map((r) => '- ' + r.file + ':' + r.line + ' — ' + r.tag + ' **' + r.label + '** — ' + r.issues.join(', ')) : ['No findings.']),
  ''
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
