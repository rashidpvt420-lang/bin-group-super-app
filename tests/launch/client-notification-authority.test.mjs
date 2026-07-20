import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['src', 'apps', 'packages'];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const forbiddenPatterns = [
  /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['"]notifications['"]/,
  /setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]notifications['"]/,
];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if ([...extensions].some((ext) => fullPath.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

test('client notification fanout is routed through createNotification callable', async () => {
  const files = (await Promise.all(roots.map(walk))).flat();
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
      offenders.push(file);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'client code must not write directly to notifications; use the createNotification callable instead',
  );

  const notificationService = await readFile('packages/shared/src/lib/notificationService.ts', 'utf8');
  assert.match(notificationService, /httpsCallable\(functions, ['"]createNotification['"]\)/);
  assert.doesNotMatch(notificationService, /collection\(db, ['"]notifications['"]\)/);
});