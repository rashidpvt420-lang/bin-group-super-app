---
*** Begin Patch
*** Update File: functions/ownerRegistrationRequest.ts
@@
-export const submitOwnerOnboardingPaymentPackage = onCall({ cors: true }, async (request) => {
-  const data = request.data || {};
-  const ownerUid = cleanText(data.ownerUid, "ownerUid", 120);
-  const ownerEmail = cleanEmail(data.ownerEmail);
-  const intakeId = cleanText(data.intakeId, "intakeId", 120);
-  const onboardingSessionId = cleanText(data.onboardingSessionId, "onboardingSessionId", 120);
-  const paymentMethod = cleanText(data.paymentMethod, "paymentMethod", 60);
-  const amount = Number(data.amount);
-  const companyProfile = cleanPlainValue(data.companyProfile || {});
-  const serviceDetails = cleanPlainValue(data.serviceDetails || {});
-  const documentUrls = cleanPlainValue(data.documentUrls || {});
-
-  if (!Number.isFinite(amount) || amount < 0) {
-    throw new HttpsError("invalid-argument", "Valid payment amount is required.");
-  }
-
-  const timestamp = serverTimestamp();
-  const batch = db.batch();
-
-  // 1. payment_transactions
-  const paymentRef = db.collection("payment_transactions").doc(intakeId);
-  batch.set(paymentRef, {
-    ownerUid,
-    ownerId: ownerUid,
-    ownerEmail,
-    intakeId,
-    onboardingSessionId,
-    paymentMethod,
-    amount,
-    currency: "AED",
-    status: "PENDING",
-    verificationState: "ADMIN_VERIFICATION_REQUIRED",
-    companyProfile,
-    serviceDetails,
-    documentUrls,
-    submittedAt: timestamp,
-    createdAt: timestamp,
-    updatedAt: timestamp
-  }, { merge: true });
-
-  // 2. intake_submissions
-  const intakeRef = db.collection("intake_submissions").doc(intakeId);
-  batch.set(intakeRef, {
-    paymentSubmitted: true,
-    paymentSubmittedAt: timestamp,
-    paymentMethod,
-    status: "payment_pending_approval",
-    ownerUid,
-    ownerId: ownerUid,
-    proofDocuments: documentUrls,
-    updatedAt: timestamp
-  }, { merge: true });
-
-  // 3. audit_logs
-  const auditRef = db.collection("audit_logs").doc();
-  batch.set(auditRef, {
-    action: "ONBOARDING_PAYMENT_SUBMITTED",
-    ownerUid,
-    ownerId: ownerUid,
-    ownerEmail,
-    intakeId,
-    sessionId: onboardingSessionId,
-    paymentMethod,
-    timestamp,
-    createdAt: timestamp,
-    documentCount: Object.keys(documentUrls).length
-  });
-
-  await batch.commit();
-
-  return { success: true };
-});
+export const submitOwnerOnboardingPaymentPackage = onCall({ cors: true }, async (request) => {
+  // Server-side validation & auth enforcement
+  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required to submit payment package.");
+  const callerUid = request.auth.uid;
+  const isAdmin = !!request.auth.token?.admin;
+
+  const data = request.data || {};
+  const ownerUid = cleanText(data.ownerUid, "ownerUid", 120);
+  const ownerEmail = cleanEmail(data.ownerEmail);
+  const intakeId = cleanText(data.intakeId, "intakeId", 120);
+  const onboardingSessionId = cleanText(data.onboardingSessionId, "onboardingSessionId", 120);
+  const paymentMethod = cleanText(data.paymentMethod, "paymentMethod", 60);
+  const amount = Number(data.amount);
+  const idempotencyKey = String(data.idempotencyKey || intakeId || "").trim();
+  const companyProfile = cleanPlainValue(data.companyProfile || {});
+  const serviceDetails = cleanPlainValue(data.serviceDetails || {});
+  const documentUrls = cleanPlainValue(data.documentUrls || {});
+
+  // Authorization: only the owner themselves or an admin may submit
+  if (!isAdmin && callerUid !== ownerUid) {
+    throw new HttpsError("permission-denied", "Caller is not authorized to submit this payment package.");
+  }
+
+  if (!Number.isFinite(amount) || amount < 0) {
+    throw new HttpsError("invalid-argument", "Valid payment amount is required.");
+  }
+
+  // Idempotency: if idempotencyKey provided, ensure we don't re-write duplicates
+  if (idempotencyKey) {
+    const existing = await db.collection("payment_transactions_idempotency").doc(idempotencyKey).get();
+    if (existing.exists) {
+      // return previous result summary, avoid double processing
+      const prev = existing.data() || {};
+      return { success: true, idempotent: true, existingResult: prev };
+    }
+  }
+
+  const timestamp = serverTimestamp();
+  const batch = db.batch();
+
+  // 1. payment_transactions
+  const paymentRef = db.collection("payment_transactions").doc(intakeId);
+  batch.set(paymentRef, {
+    ownerUid,
+    ownerId: ownerUid,
+    ownerEmail,
+    intakeId,
+    onboardingSessionId,
+    paymentMethod,
+    amount,
+    currency: "AED",
+    status: "PENDING",
+    verificationState: "ADMIN_VERIFICATION_REQUIRED",
+    companyProfile,
+    serviceDetails,
+    documentUrls,
+    submittedAt: timestamp,
+    createdAt: timestamp,
+    updatedAt: timestamp
+  }, { merge: true });
+
+  // 2. intake_submissions
+  const intakeRef = db.collection("intake_submissions").doc(intakeId);
+  batch.set(intakeRef, {
+    paymentSubmitted: true,
+    paymentSubmittedAt: timestamp,
+    paymentMethod,
+    status: "payment_pending_approval",
+    ownerUid,
+    ownerId: ownerUid,
+    proofDocuments: documentUrls,
+    updatedAt: timestamp
+  }, { merge: true });
+
+  // 3. audit_logs
+  const auditRef = db.collection("audit_logs").doc();
+  batch.set(auditRef, {
+    action: "ONBOARDING_PAYMENT_SUBMITTED",
+    ownerUid,
+    ownerId: ownerUid,
+    ownerEmail,
+    intakeId,
+    sessionId: onboardingSessionId,
+    paymentMethod,
+    timestamp,
+    createdAt: timestamp,
+    documentCount: Object.keys(documentUrls).length,
+    callerUid,
+    idempotencyKey: idempotencyKey || null
+  });
+
+  // persist idempotency marker if provided
+  if (idempotencyKey) {
+    const idempRef = db.collection("payment_transactions_idempotency").doc(idempotencyKey);
+    batch.set(idempRef, {
+      intakeId,
+      ownerUid,
+      createdAt: timestamp,
+      createdBy: callerUid
+    }, { merge: true });
+  }
+
+  await batch.commit();
+
+  return { success: true };
+});
*** End Patch
