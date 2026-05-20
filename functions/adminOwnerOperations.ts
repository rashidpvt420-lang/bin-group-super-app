import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateContractPDF } from "./pdfEngine";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
const adminRoles = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);

async function assertAdmin(auth: any) {
  if (!auth) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = auth.token || {};
  const tokenRole = String(token.role || token.userRole || token.primaryRole || "").toLowerCase();
  if (token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true || adminRoles.has(tokenRole)) return;
  const userSnap = await db.collection("users").doc(auth.uid).get();
  const user = userSnap.data() || {};
  const userRole = String(user.role || user.userRole || user.primaryRole || "").toLowerCase();
  if (user.admin === true || user.isAdmin === true || user.superAdmin === true || user.super_admin === true || adminRoles.has(userRole)) return;
  throw new HttpsError("permission-denied", "Admin access required.");
}

function cleanId(value: unknown, fallback: string) {
  const safe = String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 180);
  return safe || fallback;
}

function text(value: unknown, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function money(value: number) {
  return `AED ${Number(value || 0).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
}

function getOwner(intake: any) {
  const pending = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  const account = pending.ownerAccount || intake.ownerAccount || {};
  const company = pending.companyProfile || intake.companyProfile || {};
  const contact = intake.contactInfo || {};
  return {
    name: text(intake.ownerName || contact.name || account.fullName || company.name || company.contactPerson, "Owner"),
    email: text(intake.ownerEmail || contact.email || account.email || company.email).toLowerCase(),
    mobile: text(intake.ownerMobile || contact.phone || account.mobile || company.phone || company.mobile)
  };
}

function getProperties(intake: any) {
  const pending = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  if (Array.isArray(intake.properties) && intake.properties.length) return intake.properties;
  if (Array.isArray(pending.properties) && pending.properties.length) return pending.properties;
  return [];
}

function getPricing(intake: any) {
  const pending = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  const pricing = intake.pricing || pending.pricing || {};
  const payment = intake.payment || pending.payment || {};
  const summary = intake.portfolioSummary || pending.portfolioSummary || {};
  const annual = numberValue(pricing.annualContractValue || summary.estimatedACV || payment.annualValue || intake.annualContractValue, 0);
  const mobilization = numberValue(payment.amount || pricing.mobilizationAmount || intake.mobilizationAmount, Math.round(annual * 0.15));
  return {
    annual,
    mobilization,
    method: text(payment.method || intake.paymentMethod || "MANUAL").toUpperCase(),
    currency: text(payment.currency || pricing.currency || "AED", "AED").toUpperCase()
  };
}

function getPlan(intake: any) {
  const pending = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  const plan = intake.selectedPlan || pending.selectedPlan || {};
  return {
    raw: plan,
    name: text(plan.name || plan.packageName || intake.portfolioSummary?.recommendedTier || pending.portfolioSummary?.recommendedTier, "Institutional Package"),
    type: text(plan.id || plan.type || intake.contractType || "hybrid", "hybrid")
  };
}

function getAddOns(intake: any) {
  const pending = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  if (Array.isArray(intake.selectedAddOns)) return intake.selectedAddOns;
  if (Array.isArray(pending.selectedAddOns)) return pending.selectedAddOns;
  return [];
}

function coords(source: any) {
  const lat = numberValue(source?.geo?.lat ?? source?.geo?.latitude ?? source?.location?.lat ?? source?.location?.latitude ?? source?.coordinates?.lat ?? source?.coordinates?.latitude ?? source?.lat ?? source?.latitude, NaN);
  const lng = numberValue(source?.geo?.lng ?? source?.geo?.longitude ?? source?.location?.lng ?? source?.location?.longitude ?? source?.coordinates?.lng ?? source?.coordinates?.longitude ?? source?.lng ?? source?.longitude, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function geohash(latitude: number, longitude: number, precision = 9) {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let hash = "";
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude >= mid) { idx = idx * 2 + 1; lonMin = mid; } else { idx *= 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx *= 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += base32.charAt(idx); bit = 0; idx = 0; }
  }
  return hash;
}

function propertyAddress(property: any) {
  return text(property?.propertyName || property?.addressLine || property?.address || property?.locationAddress || property?.name, "Property Node");
}

function propertyEmirate(property: any) {
  return text(property?.emirate || property?.city || property?.area, "UAE");
}

function activeProperty(raw: any, intakeId: string, ownerId: string, owner: ReturnType<typeof getOwner>, index: number, contractId: string) {
  const gps = coords(raw);
  const propertyId = cleanId(raw?.propertyId || raw?.id || `${intakeId}_property_${index + 1}`, `${intakeId}_property_${index + 1}`);
  const address = propertyAddress(raw);
  const emirate = propertyEmirate(raw);
  const geo = gps ? {
    lat: gps.lat,
    lng: gps.lng,
    point: new admin.firestore.GeoPoint(gps.lat, gps.lng),
    geohash: raw?.geo?.geohash || geohash(gps.lat, gps.lng),
    verified: true,
    dispatchReady: true,
    source: "admin_verified_owner_onboarding"
  } : null;
  return {
    ...raw,
    id: propertyId,
    propertyId,
    ownerId,
    ownerEmail: owner.email,
    ownerName: owner.name,
    contractId,
    propertyName: address,
    name: address,
    addressLine: raw?.addressLine || raw?.address || address,
    address: raw?.address || raw?.addressLine || address,
    emirate,
    city: raw?.city || raw?.area || emirate,
    area: raw?.area || raw?.city || emirate,
    geo,
    gps: gps || null,
    location: gps || raw?.location || null,
    coordinates: gps || raw?.coordinates || null,
    status: "ACTIVE",
    activationState: "ACTIVE",
    dispatchReady: Boolean(gps),
    verified: true,
    approved: true,
    source: "ADMIN_APPROVED_OWNER_ONBOARDING",
    updatedAt: serverTimestamp()
  };
}

function mapsLink(property: any) {
  const gps = coords(property);
  const query = gps ? `${gps.lat},${gps.lng}` : `${propertyAddress(property)} ${propertyEmirate(property)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function directionsLink(property: any) {
  const gps = coords(property);
  const destination = gps ? `${gps.lat},${gps.lng}` : `${propertyAddress(property)} ${propertyEmirate(property)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

function appBaseUrl() {
  return process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "https://bin-groups.com";
}

async function fetchIntake(intakeId: string) {
  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const snap = await intakeRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Owner submission not found.");
  return { intakeRef, intake: snap.data() || {} };
}

export const adminSendOwnerOnboardingMessage = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const intakeId = text(request.data?.intakeId);
  const subject = text(request.data?.subject, "BIN GROUP onboarding update");
  const body = text(request.data?.message, "Please contact BIN GROUP Admin to complete your onboarding verification.");
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  const { intake } = await fetchIntake(intakeId);
  const owner = getOwner(intake);
  const ownerId = cleanId(intake.ownerUid || intake.pendingOwnerId || intake.ownerRegistrationId || owner.email || intakeId, `owner_${intakeId}`);
  const batch = db.batch();
  batch.set(db.collection("messages").doc(), { intakeId, ownerId, ownerEmail: owner.email, ownerMobile: owner.mobile, fromRole: "admin", toRole: "owner", subject, body, status: "SENT", channel: "APP_AND_EMAIL", createdBy: request.auth?.uid || "admin", createdAt: serverTimestamp() });
  batch.set(db.collection("notifications").doc(), { userId: ownerId, toRole: "owner", type: "ADMIN_MESSAGE", title: subject, body, read: false, createdAt: serverTimestamp() });
  if (owner.email) batch.set(db.collection("mail").doc(), { to: owner.email, message: { subject, html: `<p>Dear ${owner.name},</p><p>${body}</p><p>BIN GROUP Admin Team</p>` }, metadata: { type: "admin_owner_message", intakeId, ownerId }, createdAt: serverTimestamp() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth?.uid || "admin", actorRole: "admin", action: "ADMIN_CONTACT_OWNER", targetType: "intake_submissions", targetId: intakeId, createdAt: serverTimestamp() });
  await batch.commit();
  return { status: "QUEUED", ownerId, ownerEmail: owner.email };
});

export const adminCreateOwnerPropertyInspection = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const intakeId = text(request.data?.intakeId);
  const propertyIndex = numberValue(request.data?.propertyIndex, 0);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  const { intake } = await fetchIntake(intakeId);
  const owner = getOwner(intake);
  const pricing = getPricing(intake);
  const property = getProperties(intake)[propertyIndex] || getProperties(intake)[0];
  if (!property) throw new HttpsError("failed-precondition", "No property found in owner submission.");
  const gps = coords(property);
  if (!gps) throw new HttpsError("failed-precondition", "Property GPS is required before creating a site inspection.");
  const ownerId = cleanId(intake.ownerUid || intake.pendingOwnerId || intake.ownerRegistrationId || owner.email || intakeId, `owner_${intakeId}`);
  const propertyId = cleanId(property.propertyId || property.id || `${intakeId}_property_${propertyIndex + 1}`, `${intakeId}_property_${propertyIndex + 1}`);
  const location = { lat: gps.lat, lng: gps.lng, point: new admin.firestore.GeoPoint(gps.lat, gps.lng), geohash: geohash(gps.lat, gps.lng), address: propertyAddress(property), emirate: propertyEmirate(property), mapUrl: mapsLink(property), directionsUrl: directionsLink(property) };
  const inspectionRef = db.collection("property_inspections").doc();
  const ticketRef = db.collection("maintenanceTickets").doc();
  const dispatchRef = db.collection("technician_dispatch_jobs").doc();
  const batch = db.batch();
  batch.set(inspectionRef, { id: inspectionRef.id, intakeId, ownerId, ownerName: owner.name, ownerEmail: owner.email, ownerMobile: owner.mobile, propertyId, propertyName: propertyAddress(property), location, status: "READY_FOR_SITE_VISIT", paymentCollectionRequired: true, paymentAmount: pricing.mobilization, checklist: ["Confirm owner identity", "Confirm property GPS", "Inspect property", "Collect or verify 15% payment", "Upload visit evidence", "Prepare contract signature"], createdBy: request.auth?.uid || "admin", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(ticketRef, { id: ticketRef.id, intakeId, inspectionId: inspectionRef.id, ownerId, propertyId, title: "Owner onboarding site inspection", description: "Verify property, collect/confirm 15% payment, and prepare contract signature.", category: "ONBOARDING_INSPECTION", status: "OPEN", priority: "HIGH", location, assignedTechnicianId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(dispatchRef, { id: dispatchRef.id, intakeId, inspectionId: inspectionRef.id, ticketId: ticketRef.id, ownerId, propertyId, jobType: "OWNER_ONBOARDING_SITE_INSPECTION", status: "PENDING_ASSIGNMENT", assignmentState: "UNASSIGNED_NEAREST_TECH_REQUIRED", location, paymentCollectionRequired: true, paymentAmount: pricing.mobilization, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth?.uid || "admin", actorRole: "admin", action: "CREATE_OWNER_ONBOARDING_SITE_INSPECTION", targetType: "property_inspections", targetId: inspectionRef.id, metadata: { ticketId: ticketRef.id, dispatchJobId: dispatchRef.id, intakeId, propertyId }, createdAt: serverTimestamp() });
  await batch.commit();
  return { status: "CREATED", inspectionId: inspectionRef.id, ticketId: ticketRef.id, dispatchJobId: dispatchRef.id, directionsUrl: location.directionsUrl };
});

export const approveOwnerSubmissionOperationalFlow = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const intakeId = text(request.data?.intakeId || request.data?.id);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  const { intakeRef, intake } = await fetchIntake(intakeId);
  const owner = getOwner(intake);
  if (!owner.email) throw new HttpsError("failed-precondition", "Owner email is missing.");
  const rawProperties = getProperties(intake);
  if (!rawProperties.length) throw new HttpsError("failed-precondition", "No property found in owner submission.");
  const pricing = getPricing(intake);
  const plan = getPlan(intake);
  const addOns = getAddOns(intake);
  const adminId = request.auth?.uid || "admin";
  const ownerId = cleanId(intake.ownerUid || intake.userId || intake.pendingOwnerId || intake.ownerRegistrationId || owner.email, `owner_${intakeId}`);
  const contractId = cleanId(intake.contractId || intake.pendingPaymentSubmission?.contractId || `${intakeId}_contract`, `${intakeId}_contract`);
  const paymentId = cleanId(intake.payment?.paymentId || `${intakeId}_mobilization`, `${intakeId}_mobilization`);
  const properties = rawProperties.map((property: any, index: number) => activeProperty(property, intakeId, ownerId, owner, index, contractId));
  const propertyIds = properties.map((property: any) => property.propertyId);
  const primaryProperty = properties[0];
  const signUrl = `${appBaseUrl()}/owner/contracts?contractId=${encodeURIComponent(contractId)}`;
  const batch = db.batch();
  batch.set(intakeRef, { status: "CONVERTED_TO_OWNER", adminReviewState: "APPROVED_PENDING_OWNER_SIGNATURE", activationState: "PENDING_OWNER_SIGNATURE", paymentStatus: "RECONCILED", paymentState: "PAYMENT_VERIFIED", paymentVerified: true, documentsVerified: true, locationVerified: true, ownerUid: ownerId, activeOwnerId: ownerId, activeContractId: contractId, activePropertyIds: propertyIds, contractDeliveryState: "SIGNATURE_REQUEST_EMAIL_QUEUED", approvedAt: serverTimestamp(), approvedBy: adminId, updatedAt: serverTimestamp() }, { merge: true });
  const ownerRecord = { uid: ownerId, ownerId, role: "owner", status: "PENDING_OWNER_SIGNATURE", dashboardUnlocked: true, dashboardLocked: false, paymentVerified: true, documentsVerified: true, locationVerified: true, displayName: owner.name, fullName: owner.name, name: owner.name, email: owner.email, phone: owner.mobile, mobile: owner.mobile, activeContractId: contractId, activePropertyIds: propertyIds, latestIntakeId: intakeId, onboardingStatus: "APPROVED_AWAITING_OWNER_SIGNATURE", updatedAt: serverTimestamp() };
  batch.set(db.collection("users").doc(ownerId), ownerRecord, { merge: true });
  batch.set(db.collection("owners").doc(ownerId), ownerRecord, { merge: true });
  properties.forEach((property: any) => {
    batch.set(db.collection("properties").doc(property.propertyId), { ...property, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    batch.set(db.collection("propertyPassports").doc(property.propertyId), { passportId: property.propertyId, propertyId: property.propertyId, ownerId, ownerName: owner.name, ownerEmail: owner.email, contractId, intakeId, address: property.addressLine, emirate: property.emirate, gps: property.geo ? { lat: property.geo.lat, lng: property.geo.lng, geohash: property.geo.geohash } : null, mapUrl: mapsLink(property), directionsUrl: directionsLink(property), dispatchReady: property.dispatchReady, status: "ACTIVE", tenantLocationInheritance: "TENANT_INHERITS_PROPERTY_LOCATION", paymentVerified: true, documentsVerified: true, locationVerified: true, annualContractValue: pricing.annual, mobilizationAmount: pricing.mobilization, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    batch.set(db.collection("tenant_location_policies").doc(property.propertyId), { propertyId: property.propertyId, ownerId, defaultLocation: property.geo ? { lat: property.geo.lat, lng: property.geo.lng, address: property.addressLine, emirate: property.emirate } : null, inheritanceMode: "TENANT_INHERITS_PROPERTY_LOCATION_UNLESS_UNIT_GPS_OVERRIDDEN", dispatchToTenantUsesPropertyGeo: true, updatedAt: serverTimestamp() }, { merge: true });
  });
  batch.set(db.collection("contracts").doc(contractId), { contractId, id: contractId, intakeId, ownerId, ownerName: owner.name, ownerEmail: owner.email, propertyId: primaryProperty?.propertyId || "", propertyIds, propertyName: primaryProperty?.propertyName || "Portfolio", properties, status: "PENDING_OWNER_SIGNATURE", contractStatus: "awaiting_owner_signature", activationStatus: "PENDING_OWNER_SIGNATURE", paymentVerified: true, paymentStatus: "RECONCILED", documentsVerified: true, locationVerified: true, approved: true, approvedAt: serverTimestamp(), approvedBy: adminId, packageName: plan.name, planType: plan.type, selectedPlan: plan.raw, selectedAddOns: addOns, annualValue: pricing.annual, annualContractValue: pricing.annual, depositAmount: pricing.mobilization, mobilizationAmount: pricing.mobilization, currency: pricing.currency, paymentSchedule: { mobilizationPercent: 15, mobilizationAmount: pricing.mobilization, remainingBalance: Math.max(pricing.annual - pricing.mobilization, 0), currency: pricing.currency }, signatureState: { ownerSigned: false, binGroupsApproved: true, binGroupsApprovedAt: new Date().toISOString(), pdfGenerated: false, emailed: true, signUrl }, emailDelivery: { signRequestQueued: true, signRequestQueuedAt: new Date().toISOString(), recipient: owner.email }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("contract_signing_requests").doc(contractId), { contractId, intakeId, ownerId, ownerEmail: owner.email, ownerName: owner.name, signUrl, status: "PENDING_OWNER_SIGNATURE", packageName: plan.name, annualContractValue: pricing.annual, mobilizationAmount: pricing.mobilization, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("payment_transactions").doc(paymentId), { paymentId, intakeId, ownerId, ownerEmail: owner.email, contractId, propertyId: primaryProperty?.propertyId || "", amount: pricing.mobilization, currency: pricing.currency, method: pricing.method, status: "VERIFIED", verificationState: "ADMIN_VERIFIED", verified: true, verifiedAt: serverTimestamp(), verifiedBy: adminId, unlocksDashboard: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("owner_dashboard_unlocks").doc(ownerId), { ownerId, intakeId, contractId, propertyIds, unlocked: true, unlockState: "PENDING_OWNER_SIGNATURE", unlockedAt: serverTimestamp(), unlockedBy: adminId, updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("notifications").doc(), { userId: ownerId, toRole: "owner", type: "CONTRACT_SIGNATURE_REQUIRED", title: "Contract ready for signature", body: "BIN GROUP verified your onboarding. Sign the contract to receive your final PDF.", url: `/owner/contracts?contractId=${contractId}`, read: false, createdAt: serverTimestamp() });
  batch.set(db.collection("mail").doc(), { to: owner.email, message: { subject: `BIN GROUP ${plan.name} contract ready for signature`, html: `<p>Dear ${owner.name},</p><p>Your selected <strong>${plan.name}</strong> contract is ready for signature.</p><p>Annual value: <strong>${money(pricing.annual)}</strong><br/>15% mobilization: <strong>${money(pricing.mobilization)}</strong></p><p><a href="${signUrl}">Open and sign contract</a></p><p>After signing, the final PDF will be generated and emailed to this registered address.</p>` }, metadata: { type: "owner_contract_signature_request", intakeId, ownerId, contractId, createdBy: adminId }, createdAt: serverTimestamp() });
  batch.set(db.collection("audit_logs").doc(), { actorId: adminId, actorRole: "admin", action: "APPROVE_OWNER_SUBMISSION_OPERATIONAL_FLOW", targetType: "intake_submissions", targetId: intakeId, metadata: { ownerId, ownerEmail: owner.email, contractId, propertyIds, paymentId }, createdAt: serverTimestamp() });
  await batch.commit();
  return { status: "APPROVED_PENDING_OWNER_SIGNATURE", ownerId, contractId, propertyIds, paymentId, signUrl };
});

export const ownerSignContractAndQueuePdf = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const contractId = text(request.data?.contractId);
  const signatureName = text(request.data?.signatureName || request.auth.token?.name || request.auth.token?.email, "Owner");
  if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");
  const ref = db.collection("contracts").doc(contractId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Contract not found.");
  const contract = snap.data() || {};
  const ownerId = text(contract.ownerId || contract.ownerUid);
  const ownerEmail = text(contract.ownerEmail || request.auth.token?.email).toLowerCase();
  const requesterEmail = text(request.auth.token?.email).toLowerCase();
  if (ownerId && ownerId !== request.auth.uid && ownerEmail !== requesterEmail) throw new HttpsError("permission-denied", "This contract belongs to another owner.");
  const pdfUrl = await generateContractPDF({ ...contract, contractId, ownerName: signatureName, ownerEmail, planName: contract.packageName, propertyName: contract.propertyName, annualValue: contract.annualContractValue || contract.annualValue, mobilizationAmount: contract.depositAmount || contract.mobilizationAmount || contract.paymentSchedule?.mobilizationAmount, signedAt: new Date().toISOString() });
  const batch = db.batch();
  batch.set(ref, { status: "ACTIVE", contractStatus: "signed_active", activationStatus: "ACTIVE", signatureState: { ...(contract.signatureState || {}), ownerSigned: true, ownerSignedAt: new Date().toISOString(), ownerSignatureName: signatureName, pdfGenerated: true, pdfUrl, emailed: true }, signedPdfUrl: pdfUrl, ownerSignedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("contract_signing_requests").doc(contractId), { status: "SIGNED_PDF_EMAILED", ownerSignedAt: serverTimestamp(), pdfUrl, updatedAt: serverTimestamp() }, { merge: true });
  if (ownerId) {
    batch.set(db.collection("owners").doc(ownerId), { status: "ACTIVE", activeContractId: contractId, signedPdfUrl: pdfUrl, updatedAt: serverTimestamp() }, { merge: true });
    batch.set(db.collection("users").doc(ownerId), { status: "ACTIVE", activeContractId: contractId, signedPdfUrl: pdfUrl, updatedAt: serverTimestamp() }, { merge: true });
  }
  batch.set(db.collection("mail").doc(), { to: ownerEmail, message: { subject: "BIN GROUP signed contract PDF", html: `<p>Dear ${signatureName},</p><p>Your signed BIN GROUP contract PDF is ready.</p><p><a href="${pdfUrl}">Download signed contract PDF</a></p>` }, metadata: { type: "owner_signed_contract_pdf", contractId, ownerId, pdfUrl }, createdAt: serverTimestamp() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth.uid, actorRole: "owner", action: "OWNER_SIGN_CONTRACT_AND_QUEUE_PDF", targetType: "contracts", targetId: contractId, metadata: { ownerId, ownerEmail, pdfUrl }, createdAt: serverTimestamp() });
  await batch.commit();
  return { status: "SIGNED_PDF_EMAILED", contractId, pdfUrl };
});

export const ownerInviteTenantToProperty = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const propertyId = text(request.data?.propertyId);
  const tenantEmail = text(request.data?.tenantEmail).toLowerCase();
  const tenantName = text(request.data?.tenantName, "Tenant");
  const unitNumber = text(request.data?.unitNumber, "Unit");
  if (!propertyId || !tenantEmail) throw new HttpsError("invalid-argument", "propertyId and tenantEmail are required.");
  const propertySnap = await db.collection("properties").doc(propertyId).get();
  if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
  const property = propertySnap.data() || {};
  const ownerId = text(property.ownerId);
  const requesterEmail = text(request.auth.token?.email).toLowerCase();
  if (ownerId !== request.auth.uid && text(property.ownerEmail).toLowerCase() !== requesterEmail) throw new HttpsError("permission-denied", "Only the property owner can invite tenants.");
  const tenantId = cleanId(`${propertyId}_${tenantEmail}_${unitNumber}`, `${propertyId}_tenant`);
  const gps = coords(property);
  const tenantLocation = gps ? { lat: gps.lat, lng: gps.lng, address: propertyAddress(property), emirate: propertyEmirate(property), inheritedFromPropertyId: propertyId } : null;
  const inviteUrl = `${appBaseUrl()}/tenant/invite?tenantId=${encodeURIComponent(tenantId)}&propertyId=${encodeURIComponent(propertyId)}`;
  const batch = db.batch();
  batch.set(db.collection("tenants").doc(tenantId), { tenantId, propertyId, ownerId, name: tenantName, email: tenantEmail, unitNumber, status: "INVITED", location: tenantLocation, locationSource: tenantLocation ? "PROPERTY_INHERITED" : "PENDING_PROPERTY_LOCATION", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("tenant_invites").doc(tenantId), { tenantId, propertyId, ownerId, tenantEmail, tenantName, unitNumber, status: "SENT", inviteUrl, locationInherited: Boolean(tenantLocation), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  batch.set(db.collection("mail").doc(), { to: tenantEmail, message: { subject: "BIN GROUP tenant access invitation", html: `<p>Dear ${tenantName},</p><p>You have been invited to BIN GROUP for ${propertyAddress(property)}, ${unitNumber}.</p><p><a href="${inviteUrl}">Open tenant invitation</a></p>` }, metadata: { type: "tenant_invitation", tenantId, propertyId, ownerId }, createdAt: serverTimestamp() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth.uid, actorRole: "owner", action: "OWNER_INVITE_TENANT_TO_PROPERTY", targetType: "tenants", targetId: tenantId, metadata: { propertyId, tenantEmail, unitNumber }, createdAt: serverTimestamp() });
  await batch.commit();
  return { status: "TENANT_INVITED", tenantId, inviteUrl, locationInherited: Boolean(tenantLocation) };
});
