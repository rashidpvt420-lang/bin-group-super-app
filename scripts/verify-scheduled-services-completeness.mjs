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
      "httpsCallable(functions, 'saveScheduledServiceAccessCode')",
      'recurrenceFrequency',
      'recurrenceOccurrences',
      'cancellationPolicyAccepted',
      'PENDING_OPERATIONS_QUOTE',
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
    path: '.github/workflows/scheduled-services-production.yml',
    required: [
      "VITE_ENABLE_FIREBASE_APPCHECK: 'true'",
      'functions:tenantManageScheduledService',
      'functions:saveScheduledServiceAccessCode',
      'functions:adminRevealScheduledServiceAccessCode',
      'functions:scheduledServiceReminderCron',
      'functions:onScheduledServiceUpdated',
      'functions:createNextRecurringScheduledService',
      'functions:getScheduledServiceAvailability',
      'functions:adminManageScheduledServiceAvailability',
      'functions:adminUpdateScheduledService',
      'hosting:app,hosting:admin',
      'npm run build --workspace=functions',
    ],
    forbidden: [
      'SCHEDULED_SERVICE_ACCESS_KEY',
      'HARD_LAUNCH_APPROVAL_HMAC_KEY',
      'continue-on-error: true',
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

console.log(`[scheduled-services-completeness] PASS (${checks.length} files, secure key lifecycle, exports, builds and deploy targets verified)`);
