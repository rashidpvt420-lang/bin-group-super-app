import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
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
  const amount = Number(data.amount);

  assertAuthenticatedOwner(request, ownerUid);
  const tokenEmail = String(request.auth?.token?.email || "").trim().toLowerCase();
  if (tokenEmail && tokenEmail !== ownerEmail) {
    throw new HttpsError("permission-denied", "Checkout email does not match the authenticated account.");
  }

  if (!intakeId && !ticketId && !designRequestId) {
    throw new HttpsError("invalid-argument", "Payment must be associated with an intake, ticket, or design request.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "Valid payment amount is required.");
  }

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
    const persistedOwnerUid = String(payment.ownerUid || payment.ownerId || contract.ownerUid || contract.ownerId || "").trim();
    if (persistedOwnerUid !== ownerUid) {
      throw new HttpsError("permission-denied", "Persisted onboarding package belongs to another owner.");
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
  const returnParams = `session_id={CHECKOUT_SESSION_ID}&ownerUid=${encodeURIComponent(ownerUid)}${intakeId ? `&intakeId=${encodeURIComponent(intakeId)}` : ''}${ticketId ? `&ticketId=${encodeURIComponent(ticketId)}` : ''}${designRequestId ? `&designRequestId=${encodeURIComponent(designRequestId)}` : ''}`;

  try {
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "aed",
            product_data: {
              name: intakeId ? "BIN GROUP Property Onboarding Contract Payment" : (ticketId ? "BIN GROUP Maintenance Service Payment" : "BIN GROUP AI Design Studio Payment"),
              description: intakeId ? `Intake ID: ${intakeId}` : (ticketId ? `Ticket ID: ${ticketId}` : `Design ID: ${designRequestId}`),
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://bin-group-57c60.web.app/owner/activation?payment_success=true&${returnParams}`,
      cancel_url: `https://bin-group-57c60.web.app/owner/activation?payment_failed=true&${returnParams}`,
      customer_email: ownerEmail,
      metadata: {
        ownerUid,
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
    const onboardingSessionId = metadata.onboardingSessionId;
    const amount = session.amount_total ? session.amount_total / 100 : 0;
    const timestamp = FieldValue.serverTimestamp();
    const batch = db.batch();

    if (ownerUid && intakeId) {
      const paymentId = metadata.paymentId || onboardingPaymentId(intakeId);
      const paymentRef = db.collection("payment_transactions").doc(paymentId);
      batch.set(paymentRef, {
        paymentId,
        contractId: intakeId,
        ownerUid,
        ownerId: ownerUid,
        intakeId,
        onboardingSessionId: onboardingSessionId || "",
        paymentMethod: "STRIPE",
        gateway: "STRIPE",
        amount,
        amountReceived: amount,
        currency: "AED",
        status: "PAID",
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

      const contractRef = db.collection("contracts").doc(intakeId);
      batch.set(contractRef, {
        paymentStatus: "PAID",
        paymentVerified: true,
        status: "PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
        activationStatus: "PENDING_ADMIN_APPROVAL",
        dashboardUnlockApproved: false,
        stripeSessionId: session.id,
        updatedAt: timestamp
      }, { merge: true });

      const intakeRef = db.collection("intake_submissions").doc(intakeId);
      batch.set(intakeRef, {
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

      batch.set(db.collection("audit_logs").doc(), {
        action: "STRIPE_PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "payment_transactions",
        targetId: paymentId,
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

      if (session.customer_details?.email || session.customer_email) {
        batch.set(db.collection("mail").doc(), {
          to: String(session.customer_details?.email || session.customer_email).toLowerCase(),
          message: {
            from: "BIN GROUP <ceo@bin-groups.com>",
            replyTo: "BIN GROUP Admin <ceo@bin-groups.com>",
            subject: "BIN GROUP Card Payment Received - Approval Pending",
            html: `<p>Your BIN GROUP card payment has been received and verified.</p><p>Your signed contract and onboarding documents are now awaiting final admin approval. The owner dashboard remains protected until that review is complete.</p><p>Reference: ${paymentId}</p>`,
          },
          metadata: { type: "stripe_owner_payment_received_pending_admin", paymentId, intakeId, ownerUid },
          createdAt: timestamp,
        });
      }

      await batch.commit();
      console.log(`Stripe payment verified for owner ${ownerUid}, intake ${intakeId}, payment ${paymentId}; admin activation remains required.`);
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
    }
  }

  response.status(200).json({ received: true });
});
