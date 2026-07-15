#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';

const checks = [
  {
    path: 'src/tenant/TenantApp.tsx',
    required: [
      'import TenantScheduledServicePage',
      '<Route path="/scheduled-service" element={<TenantScheduledServicePage />} />',
    ],
  },
  {
    path: 'src/tenant/pages/TenantSimpleDashboardPage.tsx',
    required: [
      '/tenant/scheduled-service?service=deep-clean',
      '/tenant/scheduled-service?service=pest-control',
      '/tenant/scheduled-service?service=vacation-care&occupancy=away',
      '/tenant/scheduled-service?service=moving',
    ],
  },
  {
    path: 'src/tenant/pages/TenantDashboardLightPage.tsx',
    required: [
      '/tenant/scheduled-service?service=deep-clean',
      '/tenant/scheduled-service?service=pest-control',
      '/tenant/scheduled-service?service=vacation-care&occupancy=away',
      '/tenant/scheduled-service?service=moving',
    ],
  },
  {
    path: 'src/tenant/pages/TenantScheduledServicePage.tsx',
    required: [
      "httpsCallable(functions, 'getScheduledServiceAvailability')",
      "httpsCallable(functions, 'createTenantServiceTicket')",
      "httpsCallable(functions, 'saveScheduledServiceAccessCode')",
      'recurrenceFrequency',
      'recurrenceOccurrences',
      'policyAccepted',
      'availabilitySlotId',
      'accessCodeExpiresAt',
      'sensitiveOccupants',
    ],
  },
  {
    path: 'src/tenant/pages/TenantTicketDetailPage.tsx',
    required: [
      "httpsCallable(functions, 'tenantManageScheduledService')",
      "httpsCallable(functions, 'saveScheduledServiceAccessCode')",
      "runScheduledAction('approve_quote')",
      "runScheduledAction('reject_quote'",
      "runScheduledAction('request_reschedule'",
      "runScheduledAction('request_cancel'",
      'CANCELLATION & REFUND POLICY',
      'SECURE TEMPORARY ACCESS',
    ],
  },
  {
    path: 'src/tenant/pages/TenantTicketsPage.tsx',
    required: [
      "ticket.requestType === 'SCHEDULED_SERVICE'",
      'appointmentText(ticket)',
      'ticket.quoteStatus',
      'ticket.recurrenceFrequency',
      'ticket.securityAccessStatus',
    ],
  },
  {
    path: 'src/components/AuthenticatedShell.tsx',
    required: [
      "const isTenantRoute = location.pathname === '/tenant' || location.pathname.startsWith('/tenant/')",
      'showChrome && !isAdminRoute && !isTenantRoute',
    ],
  },
  {
    path: 'apps/admin-panel/src/App.tsx',
    required: [
      "import ScheduledServicesOperationsPage from './pages/ops/ScheduledServicesOperationsPage'",
      '<Route path="/tenant-services" element={<ProtectedRoute><ScheduledServicesOperationsPage /></ProtectedRoute>} />',
    ],
  },
  {
    path: 'apps/admin-panel/src/components/Navigation.tsx',
    required: [
      "text: 'Tenant Services'",
      "path: '/tenant-services'",
    ],
  },
  {
    path: 'apps/admin-panel/src/pages/ops/ScheduledServicesOperationsPage.tsx',
    required: [
      "httpsCallable(functions, 'adminManageScheduledServiceAvailability')",
      "httpsCallable(functions, 'adminUpdateScheduledService')",
      "httpsCallable(functions, 'adminRevealScheduledServiceAccessCode')",
      "runTicketAction('publish_quote'",
      "runTicketAction('confirm_appointment'",
      "runTicketAction('confirm_access'",
      "runTicketAction('approve_reschedule'",
      "runTicketAction('cancellation_decision'",
      "runTicketAction('mark_payment'",
    ],
  },
  {
    path: 'functions/tenantTicketOperations.ts',
    required: [
      'export const createTenantServiceTicket',
      'if (kind === "SCHEDULED_SERVICE")',
      'details.policyAccepted !== true',
      'quoteStatus: "PENDING_OPERATIONS_QUOTE"',
      'cancellationPolicyAccepted: true',
      'availabilitySlotId: text(details.availabilitySlotId',
      'requestedAccessCodeExpiry: timestampOrNull(details.accessCodeExpiresAt)',
      'sensitiveOccupants: text(details.sensitiveOccupants',
      'transaction.create(ticketRef, common)',
    ],
  },
  {
    path: 'functions/scheduledServices.ts',
    required: [
      'export const tenantManageScheduledService',
      'export const saveScheduledServiceAccessCode',
      'export const adminRevealScheduledServiceAccessCode',
      'export const scheduledServiceReminderCron',
      'export const onScheduledServiceUpdated',
      'export const createNextRecurringScheduledService',
      "schedule: 'every 30 minutes'",
      "'aes-256-gcm'",
      "const ACCESS_KEY_COLLECTION = 'system_secrets'",
      "const ACCESS_KEY_DOCUMENT = 'scheduled_service_access_key'",
      'transaction.create(ref',
      'accessCodeExpiresAt',
      'FULL_REFUND_WINDOW',
      'PARTIAL_REFUND_WINDOW',
      'NO_REFUND_WINDOW',
    ],
    forbidden: [
      'process.env.SCHEDULED_SERVICE_ACCESS_KEY',
      'HARD_LAUNCH_APPROVAL_HMAC_KEY',
    ],
  },
  {
    path: 'functions/scheduledServiceAvailability.ts',
    required: [
      'export const getScheduledServiceAvailability',
      'export const adminManageScheduledServiceAvailability',
      'export const adminUpdateScheduledService',
      "action === 'publish_quote'",
      "action === 'confirm_appointment'",
      "action === 'confirm_access'",
      "action === 'approve_reschedule'",
      "action === 'cancellation_decision'",
      "action === 'mark_payment'",
    ],
  },
  {
    path: 'functions/runtime.ts',
    required: [
      'export * from "./scheduledServices";',
      'export * from "./scheduledServiceAvailability";',
      'export * from "./paymentEvidence";',
      'export * from "./ticketDispatchOperations";',
      'export * from "./tenantTicketOperations";',
      'export * from "./aiUsageQuota";',
      'export * from "./hrAutomation";',
    ],
  },
  {
    path: 'functions/runtimeAll.ts',
    required: ["export * from './runtime';"],
  },
  {
    path: 'functions/package.json',
    required: ['"main": "lib/runtimeAll.js"'],
  },
  {
    path: 'scripts/harden-system-secrets-rules.mjs',
    required: [
      'match /system_secrets/{secretId}',
      'allow read, write: if false;',
      'match /{collection}/{document=**}',
      "collection != 'system_secrets' && hasAdminClaim()",
      'source.includes(legacyCatchAll)',
    ],
  },
  {
    path: 'package.json',
    required: [
      '"harden:system-secrets": "node scripts/harden-system-secrets-rules.mjs"',
      'npm run harden:system-secrets',
    ],
  },
  {
    path: '.github/workflows/scheduled-services-production.yml',
    required: [
      'name: Scheduled Services Production (Retired)',
      'workflow_dispatch:',
      'name: Refuse parallel production deployment',
      'name: Use the protected production workflow',
      'Dispatch Firebase Production Deploy',
      'exit 1',
    ],
    forbidden: [
      'id-token: write',
      'environment: production',
      'firebase deploy',
      'functions:tenantManageScheduledService',
      'continue-on-error: true',
      'push:',
    ],
  },
  {
    path: '.github/workflows/firebase-production-deploy.yml',
    required: [
      'name: Firebase Production Deploy',
      'environment: production',
      'npm run build:functions',
      'npm run test:rules',
      'node scripts/deploy-firebase-production.mjs',
      '[[ "$EXPECTED_COMMIT_SHA" == "$CURRENT_COMMIT_SHA" ]]',
      'Verify production deployment metadata and same-run bindings after deploy',
    ],
    forbidden: [
      'continue-on-error: true',
    ],
  },
  {
    path: 'scripts/deploy-firebase-production.mjs',
    required: [
      "'functions,hosting,firestore:rules,firestore:indexes,storage'",
      "'complete Firebase production stack'",
      "'hosting,firestoreRules,firestoreIndexes,storageRules,functions'",
      "'scripts/verify-production-deployment.mjs'",
    ],
  },
  {
    path: '.github/workflows/ci.yml',
    required: ['node scripts/verify-scheduled-services-completeness.mjs'],
  },
];

const failures = [];
for (const check of checks) {
  if (!existsSync(check.path)) {
    failures.push(`${check.path}: file missing`);
    continue;
  }
  const content = readFileSync(check.path, 'utf8');
  for (const pattern of check.required || []) {
    if (!content.includes(pattern)) failures.push(`${check.path}: missing ${JSON.stringify(pattern)}`);
  }
  for (const pattern of check.forbidden || []) {
    if (content.includes(pattern)) failures.push(`${check.path}: forbidden ${JSON.stringify(pattern)}`);
  }
}

if (failures.length) {
  console.error('[scheduled-services-completeness] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[scheduled-services-completeness] PASS (${checks.length} files, server-authoritative intake, secure key lifecycle, exports, protected full-stack deployment, and retired parallel deploy path verified)`);
