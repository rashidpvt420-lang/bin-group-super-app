import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, functions, classifier, rules, smoke] = await Promise.all([
  readFile(new URL('../../src/technician/pages/TechnicianHRPageV2.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../functions/hrAutomation.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../functions/hrIntentClassifier.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/hr-smoke-test.mjs', import.meta.url), 'utf8'),
]);

test('HR AI case creation is server-authoritative and no longer direct Firestore writes', () => {
  assert.match(functions, /export const createStaffHrCase = onCall/);
  assert.match(functions, /classifyHrIntent\(message\)/);
  assert.match(functions, /db\.runTransaction/);
  assert.match(functions, /tx\.create\(requestRef/);
  assert.match(functions, /tx\.create\(conversationRef/);
  assert.match(functions, /HR_CASE_SERVER_CLASSIFIED/);
  assert.match(functions, /stableCaseId\(uid, message, request\.data\?\.idempotencyKey\)/);
  assert.match(functions, /const existing = await tx\.get\(requestRef\)/);
  assert.match(functions, /hrEscalations/);
  assert.match(functions, /acknowledgementRequired: true/);
  assert.match(page, /httpsCallable\(functions, 'createStaffHrCase'\)/);
  assert.doesNotMatch(page, /classifyBlueCollarEssIntent\(text\)/);
  assert.doesNotMatch(page, /addDoc\(collection\(db, 'hrAiConversations'\)/);
  assert.doesNotMatch(page, /addDoc\(collection\(db, 'staffRequests'\)/);
});

test('Firestore rules make HR case and AI conversation writes server-only', () => {
  assert.match(rules, /'privacyTier' in data && data\.privacyTier == 'hr_manager_only'/);
  assert.match(rules, /'confidential' in data && data\.confidential == true/);
  for (const field of [
    'aiAnswer',
    'classificationSource',
    'confidence',
    'confidential',
    'privacyTier',
    'serverClassified',
    'trainingVersion',
  ]) {
    assert.match(rules, new RegExp(`'${field}'`));
  }
  assert.match(rules, /!\('requestType' in data\) \|\| !\(data\.requestType in \['manager_issue', 'safety_incident', 'staff_wellbeing'\]\)/);
  assert.match(rules, /!\('category' in data\) \|\| !\(data\.category in \['confidential', 'safety', 'wellbeing'\]\)/);
  assert.match(rules, /match \/staffRequests\/\{requestId\}[\s\S]*allow create, update, delete: if false;/);
  assert.match(rules, /match \/hrAiConversations\/\{caseId\}[\s\S]*allow create, update, delete: if false;/);
});

test('raw HR documents and wellbeing check-ins do not leak to Finance', () => {
  const staffDocumentsBlock = rules.match(/match \/staffDocuments\/\{documentId\} \{[\s\S]*?\n    \}/)?.[0] || '';
  const moodBlock = rules.match(/match \/staffMoodCheckins\/\{checkinId\} \{[\s\S]*?\n    \}/)?.[0] || '';

  assert.match(staffDocumentsBlock, /Passports, IDs, visas and medical files/);
  assert.match(staffDocumentsBlock, /allow read: if isHr\(\) \|\| staffCanRead\(resource\.data\);/);
  assert.doesNotMatch(staffDocumentsBlock, /isFinance\(\)/);
  assert.match(moodBlock, /allow read: if isHrManagerTier\(\) \|\| staffCanRead\(resource\.data\);/);
  assert.doesNotMatch(moodBlock, /allow read: if isHr\(\)/);
});

test('HR automation audit and new-hire role authority are fail-closed', () => {
  assert.match(functions, /const TECHNICIAN_NEW_HIRE_ROLE = "technician"/);
  assert.match(functions, /async function blockInvalidNewHireRole/);
  assert.match(functions, /provisioningStatus: "blocked_invalid_role"/);
  assert.match(functions, /requestedRole !== TECHNICIAN_NEW_HIRE_ROLE/);
  assert.match(functions, /const role = TECHNICIAN_NEW_HIRE_ROLE/);
  assert.match(functions, /const auditRef = db\.collection\("audit_logs"\)\.doc\(\)/);
  assert.match(functions, /const batch = db\.batch\(\)/);
  assert.match(functions, /batch\.set\(auditRef, payload\)/);
  assert.match(functions, /batch\.set\(db\.collection\("auditLogs"\)\.doc\(auditRef\.id\), payload\)/);
  assert.match(functions, /await batch\.commit\(\)/);
  assert.doesNotMatch(functions, /Promise\.allSettled\(\[\s*db\.collection\("auditLogs"\)\.add\(payload\)/);
});

test('unknown HR classifications default to confidential human review', () => {
  assert.match(functions, /isHighRiskHrCase\(result\)/);
  assert.match(functions, /result\.privacyTier === "hr_manager_only"/);
  assert.match(functions, /result\.priority === "urgent"/);
  assert.match(functions, /\["safety", "wellbeing", "confidential"\]\.includes\(result\.category\)/);
  assert.match(classifier, /if \(!winner \|\| winner\.score <= 0\)/);
  assert.match(classifier, /category: "confidential"/);
  assert.match(classifier, /privacyTier: "hr_manager_only"/);
  assert.match(classifier, /requiresHumanReview: true/);
});

test('HR smoke requires targeted notification and audit evidence', () => {
  assert.match(smoke, /where\('extraData\.requestId', '==', requestRef\.id\)/);
  assert.match(smoke, /where\('targetId', '==', requestRef\.id\)/);
  assert.match(smoke, /notifications\.size > 0 && auditLogs\.size > 0 \? 'PASS'/);
  assert.match(smoke, /process\.exit\(1\)/);
  assert.doesNotMatch(smoke, /collection\('notifications'\)\.limit\(20\)\.get\(\)/);
});
