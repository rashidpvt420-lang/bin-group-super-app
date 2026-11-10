import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
const load = (p, extras = {}) => {
  const sandbox = { exports: {}, module: { exports: {} }, String, Boolean, Number, Array, Object, RegExp, Date, Math, console, extras };
  sandbox.module.exports = sandbox.exports;
  runInNewContext(
    ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    sandbox,
  );
  return sandbox.exports;
};

const privacy = load('src/owner/utils/privacyCentreLabels.ts');
const completion = load('src/owner/utils/ownerCompletionAlertText.ts');
const sla = load('src/tenant/utils/emergencySlaCopy.ts');
const residence = load('src/tenant/utils/residenceLabel.ts');
const mask = load('src/utils/maskIban.ts');
const terms = load('src/broker/brokerTermsLabel.ts');
const commissions = load('src/broker/commissionTotals.ts');

test('Privacy Centre never shows raw event keys', () => {
  assert.equal(privacy.privacyActionLabel('OWNER_DATA_EXPORT', 'en'), 'You downloaded your data');
  assert.equal(privacy.privacyFieldLabel('PAYMENT_RECORD', 'ar'), 'سجل الدفع');
  assert.doesNotMatch(privacy.privacyActionLabel('OWNER_DATA_EXPORT', 'en'), /OWNER_DATA_EXPORT/);
  const unknown = privacy.privacyActionLabel('SOME_RAW_EVENT_KEY', 'en');
  assert.doesNotMatch(unknown, /SOME_RAW_EVENT_KEY/);
  assert.match(unknown, /Some raw event key/i);
  const card = read('src/owner/components/OwnerPrivacyCentreCard.tsx');
  assert.match(card, /privacyActionLabel/);
  assert.doesNotMatch(card, /title=\{e\.action\}/);
});

test('stale owner completion alerts are rewritten when no sign-off is pending', () => {
  const text = 'Work at the villa is completed. Please confirm the resolution.';
  const rewritten = completion.formatOwnerCompletionAlert(text, 0, 'en');
  assert.match(rewritten, /already been confirmed/i);
  assert.doesNotMatch(rewritten, /Please confirm/);
  assert.equal(completion.formatOwnerCompletionAlert(text, 2, 'en'), text);
  const bell = read('src/owner/OwnerApp.tsx');
  assert.match(bell, /formatOwnerCompletionAlert/);
});

test('Add-property map commits coordinates immediately and uses a draggable OSM fallback', () => {
  const step = read('src/components/onboarding/PropertyLocationStep.tsx');
  assert.match(step, /OsmDraggableMap/);
  assert.match(step, /Coordinates must update immediately on drag/);
  assert.match(step, /The Google map could not load/);
  assert.doesNotMatch(step, /Map unavailable — enter coordinates/);
  const osm = read('src/components/maps/OsmDraggableMap.tsx');
  assert.match(osm, /data-testid="osm-draggable-map"/);
  assert.match(osm, /onMove/);
});

