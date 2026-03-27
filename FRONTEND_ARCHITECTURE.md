# BIN Group: Frontend App Architecture (Mobile Skeletons)

All mobile applications are built using **React Native (Expo)** to ensure 95% code sharing between iOS and Android.

---

## 📁 1. Master Folder Structure

```text
/src
  /api             - Axios helpers for backend communication
  /components      - Shared UI (Buttons, Cards, RTL-Mirrored Text)
  /hooks           - Custom hooks (useAuth, useLocation, useLanguage)
  /navigation      - Tab & Stack navigators (Role-Based)
  /screens         - Specific UI Pages (Dashboard, List, Profile)
  /store           - State management (Zustand or Redux)
  /theme           - Design tokens (Colors, Typography, LQA Ratios)
```

---

## 🗺️ 2. Core Navigation Map (Role-Based)

### **Tenant Portal**

* `DashboardStack`: Map / Issue Reporting / SOS Button.
* `FinanceStack`: Rent Status / Receipt History / Direct Debit.
* `ProfileStack`: Lease Doc / Ejari PDF / Support Chat.

### **Owner Portal**

* `PortfolioStack`: ROI Dashboard / Property Unit Grid / Heatmap.
* `ApprovalStack`: Pending Quotes / Turnover Approval Logic.
* `FinancialStack`: Monthly Waterfall Statements / Tax Receipts.

### **Technician App**

* `CheckInStack`: Morning Gate (Van check) -> QR Job Unlocking.
* `TaskStack`: Active Routes -> Job Details -> Proof of Work.
* `InventoryStack`: Van Stock Request -> Parts Scanner.

---

## 📡 3. Base API Service Helper (`apiClient.js`)

```javascript
import axios from 'axios';

const API_BASE_URL = 'https://api.homeos.ae'; // Production Backend

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Middleware to inject Authorization Token & Language Header
apiClient.interceptors.request.use(async (config) => {
  const token = await getToken(); // Firebase Auth
  const lang = await getLanguage(); // 'en' or 'ar'
  config.headers.Authorization = `Bearer ${token}`;
  config.headers['Accept-Language'] = lang;
  return config;
});
```
