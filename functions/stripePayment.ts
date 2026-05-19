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
  const intakeId = cleanText(data.intakeId, "intakeId", 120);
  const onboardingSessionId = cleanText(data.onboardingSessionId, "onboardingSessionId", 120);
  const amount = Number(data.amount);
  
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "Valid payment amount is required.");
  }

  const key = stripeSecretKey.value() || process.env.STRIPE_SECRET_KEY;
  if (!key || key === "mock_key") {
    console.warn("Stripe key is missing or mock; returning mock session URL.");
    return {
      id: "mock_session_id_" + Date.now(),
      url: `http://localhost:5173/payment-success?intakeId=${encodeURIComponent(intakeId)}&ownerUid=${encodeURIComponent(ownerUid)}`
    };
  }

  const stripeInstance = new Stripe(key, { apiVersion: "2023-10-16" as any });

  try {
    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "aed",
            product_data: {
              name: "BIN GROUP Property Onboarding Contract Payment",
              description: `Intake ID: ${intakeId}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://bin-group-57c60.web.app/payment-success?session_id={CHECKOUT_SESSION_ID}&intakeId=${encodeURIComponent(intakeId)}&ownerUid=${encodeURIComponent(ownerUid)}`,
      cancel_url: `https://bin-group-57c60.web.app/onboarding?intakeId=${encodeURIComponent(intakeId)}&payment_failed=true`,
      customer_email: ownerEmail,
      metadata: {
        ownerUid,
        intakeId,
        onboardingSessionId,
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
    const onboardingSessionId = metadata.onboardingSessionId;
    const amount = session.amount_total ? session.amount_total / 100 : 0;

    if (ownerUid && intakeId) {
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();

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
    }
  }

  response.status(200).json({ received: true });
});
