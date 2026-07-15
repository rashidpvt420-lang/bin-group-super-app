import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const failures = [];
const requiredBridges = [
  'src/lib/firebase.ts',
  'apps/admin-panel/src/lib/firebase.ts',
  'packages/shared/src/lib/firebase.ts',
];

function read(path) {
  if (!existsSync(path)) {
    failures.push(`Missing required file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const path of requiredBridges) {
  const source = read(path);
  assert(source.includes('addDoc as firestoreAddDoc'), `${path} must alias the native Firestore addDoc export.`);
  assert(source.includes("collectionPath !== 'audit_logs' && collectionPath !== 'auditLogs'"), `${path} must intercept both legacy audit collection names.`);
  assert(source.includes("httpsCallable(functions, 'logUserAuditAction')"), `${path} must route audit events through logUserAuditAction.`);
  assert(source.includes('return firestoreAddDoc(reference, data);'), `${path} must preserve native writes for non-audit collections.`);
  assert(source.includes('pendingAuditWrites'), `${path} must deduplicate simultaneous legacy dual-audit writes.`);
  assert(source.includes('inferLegacyAuditTarget'), `${path} must normalize legacy audit target fields.`);
  assert(source.includes('data?.entityType') && source.includes('data?.entityId'), `${path} must accept legacy entityType/entityId audit fields.`);
  assert(source.includes("['contractId', 'contracts']"), `${path} must map legacy contractId audit fields.`);
  assert(!source.includes('void pending.finally('), `${path} must not create an unhandled rejected cleanup promise.`);
}

const auditFunction = read('functions/userAuditOperations.ts');
const functionIndex = read('functions/index.ts');
const functionRuntime = read('functions/runtime.ts');
const functionRuntimeAll = read('functions/runtimeAll.ts');
const functionsPackage = read('functions/package.json');
const firestoreRules = read('firestore.rules');

assert(auditFunction.includes('export const logUserAuditAction'), 'The authenticated audit callable must exist.');
assert(auditFunction.includes('region: "europe-west3"'), 'The audit callable must deploy in the client-configured europe-west3 region.');
assert(auditFunction.includes('request.auth?.uid'), 'The audit callable must require an authenticated user.');
assert(auditFunction.includes('db.collection("audit_logs").add'), 'The audit callable must perform the server-side audit write.');
const indexExportsAuditCallable = functionIndex.includes('export { logUserAuditAction } from "./userAuditOperations";');
const runtimeExportsAuditCallable =
  functionRuntime.includes('export * from "./userAuditOperations";') &&
  functionRuntimeAll.includes("export * from './runtime';") &&
  functionsPackage.includes('"main": "lib/runtimeAll.js"');
assert(
  indexExportsAuditCallable || runtimeExportsAuditCallable,
  'The deployed Functions entrypoint must export logUserAuditAction through index.ts or the runtimeAll -> runtime export chain.',
);
assert(firestoreRules.includes('match /audit_logs/'), 'Firestore Rules must explicitly cover audit_logs.');
assert(firestoreRules.includes('match /auditLogs/'), 'Firestore Rules must explicitly cover auditLogs.');
assert(firestoreRules.includes('match /system_health/{healthDoc}') && firestoreRules.includes('allow read: if isAdmin();'), 'Firestore Rules must let admins read system_health evidence.');

const sourceRoots = ['src', 'apps', 'packages'];
const unsafeRawAuditWriters = [];

function importsRawFirestoreAddDoc(source) {
  const namedImports = source.match(/import\s*\{[\s\S]*?\}\s*from\s*['"]firebase\/firestore['"];?/g) || [];
  const importsNamedAddDoc = namedImports.some((statement) => /\baddDoc\b/.test(statement));
  const importsNamespace = /import\s+\*\s+as\s+\w+\s+from\s+['"]firebase\/firestore['"];?/.test(source);
  const callsNamespaceAddDoc = /\b\w+\.addDoc\s*\(/.test(source);
  return importsNamedAddDoc || (importsNamespace && callsNamespaceAddDoc);
}

function walk(path) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
      walk(fullPath);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry)) continue;
    const source = readFileSync(fullPath, 'utf8');
    const referencesAuditCollection = /['"]audit_logs['"]|['"]auditLogs['"]/.test(source);
    const hasRawAuditWriteCapability = importsRawFirestoreAddDoc(source);
    if (referencesAuditCollection && hasRawAuditWriteCapability && !requiredBridges.includes(fullPath.replaceAll('\\', '/'))) {
      unsafeRawAuditWriters.push(relative('.', fullPath).replaceAll('\\', '/'));
    }
  }
}

for (const root of sourceRoots) walk(root);
assert(
  unsafeRawAuditWriters.length === 0,
  `Audit-writing source files must use a BIN GROUP Firebase bridge, not raw firebase/firestore addDoc: ${unsafeRawAuditWriters.join(', ')}`,
);

if (failures.length) {
  console.error('\nAudit write bridge verification failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Audit write bridge verification passed. Legacy audit writes are callable-backed and rules-compatible.');
