import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';

// Walk and fix ALL broken import paths by computing the correct relative path
// from each file's actual location to the target module.

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...walkDir(full));
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) results.push(full);
  }
  return results;
}

const srcRoot = resolve('src');

// Define the actual target paths
const targets = {
  'LanguageContext': resolve('src/context/LanguageContext'),
  'arabicPdfFont': resolve('src/utils/arabicPdfFont'),
};

// Patterns to detect and fix
const patterns = [
  // Wrong context imports
  { regex: /from ['"]([^'"]*\/context\/LanguageContext)['"]/g, targetKey: 'LanguageContext' },
  // Wrong arabicPdfFont imports  
  { regex: /from ['"]([^'"]*\/arabicPdfFont)['"]/g, targetKey: 'arabicPdfFont' },
];

const allFiles = walkDir('src');
let fixed = 0;

for (const f of allFiles) {
  let text = readFileSync(f, 'utf8');
  let changed = false;
  const fileDir = dirname(resolve(f));

  for (const { regex, targetKey } of patterns) {
    const target = targets[targetKey];
    regex.lastIndex = 0; // reset regex state
    
    text = text.replace(regex, (match, importPath) => {
      // Resolve what the import currently points to
      const resolvedImport = resolve(fileDir, importPath);
      
      // Check if it's wrong (doesn't resolve to our target)
      if (resolvedImport !== target) {
        // Compute the correct relative path from this file to the target
        let correctRel = relative(fileDir, target).replace(/\\/g, '/');
        if (!correctRel.startsWith('.')) correctRel = './' + correctRel;
        
        const quote = match.includes('"') ? '"' : "'";
        console.log(`FIX in ${f.split(/[/\\]/).pop()}: ${importPath} -> ${correctRel}`);
        changed = true;
        return `from ${quote}${correctRel}${quote}`;
      }
      return match;
    });
  }

  if (changed) {
    writeFileSync(f, text, 'utf8');
    fixed++;
  }
}

console.log(`\nFixed ${fixed} files total.`);
