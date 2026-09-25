#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FUNCTIONS_DIR = path.resolve('functions');
const ENTRYPOINT = path.join(FUNCTIONS_DIR, 'runtimeAll.ts');
const OUTPUT = path.resolve('audit/phase-10-functions-inventory.json');

function fail(message) {
  console.error('[phase10-functions] FAIL:', message);
  process.exit(1);
}

function read(file) {
  return readFileSync(file, 'utf8');
}

function resolveLocalModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function exportedModules(entry) {
  const visited = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = read(file);
    const re = /export\s+(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g;
    let match;
    while ((match = re.exec(source))) {
      const resolved = resolveLocalModule(file, match[1]);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return [...visited];
}

function triggerRows(file, source) {
  const rows = [];
  const triggerRe = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(onCall|onRequest|onSchedule|onDocumentCreated|onDocumentUpdated|onDocumentWritten|onDocumentDeleted|onObjectFinalized|onObjectDeleted|onTaskDispatched)\s*\(/g;
  let match;
  while ((match = triggerRe.exec(source))) {
    const [, name, trigger] = match;
    const isCallable = trigger === 'onCall';
    const isHttp = trigger === 'onRequest';
    const isBackground = !isCallable && !isHttp;
    const authEvidence = /request\.auth|require[A-Za-z0-9_]*(?:Admin|Role|Owner|Tenant|Technician|Broker|Auth)|assert[A-Za-z0-9_]*(?:Admin|Role|Owner|Tenant|Technician|Broker|Auth)|unauthenticated/.test(source);
    const publicEvidence = /public|webhook|health|verifyPublicProof|phase1|retired|410|Gone/i.test(name + '\n' + source);
    const claimEvidence = /customClaims|request\.auth\.token|hasPermission|role|ceo|super_admin|admin/i.test(source);
    const validationEvidence = /invalid-argument|failed-precondition|schema|validate|cleanText|safeId|normalize|typeof|Array\.isArray|Number\.isFinite/.test(source);
    const ownershipEvidence = /ownerId|ownerUid|tenantId|tenantUid|technicianId|assignedTechnicianId|brokerId|request\.auth\.uid/.test(source);
    const idempotencyEvidence = /idempotent|idempotency|eventId|requestId|confirmationId|transaction\.create|\.doc\([^)]*(?:event|request|confirmation|claim)/i.test(source);
    const transactionEvidence = /runTransaction|transaction\.|lease|compareAndSet|CAS|claim/i.test(source);
    const retryEvidence = /retry|attempt|backoff|onSchedule|taskQueue/i.test(source);
    const auditEvidence = /audit_logs|auditLogs|writeAudit|logAudit|auditRef/i.test(source);
    const errorEvidence = /HttpsError|try\s*\{|catch\s*\(|response\.status\(|throw new Error/.test(source);
    const secretEvidence = /defineSecret|SecretManager|secrets:\s*\[/.test(source);
    const rateLimitEvidence = /rate[_-]?limit|reserveAiUsageQuota|quota|throttle/i.test(source);
    const httpAuthEvidence = /signature|x-[a-z0-9-]*token|authorization|bearer|verify.*token|gateway.*token|webhook.*secret|410|gone|retired/i.test(source);
    rows.push({
      name,
      trigger,
      module: path.relative(process.cwd(), file),
      controls: {
        auth: isBackground ? 'server-invoked' : authEvidence ? 'present' : publicEvidence ? 'public-reviewed' : 'review',
        appCheck: isCallable ? 'global-enforced' : isHttp ? 'not-applicable-raw-http' : 'not-applicable-background',
        claims: isBackground ? 'not-applicable' : claimEvidence ? 'present' : 'review',
        inputValidation: validationEvidence ? 'present' : 'review',
        ownership: isBackground ? 'server-authority' : ownershipEvidence ? 'present' : publicEvidence ? 'public-reviewed' : 'review',
        idempotency: idempotencyEvidence ? 'present' : isBackground ? 'review' : 'not-universal',
        retries: retryEvidence ? 'present' : 'not-universal',
        raceConditions: transactionEvidence ? 'transaction-or-claim' : 'review',
        auditLogs: auditEvidence ? 'present' : 'review',
        errorHandling: errorEvidence ? 'present' : 'review',
        secrets: secretEvidence ? 'secret-bound' : 'no-secret-binding-detected',
        rateLimits: rateLimitEvidence ? 'present' : publicEvidence ? 'review' : 'not-universal',
      },
      rawHttpAuthentication: isHttp ? (httpAuthEvidence ? 'present' : 'review') : 'not-applicable',
    });
  }
  return rows;
}

const runtimeAll = read(ENTRYPOINT);
const defaultImport = runtimeAll.indexOf('import "./functionGlobalOptions"');
const runtimeExport = runtimeAll.indexOf("export * from './runtime'");
if (defaultImport < 0 || runtimeExport < 0 || defaultImport > runtimeExport) {
  fail('functionGlobalOptions must load before the canonical runtime exports');
}

const globalOptions = read(path.join(FUNCTIONS_DIR, 'functionGlobalOptions.ts'));
if (!/enforceAppCheck:\s*true/.test(globalOptions)) fail('global Functions App Check enforcement is missing');

const modules = exportedModules(ENTRYPOINT);
const rows = [];
const appCheckOffenders = [];
for (const file of modules) {
  const source = read(file);
  if (/enforceAppCheck:\s*false/.test(source)) appCheckOffenders.push(path.relative(process.cwd(), file));
  rows.push(...triggerRows(file, source));
}
if (appCheckOffenders.length) fail('deployed function modules disable App Check: ' + appCheckOffenders.join(', '));
if (!rows.length) fail('no deployed Firebase triggers were discovered');

const httpWithoutAuth = rows.filter((row) => row.trigger === 'onRequest' && row.rawHttpAuthentication !== 'present');
if (httpWithoutAuth.length) {
  fail('raw HTTP triggers lack a signature/token/fail-closed boundary: ' + httpWithoutAuth.map((row) => row.name).join(', '));
}

const counts = rows.reduce((acc, row) => {
  acc[row.trigger] = (acc[row.trigger] || 0) + 1;
  return acc;
}, {});
const report = {
  schemaVersion: 1,
  phase: 10,
  entrypoint: 'functions/runtimeAll.ts',
  globalAppCheckEnforced: true,
  deployedModuleCount: modules.length,
  deployedTriggerCount: rows.length,
  triggerCounts: counts,
  checks: [
    'auth',
    'appCheck',
    'claims',
    'inputValidation',
    'ownership',
    'idempotency',
    'retries',
    'raceConditions',
    'auditLogs',
    'errorHandling',
    'secrets',
    'rateLimits',
  ],
  triggers: rows.sort((a, b) => a.name.localeCompare(b.name)),
  hardLaunchClaim: false,
};
mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');
console.log('[phase10-functions] PASS');
console.log('[phase10-functions] deployed_modules=' + modules.length);
console.log('[phase10-functions] deployed_triggers=' + rows.length);
console.log('[phase10-functions] trigger_counts=' + JSON.stringify(counts));
