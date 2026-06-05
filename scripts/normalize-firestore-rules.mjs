import { readFileSync, writeFileSync } from 'node:fs';

const path = 'firestore.rules';
const source = readFileSync(path, 'utf8');
const needle = '    function brokerOwns(data) {';

let cursor = 0;
let seen = 0;
let removed = 0;
let output = '';

while (true) {
  const start = source.indexOf(needle, cursor);
  if (start === -1) {
    output += source.slice(cursor);
    break;
  }

  output += source.slice(cursor, start);

  let depth = 0;
  let end = start;
  for (; end < source.length; end += 1) {
    const char = source[end];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        while (source[end] === '\r' || source[end] === '\n') end += 1;
        break;
      }
    }
  }

  const block = source.slice(start, end);
  if (seen === 0) {
    output += block.endsWith('\n\n') ? block : `${block}\n\n`;
  } else {
    removed += 1;
  }
  seen += 1;
  cursor = end;
}

if (output !== source) {
  writeFileSync(path, output);
}

console.log(`Firestore rules normalization complete. Kept ${seen > 0 ? 1 : 0}, removed ${removed} duplicate brokerOwns helper(s).`);
