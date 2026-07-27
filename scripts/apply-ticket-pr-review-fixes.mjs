#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`[ticket-review-fix] ${label}: expected one match, found ${count}`);
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  'src/tenant/pages/TenantRequestPage.tsx',
  "    const clientRequestIdRef = useRef('');\n",
  "    const clientRequestIdRef = useRef('');\n    const previewUrlsRef = useRef<string[]>([]);\n",
  'preview ref',
);
replaceOnce(
  'src/tenant/pages/TenantRequestPage.tsx',
  `    useEffect(() => () => {\n        previews.forEach((url) => URL.revokeObjectURL(url));\n    }, [previews]);\n`,
  `    useEffect(() => {\n        previewUrlsRef.current = previews;\n    }, [previews]);\n\n    useEffect(() => () => {\n        previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));\n        previewUrlsRef.current = [];\n    }, []);\n`,
  'preview cleanup lifecycle',
);
replaceOnce(
  'src/tenant/pages/TenantRequestPage.tsx',
  "                kind: 'AI_CONCIERGE',\n",
  "                kind: priority === 'emergency' ? 'EMERGENCY' : 'AI_CONCIERGE',\n",
  'emergency callable routing',
);
replaceOnce(
  'src/tenant/pages/TenantRequestPage.tsx',
  "            navigate('/tenant/tickets');\n",
  "            clientRequestIdRef.current = '';\n            navigate('/tenant/tickets');\n",
  'idempotency rotation',
);

replaceOnce(
  'functions/tenantTicketOperations.ts',
  'const PRIORITIES = new Set(["normal", "urgent", "emergency"]);\n',
  `const PRIORITIES = new Set(["normal", "urgent", "emergency"]);\n\nfunction tenantSlaMinutes(priority: string) {\n  return priority === "emergency" ? 30 : priority === "urgent" ? 120 : 480;\n}\n`,
  'canonical SLA helper',
);
replaceOnce(
  'functions/tenantTicketOperations.ts',
  '          slaMinutes: 60,\n',
  '          slaMinutes: tenantSlaMinutes("emergency"),\n',
  'emergency SLA',
);
replaceOnce(
  'functions/tenantTicketOperations.ts',
  '          slaMinutes: priority === "emergency" ? 60 : priority === "urgent" ? 240 : 1440,\n',
  '          slaMinutes: tenantSlaMinutes(priority),\n',
  'maintenance SLA',
);

replaceOnce(
  'src/lib/ticketSystemService.ts',
  '      proofUpdate.photos = photoUrls;\n',
  '',
  'technician evidence field boundary',
);

replaceOnce(
  'test/five-profile-audit-guards.test.mjs',
  "import { readFileSync } from 'node:fs';\nimport { dirname, join } from 'node:path';\n",
  "import { execFileSync } from 'node:child_process';\nimport { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';\nimport { tmpdir } from 'node:os';\nimport { dirname, join, resolve } from 'node:path';\n",
  'five-profile test imports',
);
replaceOnce(
  'test/five-profile-audit-guards.test.mjs',
  "const root = join(dirname(fileURLToPath(import.meta.url)), '..');\n",
  `const root = join(dirname(fileURLToPath(import.meta.url)), '..');\n\nfunction preparedTicketRules() {\n  const directory = mkdtempSync(join(tmpdir(), 'bin-five-profile-rules-'));\n  try {\n    copyFileSync(join(root, 'firestore.rules'), join(directory, 'firestore.rules'));\n    execFileSync(process.execPath, [resolve(root, 'scripts/apply-ticket-rule-binding.mjs')], {\n      cwd: directory,\n      stdio: 'pipe',\n    });\n    return readFileSync(join(directory, 'firestore.rules'), 'utf8');\n  } finally {\n    rmSync(directory, { recursive: true, force: true });\n  }\n}\n`,
  'five-profile prepared rules helper',
);
replaceOnce(
  'test/five-profile-audit-guards.test.mjs',
  "  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');\n",
  '  const rules = preparedTicketRules();\n',
  'five-profile prepared rules use',
);

