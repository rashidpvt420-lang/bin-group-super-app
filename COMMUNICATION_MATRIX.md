# BIN Group: Communication & Notification Matrix (EN/AR)

This matrix records how BIN GROUP actually notifies people today. The app is the official record. WhatsApp is an optional extra channel and is not sending automatic job or rent messages until Meta-approved templates are registered in Admin.

---

## 1. Messaging channels

* **App notifications + push**: official operational updates (tickets, approvals, rent, lease, spend). Push is delivered when the notification document has a `recipientId` (or `userId` fallback) and a registered device token.
* **Email**: rent reminders and receipts, lease renewal offers and responses, invoices and documents.
* **WhatsApp**: not sending automatic updates yet. After Admin/CEO (MFA) registers Meta-approved templates, opted-in owners and tenants may receive the phase-1 event set below. Inbound messages to the company number go to an Admin triage queue; nothing is dispatched automatically.
* **SMS**: existing OTP and already-shipped critical alerts only. This phase does not add or widen Twilio SMS.

---

## 2. Phase-1 WhatsApp templates (submit to Meta first)

Suggested bodies and placeholder parameters are in `docs/WHATSAPP_PHASE1_TEMPLATES.md`. Until those templates are approved in Meta Business Manager and marked approved in Admin, the Owner/Tenant toggle says WhatsApp updates are coming soon. Users may pre-opt-in and switch off at any time.

| Event | English intent | Arabic intent |
| :--- | :--- | :--- |
| **TICKET_SUBMITTED** | Request received; open the app to follow progress. | تم استلام الطلب؛ افتح التطبيق للمتابعة. |
| **TECH_ASSIGNED** | A technician has been assigned; you will get an update when they set off. No ETA. | تم تعيين فني؛ سيصلك تحديث عند انطلاقه. بدون وقت وصول مقدّر. |
| **TECH_ARRIVED** | The technician has arrived. No time estimate. | وصل الفني. بدون تقدير للوقت. |
| **JOB_COMPLETED** | The request is marked completed; review and decide in the app. | تم تعليم الطلب كمكتمل؛ راجع وقرر في التطبيق. |
| **OWNER_APPROVAL_NEEDED** | Open the app to review; nothing is approved until you decide. | افتح التطبيق للمراجعة؛ لا يُعتمد شيء حتى تقرر. |
| **RENT_DUE_REMINDER** | Amount and due date; pay by cash or cheque only and upload the receipt in the app. No pay link, card, or bank transfer. | المبلغ وتاريخ الاستحقاق؛ ادفع نقدًا أو بشيك فقط وارفع الإيصال في التطبيق. لا رابط دفع ولا بطاقة ولا تحويل بنكي. |

---

## 3. Logic and trigger rules

* **Opt-in**: WhatsApp is off by default. The phone number comes from the user's profile. Pre-opt-in is allowed while templates are still unapproved.
* **Quiet hours**: 22:00–07:00 Asia/Dubai. Only emergency tickets may send WhatsApp in that window. Rent reminders already run at 09:00 Dubai.
* **Rate limits**: outbound 8 messages per user per Dubai day; inbound 20 per WhatsApp id per day (6 per hour).
* **Fallback**: if WhatsApp is skipped or fails, push still sends for rent, lease and spend notifications (recipientId), and email still sends for rent and lease documents.
* **No fake ETAs, minute promises, or payment links** on any automated channel.

---

## 4. Delivery status tracking

WhatsApp outcomes are logged in `whatsapp_notifications` and `audit_logs` with a result code (SENT, FAILED, SKIPPED_*). Provider message IDs may be stored; provider error bodies and secret values are never logged. In-app notifications use the `/notifications` collection, and push delivery records the provider message id and delivery state.
