// Regression: the Owner ticket "Chat" button navigated to /owner/chat/:id but
// OwnerApp had no chat route, so it bounced to the dashboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('owner app routes /owner/chat/:ticketId to the shared ticket chat', () => {
  const app = read('src/owner/OwnerApp.tsx');
  assert.match(app, /<Route path="\/chat\/:ticketId" element={<OwnerChatPage \/>} \/>/);
  assert.match(read('src/owner/pages/OwnerChatPage.tsx'), /<TicketChatPage role="owner" \/>/);
  assert.match(read('src/owner/pages/OwnerTicketDetailPage.tsx'), /navigate\(`\/owner\/chat\/\$\{ticket\.id\}`\)/);
});

test('tenant and technician chat pages use the same shared component', () => {
  assert.match(read('src/tenant/pages/TenantChatPage.tsx'), /role="tenant"/);
  assert.match(read('src/technician/pages/TechnicianChatPage.tsx'), /role="technician"/);
});

test('shared chat writes the fields the rules and notification trigger expect, and is bilingual and readable', () => {
  const src = read('src/components/chat/TicketChatPage.tsx');
  assert.match(src, /senderUid: user\.uid,\s*senderRole: role,/);
  assert.match(src, /message: text,\s*createdAt: serverTimestamp\(\)/);
  assert.match(src, /ownerId, ticket\.ownerUid/);
  assert.match(src, /اكتب رسالتك/);
  assert.match(src, /dir=\{isRTL \? 'rtl' : 'ltr'\}/);
  assert.doesNotMatch(src, /color: '#FFF'|rgba\(22, 22, 24/);
});
