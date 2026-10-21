// Job contact: right person, valid UAE numbers, and only while the job is active.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
const compiled = ts.transpileModule(read('src/lib/jobContact.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const opened = [];
const sandbox = { exports: {}, Set, String, window: { open: (u) => opened.push(u) } };
runInNewContext(compiled, sandbox);
const { isJobContactWindowOpen, normalizeContactPhone, resolveJobContact, telHref, whatsAppHref, openContactUrl } = sandbox.exports;

test('UAE numbers normalise to E.164 digits; junk is rejected', () => {
  assert.equal(normalizeContactPhone('055 242 3233'), '971552423233');
  assert.equal(normalizeContactPhone('+971 55 2423233'), '971552423233');
  assert.equal(normalizeContactPhone('00971552423233'), '971552423233');
  assert.equal(normalizeContactPhone('552423233'), '971552423233');
  assert.equal(normalizeContactPhone('N/A'), '');
  assert.equal(normalizeContactPhone(''), '');
  assert.equal(telHref('971552423233'), 'tel:+971552423233');
  assert.equal(whatsAppHref('971552423233'), 'https://wa.me/971552423233');
});

test('contact prefers the on-site contact, then tenant, owner, requester', () => {
  assert.equal(resolveJobContact({ contactDuringService: '0501234567', tenantPhone: '0559999999' }).role, 'onsite');
  assert.equal(resolveJobContact({ tenantPhone: 'N/A', ownerPhone: '0501112222' }).role, 'owner');
  assert.equal(resolveJobContact({ tenantPhone: '0559999999', tenantName: 'A' }).phone, '971559999999');
  assert.equal(resolveJobContact({ tenantPhone: 'N/A' }), null);
});

test('phone/WhatsApp only while the job is active', () => {
  for (const s of ['ASSIGNED', 'accepted', 'EN_ROUTE', 'on-site', 'IN_PROGRESS']) assert.equal(isJobContactWindowOpen(s), true, s);
  for (const s of ['OPEN', 'COMPLETED', 'CLOSED', 'CANCELLED', '']) assert.equal(isJobContactWindowOpen(s), false, s);
});

test('openContactUrl ignores empty urls', () => {
  openContactUrl(''); openContactUrl('tel:+971552423233');
  assert.deepEqual([...opened], ['tel:+971552423233']);
});

test('job page uses the gated, role-labelled contact and no raw tel/wa.me building', () => {
  const src = read('src/technician/pages/TechnicianJobDetailPage.tsx');
  assert.match(src, /const contactPhone = contactWindowOpen \? jobContact\?\.phone \|\| '' : '';/);
  assert.match(src, /\{contactWindowOpen && <Button[^\n]*telHref\(contactPhone\)/);
  assert.match(src, /\{contactWindowOpen && <Button[^\n]*whatsAppHref\(contactPhone\)/);
  assert.doesNotMatch(src, /window\.open\(`tel:|wa\.me\/\$\{String\(contactPhone\)/);
  assert.doesNotMatch(read('functions/index.ts'), /ticketData\.tenantPhone \|\| "N\/A"/);
});
