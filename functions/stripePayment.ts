import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

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

export const createStripeCheckoutSession = onCall({ cors: true, secrets: [stripeSecretKey] }, async (request) => {
  const data = request.data || {};
  const ownerUid = cleanText(data.ownerUid, "ownerUid", 120);
  const ownerEmail = cleanEmail(data.ownerEmail);
  const intakeId = String(data.intakeId || "").trim();
  const onboardingSessionId = String(data.onboardingSessionId || "").trim();
  const ticketId = String(data.ticketId || "").trim();
  const designRequestId = String(data.designRequestId || "").trim();
  const amount = Number(data.amount);
  
  if (!intakeId && !ticketId && !designRequestId) {
    throw new HttpsError("invalid-argument", "Payment must be associated with an intake, ticket, or design request.");
  }
  
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "Valid payment amount is required.");
  }

  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  if (!key || key === "mock_key") {
    console.error("Stripe checkout blocked: STRIPE_SECRET_KEY is not configured for production.");
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
        ...(intakeId && { intakeId }),
        ...(onboardingSessionId && { onboardingSessionId }),
        ...(ticketId && { ticketId }),
        ...(designRequestId && { designRequestId }),
      },
    });

    return { id: session.id, url: session.url };
  } catch (error: any) {
    console.error("Failed to create Stripe checkout session:", error);
    throw new HttpsError("internal", "Stripe checkout session creation failed.");
  }
});

export const stripeWebhook = onRequest({ cors: true, secrets: [stripeSecretKey] }, async (request, response) => {
  const sig = request.headers["stripe-signature"];
  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  
  if (!key || key === "mock_key") {
    response.status(400).send("Webhook setup error: Stripe secret key is unconfigured.");
    return;
  }

  const stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" as any });
  let event: Stripe.Event;

  try {
    event = stripeInstance.webhooks.constructEvent(
      request.rawBody,
      sig || "",
      process.env.STRIPE_WEBHOOK_SECRET || ""
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
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    if (ownerUid && intakeId) {
      const paymentRef = db.collection("payment_transactions").doc(intakeId);
      batch.set(paymentRef, {
        ownerUid,
        ownerId: ownerUid,
        intakeId,
        onboardingSessionId: onboardingSessionId || "",
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
      }, { merge: true });

      const intakeRef = db.collection("intake_submissions").doc(intakeId);
      batch.set(intakeRef, {
        paymentSubmitted: true,
        paymentSubmittedAt: timestamp,
        paymentMethod: "STRIPE",
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
        sessionId: onboardingSessionId || "",
        paymentMethod: "STRIPE",
        stripeSessionId: session.id,
        timestamp,
        createdAt: timestamp
      });

      await batch.commit();
      console.log(`Successfully processed Stripe payment for owner ${ownerUid}, intake ${intakeId}`);
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
