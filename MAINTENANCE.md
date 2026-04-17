# BIN-GROUP Sovereign Dashboard | Maintenance & Provisioning

## 1. Role-Based Access Control (RBAC)

User permissions are managed via the `users` collection in Firestore.

### Provisioning Admins

To elevate a user to **Admin (God-Mode)**:

1. Locate the user's `uid` in the Firebase Authentication console.
2. Go to Firestore -> `users` collection.
3. Create/Edit a document with the ID as the `uid`.
4. Add/Update the `role` field to `admin`.

### Provisioning Technical Staff

Technicians must be registered in the `technicians` collection:

1. Ensure the user has a record in `users` with `role: 'technician'`.
2. Create a document in `technicians` collection with the same `uid`.
3. Fields required:
   - `name`: string
   - `trade`: 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'FIRE'
   - `status`: 'AVAILABLE' | 'ON_DUTY'
   - `rating`: number (1-5)

### Provisioning Brokers

1. Set `role: 'broker'` in the `users` collection doc.
2. (Optional) Link to agency in `brokers` collection.

## 2. Security Protocols

- **App Check**: Enforcement is active for the `createPaymentIntent` function. Ensure the `RecaptchaV3Provider` key in `firebase.ts` matches the production key from the Cloud Console.
- **Webhook Source**: The `paymentWebhook` requires a `secretKey: 'BIN_SOVEREIGN_SECRET_2026'` in the request body. Verify this matches the payment provider configuration.

## 3. Google Maps API

The project uses the `Maps JavaScript API` and `Places API (New)`.

- **Usage**: Captured in `PropertyIntakeStep.tsx` for address autocomplete.
- **Quota**: Monitor usage in Google Cloud Console -> APIs & Services.

## 4. Emergency Bypasses (QA Only)

- **ALL BYPASSES REMOVED**.
- To simulate a payment for testing, manually update a contract document in Firestore:
  - `paymentVerified`: true
  - `status`: 'AWAITING_ACTIVATION'
