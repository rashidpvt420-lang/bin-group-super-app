import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
const defineSecret = (name: string) => ({ value: () => process.env[name] || "" });
import * as admin from "firebase-admin";
import Stripe from "stripe";

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

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
  return `${intakeId}_mobilization`;
}

function invoicePaymentId(invoiceId: string) {
  return `${invoiceId}_stripe`;
}

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const ADMIN_ROLES = new Set(["admin", "ceo", "super_admin", "manager", "operations_admin", "finance_admin"]);

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const claims = auth.token || {};
  if (claims.admin === true || claims.isAdmin === true || ADMIN_ROLES.has(roleOf(claims.role))) return;

  const profile = await db.collection("users").doc(auth.uid).get();
  const data = profile.data() || {};
  if (data.isAdmin === true || data.admin === true || ADMIN_ROLES.has(roleOf(data.role))) return;

  throw new HttpsError("permission-denied", "Admin permission required.");
}

export const createStripeCheckoutSession = onCall({ cors: true }, async (request) => {
  const data = request.data || {};
  const ownerUid = cleanText(data.ownerUid, "ownerUid", 120);

  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Login is required to start a payment.");
  }
  if (request.auth.uid !== ownerUid) {
    throw new HttpsError("permission-denied", "You can only pay for your own account.");
  }

  const ownerEmail = cleanEmail(data.ownerEmail);
  const intakeId = String(data.intakeId || "").trim();
  const onboardingSessionId = String(data.onboardingSessionId || "").trim();
  const ticketId = String(data.ticketId || "").trim();
  const designRequestId = String(data.designRequestId || "").trim();
  const invoiceId = String(data.invoiceId || "").trim();
  const amount = Number(data.amount);

  if (!intakeId && !ticketId && !designRequestId && !invoiceId) {
    throw new HttpsError("invalid-argument", "Payment must be associated with an intake, ticket, design request, or invoice.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "Valid payment amount is required.");
  }

  if (invoiceId) {
    const invoiceSnap = await db.collection("invoices").doc(invoiceId).get();
    if (!invoiceSnap.exists) throw new HttpsError("not-found", "Invoice not found.");
    const invoiceData = invoiceSnap.data() || {};
    if (invoiceData.tenantId !== ownerUid) {
      throw new HttpsError("permission-denied", "This invoice does not belong to you.");
    }
    const invoiceStatus = roleOf(invoiceData.status);
    if (invoiceStatus === "paid" || invoiceStatus === "refunded") {
      throw new HttpsError("failed-precondition", "This invoice is not awaiting payment.");
    }
    const invoiceAmount = Number(invoiceData.amount);
    if (!Number.isFinite(invoiceAmount) || Math.abs(amount - invoiceAmount) > 0.01) {
      throw new HttpsError("invalid-argument", "Payment amount does not match the invoice balance.");
    }
  }

  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Online card payment is not configured. Use bank transfer/manual verification until the payment provider is activated."
    );
  }

  const stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" as any });
  const returnParams = `session_id={CHECKOUT_SESSION_ID}&ownerUid=${encodeURIComponent(ownerUid)}${intakeId ? `&intakeId=${encodeURIComponent(intakeId)}` : ''}${ticketId ? `&ticketId=${encodeURIComponent(ticketId)}` : ''}${designRequestId ? `&designRequestId=${encodeURIComponent(designRequestId)}` : ''}${invoiceId ? `&invoiceId=${encodeURIComponent(invoiceId)}` : ''}`;
  const returnPath = invoiceId ? "/tenant/payments" : "/owner/activation";

  try {
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "aed",
            product_data: {
              name: intakeId ? "BIN GROUP Property Onboarding Contract Payment" : (ticketId ? "BIN GROUP Maintenance Service Payment" : (designRequestId ? "BIN GROUP AI Design Studio Payment" : "BIN GROUP Rent Payment")),
              description: intakeId ? `Intake ID: ${intakeId}` : (ticketId ? `Ticket ID: ${ticketId}` : (designRequestId ? `Design ID: ${designRequestId}` : `Invoice ID: ${invoiceId}`)),
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://bin-group-57c60.web.app${returnPath}?payment_success=true&${returnParams}`,
      cancel_url: `https://bin-group-57c60.web.app${returnPath}?payment_failed=true&${returnParams}`,
      customer_email: ownerEmail,
      metadata: {
        ownerUid,
        ...(intakeId && { intakeId, paymentId: onboardingPaymentId(intakeId) }),
        ...(onboardingSessionId && { onboardingSessionId }),
        ...(ticketId && { ticketId }),
        ...(designRequestId && { designRequestId }),
        ...(invoiceId && { invoiceId, paymentId: invoicePaymentId(invoiceId) }),
      },
    });

    return { id: session.id, url: session.url };
  } catch (error: any) {
    console.error("Failed to create Stripe checkout session:", error);
    throw new HttpsError("internal", "Stripe checkout session creation failed.");
  }
});

