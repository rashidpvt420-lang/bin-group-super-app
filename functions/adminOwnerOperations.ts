import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateContractPDF } from "./pdfEngine";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ts = () => admin.firestore.FieldValue.serverTimestamp();
const adminRoles = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);

const s = (v: any, fallback = "") => String(v ?? "").trim() || fallback;
const n = (v: any, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const id = (v: any, fallback: string) => s(v).replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 180) || fallback;
const money = (v: number) => `AED ${Number(v || 0).toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;

function clean(v: any): any {
  if (v === undefined || typeof v === "function") return null;
  if (v === null) return null;
  if (v instanceof admin.firestore.GeoPoint) return v;
  if (v instanceof admin.firestore.Timestamp) return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(clean);
  if (typeof v === "object") {
    const out: any = {};
    Object.entries(v).forEach(([k, e]) => { if (e !== undefined && typeof e !== "function") out[k] = clean(e); });
    return out;
  }
  return v;
}

async function assertAdmin(auth: any) {
  if (!auth) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const t = auth.token || {};
  const tr = s(t.role || t.userRole || t.primaryRole).toLowerCase();
  if (t.admin === true || t.isAdmin === true || t.superAdmin === true || t.super_admin === true || adminRoles.has(tr)) return;
  const snap = await db.collection("users").doc(auth.uid).get();
  const u = snap.data() || {};
  const ur = s(u.role || u.userRole || u.primaryRole).toLowerCase();
  if (u.admin === true || u.isAdmin === true || u.superAdmin === true || u.super_admin === true || adminRoles.has(ur)) return;
  throw new HttpsError("permission-denied", "Admin access required.");
}

function ownerOf(intake: any) {
  const p = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  const a = p.ownerAccount || intake.ownerAccount || {};
  const c = p.companyProfile || intake.companyProfile || {};
  const contact = intake.contactInfo || {};
  return {
    name: s(intake.ownerName || contact.name || a.fullName || a.name || c.name || c.contactPerson, "Owner"),
    email: s(intake.ownerEmail || contact.email || a.email || c.email).toLowerCase(),
    mobile: s(intake.ownerMobile || contact.phone || a.mobile || a.phone || c.phone || c.mobile)
  };
}

function propertiesOf(intake: any) {
  const p = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  return Array.isArray(intake.properties) && intake.properties.length ? intake.properties : Array.isArray(p.properties) ? p.properties : [];
}

function pricingOf(intake: any) {
  const p = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  const pricing = intake.pricing || p.pricing || {};
  const payment = intake.payment || p.payment || {};
  const summary = intake.portfolioSummary || p.portfolioSummary || {};
  const annual = n(pricing.annualContractValue || summary.estimatedACV || payment.annualValue || intake.annualContractValue, 0);
  return {
    annual,
    mobilization: n(payment.amount || pricing.mobilizationAmount || intake.mobilizationAmount, Math.round(annual * 0.15)),
    method: s(payment.method || intake.paymentMethod || "MANUAL").toUpperCase(),
    currency: s(payment.currency || pricing.currency || "AED", "AED").toUpperCase()
  };
}

function planOf(intake: any) {
  const p = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  const plan = intake.selectedPlan || p.selectedPlan || {};
  return {
    raw: clean(plan),
    name: s(plan.name || plan.packageName || intake.portfolioSummary?.recommendedTier || p.portfolioSummary?.recommendedTier, "Institutional Package"),
    type: s(plan.id || plan.type || intake.contractType || "hybrid", "hybrid")
  };
}

function addonsOf(intake: any) {
  const p = intake.pendingPaymentSubmission || intake.latestPaymentSubmission || {};
  return clean(Array.isArray(intake.selectedAddOns) ? intake.selectedAddOns : Array.isArray(p.selectedAddOns) ? p.selectedAddOns : []);
}

function gpsOf(x: any) {
  const lat = n(x?.geo?.lat ?? x?.geo?.latitude ?? x?.location?.lat ?? x?.location?.latitude ?? x?.coordinates?.lat ?? x?.coordinates?.latitude ?? x?.gps?.lat ?? x?.lat ?? x?.latitude, NaN);
  const lng = n(x?.geo?.lng ?? x?.geo?.longitude ?? x?.location?.lng ?? x?.location?.longitude ?? x?.coordinates?.lng ?? x?.coordinates?.longitude ?? x?.gps?.lng ?? x?.lng ?? x?.longitude, NaN);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

function geohash(lat: number, lng: number, precision = 9) {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0, bit = 0, even = true, hash = "";
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  while (hash.length < precision) {
    if (even) { const mid = (lonMin + lonMax) / 2; if (lng >= mid) { idx = idx * 2 + 1; lonMin = mid; } else { idx *= 2; lonMax = mid; } }
    else { const mid = (latMin + latMax) / 2; if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx *= 2; latMax = mid; } }
    even = !even;
    if (++bit === 5) { hash += base32.charAt(idx); bit = 0; idx = 0; }
  }
  return hash;
}

function addressOf(p: any) { return s(p?.propertyName || p?.addressLine || p?.address || p?.locationAddress || p?.name, "Property Node"); }
function emirateOf(p: any) { return s(p?.emirate || p?.city || p?.area, "UAE"); }
function appBaseUrl() { return process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "https://bin-groups.com"; }
function mapUrl(p: any) { const g = gpsOf(p); return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g ? `${g.lat},${g.lng}` : `${addressOf(p)} ${emirateOf(p)}`)}`; }
function dirUrl(p: any) { const g = gpsOf(p); return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(g ? `${g.lat},${g.lng}` : `${addressOf(p)} ${emirateOf(p)}`)}`; }

function canonicalEmail(v: any) {
  const email = s(v).toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const normalizedLocal = normalizedDomain === 'gmail.com' ? local.split('+')[0].replace(/\./g, '') : local;
  return `${normalizedLocal}@${normalizedDomain}`;
}

async function resolveOwnerRuntimeId(data: any, owner: any, intakeId: string) {
  const fallback = id(data.ownerUid || data.userId || data.pendingOwnerId || data.ownerRegistrationId || owner.email || intakeId, `owner_${intakeId}`);
  const email = s(owner.email).toLowerCase();
  const canonical = canonicalEmail(email);
  const exactCandidates = Array.from(new Set([email, canonical].filter(Boolean)));

  for (const candidate of exactCandidates) {
    const snap = await db.collection("users").where("email", "==", candidate).limit(1).get();
    if (!snap.empty) return snap.docs[0].id;
  }

  return fallback;
}

async function intakeById(intakeId: string) {
  const ref = db.collection("intake_submissions").doc(intakeId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Owner submission not found.");
  return { ref, data: snap.data() || {} };
}

function activeProperty(raw: any, intakeId: string, ownerId: string, owner: any, index: number, contractId: string) {
  const g = gpsOf(raw);
  const propertyId = id(raw?.propertyId || raw?.id || `${intakeId}_property_${index + 1}`, `${intakeId}_property_${index + 1}`);
  const address = addressOf(raw);
  const emirate = emirateOf(raw);
  return clean({
    id: propertyId,
    propertyId,
    ownerId,
    ownerEmail: owner.email,
    ownerName: owner.name,
    contractId,
    propertyName: address,
    name: address,
    addressLine: s(raw?.addressLine || raw?.address, address),
    address: s(raw?.address || raw?.addressLine, address),
    emirate,
    city: s(raw?.city || raw?.area, emirate),
    area: s(raw?.area || raw?.city, emirate),
    propertyType: s(raw?.propertyType || raw?.type || raw?.category),
    assetClass: s(raw?.assetClass || raw?.assetGrade || raw?.subType),
    units: n(raw?.units ?? raw?.numberOfUnits, 0),
    numberOfUnits: n(raw?.numberOfUnits ?? raw?.units, 0),
    areaSqFt: n(raw?.areaSqFt ?? raw?.sqft ?? raw?.sizeSqFt, 0),
    sqft: n(raw?.sqft ?? raw?.areaSqFt ?? raw?.sizeSqFt, 0),
    floors: n(raw?.floors, 0),
    lifts: n(raw?.lifts, 0),
    age: n(raw?.age ?? raw?.propertyAge, 0),
    propertyAge: n(raw?.propertyAge ?? raw?.age, 0),
    geo: g ? { lat: g.lat, lng: g.lng, point: new admin.firestore.GeoPoint(g.lat, g.lng), geohash: raw?.geo?.geohash || geohash(g.lat, g.lng), verified: true, dispatchReady: true, source: "admin_verified_owner_onboarding" } : null,
    gps: g,
    location: g || clean(raw?.location || null),
    coordinates: g || clean(raw?.coordinates || null),
    mapUrl: mapUrl(raw),
    directionsUrl: dirUrl(raw),
    status: "ACTIVE",
    activationState: "ACTIVE",
    dispatchReady: Boolean(g),
    verified: true,
    approved: true,
    source: "ADMIN_APPROVED_OWNER_ONBOARDING",
    activatedAtIso: new Date().toISOString()
  });
}

export const adminSendOwnerOnboardingMessage = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const intakeId = s(request.data?.intakeId);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  const { data } = await intakeById(intakeId);
  const owner = ownerOf(data);
  const ownerId = id(data.ownerUid || data.pendingOwnerId || data.ownerRegistrationId || owner.email || intakeId, `owner_${intakeId}`);
  const subject = s(request.data?.subject, "BIN GROUP onboarding update");
  const body = s(request.data?.message, "Please contact BIN GROUP Admin to complete your onboarding verification.");
  const batch = db.batch();
  batch.set(db.collection("messages").doc(), { intakeId, ownerId, ownerEmail: owner.email, ownerMobile: owner.mobile, fromRole: "admin", toRole: "owner", subject, body, status: "SENT", channel: "APP_AND_EMAIL", createdBy: request.auth?.uid || "admin", createdAt: ts() });
  batch.set(db.collection("notifications").doc(), { userId: ownerId, toRole: "owner", type: "ADMIN_MESSAGE", title: subject, body, read: false, createdAt: ts() });
  if (owner.email) batch.set(db.collection("mail").doc(), { to: owner.email, message: { subject, html: `<p>Dear ${owner.name},</p><p>${body}</p>` }, metadata: { type: "admin_owner_message", intakeId, ownerId }, createdAt: ts() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth?.uid || "admin", actorRole: "admin", action: "ADMIN_CONTACT_OWNER", targetType: "intake_submissions", targetId: intakeId, createdAt: ts() });
  await batch.commit();
  return { status: "QUEUED", ownerId, ownerEmail: owner.email };
});

export const adminCreateOwnerPropertyInspection = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const intakeId = s(request.data?.intakeId);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  const { data } = await intakeById(intakeId);
  const owner = ownerOf(data);
  const pricing = pricingOf(data);
  const propertyIndex = n(request.data?.propertyIndex, 0);
  const property = propertiesOf(data)[propertyIndex] || propertiesOf(data)[0];
  if (!property) throw new HttpsError("failed-precondition", "No property found in owner submission.");
  const g = gpsOf(property);
  if (!g) throw new HttpsError("failed-precondition", "Property GPS is required before creating a site inspection.");
  const ownerId = id(data.ownerUid || data.pendingOwnerId || data.ownerRegistrationId || owner.email || intakeId, `owner_${intakeId}`);
  const propertyId = id(property.propertyId || property.id || `${intakeId}_property_${propertyIndex + 1}`, `${intakeId}_property_${propertyIndex + 1}`);
  const location = { lat: g.lat, lng: g.lng, point: new admin.firestore.GeoPoint(g.lat, g.lng), geohash: geohash(g.lat, g.lng), address: addressOf(property), emirate: emirateOf(property), mapUrl: mapUrl(property), directionsUrl: dirUrl(property) };
  const inspectionRef = db.collection("property_inspections").doc();
  const ticketRef = db.collection("maintenanceTickets").doc();
  const dispatchRef = db.collection("technician_dispatch_jobs").doc();
  const batch = db.batch();
  batch.set(inspectionRef, { id: inspectionRef.id, intakeId, ownerId, ownerName: owner.name, ownerEmail: owner.email, ownerMobile: owner.mobile, propertyId, propertyName: addressOf(property), location, status: "READY_FOR_SITE_VISIT", paymentCollectionRequired: true, paymentAmount: pricing.mobilization, createdBy: request.auth?.uid || "admin", createdAt: ts(), updatedAt: ts() });
  batch.set(ticketRef, { id: ticketRef.id, intakeId, inspectionId: inspectionRef.id, ownerId, propertyId, title: "Owner onboarding site inspection", category: "ONBOARDING_INSPECTION", status: "OPEN", priority: "HIGH", location, assignedTechnicianId: null, createdAt: ts(), updatedAt: ts() });
  batch.set(dispatchRef, { id: dispatchRef.id, intakeId, inspectionId: inspectionRef.id, ticketId: ticketRef.id, ownerId, propertyId, jobType: "OWNER_ONBOARDING_SITE_INSPECTION", status: "PENDING_ASSIGNMENT", assignmentState: "UNASSIGNED_NEAREST_TECH_REQUIRED", location, paymentCollectionRequired: true, paymentAmount: pricing.mobilization, createdAt: ts(), updatedAt: ts() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth?.uid || "admin", actorRole: "admin", action: "CREATE_OWNER_ONBOARDING_SITE_INSPECTION", targetType: "property_inspections", targetId: inspectionRef.id, metadata: { ticketId: ticketRef.id, dispatchJobId: dispatchRef.id, intakeId, propertyId }, createdAt: ts() });
  await batch.commit();
  return { status: "CREATED", inspectionId: inspectionRef.id, ticketId: ticketRef.id, dispatchJobId: dispatchRef.id, directionsUrl: location.directionsUrl };
});

export const approveOwnerSubmissionOperationalFlow = onCall({ cors: true }, async (request) => {
  await assertAdmin(request.auth);
  const intakeId = s(request.data?.intakeId || request.data?.id);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  const { ref, data } = await intakeById(intakeId);
  const owner = ownerOf(data);
  if (!owner.email) throw new HttpsError("failed-precondition", "Owner email is missing.");
  const rawProps = propertiesOf(data);
  if (!rawProps.length) throw new HttpsError("failed-precondition", "No property found in owner submission.");
  const pricing = pricingOf(data);
  const plan = planOf(data);
  const addOns = addonsOf(data);
  const adminId = request.auth?.uid || "admin";
  const ownerId = await resolveOwnerRuntimeId(data, owner, intakeId);
  const contractId = id(data.contractId || data.pendingPaymentSubmission?.contractId || `${intakeId}_contract`, `${intakeId}_contract`);
  const paymentId = id(data.payment?.paymentId || `${intakeId}_mobilization`, `${intakeId}_mobilization`);
  const properties = rawProps.map((p: any, i: number) => activeProperty(p, intakeId, ownerId, owner, i, contractId));
  const propertyIds = properties.map((p: any) => p.propertyId);
  const primary = properties[0];
  const signUrl = `${appBaseUrl()}/owner/contracts?contractId=${encodeURIComponent(contractId)}`;
  const batch = db.batch();
  batch.set(ref, { status: "CONVERTED_TO_OWNER", adminReviewState: "APPROVED_PENDING_OWNER_SIGNATURE", activationState: "PENDING_OWNER_SIGNATURE", paymentStatus: "RECONCILED", paymentState: "PAYMENT_VERIFIED", paymentVerified: true, documentsVerified: true, locationVerified: true, ownerUid: ownerId, activeOwnerId: ownerId, activeContractId: contractId, activePropertyIds: propertyIds, contractDeliveryState: "SIGNATURE_REQUEST_EMAIL_QUEUED", approvedAt: ts(), approvedBy: adminId, updatedAt: ts() }, { merge: true });
  const ownerRecord = { uid: ownerId, ownerId, role: "owner", status: "PENDING_OWNER_SIGNATURE", dashboardUnlocked: false, dashboardLocked: true, paymentVerified: true, documentsVerified: true, locationVerified: true, displayName: owner.name, fullName: owner.name, name: owner.name, email: owner.email, phone: owner.mobile, mobile: owner.mobile, activeContractId: contractId, activePropertyIds: propertyIds, latestIntakeId: intakeId, onboardingStatus: "APPROVED_AWAITING_OWNER_SIGNATURE", updatedAt: ts() };
  batch.set(db.collection("users").doc(ownerId), ownerRecord, { merge: true });
  batch.set(db.collection("owners").doc(ownerId), ownerRecord, { merge: true });
  properties.forEach((p: any) => {
    batch.set(db.collection("properties").doc(p.propertyId), { ...p, createdAt: ts(), updatedAt: ts() }, { merge: true });
    batch.set(db.collection("propertyPassports").doc(p.propertyId), { passportId: p.propertyId, propertyId: p.propertyId, ownerId, ownerName: owner.name, ownerEmail: owner.email, contractId, intakeId, address: p.addressLine, emirate: p.emirate, gps: p.geo ? { lat: p.geo.lat, lng: p.geo.lng, geohash: p.geo.geohash } : null, mapUrl: mapUrl(p), directionsUrl: dirUrl(p), dispatchReady: p.dispatchReady, status: "ACTIVE", tenantLocationInheritance: "TENANT_INHERITS_PROPERTY_LOCATION", paymentVerified: true, documentsVerified: true, locationVerified: true, annualContractValue: pricing.annual, mobilizationAmount: pricing.mobilization, createdAt: ts(), updatedAt: ts() }, { merge: true });
    batch.set(db.collection("tenant_location_policies").doc(p.propertyId), { propertyId: p.propertyId, ownerId, defaultLocation: p.geo ? { lat: p.geo.lat, lng: p.geo.lng, address: p.addressLine, emirate: p.emirate } : null, inheritanceMode: "TENANT_INHERITS_PROPERTY_LOCATION_UNLESS_UNIT_GPS_OVERRIDDEN", dispatchToTenantUsesPropertyGeo: true, updatedAt: ts() }, { merge: true });
  });
  batch.set(db.collection("contracts").doc(contractId), { contractId, id: contractId, intakeId, ownerId, ownerName: owner.name, ownerEmail: owner.email, propertyId: primary.propertyId, propertyIds, propertyName: primary.propertyName || "Portfolio", properties, status: "PENDING_OWNER_SIGNATURE", contractStatus: "awaiting_owner_signature", activationStatus: "PENDING_OWNER_SIGNATURE", paymentVerified: true, paymentStatus: "RECONCILED", documentsVerified: true, locationVerified: true, approved: true, approvedAt: ts(), approvedBy: adminId, packageName: plan.name, planType: plan.type, selectedPlan: plan.raw || {}, selectedAddOns: addOns || [], annualValue: pricing.annual, annualContractValue: pricing.annual, depositAmount: pricing.mobilization, mobilizationAmount: pricing.mobilization, currency: pricing.currency, paymentSchedule: { mobilizationPercent: 15, mobilizationAmount: pricing.mobilization, remainingBalance: Math.max(pricing.annual - pricing.mobilization, 0), currency: pricing.currency }, signatureState: { ownerSigned: false, binGroupsApproved: true, binGroupsApprovedAt: new Date().toISOString(), pdfGenerated: false, emailed: true, signUrl }, emailDelivery: { signRequestQueued: true, signRequestQueuedAt: new Date().toISOString(), recipient: owner.email }, createdAt: ts(), updatedAt: ts() }, { merge: true });
  batch.set(db.collection("contract_signing_requests").doc(contractId), { contractId, intakeId, ownerId, ownerEmail: owner.email, ownerName: owner.name, signUrl, status: "PENDING_OWNER_SIGNATURE", packageName: plan.name, annualContractValue: pricing.annual, mobilizationAmount: pricing.mobilization, createdAt: ts(), updatedAt: ts() }, { merge: true });
  batch.set(db.collection("payment_transactions").doc(paymentId), { paymentId, intakeId, ownerId, ownerEmail: owner.email, contractId, propertyId: primary.propertyId, amount: pricing.mobilization, currency: pricing.currency, method: pricing.method, status: "VERIFIED", verificationState: "ADMIN_VERIFIED", verified: true, verifiedAt: ts(), verifiedBy: adminId, unlocksDashboard: true, createdAt: ts(), updatedAt: ts() }, { merge: true });
  batch.set(db.collection("owner_dashboard_unlocks").doc(ownerId), { ownerId, intakeId, contractId, propertyIds, unlocked: false, unlockState: "PENDING_OWNER_SIGNATURE", unlockedAt: ts(), unlockedBy: adminId, updatedAt: ts() }, { merge: true });
  batch.set(db.collection("notifications").doc(), { userId: ownerId, toRole: "owner", type: "CONTRACT_SIGNATURE_REQUIRED", title: "Contract ready for signature", body: "BIN GROUP verified your onboarding. Sign the contract to receive your final PDF.", url: `/owner/contracts?contractId=${contractId}`, read: false, createdAt: ts() });
  batch.set(db.collection("mail").doc(), { to: owner.email, message: { subject: `BIN GROUP ${plan.name} contract ready for signature`, html: `<p>Dear ${owner.name},</p><p>Your selected ${plan.name} contract is ready for signature.</p><p>Annual value: ${money(pricing.annual)}<br/>15% mobilization: ${money(pricing.mobilization)}</p><p><a href="${signUrl}">Open and sign contract</a></p>` }, metadata: { type: "owner_contract_signature_request", intakeId, ownerId, contractId, createdBy: adminId }, createdAt: ts() });
  batch.set(db.collection("audit_logs").doc(), { actorId: adminId, actorRole: "admin", action: "APPROVE_OWNER_SUBMISSION_OPERATIONAL_FLOW", targetType: "intake_submissions", targetId: intakeId, metadata: { ownerId, ownerEmail: owner.email, contractId, propertyIds, paymentId }, createdAt: ts() });
  try { await batch.commit(); }
  catch (e: any) { console.error("OWNER_PROVISIONING_COMMIT_FAILED", { intakeId, ownerId, contractId, propertyIds, message: e?.message, stack: e?.stack }); throw new HttpsError("internal", `Owner provisioning failed: ${e?.message || "Firestore commit failed"}`); }
  return { status: "APPROVED_PENDING_OWNER_SIGNATURE", ownerId, contractId, propertyIds, paymentId, signUrl };
});

export const ownerSignContractAndQueuePdf = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const contractId = s(request.data?.contractId);
  const signatureName = s(request.data?.signatureName || request.auth.token?.name || request.auth.token?.email, "Owner");
  if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");
  const ref = db.collection("contracts").doc(contractId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Contract not found.");
  const contract = snap.data() || {};
  const ownerId = s(contract.ownerId || contract.ownerUid);
  const ownerEmail = s(contract.ownerEmail || request.auth.token?.email).toLowerCase();
  const requesterEmail = s(request.auth.token?.email).toLowerCase();
  if (ownerId && ownerId !== request.auth.uid && ownerEmail !== requesterEmail) throw new HttpsError("permission-denied", "This contract belongs to another owner.");
  const pdfUrl = await generateContractPDF({ ...clean(contract), contractId, ownerName: signatureName, ownerEmail, planName: contract.packageName, propertyName: contract.propertyName, annualValue: contract.annualContractValue || contract.annualValue, mobilizationAmount: contract.depositAmount || contract.mobilizationAmount || contract.paymentSchedule?.mobilizationAmount, signedAt: new Date().toISOString() });
  const batch = db.batch();
  batch.set(ref, { status: "ACTIVE", contractStatus: "signed_active", activationStatus: "ACTIVE", signatureState: { ...(contract.signatureState || {}), ownerSigned: true, ownerSignedAt: new Date().toISOString(), ownerSignatureName: signatureName, pdfGenerated: true, pdfUrl, emailed: true }, signedPdfUrl: pdfUrl, ownerSignedAt: ts(), updatedAt: ts() }, { merge: true });
  batch.set(db.collection("contract_signing_requests").doc(contractId), { status: "SIGNED_PDF_EMAILED", ownerSignedAt: ts(), pdfUrl, updatedAt: ts() }, { merge: true });
  if (ownerId) { batch.set(db.collection("owners").doc(ownerId), { status: "ACTIVE", activeContractId: contractId, signedPdfUrl: pdfUrl, updatedAt: ts() }, { merge: true }); batch.set(db.collection("users").doc(ownerId), { status: "ACTIVE", activeContractId: contractId, signedPdfUrl: pdfUrl, updatedAt: ts() }, { merge: true }); }
  batch.set(db.collection("mail").doc(), { to: ownerEmail, message: { subject: "BIN GROUP signed contract PDF", html: `<p>Dear ${signatureName},</p><p>Your signed BIN GROUP contract PDF is ready.</p><p><a href="${pdfUrl}">Download signed contract PDF</a></p>` }, metadata: { type: "owner_signed_contract_pdf", contractId, ownerId, pdfUrl }, createdAt: ts() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth.uid, actorRole: "owner", action: "OWNER_SIGN_CONTRACT_AND_QUEUE_PDF", targetType: "contracts", targetId: contractId, metadata: { ownerId, ownerEmail, pdfUrl }, createdAt: ts() });
  await batch.commit();
  return { status: "SIGNED_PDF_EMAILED", contractId, pdfUrl };
});

export const ownerInviteTenantToProperty = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const propertyId = s(request.data?.propertyId);
  const tenantEmail = s(request.data?.tenantEmail).toLowerCase();
  const tenantName = s(request.data?.tenantName, "Tenant");
  const unitNumber = s(request.data?.unitNumber, "Unit");
  if (!propertyId || !tenantEmail) throw new HttpsError("invalid-argument", "propertyId and tenantEmail are required.");
  const propSnap = await db.collection("properties").doc(propertyId).get();
  if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
  const prop = propSnap.data() || {};
  const ownerId = s(prop.ownerId);
  const requesterEmail = s(request.auth.token?.email).toLowerCase();
  if (ownerId !== request.auth.uid && s(prop.ownerEmail).toLowerCase() !== requesterEmail) throw new HttpsError("permission-denied", "Only the property owner can invite tenants.");
  const tenantId = id(`${propertyId}_${tenantEmail}_${unitNumber}`, `${propertyId}_tenant`);
  const g = gpsOf(prop);
  const tenantLocation = g ? { lat: g.lat, lng: g.lng, address: addressOf(prop), emirate: emirateOf(prop), inheritedFromPropertyId: propertyId } : null;
  const inviteUrl = `${appBaseUrl()}/tenant/invite?tenantId=${encodeURIComponent(tenantId)}&propertyId=${encodeURIComponent(propertyId)}`;
  const batch = db.batch();
  batch.set(db.collection("tenants").doc(tenantId), { tenantId, propertyId, ownerId, name: tenantName, email: tenantEmail, unitNumber, status: "INVITED", location: tenantLocation, locationSource: tenantLocation ? "PROPERTY_INHERITED" : "PENDING_PROPERTY_LOCATION", createdAt: ts(), updatedAt: ts() }, { merge: true });
  batch.set(db.collection("tenant_invites").doc(tenantId), { tenantId, propertyId, ownerId, tenantEmail, tenantName, unitNumber, status: "SENT", inviteUrl, locationInherited: Boolean(tenantLocation), createdAt: ts(), updatedAt: ts() }, { merge: true });
  batch.set(db.collection("mail").doc(), { to: tenantEmail, message: { subject: "BIN GROUP tenant access invitation", html: `<p>Dear ${tenantName},</p><p>You have been invited to BIN GROUP for ${addressOf(prop)}, ${unitNumber}.</p><p><a href="${inviteUrl}">Open tenant invitation</a></p>` }, metadata: { type: "tenant_invitation", tenantId, propertyId, ownerId }, createdAt: ts() });
  batch.set(db.collection("audit_logs").doc(), { actorId: request.auth.uid, actorRole: "owner", action: "OWNER_INVITE_TENANT_TO_PROPERTY", targetType: "tenants", targetId: tenantId, metadata: { propertyId, tenantEmail, unitNumber }, createdAt: ts() });
  await batch.commit();
  return { status: "TENANT_INVITED", tenantId, inviteUrl, locationInherited: Boolean(tenantLocation) };
});
