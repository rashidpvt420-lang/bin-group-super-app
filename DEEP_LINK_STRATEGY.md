# BIN Group: Deep-Link & Universal Link Strategy

To ensure a "No-Call" experience, users must be able to jump from an external notification (WhatsApp, SMS, Email) directly into the relevant screen inside the app.

---

## 🏗️ 1. URL Schema (Custom Protocol)

The app responds to the `bin://` protocol for internal routing.

| Path | Example | Mobile Action |
| :--- | :--- | :--- |
| `/ticket/:id` | `bin://ticket/TKT-102` | Opens Job Details Screen. |
| `/invoice/:id` | `bin://invoice/INV-909` | Opens Payment Gateway Screen. |
| `/approve/:id` | `bin://approve/QT-55` | Opens Owner Quote Approval view. |
| `/renew/:id` | `bin://renew/LEASE-12` | Opens Ejari Renewal Interface. |

---

## 🌐 2. Universal Links (HTTPS Mirror)

For users who don't have the app installed, `https://homeos.ae/app/...` links will:

1. **If App Installed**: Open the app to the specific screen.
2. **If App NOT Installed**: Redirect to the **App Store / Play Store** download page.

---

## 💬 3. Notification Integration (The "One-Tap" Workflow)

Example of a WhatsApp template payload:
*"Your maintenance quote is ready. Tap here to approve: [https://homeos.ae/app/approve/QT-55]"*

### Technical Implementation

* **iOS**: Configure `Associated Domains` in the Apple Developer Portal.
* **Android**: Add `intent-filter` with `autoVerify="true"` to the `AndroidManifest.xml`.

---

## 📊 4. Attribution & Analytics

Every deep link is appended with UTM-style params to track the source of the traffic:

* `utm_source`: [whatsapp, sms, email, push]
* `utm_medium`: [automated_trigger]
* `utm_campaign`: [rent_collection_v1, ticket_update]
