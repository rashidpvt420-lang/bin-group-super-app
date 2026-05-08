# BIN GROUP Super App: Deployment & Operations Guide

## 🚀 Production Infrastructure
- **Firebase Project**: `bin-group-57c60`
- **Primary Domain**: [https://bin-groups.com](https://bin-groups.com)
- **Secondary Domain**: [https://www.bin-groups.com](https://www.bin-groups.com)
- **Firebase Project ID**: `bin-group-57c60`

---

## 🛠️ Local Development & Deployment

### 1. Build Pipeline
To generate the production bundle:
```powershell
npm install
npm run build
```

### 2. Hosting Deployment
To push the latest frontend changes to production:
```powershell
firebase deploy --only hosting
```

### 3. Full Ecosystem Update
To deploy Cloud Functions, Firestore Rules, and Indexes along with Hosting:
```powershell
./deploy-production.ps1
```

---

## 🔒 Security & Roles

### Emergency Admin Grant
If an administrator is locked out or needs escalation:
1. Open `scripts/add_admin_grant.js`.
2. Update the target `email`.
3. Run: `node c:\Users\My-PC\Desktop\scripts\add_admin_grant.js`.
4. User logs in -> Role system auto-detects grant -> Account upgraded to Admin.

---

## 📋 Mission Logs & Audits
- **Admin Command Center**: [ADMIN_COMMAND_CENTER.md](./ADMIN_COMMAND_CENTER.md)
- **Infrastructure Status**: [API_INFRASTRUCTURE_READINESS_REPORT.md](./API_INFRASTRUCTURE_READINESS_REPORT.md)
- **Archival Plan**: Legacy folders (e.g., `studio-5724711541`) are staged for deletion once production stability is confirmed.

---
© 2026 BIN GROUP UAE. Sovereign Property Operations OS.
