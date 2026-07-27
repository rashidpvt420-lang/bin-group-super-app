#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/launch/firestore-final-authority.test.mjs';
let source = readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`[ticket-final-authority-fix] ${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  "const liveLocationHardener = path.join(root, 'scripts/harden-technician-live-location-authority.mjs');\n",
  "const ticketBindingHardener = path.join(root, 'scripts/apply-ticket-rule-binding.mjs');\nconst liveLocationHardener = path.join(root, 'scripts/harden-technician-live-location-authority.mjs');\n",
  'ticket binding hardener declaration',
);
replaceOnce(
  "    const liveLocation = spawnSync(process.execPath, [liveLocationHardener], { cwd: directory, encoding: 'utf8' });\n",
  "    const ticketBinding = spawnSync(process.execPath, [ticketBindingHardener], { cwd: directory, encoding: 'utf8' });\n    assert.equal(ticketBinding.status, 0, ticketBinding.stderr || ticketBinding.stdout);\n    const liveLocation = spawnSync(process.execPath, [liveLocationHardener], { cwd: directory, encoding: 'utf8' });\n",
  'first ticket binding preparation',
);
replaceOnce(
  "    const liveLocationSecond = spawnSync(process.execPath, [liveLocationHardener], { cwd: directory, encoding: 'utf8' });\n",
  "    const ticketBindingSecond = spawnSync(process.execPath, [ticketBindingHardener], { cwd: directory, encoding: 'utf8' });\n    assert.equal(ticketBindingSecond.status, 0, ticketBindingSecond.stderr || ticketBindingSecond.stdout);\n    const liveLocationSecond = spawnSync(process.execPath, [liveLocationHardener], { cwd: directory, encoding: 'utf8' });\n",
  'second ticket binding preparation',
);

writeFileSync(path, source);
console.log('[ticket-final-authority-fix] Final authority test now prepares the isolated ticket rules before final hardening.');