replaceOnce(
  'tests/launch/property-geo-authority.test.mjs',
  "import { readFile } from 'node:fs/promises';\nimport test from 'node:test';\n",
  "import { execFileSync } from 'node:child_process';\nimport { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';\nimport { readFile } from 'node:fs/promises';\nimport { tmpdir } from 'node:os';\nimport { join } from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport test from 'node:test';\n",
  'property geo test imports',
);
replaceOnce(
  'tests/launch/property-geo-authority.test.mjs',
  "const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');\n",
  `const read = (path) => readFile(new URL(\`../../\${path}\`, import.meta.url), 'utf8');\n\nfunction preparedPropertyRules() {\n  const directory = mkdtempSync(join(tmpdir(), 'bin-property-geo-rules-'));\n  try {\n    copyFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), join(directory, 'firestore.rules'));\n    execFileSync(\n      process.execPath,\n      [fileURLToPath(new URL('../../scripts/harden-property-geo-authority.mjs', import.meta.url))],\n      { cwd: directory, stdio: 'pipe' },\n    );\n    return readFileSync(join(directory, 'firestore.rules'), 'utf8');\n  } finally {\n    rmSync(directory, { recursive: true, force: true });\n  }\n}\n`,
  'property geo prepared rules helper',
);
{
  const path = 'tests/launch/property-geo-authority.test.mjs';
  const source = readFileSync(path, 'utf8');
  const needle = "    read('firestore.rules'),";
  const count = source.split(needle).length - 1;
  if (count !== 2) throw new Error(`[ticket-review-fix] property geo prepared rules uses: expected two matches, found ${count}`);
  writeFileSync(path, source.split(needle).join('    Promise.resolve(preparedPropertyRules()),'));
}

writeFileSync('tests/launch/ticket-review-blockers.test.mjs', `import assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nimport test from 'node:test';\n\nconst read = (path) => readFileSync(path, 'utf8');\n\ntest('Tenant requests route emergencies and persist canonical SLA values', () => {\n  const page = read('src/tenant/pages/TenantRequestPage.tsx');\n  const operations = read('functions/tenantTicketOperations.ts');\n  assert.match(page, /kind: priority === 'emergency' \\? 'EMERGENCY' : 'AI_CONCIERGE'/);\n  assert.match(page, /clientRequestIdRef\\.current = '';/);\n  assert.match(operations, /return priority === "emergency" \\? 30 : priority === "urgent" \\? 120 : 480;/);\n  assert.match(operations, /slaMinutes: tenantSlaMinutes\\("emergency"\\)/);\n  assert.match(operations, /slaMinutes: tenantSlaMinutes\\(priority\\)/);\n});\n\ntest('photo previews and Technician completion evidence remain policy-safe', () => {\n  const page = read('src/tenant/pages/TenantRequestPage.tsx');\n  const service = read('src/lib/ticketSystemService.ts');\n  assert.match(page, /const previewUrlsRef = useRef<string\\[\\]>\\(\\[\\]\\)/);\n  assert.match(page, /previewUrlsRef\\.current = previews/);\n  assert.match(page, /previewUrlsRef\\.current\\.forEach\\(\\(url\\) => URL\\.revokeObjectURL\\(url\\)\\)/);\n  assert.doesNotMatch(page, /previews\\.forEach\\(\\(url\\) => URL\\.revokeObjectURL\\(url\\)\\);\\n    }, \\[previews\\]\\)/);\n  assert.doesNotMatch(service, /proofUpdate\\.photos = photoUrls/);\n  for (const field of ['proofPhotos', 'completionPhotos', 'afterPhotos', 'afterPhotoUrl']) {\n    assert.match(service, new RegExp(\`proofUpdate\\\\.\${field}\`));\n  }\n});\n\ntest('launch rule contracts prepare isolated rule copies', () => {\n  const fiveProfile = read('test/five-profile-audit-guards.test.mjs');\n  const propertyGeo = read('tests/launch/property-geo-authority.test.mjs');\n  assert.match(fiveProfile, /preparedTicketRules\\(\\)/);\n  assert.match(fiveProfile, /mkdtempSync/);\n  assert.match(propertyGeo, /preparedPropertyRules\\(\\)/);\n  assert.match(propertyGeo, /harden-property-geo-authority\\.mjs/);\n});\n`);

console.log('[ticket-review-fix] Applied emergency, SLA, preview, evidence-field, and isolated-rules corrections.');
