import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();
const BRANDED_FROM = "BIN GROUP <ceo@bin-groups.com>";
const BRANDED_REPLY_TO = "BIN GROUP Admin <ceo@bin-groups.com>";

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const safeId = (value: unknown, fallback: string) =>
  text(value)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180) || fallback;

function isCanonicalOwnerOnboarding(payment: FirebaseFirestore.DocumentData) {
  const recordType = upper(payment.recordType);
  const transactionType = upper(payment.transactionType);
  const paymentType = upper(payment.paymentType);
  const isRent =
    recordType === "OWNER_RENT_PAYMENT" ||
    recordType === "TENANT_RENT_PAYMENT_PROOF" ||
    transactionType === "RENT_COLLECTION" ||
    transactionType === "RENT_PAYMENT_PROOF" ||
    paymentType === "RENT_COLLECTION";

  return !isRent && Boolean(
    text(payment.ownerUid || payment.ownerId) &&
    text(payment.ownerEmail) &&
    text(payment.intakeId) &&
    text(payment.contractId) &&
    text(payment.quoteHash),
  );
}

function ownerPortalUrl(path: string) {
  const base = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "https://bin-group-57c60.web.app";
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function amountLabel(payment: FirebaseFirestore.DocumentData) {
  const amount = Number(payment.activationDeposit || payment.amount || payment.amountReceived || 0);
  return `AED ${Number.isFinite(amount) ? amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`;
}

function lifecycleMetadata(
  type: string,
  paymentId: string,
  payment: FirebaseFirestore.DocumentData,
  extra: Record<string, unknown> = {},
) {
  return {
    type,
    paymentId,
    intakeId: text(payment.intakeId),
    contractId: text(payment.contractId),
    ownerUid: text(payment.ownerUid || payment.ownerId),
    ownerEmail: text(payment.ownerEmail).toLowerCase(),
    quoteHash: text(payment.quoteHash).toLowerCase(),
    requiresProviderDeliveryProof: true,
    ...extra,
  };
}

async function queueSubmissionEmails(
  paymentId: string,
  payment: FirebaseFirestore.DocumentData,
  reason: "INITIAL_SUBMISSION" | "RESUBMISSION",
) {
  if (!isCanonicalOwnerOnboarding(payment)) return;

  const ownerEmail = text(payment.ownerEmail).toLowerCase();
  const ownerName = text(payment.signatureName || payment.companyProfile?.contactPerson || "Owner");
  const intakeId = text(payment.intakeId);
  const contractId = text(payment.contractId);
  const quoteHash = text(payment.quoteHash).toLowerCase();
  const quoteKey = safeId(quoteHash.slice(0, 16), "quote");
  const contractUrl = text(payment.contractUrl);
  const onboardingMailId = safeId(`owner_onboarding_${paymentId}_${quoteKey}`, `owner_onboarding_${paymentId}`);
  const contractMailId = safeId(`owner_contract_${paymentId}_${quoteKey}`, `owner_contract_${paymentId}`);
  const batch = db.batch();

  batch.set(db.collection("mail").doc(onboardingMailId), {
    to: [ownerEmail],
    message: {
      from: BRANDED_FROM,
      replyTo: BRANDED_REPLY_TO,
      subject: reason === "RESUBMISSION"
        ? "BIN GROUP Owner Onboarding Resubmitted for Verification"
        : "BIN GROUP Owner Onboarding Submitted",
      text: `${ownerName}, your owner onboarding package ${intakeId} was ${reason === "RESUBMISSION" ? "resubmitted" : "submitted"}. Amount awaiting verification: ${amountLabel(payment)}.`,
      html: `<p>Dear ${ownerName},</p>
<p><b>Your BIN GROUP owner onboarding package has been ${reason === "RESUBMISSION" ? "resubmitted" : "submitted"} for verification.</b></p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
<tr><td><b>Onboarding reference</b></td><td>${intakeId}</td></tr>
<tr><td><b>Contract reference</b></td><td>${contractId}</td></tr>
<tr><td><b>15% mobilization</b></td><td>${amountLabel(payment)}</td></tr>
<tr><td><b>Payment method</b></td><td>${text(payment.paymentMethod || payment.method)}</td></tr>
</table>
<p>BIN GROUP will verify the property documents, signed agreement and payment receipt. Your dashboard remains securely locked until approval.</p>
<p><a href="${ownerPortalUrl("/owner/activation")}">Track owner activation</a></p>
<p>BIN GROUP - Made in UAE 🇦🇪</p>`,
    },
    metadata: lifecycleMetadata("owner_onboarding_submission_delivery", paymentId, payment, { reason }),
    createdAt: ts(),
    updatedAt: ts(),
  }, { merge: true });

  if (contractUrl) {
    batch.set(db.collection("mail").doc(contractMailId), {
      to: [ownerEmail],
      message: {
        from: BRANDED_FROM,
        replyTo: BRANDED_REPLY_TO,
        subject: "BIN GROUP Signed Owner Contract",
        text: `${ownerName}, your signed BIN GROUP contract ${contractId} is available at ${contractUrl}`,
        html: `<p>Dear ${ownerName},</p>
<p><b>Your signed BIN GROUP owner contract is ready.</b></p>
<p>Contract reference: <b>${contractId}</b></p>
<p>Locked quote hash: <code>${quoteHash}</code></p>
<p><a href="${contractUrl}" style="background:#C6A75E;color:#000;padding:12px 18px;text-decoration:none;font-weight:bold;border-radius:8px">Open Signed Contract</a></p>
<p>This contract remains pending activation until the 15% mobilization payment is approved.</p>
<p>BIN GROUP - Made in UAE 🇦🇪</p>`,
      },
      metadata: lifecycleMetadata("owner_signed_contract_delivery", paymentId, payment, { reason, contractUrl }),
      createdAt: ts(),
      updatedAt: ts(),
    }, { merge: true });
  }

  batch.set(db.collection("audit_logs").doc(), {
    action: "OWNER_ONBOARDING_LIFECYCLE_EMAILS_QUEUED",
    actorId: "OWNER_ONBOARDING_EMAIL_TRIGGER",
    actorRole: "system",
    ownerUid: text(payment.ownerUid || payment.ownerId),
    ownerEmail,
    paymentId,
    intakeId,
    contractId,
    quoteHash,
    reason,
    onboardingMailId,
    contractMailId: contractUrl ? contractMailId : null,
    createdAt: ts(),
  });

  await batch.commit();
}

async function queueRejectionEmail(paymentId: string, payment: FirebaseFirestore.DocumentData) {
  if (!isCanonicalOwnerOnboarding(payment)) return;
  const ownerEmail = text(payment.ownerEmail).toLowerCase();
  const ownerName = text(payment.signatureName || payment.companyProfile?.contactPerson || "Owner");
  const quoteKey = safeId(text(payment.quoteHash).slice(0, 16), "quote");
  const mailId = safeId(`owner_payment_rejected_${paymentId}_${quoteKey}`, `owner_payment_rejected_${paymentId}`);
  const reason = text(payment.rejectionReason || "The submitted payment evidence requires correction.");

  await db.collection("mail").doc(mailId).set({
    to: [ownerEmail],
    message: {
      from: BRANDED_FROM,
      replyTo: BRANDED_REPLY_TO,
      subject: "BIN GROUP Payment Evidence Requires Resubmission",
      text: `${ownerName}, your owner onboarding payment evidence requires resubmission. Reason: ${reason}`,
      html: `<p>Dear ${ownerName},</p>
<p><b>Your owner onboarding remains locked because the payment evidence requires correction.</b></p>
<p>Reason: ${reason}</p>
<p>Upload a new receipt and submit a fresh server-authoritative quote package. The rejected evidence cannot unlock the dashboard.</p>
<p><a href="${ownerPortalUrl("/onboarding")}">Resume owner onboarding</a></p>
<p>BIN GROUP - Made in UAE 🇦🇪</p>`,
    },
    metadata: lifecycleMetadata("owner_payment_rejection_delivery", paymentId, payment, { rejectionReason: reason }),
    createdAt: ts(),
    updatedAt: ts(),
  }, { merge: true });
}

async function queueInvoiceEmail(paymentId: string, payment: FirebaseFirestore.DocumentData) {
  if (!isCanonicalOwnerOnboarding(payment)) return;
  const ownerEmail = text(payment.ownerEmail).toLowerCase();
  const ownerName = text(payment.signatureName || payment.companyProfile?.contactPerson || "Owner");
  const invoiceId = text(payment.invoiceId);
  const invoiceProofHash = text(payment.invoiceProofHash).toLowerCase();
  if (!invoiceId || !/^[a-f0-9]{64}$/.test(invoiceProofHash)) return;

  const mailId = safeId(`owner_invoice_${paymentId}_${invoiceId}`, `owner_invoice_${paymentId}`);
  await db.collection("mail").doc(mailId).set({
    to: [ownerEmail],
    message: {
      from: BRANDED_FROM,
      replyTo: BRANDED_REPLY_TO,
      subject: `BIN GROUP Mobilization Invoice ${invoiceId} - Dashboard Activated`,
      text: `${ownerName}, invoice ${invoiceId} for ${amountLabel(payment)} is paid and your owner dashboard is active. Proof hash: ${invoiceProofHash}`,
      html: `<p>Dear ${ownerName},</p>
<p><b>Your 15% mobilization payment has been approved and your owner dashboard is active.</b></p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
<tr><td><b>Invoice</b></td><td>${invoiceId}</td></tr>
<tr><td><b>Paid amount</b></td><td>${amountLabel(payment)}</td></tr>
<tr><td><b>Contract</b></td><td>${text(payment.contractId)}</td></tr>
<tr><td><b>Invoice proof hash</b></td><td><code>${invoiceProofHash}</code></td></tr>
</table>
<p><a href="${ownerPortalUrl("/owner/financials")}" style="background:#C6A75E;color:#000;padding:12px 18px;text-decoration:none;font-weight:bold;border-radius:8px">Open Owner Financials</a></p>
<p>BIN GROUP - Made in UAE 🇦🇪</p>`,
    },
    metadata: lifecycleMetadata("owner_mobilization_invoice_delivery", paymentId, payment, { invoiceId, invoiceProofHash }),
    createdAt: ts(),
    updatedAt: ts(),
  }, { merge: true });
}

export const onOwnerOnboardingPaymentCreatedEmails = onDocumentCreated(
  { document: "payment_transactions/{paymentId}", region: "europe-west3" },
  async (event) => {
    const payment = event.data?.data();
    if (!payment || upper(payment.status || payment.paymentStatus) !== "PENDING") return;
    await queueSubmissionEmails(event.params.paymentId, payment, "INITIAL_SUBMISSION");
  },
);

export const onOwnerOnboardingPaymentLifecycleUpdated = onDocumentUpdated(
  { document: "payment_transactions/{paymentId}", region: "europe-west3" },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (!isCanonicalOwnerOnboarding(after)) return;

    const beforeState = upper(before.status || before.paymentStatus);
    const afterState = upper(after.status || after.paymentStatus);
    const quoteChanged = text(before.quoteHash) !== text(after.quoteHash);

    if (afterState === "PENDING" && (beforeState !== "PENDING" || quoteChanged)) {
      await queueSubmissionEmails(event.params.paymentId, after, "RESUBMISSION");
    }
    if (afterState === "REJECTED" && beforeState !== "REJECTED") {
      await queueRejectionEmail(event.params.paymentId, after);
    }
    if (afterState === "APPROVED" && beforeState !== "APPROVED") {
      await queueInvoiceEmail(event.params.paymentId, after);
    }
  },
);
