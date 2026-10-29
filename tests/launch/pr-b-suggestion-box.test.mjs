import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('suggestion box card is on the owner, tenant, technician and broker home dashboards', () => {
  const pages = {
    owner: 'src/owner/pages/OwnerSimpleDashboardPage.tsx',
    tenant: 'src/tenant/pages/TenantSimpleDashboardPage.tsx',
    technician: 'src/technician/pages/TechnicianSimpleDashboardPage.tsx',
    broker: 'src/broker/pages/BrokerSimpleDashboardPage.tsx',
  };
  for (const [role, path] of Object.entries(pages)) {
    const src = read(path);
    assert.match(src, /import SuggestionBoxCard from '\.\.\/\.\.\/components\/SuggestionBoxCard'/, path);
    assert.ok(src.includes(`<SuggestionBoxCard role="${role}" />`), `${path} renders the ${role} suggestion box`);
  }
});

test('card writes exactly the rule-approved fields with a server timestamp', () => {
  const card = read('src/components/SuggestionBoxCard.tsx');
  assert.match(card, /collection\(db, 'user_suggestions'\)/);
  assert.match(card, /createdAt: serverTimestamp\(\)/);
  for (const field of ['createdBy: uid', 'role,', 'category,', "status: 'new'", "source: 'dashboard_suggestion_box'"]) {
    assert.ok(card.includes(field), `payload has ${field}`);
  }
  assert.doesNotMatch(card, /getDocs|onSnapshot/, 'authors never read suggestions back');
});

test('rules: own-create for the four roles, admin-only read, no user edits', () => {
  const rules = read('firestore.rules');
  const start = rules.indexOf('match /user_suggestions/{suggestionId}');
  assert.ok(start > 0, 'user_suggestions rule exists');
  const block = rules.slice(start, rules.indexOf('\n    }\n', start));
  assert.match(block, /allow read: if isAdmin\(\);/);
  assert.match(block, /claimedRole\(\) in \['owner', 'tenant', 'technician', 'broker'\]/);
  assert.match(block, /request\.resource\.data\.createdBy == request\.auth\.uid/);
  assert.match(block, /request\.resource\.data\.role == claimedRole\(\)/);
  assert.match(block, /createdAt == request\.time/);
  assert.match(block, /allow update, delete: if false;/);
});

test('admin command center links to the admin-only suggestions list', () => {
  const terminal = read('src/admin/AdminTerminal.tsx');
  assert.match(terminal, /navigate\('\/admin\/suggestions'\)/);
  assert.match(terminal, /showingSuggestions \? \(\s*<AdminSuggestionsPage \/>/);
  const page = read('src/admin/AdminSuggestionsPage.tsx');
  assert.match(page, /collection\(db, 'user_suggestions'\)/);
  assert.match(page, /permission-denied/);
});
