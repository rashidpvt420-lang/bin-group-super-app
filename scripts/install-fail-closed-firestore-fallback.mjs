import fs from 'node:fs';

const rulesPath = 'firestore.rules';
let rules = fs.readFileSync(rulesPath, 'utf8').replace(/\r\n?/g, '\n');

function readMatchBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1, text: source.slice(start, index + 1) };
    }
  }
  throw new Error(`Unclosed match block: ${marker}`);
}

const failClosedBlock = `    // Collections without an explicit policy are denied. Privileged browser
    // clients must use an explicit collection rule or a server-side callable.
    match /{document=**} {
      allow read, write: if false;
    }`;

const existingAdminCatchAll = readMatchBlock(rules, '    match /{collection}/{document=**} {');
const existingFailClosed = readMatchBlock(rules, '    match /{document=**} {');

if (existingAdminCatchAll) {
  rules = `${rules.slice(0, existingAdminCatchAll.start)}${failClosedBlock}${rules.slice(existingAdminCatchAll.end)}`;
  console.log('[patched] replaced global admin catch-all with constant-deny fallback');
} else if (existingFailClosed?.text.includes('allow read, write: if false;')) {
  console.log('[already applied] constant-deny Firestore fallback');
} else {
  throw new Error('Expected global catch-all was not found.');
}

if (rules.includes('match /{collection}/{document=**}')) {
  throw new Error('Global collection admin catch-all still exists.');
}
if ((rules.split('match /{document=**} {').length - 1) !== 1) {
  throw new Error('Fail-closed recursive fallback must exist exactly once.');
}
if (!rules.includes('match /{document=**} {\n      allow read, write: if false;')) {
  throw new Error('Fail-closed recursive fallback is malformed.');
}

fs.writeFileSync(rulesPath, rules, 'utf8');
console.log('[install-fail-closed-firestore-fallback] explicit-policy-only rules installed');
