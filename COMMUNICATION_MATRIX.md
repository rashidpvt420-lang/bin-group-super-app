# BIN Group: Communication & Notification Matrix (EN/AR 🇦🇪)

This matrix defines the bilingual messaging strategy for all automated touchpoints in the BIN Group Super App.

---

## 🏗️ 1. Messaging Channels

* **WhatsApp**: Primary for urgent updates and document sharing.
* **Push Notifications**: Daily operational updates and ETAs.
* **SMS**: Critical alerts (SOS, Payment Failure) and OTPs.
* **Email**: Full invoices, lease contracts, and monthly reports.

---

## 💬 2. Notification Templates

| Event | English Template | Arabic Template (RTL) |
| :--- | :--- | :--- |
| **Rent Reminder** | "Dear [Name], your rent for [Property] is due in 5 days. Click here to pay: [Link]" | "[اسم] العزيز، إيجارك لـ [العقار] مستحق خلال 5 أيام. اضغط هنا للدفع: [رابط]" |
| **Cheque Deposited** | "Update: Your cheque [Number] for AED [Amount] has been deposited." | "تحديث: تم إيداع الشيك رقم [الرقم] بمبلغ [المبلغ] درهم." |
| **Tech Near By** | "Help is coming! [TechName] is 5 mins away from your location." | "المساعدة قادمة! [اسم الفني] على بعد 5 دقائق من موقعك." |
| **SOS Redirect** | "CRITICAL: Potential Emergency detected. Redirecting you to UAE 999 now." | "حالة حرجة: تم اكتشاف حالة طوارئ محتملة. جاري تحويلك إلى 999 الآن." |
| **Lease Renewal** | "Great news! Your lease is eligible for renewal. View the new RERA-aligned terms here." | "أخبار رائعة! عقد إيجارك مؤهل للتجديد. اطلع على الشروط الجديدة المتوافقة مع ريرا هنا." |

---

## 🛠️ 3. Logic & Trigger Rules

* **Late Fee Trigger**: If rent is unpaid 48h post-due date, send SMS alert + WhatsApp Warning.
* **Job Completion**: WhatsApp a PDF of the "No-Photo, No-Pay" completion report immediately upon tech sign-off.
* **Quiet Hours**: Only critical SOS/Security alerts are sent between 11:00 PM and 07:00 AM (UAE Time).

---

## 📊 4. Delivery Status Tracking

Every notification must be logged in the `/notifications` collection with:

* `delivery_status`: [sent, delivered, read, failed]
* `provider_ref`: [Twilio ID, Firebase Message ID]
* `timestamp`: Exact UAE time of interaction.
