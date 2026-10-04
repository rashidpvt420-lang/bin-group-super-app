import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
const leads = read('src/broker/pages/BrokerLeadsPage.tsx');

// The validator's patterns, copied verbatim. The first test checks the page source contains
// exactly these lines, so the behaviour tests below exercise what ships (no eval / Function()).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UAE_PHONE_PATTERN = /^(\+971|00971|0)?5\d{8}$|^(\+971|00971|0)?[2-9]\d{7}$/;
const BUDGET_PATTERN = /^[\d,.\s]+(k|m)?$/i;
const NAME_LETTERS = /\p{L}/gu;
const normaliseUaePhone = (value) => value.replace(/[\s()-]/g, '');
const leadFieldErrors = (input) => {
  const errors = {};
  if ((input.leadName.match(NAME_LETTERS) || []).length < 2) errors.leadName = 'name';
  if (input.phone.trim() && !UAE_PHONE_PATTERN.test(normaliseUaePhone(input.phone.trim()))) errors.phone = 'phone';
  if (input.email.trim() && !EMAIL_PATTERN.test(input.email.trim())) errors.email = 'email';
  if (input.budget.trim() && !BUDGET_PATTERN.test(input.budget.trim())) errors.budget = 'budget';
  return errors;
};
const loadValidator = () => leadFieldErrors;

test('page validator uses the same patterns and rules as this test', () => {
  for (const line of [
    `const EMAIL_PATTERN = /${EMAIL_PATTERN.source}/;`,
    `const UAE_PHONE_PATTERN = /${UAE_PHONE_PATTERN.source}/;`,
    "const normaliseUaePhone = (value: string) => value.replace(/[\\s()-]/g, '');",
    "if ((input.leadName.match(/\\p{L}/gu) || []).length < 2) errors.leadName",
    "if (input.phone.trim() && !UAE_PHONE_PATTERN.test(normaliseUaePhone(input.phone.trim()))) errors.phone",
    "if (input.email.trim() && !EMAIL_PATTERN.test(input.email.trim())) errors.email",
    `if (input.budget.trim() && !/${BUDGET_PATTERN.source}/i.test(input.budget.trim())) errors.budget`,
  ]) assert.ok(leads.includes(line), `BrokerLeadsPage.tsx should contain: ${line}`);
});

test('lead form rejects "!!" as phone, email and budget (the record the audit saved)', () => {
  const errors = loadValidator()({ leadName: 'Ali Hassan', phone: '!!', email: '!!', budget: '!!' });
  assert.deepEqual(Object.keys(errors).sort(), ['budget', 'email', 'phone']);
  assert.ok(loadValidator()({ leadName: '!!', phone: '', email: '', budget: '' }).leadName);
});

test('lead form accepts real UAE numbers, emails and amounts, and empty optional fields', () => {
  const v = loadValidator();
  for (const phone of ['+971 50 123 4567', '0501234567', '00971501234567', '+97143334444', '']) {
    assert.equal(v({ leadName: 'Ali Hassan', phone, email: '', budget: '' }).phone, undefined, phone);
  }
  assert.equal(v({ leadName: 'Ali', phone: '', email: 'ali@example.ae', budget: '1,200,000' }).email, undefined);
  assert.equal(v({ leadName: 'علي حسن', phone: '', email: '', budget: '120k' }).budget, undefined);
  assert.equal(v({ leadName: 'علي حسن', phone: '', email: '', budget: '' }).leadName, undefined);
});

test('submit is blocked while there are field errors, and errors show inline', () => {
  assert.match(leads, /if \(Object\.keys\(leadFieldErrors\(\{ leadName, phone, email, budget \}, isRTL\)\)\.length\) return;/);
  assert.match(leads, /type="email"/);
  assert.match(leads, /type="tel"/);
  assert.match(leads, /helperText=\{showErrors \? fieldErrors\.email : undefined\}/);
});

test('lead dialog wording and contrast', () => {
  assert.doesNotMatch(leads, /INITIALIZE MISSION|Mission Notes/);
  assert.doesNotMatch(leads, /rgba\(255,255,255,0\.62\)/);
  assert.match(leads, /'Save lead'/);
});

test('attribution card has no white or pale-yellow text on its cream background', () => {
  const card = read('src/components/BrokerAttributionQuickStartCard.tsx');
  assert.doesNotMatch(card, /color: '#fff'|rgba\(255,255,255,0\.(5|58)\)|#fcd34d|#6ee7b7/);
  assert.match(card, /#92400E/);
});

test('broker header title is AA gold and the subtitle does not wrap on phones', () => {
  const app = read('src/broker/BrokerApp.tsx');
  assert.doesNotMatch(app, /color: '#B8932F', fontWeight: 950, letterSpacing: 2/);
  assert.match(app, /display: \{ xs: 'none', sm: 'block' \}, whiteSpace: 'nowrap' \}\}>\{label\('broker\.portal\.subtitle'/);
});
