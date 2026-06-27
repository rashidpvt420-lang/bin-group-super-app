import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.join(__dirname, '../functions');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'lib') {
        results = results.concat(walk(filePath));
      }
    } else if (filePath.endsWith('.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

const files = walk(functionsDir);
let changed = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('admin.firestore.FieldValue')) {
    content = content.replace(/admin\.firestore\.FieldValue/g, 'FieldValue');
    if (!content.includes('import { FieldValue }')) {
      content = 'import { FieldValue } from "firebase-admin/firestore";\n' + content;
    }
    content = content.replace(/const serverTimestamp = \(\) => FieldValue\.serverTimestamp\(\);/g, 'const serverTimestamp = FieldValue.serverTimestamp;');
    fs.writeFileSync(file, content, 'utf8');
    changed++;
  }
}
console.log(`Updated ${changed} files.`);
