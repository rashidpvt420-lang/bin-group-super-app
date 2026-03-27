# BIN Group: Localization (L10n) & RTL Strategy

To reach the #1 position in the UAE market, the app must provide a "Cultural-First" experience, not just a translated one.

---

## 🏗️ 1. Technical Implementation
*   **Framework**: Use `i18next` for Web/React and `intl` for Flutter/React Native.
*   **Layout Engine**: All UI containers must use Flexbox/Grid with `flex-direction: row-reverse` or `dir="rtl"` when the language is set to `ar`.
*   **Fonts**: 
    *   **English**: Inter, Roboto, or Outfit.
    *   **Arabic**: Dubai Font, IBM Plex Sans Arabic, or Almarai.

---

## 🌍 2. Trans-creation vs. Translation
We do not use direct machine translations for the following high-impact terms:

| English | Standard Translation | BIN Group Preferred (UAE Context) |
| :--- | :--- | :--- |
| **Lease Agreement** | اتفاقية إيجار | **عقد إيجار (Ejari)** |
| **Service Charge** | رسوم الخدمة | **رسوم الخدمات المشتركة** |
| **Technician** | تقني | **فني متخصص** |
| **Maintenance** | صيانة | **صيانة وقائية وجمالية** |

---

## 📊 3. Master Translation Source (Schema)
The master translation file `i18n_translation_master.json` is organized by functional domain:

```json
{
  "en": {
    "dashboard": {
      "roi_title": "Portfolio Net Yield",
      "active_tickets": "Ongoing Jobs"
    },
    "finance": {
      "payout_btn": "Request Payout"
    }
  },
  "ar": {
    "dashboard": {
      "roi_title": "صافي عائد المحفظة",
      "active_tickets": "المهام الجاري تنفيذها"
    },
    "finance": {
      "payout_btn": "طلب تحويل الدفعة"
    }
  }
}
```

---

## ✅ 4. RTL Quality Check (LQA)
- [ ] **Mirroring**: Does the icon for "Back" reverse direction in Arabic? (Yes).
- [ ] **Numerical Formatting**: Use Western Arabic numerals (1, 2, 3) + "AED" or "د.إ" consistently.
- [ ] **Text Truncation**: Ensure Arabic text (which is often 20% longer) does not bleed out of UI buttons.
