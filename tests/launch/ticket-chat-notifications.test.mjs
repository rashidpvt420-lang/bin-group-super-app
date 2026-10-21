// Regression: onChatMessageSent read senderId/text while the chat pages write
// senderUid/message, so no chat push ever fired, and it linked to /ticket/:id
// which is not a route in any role app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
function loadShared(relative) {
  const compiled = ts.transpileModule(read(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative }).outputText;
  const sandbox = { exports: {}, Set, String, encodeURIComponent, require: (id) => { throw new Error(`unexpected import ${id}`); } };
  runInNewContext(compiled, sandbox, { filename: relative });
  return sandbox.exports;
}
const { chatMessageSender, chatMessageSnippet, chatRecipients } = loadShared('functions/shared/ticketChatNotification.ts');
const ticket = { tenantId: 'ten', ownerId: 'own', assignedTechnicianId: 'tech' };

test('sender is read from senderUid (what the chat pages write) with senderId fallback', () => {
  assert.equal(chatMessageSender({ senderUid: 'tech', message: 'hi' }), 'tech');
  assert.equal(chatMessageSender({ senderId: 'ten' }), 'ten');
  assert.equal(chatMessageSender({}), '');
});

test('snippet reads message field and truncates', () => {
  assert.equal(chatMessageSnippet({ message: 'On my way' }), 'On my way');
  assert.equal(chatMessageSnippet({ message: 'x'.repeat(60) }), `${'x'.repeat(50)}...`);
  assert.equal(chatMessageSnippet({ text: 'legacy' }), 'legacy');
});

test('technician message notifies tenant and owner with their own chat routes', () => {
  const r = chatRecipients('T1', ticket, 'tech').map((x) => `${x.uid}:${x.url}`);
  assert.deepEqual([...r], ['ten:/tenant/chat/T1', 'own:/owner/chat/T1']);
});

test('tenant message notifies owner and technician, never the sender, deduped', () => {
  assert.deepEqual([...chatRecipients('T1', ticket, 'ten').map((x) => x.uid)], ['own', 'tech']);
  assert.deepEqual([...chatRecipients('T1', { tenantId: 'a', ownerId: 'a', assignedTechnicianId: 't' }, 't').map((x) => x.uid)], ['a']);
});

test('trigger uses the shared helpers and no longer links to the bare /ticket route', () => {
  const src = read('functions/index.ts');
  const body = src.slice(src.indexOf('export const onChatMessageSent'), src.indexOf('export const onTechnicianDutyStatusChanged'));
  assert.match(body, /chatMessageSender\(message\)/);
  assert.match(body, /chatRecipients\(ticketId, ticket, senderId\)/);
  assert.doesNotMatch(body, /url: `\/ticket\//);
});
