import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

type StripeCtor = typeof import("stripe").default;

async function loadStripe(): Promise<StripeCtor> {
  const mod = await import("stripe");
  return ((mod as any).default || mod) as StripeCtor;
}

function cleanText(value: unknown, label: string, maxLength: number) {
  const output = String(value || "").trim();
  if (!output) throw new HttpsError("invalid-argument", `${label} is required.`);
  if (output.length > maxLength) throw new HttpsError("invalid-argument", `${label} is too long.`);
  return output;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, "Email", 160).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError("invalid-argument", "Valid email is required.");
  return email;
}

function onboardingPaymentId(intakeId: string) {
  // One canonical ID across package submission, Stripe verification, admin
  // approval, contract activation, reporting, and audit evidence.
  return intakeId;
}

function assertAuthenticatedPayer(request: any, ownerUid: string) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Login is required before checkout.");
  if (request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active payer account is required.");
  }
  if (String(request.auth.uid) !== ownerUid) {
    throw new HttpsError("permission-denied", "Checkout payer does not match the authenticated account.");
  }
}

function ownerIdOf(data: Record<string, any>) {
  return String(data.ownerUid || data.ownerId || data.userId || data.createdBy || "").trim();
}

function serverAmount(data: Record<string, any>, fields: string[]) {
  for (const field of fields) {
    const value = Number(data[field]);
    if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
  }
  return 0;
}

function sameMoney(left: number, right: number) {
  return Math.abs(left - right) < 0.01;
}

function safeId(value: unknown) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 220);
}

