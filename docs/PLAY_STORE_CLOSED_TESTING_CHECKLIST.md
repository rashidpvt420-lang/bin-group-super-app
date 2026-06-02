# BIN GROUP Play Store Closed Testing Checklist

Status: preparation document for Android closed testing and production readiness.

## 1. Android build readiness

- Confirm `android/` project exists and opens in Android Studio.
- Confirm app package name matches final BIN GROUP brand.
- Confirm app icon, splash screen, and app label are final.
- Confirm `targetSdkVersion` follows current Google Play target API requirements.
- Confirm release build uses app signing and not debug signing.
- Confirm Firebase config for Android is production project `bin-group-57c60`.

## 2. Privacy and Data Safety

The app collects or processes sensitive data:

- User identity and contact details.
- Property and tenant records.
- Technician job/location data.
- HR profile data, salary package, staff agreement status.
- Documents, evidence photos, design reference images.
- Push notification tokens.

Before Play Store production:

- Publish privacy policy URL.
- Publish terms URL.
- Add account deletion instructions.
- Complete Google Play Data Safety form.
- Explain location use for live technician dispatch and job tracking.
- Explain notification use for job, HR, ticket, payment, and design alerts.

## 3. Closed testing plan

Recommended test group:

- 2 Admin users.
- 3 Owner users.
- 3 Tenant users.
- 3 Technician users.
- 1 Broker user.

Minimum test duration: 14 days continuous closed testing before production promotion.

## 4. Device coverage

Test at least:

- Samsung mid-range Android.
- Samsung flagship Android.
- Xiaomi/Redmi Android.
- Oppo/Vivo Android.
- Google Pixel or clean Android device.
- Tablet or foldable if target customers may use tablets.

## 5. Critical test cases

### Admin

- Login.
- Register staff.
- Salary package auto split.
- Staff agreement creation.
- Live Map technician assignment.
- Gate Pass PDF generation.
- Tickets management.
- Notifications inbox.

### Owner

- Login.
- Dashboard.
- Properties.
- Contracts.
- Financials.
- Documents.
- AI Design Studio.
- Ticket view.

### Tenant

- Login.
- Unit page.
- Submit maintenance request with photo.
- Emergency request.
- Ticket detail.
- AI Design Studio owner approval flow.
- Documents.

### Technician

- Login.
- Jobs list.
- Job detail.
- On The Way.
- GPS permission.
- Live tracking state.
- Upload before/after proof.
- HR Self-Service.
- Accept staff agreement.
- People AI request.
- Weekly happiness check.

### Broker

- Login.
- Leads.
- Referrals.
- Commissions.
- Documents.
- Profile.

## 6. Launch blockers

Do not launch to full public until these are green:

- No failed Android release build.
- No failed Firebase rules deploy.
- No critical route crashes.
- GPS permission and tracking tested on real Android device.
- Push notification tested on real Android device.
- PDF generation tested on real Android device.
- Arabic RTL tested on all main screens.
- Account deletion/privacy links working.

## 7. Current launch recommendation

- Web controlled pilot: allowed.
- Android closed testing: prepare and start after APK/AAB verification.
- Full Play Store public launch: after closed testing and device QA.