test('tenant emergency copy is honest when no residence is linked', () => {
  const off = sla.tenantEmergencySlaCopy({ hasResidence: false, minutes: 30, lang: 'en' });
  assert.equal(off.promiseMinutes, null);
  assert.match(off.detail, /cannot promise a 30-minute response/i);
  assert.match(off.nextStep, /999/);
  const on = sla.tenantEmergencySlaCopy({ hasResidence: true, minutes: 30, lang: 'en' });
  assert.equal(on.promiseMinutes, 30);
  const dash = read('src/tenant/pages/TenantSimpleDashboardPage.tsx');
  assert.match(dash, /tenantEmergencySlaCopy/);
  assert.doesNotMatch(dash, /tx\('tenant\.home\.responseWithin'/);
});

test('tenant residence labels prefer unit and building over villa-only wording', () => {
  assert.equal(residence.formatResidenceLabel({ unitNumber: '12', propertyName: 'Al Reem', propertyType: 'villa' }), 'Unit 12 · Al Reem');
  const alert = residence.alignAlertResidenceText('Work at the villa is complete.', { unitNumber: '12', propertyName: 'Al Reem' }, 'en');
  assert.match(alert, /Unit 12 · Al Reem/);
  assert.doesNotMatch(alert, /\bvilla\b/i);
});

test('Official statement block is bilingual and RTL-aware', () => {
  const src = read('src/components/MoneyStatementDownload.tsx');
  assert.match(src, /البيان الرسمي/);
  assert.match(src, /dir=\{isRTL \? 'rtl' : 'ltr'\}/);
  assert.match(src, /Stamped BIN GROUP statement/);
});

test('IBAN mask shows only the last four characters', () => {
  assert.equal(mask.maskIban('AE070331234567890123456'), '•••• 3456');
  assert.equal(mask.maskIban('•••• 3456'), '•••• 3456');
  assert.equal(mask.maskIban('AE12'), '•••• AE12');
  const admin = read('apps/admin-panel/src/pages/brokers/BrokerManagementPage.tsx');
  assert.match(admin, /maskIban\(request\.bankIban\)/);
  assert.doesNotMatch(admin, /IBAN: \{request\.bankIban \|\| 'Missing'\}/);
});

test('VOID commissions are not settleable and are excluded from totals', () => {
  assert.equal(commissions.settlementLabel({ status: 'VOID', payoutStatus: 'AVAILABLE' }), 'VOID — not settleable');
  assert.equal(commissions.settlementLabelLocalized({ status: 'VOID', payoutStatus: 'AVAILABLE' }, 'ar'), 'ملغاة — غير قابلة للتسوية');
  assert.equal(commissions.pendingSettlementAmount([{ status: 'PENDING', amount: 500 }, { status: 'VOID', amount: 1000, payoutStatus: 'AVAILABLE' }]), 500);
  const page = read('src/broker/pages/BrokerCommissionsPage.tsx');
  assert.match(page, /settlementLabelLocalized/);
});

test('broker terms codes render a human label, never the raw code in the UI', () => {
  assert.equal(terms.brokerTermsLabel('BIN_BROKER_TERMS_2026_01', 'en'), 'Broker commission terms (January 2026)');
  assert.match(terms.brokerTermsLabel('BIN_BROKER_TERMS_2026_01', 'ar'), /يناير 2026/);
  const profile = read('src/broker/pages/BrokerProfilePage.tsx');
  assert.match(profile, /brokerTermsLabel/);
  assert.doesNotMatch(profile, /\$\{CURRENT_TERMS_VERSION\}/);
});

test('broker home Referrals tile uses a real count, not the word Open', () => {
  const dash = read('src/broker/pages/BrokerSimpleDashboardPage.tsx');
  assert.match(dash, /signals\.referralCount/);
  assert.doesNotMatch(dash, /broker\.home\.open/);
  const hook = read('src/broker/hooks/useBrokerAttributionSignals.ts');
  assert.match(hook, /collection\(db, 'referrals'\)/);
  assert.match(hook, /referralCount/);
});

test('technician language sets document dir and job history hides raw property IDs', () => {
  const i18n = read('src/technician/i18n/technicianLanguages.ts');
  assert.match(i18n, /document\.documentElement\.dir/);
  assert.match(i18n, /document\.body\.dir/);
  const history = read('src/technician/pages/TechnicianHistoryPage.tsx');
  assert.match(history, /resolveTicketPropertyDisplayName/);
  assert.doesNotMatch(history, /\{job\.propertyName\}/);
});

test('AppHeader greeting and staff muted text meet WCAG AA on navy', () => {
  const lum = (h) => {
    const c = h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  assert.ok(ratio('#F8F4D8', '#111827') >= 4.5, `header eyebrow ${ratio('#F8F4D8', '#111827')}`);
  assert.ok(ratio('#FFFFFF', '#111827') >= 4.5);
  assert.ok(ratio('#E2E8F0', '#0f172a') >= 4.5, `staff muted ${ratio('#E2E8F0', '#0f172a')}`);
  const header = read('src/components/ui/AppHeader.tsx');
  assert.match(header, /#F8F4D8/);
});

test('Payroll Hub opens payroll prep and the prepare button is not a silent payout', () => {
  const nav = read('apps/admin-panel/src/components/Navigation.tsx');
  assert.match(nav, /tx\('fin\.payroll', 'Payroll Hub'\)[\s\S]{0,80}path: '\/hr\/payroll-prep'/);
  const lang = read('packages/shared/src/context/LanguageContext.tsx');
  assert.match(lang, /'fin\.gen_payroll_btn': 'Prepare payroll batch'/);
  assert.doesNotMatch(lang, /'fin\.gen_payroll_btn': 'Execute Payroll Run'/);
  const payroll = read('apps/admin-panel/src/pages/financials/PayrollManagementPage.tsx');
  assert.match(payroll, /fin\.payroll_prep_gate/);
  assert.match(payroll, /fin\.payroll_settle_gate/);
});

test('payment and payout approvals state the Admin/CEO/Finance Admin MFA gate', () => {
  const payments = read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx');
  assert.match(payments, /fin\.payment_approval_gate/);
  assert.match(payments, /canSettlePayroll/);
  assert.match(payments, /!canApprovePayments/);
  const brokers = read('apps/admin-panel/src/pages/brokers/BrokerManagementPage.tsx');
  assert.match(brokers, /Payout approval is limited to Admin, CEO and Finance Admin/);
  assert.match(brokers, /commissionTotalsExcludingVoid/);
  assert.match(brokers, /!canApprovePayout/);
  const server = read('functions/adminBrokerPayoutReview.ts');
  assert.match(server, /VOID or cancelled commissions cannot be settled/);
  assert.match(server, /verified Admin MFA session is required/);
});

test('painting admin copy keeps owner quote acceptance and Finance Manager/Controller internal approval', () => {
  const page = read('apps/admin-panel/src/pages/ops/PaintingProjectsAdminPage.tsx');
  assert.match(page, /owner accepts the quote by email code/i);
  assert.match(page, /Finance Manager or Finance Controller/);
  assert.match(page, /invoice issuer cannot approve/);
  assert.doesNotMatch(page, /only the owner can approve, by email code/);
});

test('admin Google Maps loader waits for importLibrary instead of crashing the stub', () => {
  const src = read('apps/admin-panel/src/lib/googleMaps.ts');
  assert.match(src, /typeof maps\.importLibrary === 'function'/);
  assert.match(src, /waitForMapsApi/);
  assert.match(src, /GOOGLE_MAPS_SETTINGS_UNAVAILABLE/);
});

test('HR Command starts both lifecycle and ops reads together', () => {
  const src = read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
  assert.match(src, /const opsPromise = isHRManager \? getOps\(\{\}\) : Promise\.resolve\(null\)/);
  assert.match(src, /setLoading\(false\)/);
});

test('admin dashboard card bodies are bilingual and use stronger contrast', () => {
  const src = read('apps/admin-panel/src/pages/dashboard/AdminSimpleDashboardPage.tsx');
  assert.match(src, /كل ما يحتاج إلى ضبط اليوم/);
  assert.match(src, /rgba\(255,255,255,0\.86\)/);
  assert.doesNotMatch(src, /rgba\(255,255,255,0\.55\)/);
});

test('Arabic logout labels are isolated so they do not render garbled', () => {
  const app = read('apps/admin-panel/src/App.tsx');
  const layout = read('apps/admin-panel/src/layout/AdminLayout.tsx');
  assert.match(app, /unicodeBidi: 'isolate'/);
  assert.match(layout, /unicodeBidi: 'isolate'/);
  assert.match(app, /t\('nav\.logout'\)/);
});

test('language files keep EN/AR parity for new payroll and payment gate keys', () => {
  for (const file of ['src/context/LanguageContext.tsx', 'packages/shared/src/context/LanguageContext.tsx']) {
    const src = read(file);
    for (const key of ['fin.payroll_prep_gate', 'fin.payroll_settle_gate', 'fin.payroll_prep_denied', 'fin.payment_approval_gate', 'fin.gen_payroll_btn']) {
      assert.equal((src.match(new RegExp(`'${key}'`, 'g')) || []).length, 2, `${file} ${key}`);
    }
  }
});
