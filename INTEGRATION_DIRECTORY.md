# BIN Group: Third-Party Integration Directory

This is the comprehensive "Provisioning List" for the DevOps team to set up all external services required for the Super App ecosystem.

---

## 🏦 1. Financial & Payment Logic

| Service | Provider | Purpose |
| :--- | :--- | :--- |
| **Payments** | Stripe / PayTabs | Rent collection, Vendor payouts, Escrow holds. |
| **Identity** | UAE PASS API | EID verification, Legal digital signatures. |
| **VAT Reporting** | FTA API (Digital) | Real-time VAT log synchronization. |

---

## 💬 2. Messaging & Auth

| Service | Provider | Purpose |
| :--- | :--- | :--- |
| **Auth** | Firebase Auth | Phone/OTP login for all users. |
| **WhatsApp** | Twilio / MessageBird | Automated notification templates & PDF work orders. |
| **SMS** | Twilio / Etisalat | Critical SOS alerts and fallback OTPs. |

---

## 🗺️ 3. Infrastructure & Intelligence

| Service | Provider | Purpose |
| :--- | :--- | :--- |
| **Maps/GIS** | Google Maps API | Technician routing, Property geo-fencing, Makani lookup. |
| **AI (Brain)** | Google Vertex AI/Gemini | Image analysis (Photo Gates), Chatbot (Ameen), Document OCR. |
| **Hosting** | Google Cloud (GCP) | Data residency in UAE regions, GKE, Firestore. |
| **Monitoring** | DataDog / Sentry | Error tracking and infrastructure health. |

---

## 🛠️ 4. Integration Secrets Management

* **Safety**: All keys must be stored in **GCP Secret Manager**.
* **Branching**: Use separate API Key sets for `Development`, `Staging`, and `Production`.
