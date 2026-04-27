const fs = require('fs');
let content = fs.readFileSync('functions/index.ts', 'utf8');
content = content.replace(
    /if \(!request\.auth \|\| !request\.auth\.token\.admin\) \{\s+throw new HttpsError\("permission-denied", "Sovereign Admin credentials required\."\);\s+\}/,
    `if (!request.auth) {
        console.warn("[TECH-REPAIR] Unauthorized access attempt (no auth)");
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const isAdmin = request.auth.token.admin === true || request.auth.token.super_admin === true;
    if (!isAdmin) {
        console.warn("[TECH-REPAIR] Permission denied for user " + request.auth.uid);
        throw new HttpsError("permission-denied", "Sovereign Admin credentials required.");
    }`
);
fs.writeFileSync('functions/index.ts', content);
console.log('Fixed index.ts');
