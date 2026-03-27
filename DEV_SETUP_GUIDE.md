# BIN Group: Developer Environment Setup Guide

This guide enables a new developer to set up the full BIN Group development environment and start contributing in < 30 minutes.

---

## 🛠️ 1. Prerequisites
*   **Node.js**: v18.x or v20.x (LTS).
*   **Firebase CLI**: `npm install -g firebase-tools`.
*   **Git**: Access to the [private repository].
*   **Docker**: For running local Postgres/Redis emulators (Optional).

---

## 🚀 2. Local Setup
1.  **Clone the Repo**: `git clone ... && cd bin-app`
2.  **Install Dependencies**:
    ```bash
    cd backend && npm install
    cd ../admin-panel && npm install
    cd ../tenant-app && npm install # Repeat for Owner/Tech apps
    ```
3.  **Environment Variables**: Create `.env` files based on `.env.example`.
    *   `FIREBASE_SERVICE_ACCOUNT_JSON`
    *   `STRIPE_SECRET_KEY`
    *   `GEMINI_API_KEY`

4.  **Launch Firebase Emulator**:
    ```bash
    firebase emulators:start
    ```
    *   This spawns a local UI at `localhost:4000` with local Firestore, Auth, and Functions.

---

## 🏗️ 3. Branching Strategy
*   `main`: Production-only (Protected).
*   `staging`: Pre-release testing on UAE GCP servers.
*   `feature/XXX`: Individual developer tasks (Merged via PR into staging).

---

## ✅ 4. Pre-Commit Checklist
Before pushing code, developers MUST run:
1.  `npm run lint` — Consistent code style.
2.  `npm test` — Ensure 0 regression in [Test Scenarios](./TEST_SCENARIOS.md).
3.  `npm run build` — Verify zero production build errors.

---

## 📞 5. Tech Support
For blocked environments, ping the #dev-ops channel on Slack/Teams or contact the CTO directly.
