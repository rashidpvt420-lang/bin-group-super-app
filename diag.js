import fs from 'fs';

const filePath = 'C:/Users/My-PC/Desktop/bin app/packages/shared/src/context/LanguageContext.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const keysEn = new Set();
const keysAr = new Set();
let currentBlock = 'none';

const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('en: {')) currentBlock = 'en';
    if (line.includes('ar: {')) currentBlock = 'ar';
    
    // Look for lines that look like key declarations: 'key': 'value'
    const match = line.match(/^\s*'([^']+)':/);
    if (match) {
        const key = match[1];
        if (currentBlock === 'en') {
            if (keysEn.has(key)) {
                console.log(`Duplicate EN key found: "${key}" at line ${index + 1}`);
            }
            keysEn.add(key);
        } else if (currentBlock === 'ar') {
            if (keysAr.has(key)) {
                console.log(`Duplicate AR key found: "${key}" at line ${index + 1}`);
            }
            keysAr.add(key);
        }
    }
});