export const createStripeCheckoutSession = onCall({
  cors: true,
  enforceAppCheck: true,
  secrets: [stripeSecretKey],
}, async (request) => {
  const data = request.data || {};
  const ownerUid = cleanText(data.ownerUid, "ownerUid", 120);
  const ownerEmail = cleanEmail(data.ownerEmail);
  const intakeId = String(data.intakeId || "").trim();
  const onboardingSessionId = String(data.onboardingSessionId || "").trim();
  const ticketId = String(data.ticketId || "").trim();
  const designRequestId = String(data.designRequestId || "").trim();
  const requestedAmount = Number(data.amount);

  assertAuthenticatedPayer(request, ownerUid);
  const tokenEmail = String(request.auth?.token?.email || "").trim().toLowerCase();
  if (tokenEmail && tokenEmail !== ownerEmail) {
    throw new HttpsError("permission-denied", "Checkout email does not match the authenticated account.");
  }

  const targetCount = [intakeId, ticketId, designRequestId].filter(Boolean).length;
  if (targetCount !== 1) {
    throw new HttpsError("invalid-argument", "Payment must reference exactly one intake, ticket, or design request.");
  }

  let chargeAmount = 0;
  let productName = "BIN GROUP Payment";
  let productDescription = "BIN GROUP payment";
  let targetRef: FirebaseFirestore.DocumentReference | null = null;
  let targetRecord: FirebaseFirestore.DocumentData = {};
  let targetKind = "";
  let targetId = "";

  if (intakeId) {
    const paymentId = onboardingPaymentId(intakeId);
    targetRef = db.collection("payment_transactions").doc(paymentId);
    const [paymentSnap, contractSnap] = await Promise.all([
      targetRef.get(),
      db.collection("contracts").doc(intakeId).get(),
    ]);
    if (!paymentSnap.exists || !contractSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Owner onboarding package is not persisted yet. Submit the signed contract, documents, and payment package before starting checkout."
      );
    }
    const payment = paymentSnap.data() || {};
    const contract = contractSnap.data() || {};
    targetRecord = payment;
    targetKind = "intake";
    targetId = intakeId;
    const persistedOwnerUid = ownerIdOf(payment) || ownerIdOf(contract);
    if (persistedOwnerUid !== ownerUid) {
      throw new HttpsError("permission-denied", "Persisted onboarding package belongs to another owner.");
    }
    chargeAmount = serverAmount(payment, ["amount", "activationDeposit", "amountDue", "total"]);
    productName = "BIN GROUP Property Onboarding Contract Payment";
    productDescription = `Intake ID: ${intakeId}`;
  }

  if (ticketId) {
    targetRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketSnap = await targetRef.get();
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Maintenance ticket not found.");
    const ticket = ticketSnap.data() || {};
    targetRecord = ticket;
    targetKind = "ticket";
    targetId = ticketId;
    if (ownerIdOf(ticket) !== ownerUid) {
      throw new HttpsError("permission-denied", "Maintenance ticket belongs to another owner.");
    }
    chargeAmount = serverAmount(ticket, ["paymentAmount", "amountDue", "invoiceAmount", "finalCost", "approvedCost", "totalAmount"]);
    productName = "BIN GROUP Maintenance Service Payment";
    productDescription = `Ticket ID: ${ticketId}`;
  }

  if (designRequestId) {
    const designRef = db.collection("design_requests").doc(designRequestId);
    const paymentRef = db.collection("payment_transactions").doc(`design_${designRequestId}`);
    const [designSnap, paymentSnap] = await Promise.all([designRef.get(), paymentRef.get()]);
    if (!designSnap.exists || !paymentSnap.exists) {
      throw new HttpsError("failed-precondition", "Create the server-authoritative design payment request before checkout.");
    }
    const design = designSnap.data() || {};
    const payment = paymentSnap.data() || {};
    targetRef = paymentRef;
    targetRecord = payment;
    targetKind = "design";
    targetId = designRequestId;
    const payerUid = String(payment.payerId || design.payerId || ownerIdOf(design)).trim();
    if (payerUid !== ownerUid || String(payment.designRequestId || "") !== designRequestId) {
      throw new HttpsError("permission-denied", "Design payment request belongs to another payer.");
    }
    chargeAmount = serverAmount(payment, ["amount", "amountDue", "paymentAmount"]);
    productName = "BIN GROUP AI Design Studio Payment";
    productDescription = `Design deposit: ${designRequestId}`;
  }

  if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    throw new HttpsError("failed-precondition", "The server-authoritative payment amount is missing or invalid.");
  }
  if (Number.isFinite(requestedAmount) && requestedAmount > 0 && !sameMoney(requestedAmount, chargeAmount)) {
    throw new HttpsError("failed-precondition", "Payment amount changed. Refresh the quote or invoice before checkout.");
  }

  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Online card payment is not configured. Use bank transfer/manual verification until the payment provider is activated."
    );
  }

  const Stripe = await loadStripe();
  const stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" as any });
  const returnParams = `session_id={CHECKOUT_SESSION_ID}&ownerUid=${encodeURIComponent(ownerUid)}${intakeId ? `&intakeId=${encodeURIComponent(intakeId)}` : ''}${ticketId ? `&ticketId=${encodeURIComponent(ticketId)}` : ''}${designRequestId ? `&designRequestId=${encodeURIComponent(designRequestId)}` : ''}`;
  const persistedState = String(
    targetRecord.paymentStatus ||
    targetRecord.status ||
    targetRecord.verificationState ||
    "",
  ).trim().toUpperCase();
  if (["PAID", "APPROVED", "PENDING_ADMIN_APPROVAL"].includes(persistedState) || targetRecord.paymentVerified === true) {
    throw new HttpsError("failed-precondition", "This payment is already paid or awaiting final admin approval.");
  }
  const existingSessionId = String(targetRecord.stripeSessionId || "").trim();
  let checkoutAttempt = Number(targetRecord.checkoutAttempt || 0);
  if (existingSessionId) {
    const existingSession = await stripeInstance.checkout.sessions.retrieve(existingSessionId);
    if (existingSession.status === "open" && existingSession.url) {
      return { id: existingSession.id, url: existingSession.url, idempotent: true };
    }
    if (existingSession.status === "complete") {
      throw new HttpsError(
        "failed-precondition",
        "Stripe reports this checkout as completed. Reconciliation must finish before another charge can be created.",
      );
    }
    checkoutAttempt += 1;
  }
  const idempotencyKey = crypto.createHash("sha256")
    .update([
      "bin-group-checkout",
      targetKind,
      targetId,
      ownerUid,
      chargeAmount.toFixed(2),
      String(targetRecord.quoteHash || ""),
      String(checkoutAttempt),
    ].join("|"))
    .digest("hex");
  if (!targetRef) throw new HttpsError("internal", "Payment target was not resolved.");
  const checkoutReservationId = crypto.randomUUID();
  await db.runTransaction(async (transaction) => {
    const freshSnap = await transaction.get(targetRef!);
    if (!freshSnap.exists) throw new HttpsError("not-found", "Payment target no longer exists.");
    const fresh = freshSnap.data() || {};
    const freshState = String(
      fresh.paymentStatus ||
      fresh.status ||
      fresh.verificationState ||
      "",
    ).trim().toUpperCase();
    if (
      ["PAID", "APPROVED", "PENDING_ADMIN_APPROVAL", "REJECTED", "PAYMENT_REJECTED", "CANCELLED"].includes(freshState) ||
      fresh.paymentVerified === true
    ) {
      throw new HttpsError("failed-precondition", "Payment is no longer eligible for Stripe checkout.");
    }
    const reservationExpiresAt = fresh.checkoutReservationExpiresAt?.toMillis?.() || 0;
    if (
      fresh.checkoutReservationId &&
      reservationExpiresAt > Date.now() &&
      fresh.checkoutReservationId !== checkoutReservationId
    ) {
      throw new HttpsError("aborted", "Another checkout creation attempt is already in progress.");
    }
    const freshOwnerUid = targetKind === "design"
      ? String(fresh.payerId || "").trim()
      : ownerIdOf(fresh);
    const freshAmount = targetKind === "ticket"
      ? serverAmount(fresh, ["paymentAmount", "amountDue", "invoiceAmount", "finalCost", "approvedCost", "totalAmount"])
      : targetKind === "design"
        ? serverAmount(fresh, ["amount", "amountDue", "paymentAmount"])
        : serverAmount(fresh, ["amount", "activationDeposit", "amountDue", "total"]);
    if (
      freshOwnerUid !== ownerUid ||
      !sameMoney(freshAmount, chargeAmount) ||
      String(fresh.stripeSessionId || "").trim() !== existingSessionId ||
      (
        Boolean(existingSessionId) &&
        String(fresh.invalidatedStripeSessionId || "").trim() === existingSessionId
      )
    ) {
      throw new HttpsError("aborted", "Payment ownership, amount, or checkout state changed.");
    }
    transaction.set(targetRef!, {
      checkoutReservationId,
      checkoutReservationExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
      checkoutAttempt,
      checkoutState: "CREATING_STRIPE_SESSION",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  try {
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "aed",
            product_data: {
              name: productName,
              description: productDescription,
            },
            unit_amount: Math.round(chargeAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://bin-group-57c60.web.app/owner/activation?payment_success=true&${returnParams}`,
      cancel_url: `https://bin-group-57c60.web.app/owner/activation?payment_failed=true&${returnParams}`,
      customer_email: ownerEmail,
      client_reference_id: intakeId || ticketId || designRequestId,
      metadata: {
        ownerUid,
        expectedAmount: chargeAmount.toFixed(2),
        currency: "AED",
        ...(intakeId && { intakeId, paymentId: onboardingPaymentId(intakeId) }),
        ...(onboardingSessionId && { onboardingSessionId }),
        ...(ticketId && { ticketId }),
        ...(designRequestId && { designRequestId }),
      },
    }, { idempotencyKey });

    try {
      await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(targetRef!);
        const fresh = freshSnap.data() || {};
        const freshState = String(
          fresh.paymentStatus ||
          fresh.status ||
          fresh.verificationState ||
          "",
        ).trim().toUpperCase();
        if (
          !freshSnap.exists ||
          fresh.checkoutReservationId !== checkoutReservationId ||
          ["PAID", "APPROVED", "PENDING_ADMIN_APPROVAL", "REJECTED", "PAYMENT_REJECTED", "CANCELLED"].includes(freshState) ||
          fresh.paymentVerified === true
        ) {
          throw new HttpsError("aborted", "Payment changed while Stripe created the checkout session.");
        }
        transaction.set(targetRef!, {
          stripeSessionId: session.id,
          stripeCheckoutStatus: String(session.status || "open").toUpperCase(),
          checkoutAttempt,
          checkoutIdempotencyKeyHash: crypto.createHash("sha256").update(idempotencyKey).digest("hex"),
          stripeSessionCreatedAt: FieldValue.serverTimestamp(),
          checkoutReservationId: FieldValue.delete(),
          checkoutReservationExpiresAt: FieldValue.delete(),
          checkoutState: "STRIPE_SESSION_OPEN",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    } catch (error) {
      if (session.status === "open") {
        await stripeInstance.checkout.sessions.expire(session.id).catch(() => undefined);
      }
      throw error;
    }

    return { id: session.id, url: session.url, idempotent: false };
  } catch (error: any) {
    console.error("Failed to create Stripe checkout session:", error);
    await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(targetRef!);
      if (freshSnap.exists && freshSnap.data()?.checkoutReservationId === checkoutReservationId) {
        transaction.set(targetRef!, {
          checkoutReservationId: FieldValue.delete(),
          checkoutReservationExpiresAt: FieldValue.delete(),
          checkoutState: "STRIPE_SESSION_CREATION_FAILED",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }).catch(() => undefined);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Stripe checkout session creation failed.");
  }
});

export const stripeWebhook = onRequest({
  cors: true,
  secrets: [stripeSecretKey, stripeWebhookSecret],
}, async (request, response) => {
  const sig = request.headers["stripe-signature"];
  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  const webhookSecret = stripeWebhookSecret.value() || process.env.STRIPE_WEBHOOK_SECRET;

  if (!key) {
    response.status(400).send("Webhook setup error: Stripe secret key is unconfigured.");
    return;
  }
  if (!webhookSecret) {
    response.status(400).send("Webhook setup error: Stripe webhook secret is unconfigured.");
    return;
  }

  const Stripe = await loadStripe();
  const stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" as any });
  let event: import("stripe").Stripe.Event;

  try {
    event = stripeInstance.webhooks.constructEvent(request.rawBody, sig || "", webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  const eventId = safeId(event.id);
  const eventRef = db.collection("stripe_webhook_events").doc(eventId);
  const claim = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(eventRef);
    const data = snap.data() || {};
    if (data.processed === true || data.ignored === true) return "DUPLICATE";
    const processingStartedAt = data.processingStartedAt?.toMillis?.() || 0;
    if (data.processing === true && Date.now() - processingStartedAt < 10 * 60 * 1000) {
      return "IN_PROGRESS";
    }
    transaction.set(eventRef, {
      eventId: event.id,
      eventType: event.type,
      processing: true,
      processingStartedAt: FieldValue.serverTimestamp(),
      attempts: Number(data.attempts || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    return "CLAIMED";
  });
  if (claim === "DUPLICATE") {
    response.status(200).json({ received: true, duplicate: true });
    return;
  }
  if (claim === "IN_PROGRESS") {
    // A 2xx response tells Stripe to stop retrying. Until durable processing
    // completes, fail closed so a crashed worker cannot lose a paid event.
    response.status(503).json({ received: false, processing: true, retry: true });
    return;
  }

  try {
  if (event.type !== "checkout.session.completed") {
    await eventRef.set({ eventId: event.id, eventType: event.type, processed: false, ignored: true, processing: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    response.status(200).json({ received: true, ignored: true });
    return;
  }

  const session = event.data.object as import("stripe").Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    await eventRef.set({ eventId: event.id, eventType: event.type, sessionId: session.id, processed: false, ignored: true, processing: false, reason: "PAYMENT_NOT_PAID", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    response.status(200).json({ received: true, processed: false, ignored: true, reason: "PAYMENT_NOT_PAID" });
    return;
  }

  const metadata = session.metadata || {};
  const ownerUid = String(metadata.ownerUid || "").trim();
  const intakeId = String(metadata.intakeId || "").trim();
  const ticketId = String(metadata.ticketId || "").trim();
  const designRequestId = String(metadata.designRequestId || "").trim();
  const onboardingSessionId = String(metadata.onboardingSessionId || "").trim();
  const amount = session.amount_total ? session.amount_total / 100 : 0;
  const currency = String(session.currency || "").toUpperCase();
  const expectedMetadataAmount = Number(metadata.expectedAmount);
  const timestamp = FieldValue.serverTimestamp();

  if (!ownerUid || [intakeId, ticketId, designRequestId].filter(Boolean).length !== 1 || currency !== "AED" || amount <= 0) {
    await eventRef.set({ eventId: event.id, eventType: event.type, sessionId: session.id, processed: false, ignored: true, processing: false, reason: "INVALID_SIGNED_SESSION_METADATA", ownerUid, intakeId, ticketId, designRequestId, currency, amount, updatedAt: timestamp }, { merge: true });
    response.status(200).json({ received: true, processed: false, reason: "INVALID_SIGNED_SESSION_METADATA" });
    return;
  }
  if (Number.isFinite(expectedMetadataAmount) && expectedMetadataAmount > 0 && !sameMoney(expectedMetadataAmount, amount)) {
    await eventRef.set({ eventId: event.id, eventType: event.type, sessionId: session.id, processed: false, ignored: true, processing: false, manualReviewRequired: true, reason: "STRIPE_METADATA_AMOUNT_MISMATCH", expectedAmount: expectedMetadataAmount, receivedAmount: amount, updatedAt: timestamp }, { merge: true });
    response.status(200).json({ received: true, processed: false, reason: "STRIPE_METADATA_AMOUNT_MISMATCH" });
    return;
  }

  const eventRecord = {
    eventId: event.id,
    eventType: event.type,
    sessionId: session.id,
    paymentIntentId: String(session.payment_intent || ""),
    ownerUid,
    intakeId: intakeId || null,
    ticketId: ticketId || null,
    designRequestId: designRequestId || null,
    amount,
    amountMinor: Number(session.amount_total || 0),
    currency,
    processed: true,
    processing: false,
    processedAt: timestamp,
    createdAt: timestamp,
  };

  if (intakeId) {
    const paymentId = metadata.paymentId || onboardingPaymentId(intakeId);
    const paymentRef = db.collection("payment_transactions").doc(paymentId);
    const contractRef = db.collection("contracts").doc(intakeId);
    const webhookResult = await db.runTransaction(async (transaction) => {
      const [paymentSnap, contractSnap] = await Promise.all([
        transaction.get(paymentRef),
        transaction.get(contractRef),
      ]);
      const payment = paymentSnap.data() || {};
      const contract = contractSnap.data() || {};
      const expectedAmount = serverAmount(payment, ["amount", "activationDeposit", "amountDue", "total"]);
      const persistedOwnerUid = ownerIdOf(payment) || ownerIdOf(contract);
      const persistedSessionId = String(payment.stripeSessionId || "").trim();
      const invalidatedSessionId = String(payment.invalidatedStripeSessionId || "").trim();
      const paymentState = String(payment.status || payment.paymentStatus || "").trim().toUpperCase();
      const contractState = String(contract.status || contract.paymentStatus || "").trim().toUpperCase();
      const rejectedOrInvalidated =
        ["REJECTED", "PAYMENT_REJECTED"].includes(paymentState) ||
        ["REJECTED", "PAYMENT_REJECTED"].includes(contractState) ||
        invalidatedSessionId === session.id;
      const sessionMatches = persistedSessionId === session.id;
      const mismatchReason = rejectedOrInvalidated
        ? "REJECTED_OR_INVALIDATED_STRIPE_SESSION"
        : !sessionMatches
          ? "UNEXPECTED_OR_DUPLICATE_STRIPE_SESSION"
          : "AMOUNT_OR_OWNERSHIP_MISMATCH";

      if (
        !paymentSnap.exists ||
        !contractSnap.exists ||
        persistedOwnerUid !== ownerUid ||
        expectedAmount <= 0 ||
        !sameMoney(expectedAmount, amount) ||
        !sessionMatches ||
        rejectedOrInvalidated
      ) {
        if (!rejectedOrInvalidated && paymentSnap.exists) {
          transaction.set(paymentRef, {
            status: "REVIEW_REQUIRED",
            paymentStatus: "REVIEW_REQUIRED",
            verificationState: mismatchReason,
            verified: false,
            paymentVerified: false,
            adminApprovalRequired: true,
            unlocksDashboard: false,
            receivedStripeSessionId: session.id,
            stripePaymentIntentId: String(session.payment_intent || ""),
            expectedAmount,
            amountReceived: amount,
            updatedAt: timestamp,
          }, { merge: true });
        }
        transaction.set(db.collection("audit_logs").doc(`stripe_mismatch_${eventId}`), {
          action: rejectedOrInvalidated
            ? "STRIPE_REJECTED_SESSION_IGNORED"
            : "STRIPE_PAYMENT_REQUIRES_MANUAL_REVIEW",
          actorId: ownerUid,
          actorRole: "owner",
          targetType: "payment_transactions",
          targetId: paymentId,
          ownerUid,
          intakeId,
          expectedAmount,
          amountReceived: amount,
          ownershipMatched: persistedOwnerUid === ownerUid,
          expectedStripeSessionId: persistedSessionId || null,
          stripeSessionId: session.id,
          reason: mismatchReason,
          createdAt: timestamp,
        });
        transaction.set(eventRef, {
          ...eventRecord,
          processed: false,
          ignored: true,
          // Stripe has already captured funds. Every business mismatch,
          // including a rejected/invalidated session, requires reconciliation.
          manualReviewRequired: true,
          reason: mismatchReason,
          expectedAmount,
        });
        return { processed: false, reason: mismatchReason };
      }

      transaction.set(paymentRef, {
        paymentId,
        contractId: intakeId,
        ownerUid,
        ownerId: ownerUid,
        intakeId,
        onboardingSessionId,
        paymentMethod: "STRIPE",
        gateway: "STRIPE",
        amount: expectedAmount,
        amountReceived: amount,
        currency: "AED",
        status: "PENDING_ADMIN_APPROVAL",
        paymentStatus: "PAID",
        verificationState: "AUTO_VERIFIED",
        verified: true,
        paymentVerified: true,
        adminApprovalRequired: true,
        unlocksDashboard: false,
        activationState: "PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        submittedAt: timestamp,
        verifiedAt: timestamp,
        updatedAt: timestamp,
      }, { merge: true });
      transaction.set(contractRef, {
        paymentStatus: "PAID",
        paymentVerified: true,
        status: "PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
        activationStatus: "PENDING_ADMIN_APPROVAL",
        dashboardUnlockApproved: false,
        stripeSessionId: session.id,
        updatedAt: timestamp,
      }, { merge: true });
      transaction.set(db.collection("intake_submissions").doc(intakeId), {
        paymentSubmitted: true,
        paymentSubmittedAt: timestamp,
        paymentMethod: "STRIPE",
        paymentState: "PAYMENT_VERIFIED",
        paymentStatus: "PAID",
        status: "payment_verified_pending_admin_approval",
        adminReviewState: "PAYMENT_VERIFIED_AWAITING_APPROVAL",
        ownerUid,
        ownerId: ownerUid,
        updatedAt: timestamp,
      }, { merge: true });

      const ownerPendingPatch = {
        paymentVerified: true,
        dashboardLocked: true,
        dashboardUnlocked: false,
        adminApproved: false,
        status: "pending_admin_approval",
        latestActivationContractId: intakeId,
        activationStatus: "PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
        updatedAt: timestamp,
      };
      transaction.set(db.collection("users").doc(ownerUid), ownerPendingPatch, { merge: true });
      transaction.set(db.collection("owners").doc(ownerUid), { ...ownerPendingPatch, status: "PENDING_ADMIN_APPROVAL" }, { merge: true });
      transaction.set(db.collection("owner_registration_requests").doc(ownerUid), ownerPendingPatch, { merge: true });
      transaction.set(db.collection("audit_logs").doc(`stripe_payment_${eventId}`), {
        action: "STRIPE_PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "payment_transactions",
        targetId: paymentId,
        ownerUid,
        ownerId: ownerUid,
        intakeId,
        paymentId,
        sessionId: onboardingSessionId,
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        createdAt: timestamp,
      });
      if (session.customer_details?.email || session.customer_email) {
        transaction.set(db.collection("mail").doc(`stripe_owner_${eventId}`), {
          to: String(session.customer_details?.email || session.customer_email).toLowerCase(),
          message: {
            from: "BIN GROUP <ceo@bin-groups.com>",
            replyTo: "BIN GROUP Admin <ceo@bin-groups.com>",
            subject: "BIN GROUP Card Payment Received - Approval Pending",
            html: `<p>Your BIN GROUP card payment has been received and verified.</p><p>Your signed contract and onboarding documents are now awaiting final admin approval. The owner dashboard remains protected until that review is complete.</p><p>Reference: ${paymentId}</p>`,
          },
          metadata: { type: "stripe_owner_payment_received_pending_admin", paymentId, intakeId, ownerUid, stripeEventId: event.id },
          createdAt: timestamp,
        });
      }
      transaction.set(eventRef, eventRecord);
      return { processed: true, reason: null };
    });

    response.status(200).json({
      received: true,
      processed: webhookResult.processed,
      ...(webhookResult.reason ? { reason: webhookResult.reason } : {}),
    });
    return;
  }

  if (designRequestId) {
    const designRef = db.collection("design_requests").doc(designRequestId);
    const paymentRef = db.collection("payment_transactions").doc(`design_${designRequestId}`);
    const designResult = await db.runTransaction(async (transaction) => {
      const [designSnap, paymentSnap] = await Promise.all([
        transaction.get(designRef),
        transaction.get(paymentRef),
      ]);
      const design = designSnap.data() || {};
      const payment = paymentSnap.data() || {};
      const expectedAmount = serverAmount(payment, ["amount", "amountDue", "paymentAmount"]);
      const payerUid = String(payment.payerId || design.payerId || ownerIdOf(design)).trim();
      const persistedSessionId = String(payment.stripeSessionId || "").trim();
      const invalidatedSessionId = String(payment.invalidatedStripeSessionId || "").trim();
      const state = String(payment.status || payment.paymentStatus || "").trim().toUpperCase();
      const rejectedOrInvalidated =
        ["REJECTED", "PAYMENT_REJECTED"].includes(state) ||
        invalidatedSessionId === session.id;
      const sessionMatches = persistedSessionId === session.id;
      const valid =
        designSnap.exists &&
        paymentSnap.exists &&
        payerUid === ownerUid &&
        expectedAmount > 0 &&
        sameMoney(expectedAmount, amount) &&
        sessionMatches &&
        !rejectedOrInvalidated;
      if (!valid) {
        const reason = rejectedOrInvalidated
          ? "REJECTED_OR_INVALIDATED_STRIPE_SESSION"
          : !sessionMatches
            ? "UNEXPECTED_OR_DUPLICATE_STRIPE_SESSION"
            : "DESIGN_AMOUNT_OR_OWNERSHIP_MISMATCH";
        if (paymentSnap.exists && !rejectedOrInvalidated) {
          transaction.set(paymentRef, {
            status: "REVIEW_REQUIRED",
            paymentStatus: "REVIEW_REQUIRED",
            verificationState: reason,
            paymentVerified: false,
            approved: false,
            expectedAmount,
            amountReceived: amount,
            receivedStripeSessionId: session.id,
            updatedAt: timestamp,
          }, { merge: true });
        }
        transaction.set(db.collection("audit_logs").doc(`stripe_design_mismatch_${eventId}`), {
          action: "STRIPE_DESIGN_PAYMENT_REQUIRES_MANUAL_REVIEW",
          actorId: ownerUid,
          actorRole: String(payment.payerRole || "payer"),
          targetType: "design_requests",
          targetId: designRequestId,
          expectedAmount,
          amountReceived: amount,
          expectedStripeSessionId: persistedSessionId || null,
          receivedStripeSessionId: session.id,
          reason,
          createdAt: timestamp,
        });
        transaction.set(eventRef, {
          ...eventRecord,
          processed: false,
          ignored: true,
          manualReviewRequired: true,
          reason,
          expectedAmount,
        });
        return { processed: false, reason };
      }

      transaction.set(designRef, {
        paymentStatus: "PAID",
        approvalStatus: "READY_FOR_EXECUTION",
        stripeSessionId: session.id,
        updatedAt: timestamp,
      }, { merge: true });
      transaction.set(paymentRef, {
        payerId: ownerUid,
        designRequestId,
        paymentMethod: "STRIPE",
        amount,
        amountReceived: amount,
        currency: "AED",
        status: "PAID",
        verificationState: "AUTO_VERIFIED",
        paymentVerified: true,
        approved: true,
        stripeEventId: event.id,
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        submittedAt: timestamp,
        verifiedAt: timestamp,
        updatedAt: timestamp,
      }, { merge: true });
      transaction.set(db.collection("audit_logs").doc(`stripe_design_${eventId}`), {
        action: "STRIPE_DESIGN_PAYMENT_VERIFIED",
        actorId: ownerUid,
        actorRole: String(payment.payerRole || "payer"),
        targetType: "design_requests",
        targetId: designRequestId,
        ownerUid,
        designRequestId,
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        createdAt: timestamp,
      });
      transaction.set(eventRef, eventRecord);
      return { processed: true, reason: null };
    });
    response.status(200).json({
      received: true,
      processed: designResult.processed,
      ...(designResult.reason ? { reason: designResult.reason } : {}),
    });
    return;
  }

  if (ticketId) {
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketResult = await db.runTransaction(async (transaction) => {
      const ticketSnap = await transaction.get(ticketRef);
      const ticket = ticketSnap.data() || {};
      const expectedAmount = serverAmount(ticket, ["paymentAmount", "amountDue", "invoiceAmount", "finalCost", "approvedCost", "totalAmount"]);
      const persistedSessionId = String(ticket.stripeSessionId || "").trim();
      const invalidatedSessionId = String(ticket.invalidatedStripeSessionId || "").trim();
      const state = String(ticket.paymentStatus || ticket.status || "").trim().toUpperCase();
      const rejectedOrInvalidated =
        ["REJECTED", "PAYMENT_REJECTED"].includes(state) ||
        invalidatedSessionId === session.id;
      const sessionMatches = persistedSessionId === session.id;
      const valid =
        ticketSnap.exists &&
        ownerIdOf(ticket) === ownerUid &&
        expectedAmount > 0 &&
        sameMoney(expectedAmount, amount) &&
        sessionMatches &&
        !rejectedOrInvalidated;
      if (!valid) {
        const reason = rejectedOrInvalidated
          ? "REJECTED_OR_INVALIDATED_STRIPE_SESSION"
          : !sessionMatches
            ? "UNEXPECTED_OR_DUPLICATE_STRIPE_SESSION"
            : "TICKET_AMOUNT_OR_OWNERSHIP_MISMATCH";
        transaction.set(db.collection("audit_logs").doc(`stripe_ticket_mismatch_${eventId}`), {
          action: "STRIPE_TICKET_PAYMENT_REQUIRES_MANUAL_REVIEW",
          actorId: ownerUid,
          actorRole: "owner",
          targetType: "maintenanceTickets",
          targetId: ticketId,
          expectedAmount,
          amountReceived: amount,
          expectedStripeSessionId: persistedSessionId || null,
          receivedStripeSessionId: session.id,
          reason,
          createdAt: timestamp,
        });
        transaction.set(eventRef, {
          ...eventRecord,
          processed: false,
          ignored: true,
          manualReviewRequired: true,
          reason,
          expectedAmount,
        });
        return { processed: false, reason };
      }

      transaction.set(ticketRef, {
        paymentStatus: "PAID",
        stripeSessionId: session.id,
        updatedAt: timestamp,
      }, { merge: true });
      transaction.set(db.collection("payment_transactions").doc(`stripe_${safeId(session.id)}`), {
        ownerUid,
        ownerId: ownerUid,
        ticketId,
        paymentMethod: "STRIPE",
        amount,
        currency: "AED",
        status: "PAID",
        verificationState: "AUTO_VERIFIED",
        stripeEventId: event.id,
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        submittedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.set(db.collection("audit_logs").doc(`stripe_ticket_${eventId}`), {
        action: "STRIPE_TICKET_PAYMENT_VERIFIED",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "maintenanceTickets",
        targetId: ticketId,
        ownerUid,
        ticketId,
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        createdAt: timestamp,
      });
      transaction.set(eventRef, eventRecord);
      return { processed: true, reason: null };
    });
    response.status(200).json({
      received: true,
      processed: ticketResult.processed,
      ...(ticketResult.reason ? { reason: ticketResult.reason } : {}),
    });
    return;
  }

  await eventRef.set({ ...eventRecord, processed: false, ignored: true, reason: "NO_PAYMENT_TARGET" });
  response.status(200).json({ received: true, processed: false, reason: "NO_PAYMENT_TARGET" });
  } catch {
    console.error("Stripe webhook processing failed after claim", { eventId });
    try {
      await eventRef.set({
        processed: false,
        processing: false,
        processingFailed: true,
        failureCode: "UNHANDLED_PROCESSING_FAILURE",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch {
      console.error("Stripe webhook claim release failed", { eventId });
    }
    response.status(500).json({ received: false, retry: true });
  }
});
