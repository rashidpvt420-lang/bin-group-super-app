# WhatsApp phase 1 — templates to submit in Meta Business Manager

WhatsApp job and rent alerts are **not sending** until every step below is done. The app stays the official record. This file has no secret values.

## What Rashid needs to do

1. In Meta Business Manager, open the WhatsApp Business Account used for BIN GROUP and submit the six templates below, in **English (`en_US`)** and **Arabic (`ar`)**.
2. Wait until Meta marks each template **Approved**.
3. After this PR is merged and deployed, open Admin → **WhatsApp templates** (Admin or CEO, MFA required) and, for each event, enter the exact Meta template name, set the language codes (`ar` / `en_US`, unless Meta assigned a different code), and switch **Marked approved after Meta approval**.
4. Confirm the four Cloud Functions secrets exist on the production Firebase project (values stay in Secret Manager; do not paste them into chat, issues, or this repo):
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_APP_SECRET`
5. After templates are approved and registered, send one real test to an opted-in phone you control before telling owners or tenants that WhatsApp alerts are available. Until the five job templates are marked approved in Admin, the in-app toggle stays **Coming soon**.

Category: Utility (recommended). Variables must stay as shown so a send cannot inject a pay link or an ETA.

## TICKET_SUBMITTED

- Suggested name: `bin_ticket_submitted`
- Placeholders: `{{1}}` ticket reference (example `AB12CD34`); `{{2}}` category (example `AC`)
- English (`en_US`): BIN GROUP: we received your request {{1}} ({{2}}). The app is the official record. Open the BIN GROUP app to follow progress.
- Arabic (`ar`): مجموعة بن: استلمنا طلبك {{1}} ({{2}}). التطبيق هو السجل الرسمي. افتح تطبيق مجموعة بن لمتابعة التقدم.

## TECH_ASSIGNED

- Suggested name: `bin_tech_assigned`
- Placeholders: `{{1}}` ticket reference; `{{2}}` category
- English (`en_US`): BIN GROUP: a technician has been assigned to request {{1}} ({{2}}). You will get an update when they set off. Open the app for the official status.
- Arabic (`ar`): مجموعة بن: تم تعيين فني للطلب {{1}} ({{2}}). سيصلك تحديث عند انطلاقه. افتح التطبيق للاطلاع على الحالة الرسمية.

## TECH_ARRIVED

- Suggested name: `bin_tech_arrived`
- Placeholders: `{{1}}` ticket reference; `{{2}}` category
- English (`en_US`): BIN GROUP: the technician has arrived for request {{1}} ({{2}}). Open the app for the official status.
- Arabic (`ar`): مجموعة بن: وصل الفني لطلب {{1}} ({{2}}). افتح التطبيق للاطلاع على الحالة الرسمية.

## JOB_COMPLETED

- Suggested name: `bin_job_completed`
- Placeholders: `{{1}}` ticket reference; `{{2}}` category
- English (`en_US`): BIN GROUP: request {{1}} ({{2}}) is marked completed. Review the work in the app. Nothing is approved until you decide in the app.
- Arabic (`ar`): مجموعة بن: تم تعليم الطلب {{1}} ({{2}}) كمكتمل. راجع العمل في التطبيق. لا يُعتمد شيء حتى تقرر في التطبيق.

## OWNER_APPROVAL_NEEDED

- Suggested name: `bin_owner_approval_needed`
- Placeholders: `{{1}}` request reference; `{{2}}` category
- English (`en_US`): BIN GROUP: request {{1}} ({{2}}) needs your decision. Open the app to review. Nothing is approved until you decide.
- Arabic (`ar`): مجموعة بن: الطلب {{1}} ({{2}}) يحتاج إلى قرارك. افتح التطبيق للمراجعة. لا يُعتمد شيء حتى تقرر.

## RENT_DUE_REMINDER

- Suggested name: `bin_rent_due_reminder`
- Placeholders: `{{1}}` amount (example `AED 5,000.00`); `{{2}}` due date (example `2026-12-01`)
- English (`en_US`): BIN GROUP: rent of {{1}} is due on {{2}}. Pay by cash or cheque only and upload the receipt in the app. The app is the official record. Do not send payments or card details over WhatsApp.
- Arabic (`ar`): مجموعة بن: إيجار بمبلغ {{1}} مستحق بتاريخ {{2}}. ادفع نقدًا أو بشيك فقط وارفع الإيصال في التطبيق. التطبيق هو السجل الرسمي. لا ترسل مدفوعات أو بيانات بطاقة عبر واتساب.

Payment policy in this template is fixed text: AED Cash or Cheque only. Do not add a button, pay link, card, Stripe, or bank-transfer line.
