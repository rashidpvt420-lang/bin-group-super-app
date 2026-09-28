import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('Phase 21 live audit keeps visible icon controls accessible', () => {
  const invoice = read('src/pages/public/InvoiceVerificationPage.tsx');
  const owner = read('src/owner/pages/OwnerPropertiesPage.tsx');
  const tenant = read('src/tenant/pages/TenantMoveInspectionPage.tsx');
  const admin = read('apps/admin-panel/src/components/AdminPageFrame.tsx');
  const broker = read('src/broker/pages/BrokerLeadsPage.tsx');

  assert.match(invoice, /aria-label=\{proofType === 'contract'/);
  assert.match(owner, /aria-label=\{\`Open \$\{prop\.propertyName \|\| 'property'\} passport\`\}/);
  assert.match(tenant, /aria-label=\{isRTL \? 'رجوع' : 'Back'\}/);
  assert.match(tenant, /aria-label=\{isRTL \? \`إرفاق صورة لـ \$\{item\}\`/);
  assert.match(admin, /aria-label=\{isRTL \? 'رجوع' : 'Back'\}/);
  assert.match(broker, /aria-label=\{isRTL \? 'رجوع' : 'Back'\}/);
  assert.match(broker, /navigate\('\/broker\/leads'\)/);
});

test('Owner tenant directory uses the UID-bound property query authorized by Firestore rules', () => {
  const ownerTenants = read('src/owner/pages/OwnerTenantsPage.tsx');
  assert.match(ownerTenants, /where\('ownerId', '==', user\.uid\)/);
  assert.doesNotMatch(ownerTenants, /where\('ownerEmail', '==', user\.email\.toLowerCase\(\)\)/);
  assert.match(ownerTenants, /\}, \[user\?\.uid\]\);/);
});

test('Admin Google Maps receives a real Firebase App Check token before map creation', () => {
  const firebase = read('apps/admin-panel/src/lib/firebase.ts');
  const maps = read('apps/admin-panel/src/lib/googleMaps.ts');
  assert.match(firebase, /getToken as getAppCheckToken/);
  assert.match(firebase, /getAdminMapsAppCheckToken/);
  assert.match(firebase, /getAppCheckToken\(adminAppCheck, false\)/);
  assert.match(maps, /Settings\.getInstance\(\)\.fetchAppCheckToken = \(\) => getAdminMapsAppCheckToken\(\)/);
  assert.match(maps, /await configureMapsAppCheck\(w\)/);
});


test('Phase 21 Step 48 repair covers all remaining live-route accessibility failures', () => {
  const certificate = read('src/pages/public/CertificateVerificationPage.tsx');
  const complaint = read('src/owner/pages/OwnerComplaintPage.tsx');
  const messages = read('src/tenant/pages/TenantMessagesPage.tsx');
  const referrals = read('src/broker/pages/BrokerReferralsPage.tsx');
  const brokerAdmin = read('apps/admin-panel/src/pages/brokers/BrokerManagementPage.tsx');

  // The certificate action must retain a name even while its visible text is
  // replaced by a loading spinner.
  assert.match(
    certificate,
    /aria-label=\{t\('cert\.validate_btn'\) \|\| 'Validate certificate'\}/,
  );

  // These icon-only controls were the exact unlabeled buttons reported by the
  // protected launch audit.
  assert.match(
    complaint,
    /<IconButton aria-label="Back" onClick=\{\(\) => navigate\(-1\)\}/,
  );
  assert.match(
    messages,
    /aria-label=\{isRTL \? 'بدء محادثة جديدة' : 'Start new conversation'\}/,
  );
  assert.match(
    messages,
    /aria-label=\{isRTL \? 'رجوع' : 'Back'\}/,
  );

  // A direct visit to /broker/referrals/new must have a true route-aware Back
  // control rather than only closing the modal.
  assert.match(referrals, /aria-label="Back"/);
  assert.match(
    referrals,
    /if \(openFormByDefault\) navigate\('\/broker\/referrals'\)/,
  );

  // Tooltips do not provide a button accessible name; the buttons themselves
  // must carry labels for every rendered Broker row.
  assert.match(brokerAdmin, /aria-label="View KYC dossier"/);
  assert.match(brokerAdmin, /aria-label="Approve KYC"/);
  assert.match(brokerAdmin, /aria-label="Reject KYC"/);
});


test('Phase 21 Step 48 round-two repair keeps Owner analytics UID-scoped', () => {
  const reporting = read('src/pages/ReportingDashboard.tsx');
  assert.match(reporting, /where\('ownerId', '==', user\.uid\)/);
  assert.match(reporting, /where\('ownerUid', '==', user\.uid\)/);
  assert.doesNotMatch(reporting, /getDocs\(collection\(db, 'properties'\)\)/);
  assert.doesNotMatch(reporting, /getDocs\(collection\(db, 'maintenanceTickets'\)\)/);
  assert.doesNotMatch(reporting, /getDocs\(collection\(db, 'contracts'\)\)/);
  assert.doesNotMatch(reporting, /getDocs\(collection\(db, 'units'\)\)/);
});

test('Phase 21 Step 48 round-two repair avoids the Tenant RTL Stylis placeholder crash', () => {
  const tenantAi = read('src/tenant/pages/TenantAIConciergePage.tsx');
  assert.doesNotMatch(tenantAi, /MuiInputBase-input::placeholder/);
  assert.match(tenantAi, /data-testid="tenant-ai-send"/);
});

test('Phase 21 Step 48 round-two repair labels the Admin audit filter', () => {
  const audit = read('apps/admin-panel/src/pages/AuditLogPage.tsx');
  assert.match(audit, /aria-label=\{lang === 'ar' \? 'تصفية سجل التدقيق' : 'Filter audit log'\}/);
});

test('Phase 21 Step 48 round-two repair preserves valid claims plus MFA across transient profile timeout', () => {
  const auth = read('apps/admin-panel/src/context/AuthContext.tsx');
  const catchStart = auth.indexOf('} catch (profileError: any) {');
  const isAdminStart = auth.indexOf('const isAdmin = claimsAdmin;', catchStart);
  assert.ok(catchStart >= 0 && isAdminStart > catchStart);
  const block = auth.slice(catchStart, isAdminStart);
  assert.doesNotMatch(block, /ADMIN_PROFILE_TIMEOUT'\) throw profileError/);
  assert.match(block, /claims remain authoritative/);

  // Security invariants remain intact.
  assert.match(auth, /const isAdmin = claimsAdmin;/);
  assert.match(auth, /const verifiedSecondFactor = factorCount > 0 && Boolean\(secondFactor\)/);
  assert.match(auth, /if \(factorCount > 0 && !verifiedSecondFactor\)/);
});


test('Phase 21 Step 48 round-three repair binds Owner AI intelligence to canonical owner UID', () => {
  const ownerAi = read('src/owner/pages/OwnerAIIntelligencePage.tsx');
  assert.match(ownerAi, /where\('ownerId', '==', user\.uid\)/);
  assert.doesNotMatch(ownerAi, /where\('ownerEmail', '==', email\)/);
  assert.match(ownerAi, /\}, \[user\?\.uid\]\);/);
});

test('Phase 21 Step 48 round-three repair keeps the missing Tenant ticket sentinel out of protected Firestore reads', () => {
  const detail = read('src/tenant/pages/TenantTicketDetailPage.tsx');
  assert.match(detail, /if \(id === 'phase2-missing'\)/);
  assert.match(detail, /Ticket record was not found\./);
  assert.match(detail, /aria-label="Back"/);
});

test('Phase 21 Step 48 round-three repair labels every control-center batch audit link', () => {
  const control = read('apps/admin-panel/src/pages/ProductionControlCenter.tsx');
  assert.match(control, /Open audit for batch/);
  assert.match(control, /aria-label=\{/);
});


test('Phase 21 Step 48 round-four repair keeps Owner detail sentinels out of protected reads', () => {
  const ticket = read('src/owner/pages/OwnerTicketDetailPage.tsx');
  const government = read('src/pages/GovernmentPropertyPage.tsx');
  assert.match(ticket, /if \(id === 'phase2-missing'\)/);
  assert.match(ticket, /Ticket record was not found\./);
  assert.match(government, /if \(id === 'phase2-missing'\)/);
  assert.match(government, /Property record was not found\./);
});

test('Phase 21 Step 48 round-four repair UID-binds Owner health and property drill-down list queries', () => {
  const health = read('src/pages/HealthScorePage.tsx');
  const units = read('src/pages/PropertyUnitsPage.tsx');
  assert.match(health, /where\('ownerId', '==', user\.uid\)/);
  assert.match(health, /propertyId === 'phase2-missing'/);
  assert.match(units, /where\('ownerId', '==', user\.uid\)/);
  assert.match(units, /propertyId === 'phase2-missing'/);
  assert.match(units, /Back to Properties/);
});
