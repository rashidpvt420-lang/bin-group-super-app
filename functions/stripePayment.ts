import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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

function assertAuthenticatedOwner(request: any, ownerUid: string) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner login is required before checkout.");
  if (String(request.auth.uid) !== ownerUid) {
    throw new HttpsError("permission-denied", "Checkout owner does not match the authenticated account.");
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

  assertAuthenticatedOwner(request, ownerUid);
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

  if (intakeId) {
    const paymentId = onboardingPaymentId(intakeId);
    const [paymentSnap, contractSnap] = await Promise.all([
      db.collection("payment_transactions").doc(paymentId).get(),
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
    const persistedOwnerUid = ownerIdOf(payment) || ownerIdOf(contract);
    if (persistedOwnerUid !== ownerUid) {
      throw new HttpsError("permission-denied", "Persisted onboarding package belongs to another owner.");
    }
    chargeAmount = serverAmount(payment, ["amount", "activationDeposit", "amountDue", "total"]);
    productName = "BIN GROUP Property Onboarding Contract Payment";
    productDescription = `Intake ID: ${intakeId}`;
  }

  if (ticketId) {
    const ticketSnap = await db.collection("maintenanceTickets").doc(ticketId).get();
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Maintenance ticket not found.");
    const ticket = ticketSnap.data() || {};
    if (ownerIdOf(ticket) !== ownerUid) {
      throw new HttpsError("permission-denied", "Maintenance ticket belongs to another owner.");
    }
    chargeAmount = serverAmount(ticket, ["paymentAmount", "amountDue", "invoiceAmount", "finalCost", "approvedCost", "totalAmount"]);
    productName = "BIN GROUP Maintenance Service Payment";
    productDescription = `Ticket ID: ${ticketId}`;
  }

  if (designRequestId) {
    const designSnap = await db.collection("design_requests").doc(designRequestId).get();
    if (!designSnap.exists) throw new HttpsError("not-found", "Design request not found.");
    const design = designSnap.data() || {};
    if (ownerIdOf(design) !== ownerUid) {
      throw new HttpsError("permission-denied", "Design request belongs to another owner.");
    }
    chargeAmount = serverAmount(design, ["paymentAmount", "amountDue", "quotedAmount", "totalAmount", "price"]);
    productName = "BIN GROUP AI Design Studio Payment";
    productDescription = `Design ID: ${designRequestId}`;
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
    });

    return { id: session.id, url: session.url };
  } catch (error: any) {
    console.error("Failed to create Stripe checkout session:", error);
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
    response.status(202).json({ received: true, processing: true });
    return;
  }

  if (event.type !== "checkout.session.completed") {
    await eventRef.set({ eventId: event.id, eventType: event.type, processed: false, ignored: true, processing: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    response.status(200).json({ received: true, ignored: true });
    return;
  }

  const session = event.data.object as import("stripe").Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    await eventRef.set({ eventId: event.id, eventType: event.type, sessionId: session.id, processed: false, processing: false, reason: "PAYMENT_NOT_PAID", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    response.status(202).json({ received: true, processed: false, reason: "PAYMENT_NOT_PAID" });
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
    await eventRef.set({ eventId: event.id, eventType: event.type, sessionId: session.id, processed: false, reason: "INVALID_SIGNED_SESSION_METADATA", ownerUid, intakeId, ticketId, designRequestId, currency, amount, createdAt: timestamp });
    response.status(200).json({ received: true, processed: false, reason: "INVALID_SIGNED_SESSION_METADATA" });
    return;
  }
  if (Number.isFinite(expectedMetadataAmount) && expectedMetadataAmount > 0 && !sameMoney(expectedMetadataAmount, amount)) {
    await eventRef.set({ eventId: event.id, eventType: event.type, sessionId: session.id, processed: false, reason: "STRIPE_METADATA_AMOUNT_MISMATCH", expectedAmount: expectedMetadataAmount, receivedAmount: amount, createdAt: timestamp });
    response.status(200).json({ received: true, processed: false, reason: "STRIPE_METADATA_AMOUNT_MISMATCH" });
    return;
  }

  const batch = db.batch();
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
    currency,
    processed: true,
    processing: false,
    processedAt: timestamp,
    createdAt: timestamp,
  };

  if (intakeId) {
    const paymentId = metadata.paymentId || onboardingPaymentId(intakeId);
    const paymentRef = db.collection("payment_transactions").doc(paymentId);
    const [paymentSnap, contractSnap] = await Promise.all([
      paymentRef.get(),
      db.collection("contracts").doc(intakeId).get(),
    ]);
    const payment = paymentSnap.data() || {};
    const contract = contractSnap.data() || {};
    const expectedAmount = serverAmount(payment, ["amount", "activationDeposit", "amountDue", "total"]);
    const persistedOwnerUid = ownerIdOf(payment) || ownerIdOf(contract);

    if (!paymentSnap.exists || !contractSnap.exists || persistedOwnerUid !== ownerUid || expectedAmount <= 0 || !sameMoney(expectedAmount, amount)) {
      batch.set(paymentRef, {
        status: "REVIEW_REQUIRED",
        paymentStatus: "REVIEW_REQUIRED",
        verificationState: "AMOUNT_OR_OWNERSHIP_MISMATCH",
        verified: false,
        paymentVerified: false,
        adminApprovalRequired: true,
        unlocksDashboard: false,
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        expectedAmount,
        amountReceived: amount,
        updatedAt: timestamp,
      }, { merge: true });
      batch.set(db.collection("audit_logs").doc(`stripe_mismatch_${eventId}`), {
        action: "STRIPE_PAYMENT_REQUIRES_MANUAL_REVIEW",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "payment_transactions",
        targetId: paymentId,
        ownerUid,
        intakeId,
        expectedAmount,
        amountReceived: amount,
        ownershipMatched: persistedOwnerUid === ownerUid,
        stripeSessionId: session.id,
        createdAt: timestamp,
      });
      batch.set(eventRef, { ...eventRecord, processed: false, reason: "AMOUNT_OR_OWNERSHIP_MISMATCH", expectedAmount });
      await batch.commit();
      response.status(200).json({ received: true, processed: false, reason: "AMOUNT_OR_OWNERSHIP_MISMATCH" });
      return;
    }

    batch.set(paymentRef, {
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
      updatedAt: timestamp
    }, { merge: true });

    batch.set(db.collection("contracts").doc(intakeId), {
      paymentStatus: "PAID",
      paymentVerified: true,
      status: "PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
      activationStatus: "PENDING_ADMIN_APPROVAL",
      dashboardUnlockApproved: false,
      stripeSessionId: session.id,
      updatedAt: timestamp
    }, { merge: true });

    batch.set(db.collection("intake_submissions").doc(intakeId), {
      paymentSubmitted: true,
      paymentSubmittedAt: timestamp,
      paymentMethod: "STRIPE",
      paymentState: "PAYMENT_VERIFIED",
      paymentStatus: "PAID",
      status: "payment_verified_pending_admin_approval",
      adminReviewState: "PAYMENT_VERIFIED_AWAITING_APPROVAL",
      ownerUid,
      ownerId: ownerUid,
      updatedAt: timestamp
    }, { merge: true });

    const ownerPendingPatch = {
      paymentVerified: true,
      dashboardLocked: true,
      dashboardUnlocked: false,
      adminApproved: false,
      status: "pending_admin_approval",
      latestActivationContractId: intakeId,
      activationStatus: "PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
      updatedAt: timestamp
    };
    batch.set(db.collection("users").doc(ownerUid), ownerPendingPatch, { merge: true });
    batch.set(db.collection("owners").doc(ownerUid), { ...ownerPendingPatch, status: "PENDING_ADMIN_APPROVAL" }, { merge: true });
    batch.set(db.collection("owner_registration_requests").doc(ownerUid), ownerPendingPatch, { merge: true });

    batch.set(db.collection("audit_logs").doc(`stripe_payment_${eventId}`), {
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
      createdAt: timestamp
    });

    if (session.customer_details?.email || session.customer_email) {
      batch.set(db.collection("mail").doc(`stripe_owner_${eventId}`), {
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
  }

  if (designRequestId) {
    const designRef = db.collection("design_requests").doc(designRequestId);
    const designSnap = await designRef.get();
    const design = designSnap.data() || {};
    const expectedAmount = serverAmount(design, ["paymentAmount", "amountDue", "quotedAmount", "totalAmount", "price"]);
    if (!designSnap.exists || ownerIdOf(design) !== ownerUid || expectedAmount <= 0 || !sameMoney(expectedAmount, amount)) {
      batch.set(db.collection("audit_logs").doc(`stripe_design_mismatch_${eventId}`), {
        action: "STRIPE_DESIGN_PAYMENT_REQUIRES_MANUAL_REVIEW",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "design_requests",
        targetId: designRequestId,
        expectedAmount,
        amountReceived: amount,
        createdAt: timestamp,
      });
      batch.set(eventRef, { ...eventRecord, processed: false, reason: "DESIGN_AMOUNT_OR_OWNERSHIP_MISMATCH", expectedAmount });
      await batch.commit();
      response.status(200).json({ received: true, processed: false, reason: "DESIGN_AMOUNT_OR_OWNERSHIP_MISMATCH" });
      return;
    }

    batch.set(designRef, {
      paymentStatus: "PAID",
      approvalStatus: "READY_FOR_EXECUTION",
      stripeSessionId: session.id,
      updatedAt: timestamp
    }, { merge: true });
    batch.set(db.collection("payment_transactions").doc(`stripe_${safeId(session.id)}`), {
      ownerUid,
      ownerId: ownerUid,
      designRequestId,
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
      updatedAt: timestamp
    });
    batch.set(db.collection("audit_logs").doc(`stripe_design_${eventId}`), {
      action: "STRIPE_DESIGN_PAYMENT_VERIFIED",
      actorId: ownerUid,
      actorRole: "owner",
      targetType: "design_requests",
      targetId: designRequestId,
      ownerUid,
      designRequestId,
      paymentMethod: "STRIPE",
      stripeSessionId: session.id,
      createdAt: timestamp
    });
  }

  if (ticketId) {
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    const ticket = ticketSnap.data() || {};
    const expectedAmount = serverAmount(ticket, ["paymentAmount", "amountDue", "invoiceAmount", "finalCost", "approvedCost", "totalAmount"]);
    if (!ticketSnap.exists || ownerIdOf(ticket) !== ownerUid || expectedAmount <= 0 || !sameMoney(expectedAmount, amount)) {
      batch.set(db.collection("audit_logs").doc(`stripe_ticket_mismatch_${eventId}`), {
        action: "STRIPE_TICKET_PAYMENT_REQUIRES_MANUAL_REVIEW",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "maintenanceTickets",
        targetId: ticketId,
        expectedAmount,
        amountReceived: amount,
        createdAt: timestamp,
      });
      batch.set(eventRef, { ...eventRecord, processed: false, reason: "TICKET_AMOUNT_OR_OWNERSHIP_MISMATCH", expectedAmount });
      await batch.commit();
      response.status(200).json({ received: true, processed: false, reason: "TICKET_AMOUNT_OR_OWNERSHIP_MISMATCH" });
      return;
    }

    batch.set(ticketRef, {
      paymentStatus: "PAID",
      stripeSessionId: session.id,
      updatedAt: timestamp
    }, { merge: true });
    batch.set(db.collection("payment_transactions").doc(`stripe_${safeId(session.id)}`), {
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
      updatedAt: timestamp
    });
    batch.set(db.collection("audit_logs").doc(`stripe_ticket_${eventId}`), {
      action: "STRIPE_TICKET_PAYMENT_VERIFIED",
      actorId: ownerUid,
      actorRole: "owner",
      targetType: "maintenanceTickets",
      targetId: ticketId,
      ownerUid,
      ticketId,
      paymentMethod: "STRIPE",
      stripeSessionId: session.id,
      createdAt: timestamp
    });
  }

  batch.set(eventRef, eventRecord);
  await batch.commit();
  response.status(200).json({ received: true, processed: true });
});
