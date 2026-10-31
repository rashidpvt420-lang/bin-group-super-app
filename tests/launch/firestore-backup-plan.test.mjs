import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('backup plan is dry-run by default and covers daily, weekly, delete protection', () => {
  const out = execFileSync('bash', ['scripts/firestore-backup-plan.sh'], { encoding: 'utf8' });
  assert.match(out, /DRY RUN/);
  assert.match(out, /--recurrence=daily --retention=7d/);
  assert.match(out, /--recurrence=weekly --day-of-week=SUN --retention=28d/);
  assert.match(out, /databases update .*--delete-protection/);
  assert.doesNotMatch(out, /--no-delete-protection|schedules delete/);
});

test('apply refuses without explicit project confirmation', () => {
  assert.throws(() => execFileSync('bash', ['scripts/firestore-backup-plan.sh', '--apply'], {
    encoding: 'utf8', stdio: 'pipe', env: { ...process.env, CONFIRM_PROJECT: '' },
  }), (e) => e.status === 2);
  assert.match(readFileSync('docs/FIRESTORE_BACKUP_RUNBOOK.md', 'utf8'), /Nothing is applied to production until the founder approves/);
});