export const stripeWebhook = onRequest({ cors: true }, async (request, response) => {
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

  const stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" as any });
  let event: Stripe.Event;

  try {
    event = stripeInstance.webhooks.constructEvent(
      request.rawBody,
      sig || "",
      webhookSecret
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};
    const ownerUid = metadata.ownerUid;
    const intakeId = metadata.intakeId;
    const ticketId = metadata.ticketId;
    const designRequestId = metadata.designRequestId;
    const invoiceId = metadata.invoiceId;
    const onboardingSessionId = metadata.onboardingSessionId;
    const amount = session.amount_total ? session.amount_total / 100 : 0;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    if (ownerUid && intakeId) {
      const paymentId = metadata.paymentId || onboardingPaymentId(intakeId);
      const paymentRef = db.collection("payment_transactions").doc(paymentId);
      batch.set(paymentRef, {
        paymentId,
        ownerUid,
        ownerId: ownerUid,
        intakeId,
        onboardingSessionId: onboardingSessionId || "",
        paymentMethod: "STRIPE",
        gateway: "STRIPE",
        amount,
        currency: "AED",
        status: "PAID",
        verificationState: "AUTO_VERIFIED",
        verified: true,
        unlocksDashboard: true,
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        submittedAt: timestamp,
        verifiedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      }, { merge: true });

      const intakeRef = db.collection("intake_submissions").doc(intakeId);
      batch.set(intakeRef, {
        paymentSubmitted: true,
        paymentSubmittedAt: timestamp,
        paymentMethod: "STRIPE",
        paymentState: "PAYMENT_VERIFIED",
        paymentStatus: "PAID",
        status: "payment_approved",
        ownerUid,
        ownerId: ownerUid,
        updatedAt: timestamp
      }, { merge: true });

      const userRef = db.collection("users").doc(ownerUid);
      batch.set(userRef, {
        paymentVerified: true,
        dashboardLocked: false,
        dashboardUnlocked: true,
        status: "active",
        updatedAt: timestamp
      }, { merge: true });

      const ownerRef = db.collection("owners").doc(ownerUid);
      batch.set(ownerRef, {
        paymentVerified: true,
        dashboardLocked: false,
        dashboardUnlocked: true,
        paymentStatus: "PAID",
        status: "ACTIVE",
        updatedAt: timestamp
      }, { merge: true });

      const registrationRef = db.collection("owner_registration_requests").doc(ownerUid);
      batch.set(registrationRef, {
        status: "active",
        dashboardLocked: false,
        dashboardUnlocked: true,
        paymentVerified: true,
        updatedAt: timestamp
      }, { merge: true });

      const auditRef = db.collection("audit_logs").doc();
      batch.set(auditRef, {
        action: "STRIPE_PAYMENT_VERIFIED",
        ownerUid,
        ownerId: ownerUid,
        intakeId,
        paymentId,
        sessionId: onboardingSessionId || "",
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        timestamp,
        createdAt: timestamp
      });

      await batch.commit();
      console.log(`Successfully processed Stripe payment for owner ${ownerUid}, intake ${intakeId}, payment ${paymentId}`);
    } else if (ownerUid && designRequestId) {
      const designRef = db.collection("design_requests").doc(designRequestId);
      batch.set(designRef, {
        paymentStatus: "PAID",
        approvalStatus: "READY_FOR_EXECUTION",
        updatedAt: timestamp
      }, { merge: true });

      const paymentRef = db.collection("payment_transactions").doc();
      batch.set(paymentRef, {
        ownerUid,
        ownerId: ownerUid,
        designRequestId,
        paymentMethod: "STRIPE",
        amount,
        currency: "AED",
        status: "PAID",
        verificationState: "AUTO_VERIFIED",
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        submittedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const auditRef = db.collection("audit_logs").doc();
      batch.set(auditRef, {
        action: "STRIPE_DESIGN_PAYMENT_VERIFIED",
        ownerUid,
        ownerId: ownerUid,
        designRequestId,
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        timestamp,
        createdAt: timestamp
      });

      await batch.commit();
      console.log(`Successfully processed Stripe payment for design request ${designRequestId}`);
    } else if (ownerUid && ticketId) {
      const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
      batch.set(ticketRef, {
        paymentStatus: "PAID",
        updatedAt: timestamp
      }, { merge: true });

      const paymentRef = db.collection("payment_transactions").doc();
      batch.set(paymentRef, {
        ownerUid,
        ownerId: ownerUid,
        ticketId,
        paymentMethod: "STRIPE",
        amount,
        currency: "AED",
        status: "PAID",
        verificationState: "AUTO_VERIFIED",
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        submittedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const auditRef = db.collection("audit_logs").doc();
      batch.set(auditRef, {
        action: "STRIPE_TICKET_PAYMENT_VERIFIED",
        ownerUid,
        ownerId: ownerUid,
        ticketId,
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        timestamp,
        createdAt: timestamp
      });

      await batch.commit();
      console.log(`Successfully processed Stripe payment for ticket ${ticketId}`);
    } else if (ownerUid && invoiceId) {
      const paymentId = invoicePaymentId(invoiceId);
      const paymentRef = db.collection("payment_transactions").doc(paymentId);
      batch.set(paymentRef, {
        paymentId,
        tenantId: ownerUid,
        payerId: ownerUid,
        ownerId: ownerUid,
        invoiceId,
        paymentMethod: "STRIPE",
        gateway: "STRIPE",
        paymentType: "TENANT_RENT",
        amount,
        currency: "AED",
        status: "PAID",
        verificationState: "AUTO_VERIFIED",
        stripeSessionId: session.id,
        stripePaymentIntentId: String(session.payment_intent || ""),
        submittedAt: timestamp,
        verifiedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      }, { merge: true });

      const invoiceRef = db.collection("invoices").doc(invoiceId);
      batch.set(invoiceRef, {
        status: "paid",
        paidAt: timestamp,
        paymentMethod: "STRIPE",
        stripePaymentIntentId: String(session.payment_intent || ""),
        updatedAt: timestamp
      }, { merge: true });

      const auditRef = db.collection("audit_logs").doc();
      batch.set(auditRef, {
        action: "STRIPE_RENT_PAYMENT_VERIFIED",
        tenantId: ownerUid,
        ownerId: ownerUid,
        invoiceId,
        paymentId,
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        timestamp,
        createdAt: timestamp
      });

      await batch.commit();
      console.log(`Successfully processed Stripe rent payment for tenant ${ownerUid}, invoice ${invoiceId}`);
    }
  }

  response.status(200).json({ received: true });
});

export const adminRefundInvoicePayment = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);

  const invoiceId = cleanText(request.data?.invoiceId, "invoiceId", 120);
  const reason = String(request.data?.reason || "Refunded by admin.").trim();

  const paymentId = invoicePaymentId(invoiceId);
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    throw new HttpsError("not-found", "Card payment record not found for this invoice.");
  }

  const payment = paymentSnap.data() || {};
  if (roleOf(payment.status) === "refunded") {
    return { status: "SUCCESS", paymentId, idempotent: true };
  }
  if (payment.gateway !== "STRIPE" || !payment.stripePaymentIntentId) {
    throw new HttpsError("failed-precondition", "This payment was not made via Stripe and cannot be refunded here.");
  }

  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new HttpsError("failed-precondition", "Stripe is not configured.");
  }
  const stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" as any });

  let refund: Stripe.Refund;
  try {
    refund = await stripeInstance.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reason: "requested_by_customer",
    });
  } catch (error: any) {
    console.error("Stripe refund failed:", error);
    throw new HttpsError("internal", "Stripe refund could not be processed.");
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const actorId = request.auth?.uid || "admin";
  const batch = db.batch();

  batch.set(paymentRef, {
    status: "REFUNDED",
    refundId: refund.id,
    refundReason: reason,
    refundedBy: actorId,
    refundedAt: now,
    updatedAt: now,
  }, { merge: true });

  batch.set(db.collection("invoices").doc(invoiceId), {
    status: "refunded",
    refundedAt: now,
    updatedAt: now,
  }, { merge: true });

  batch.set(db.collection("auditLogs").doc(), {
    action: "ADMIN_REFUND_INVOICE_PAYMENT",
    actorId,
    invoiceId,
    paymentId,
    refundId: refund.id,
    reason,
    createdAt: now,
  });

  await batch.commit();

  return { status: "SUCCESS", paymentId, refundId: refund.id, idempotent: false };
});
