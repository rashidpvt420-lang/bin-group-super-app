# Next Errors To Send To ChatGPT — V2

Send these only if they fail during local Antigravity/Codex verification:

1. Full output of:
   ```bash
   npm install
   npm run build
   npm run lint
   npm run typecheck --if-present
   ```

2. Full output of:
   ```bash
   cd functions
   npm install
   npm run build
   cd ..
   ```

3. Firestore emulator/rules errors from:
   ```bash
   firebase use staging
   firebase emulators:start --only firestore,functions,hosting
   ```

4. Browser console errors from staging URLs.

5. Firebase permission-denied errors with:
   - signed-in role
   - UID
   - target collection/document path
   - action: read/create/update/delete

6. Screenshots of broken owner/admin/tenant/technician/broker pages.
