import { readFileSync, writeFileSync } from 'node:fs';

const target = 'src/context/RoleContext.tsx';
let source = readFileSync(target, 'utf8');
const marker = '    [key: string]: unknown;';

if (!source.includes(marker)) {
  source = source.replace(
    '    permissions?: Record<string, boolean>;\n}',
    `    permissions?: Record<string, boolean>;\n${marker}\n}`
  );
  writeFileSync(target, source);
  console.log('Role context type guard installed.');
} else {
  console.log('Role context type guard already installed.');
}
