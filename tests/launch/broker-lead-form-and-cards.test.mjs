import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
const leads = read('src/broker/pages/BrokerLeadsPage.tsx');

// Pull the validator out of the page source and run it, so the test checks behaviour.
const loadValidator = () => {
  const start = leads.indexOf('const EMAIL_PATTERN');
  const end = leads.indexOf('const numericAmount');
  assert.ok(start > 0 && end > start, 'validator block missing');
  const js = leads.slice(start, end)
    .replace(/: \{ leadName: string; phone: string; email: string; budget: string \}/, '')
    .replace(/const errors: Partial<Record<[^>]+>> = \{\};/, 'const errors = {};')
    .replace(/\(value: string\)/, '(value)');
  return new Function(`${js}; return leadFieldErrors;`)();
};

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
