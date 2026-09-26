import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type * as FirebaseFirestore from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

const SECURE = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;
const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager"]);
const HR_ROLES = new Set(["hr_admin", "hr_manager", "hr_staff"]);
const FINANCE_ROLES = new Set(["finance_admin", "finance_staff", "account_manager"]);
const OPS_ROLES = new Set(["operations_admin", "operations_manager", "dispatcher", "support_admin"]);

type VaultActor = {
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
  isHr: boolean;
  isFinance: boolean;
  isOps: boolean;
};

type VaultArtifact = {
  artifactId: string;
  sourceCollection: string;
  sourceId: string;
  category: string;
  title: string;
  status: string;
  propertyId: string | null;
  contractId: string | null;
  paymentId: string | null;
  storagePath: string | null;
  fileName: string | null;
  createdAt: unknown;
};

function roleOf(token: Record<string, any>) {
  return lower(token.role || token.userRole || token.primaryRole);
}

async function requireActor(auth: any): Promise<VaultActor> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const token = auth.token || {};
  if (token.suspended === true) throw new HttpsError("permission-denied", "Suspended account.");

  const user = await admin.auth().getUser(auth.uid);
  if (user.disabled || user.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "Inactive account.");
  }

  const role = roleOf(user.customClaims || token) || roleOf(token);
  const claimAdmin = token.admin === true || token.isAdmin === true || token.superAdmin === true ||
    token.super_admin === true || token.ceo === true || ADMIN_ROLES.has(role);

  return {
    uid: auth.uid,
    email: lower(user.email || token.email),
    role,
    isAdmin: claimAdmin,
    isHr: claimAdmin || HR_ROLES.has(role),
    isFinance: claimAdmin || FINANCE_ROLES.has(role),
    isOps: claimAdmin || OPS_ROLES.has(role),
  };
}

const SOURCE_CATEGORIES: Record<string, string> = {
  contracts: "contract",
  invoices: "invoice",
  owner_property_reports: "property_report",
  propertyInspections: "inspection_report",
  inspections: "inspection_report",
  tenantDocuments: "tenant_document",
  leases: "lease",
  documentLibrary: "property_document",
  brokerDocuments: "broker_compliance",
  staffDocuments: "staff_document",
  pdf_reports: "staff_report",
  staffLetters: "staff_letter",
  maintenanceTickets: "work_evidence",
};

const titleOf = (collection: string, id: string, data: any) => text(
  data.title || data.name || data.documentName || data.fileName || data.documentLabel ||
  data.letterType || data.type || data.docType || data.inspectionType ||
  data.invoiceNumber || data.contractNumber || data.periodKey || `${SOURCE_CATEGORIES[collection] || "document"} ${id}`
);

const storagePathOf = (data: any): string | null => {
  const direct = text(
    data.canonicalPdfStoragePath ||
    data.storagePath ||
    data.pdfStoragePath ||
    data.payslipStoragePath ||
    data.filePath ||
    data.receiptPath ||
    data.paymentProofPath ||
    data.evidencePath ||
    data.signatureState?.pdfStoragePath ||
    data.receiptEvidence?.storagePath ||
    data.paymentProofEvidence?.storagePath
  );
  return direct || null;
};

function toArtifact(collection: string, id: string, data: any): VaultArtifact {
  return {
    artifactId: `${collection}:${id}`,
    sourceCollection: collection,
    sourceId: id,
    category: SOURCE_CATEGORIES[collection] || "document",
    title: titleOf(collection, id, data),
    status: text(data.status || data.verificationStatus || data.ownerReviewStatus || "ACTIVE"),
    propertyId: text(data.propertyId) || null,
    contractId: text(data.contractId) || (collection === "contracts" ? id : null),
    paymentId: text(data.paymentId) || null,
    storagePath: storagePathOf(data),
    fileName: text(data.fileName || data.documentFileName) || null,
    createdAt: data.createdAt || data.updatedAt || data.uploadedAt || data.submittedAt || null,
  };
}

async function queryMany(collectionName: string, pairs: Array<[string, string]>, max = 80) {
  const found = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const [field, value] of pairs) {
    if (!value) continue;
    const snap = await db.collection(collectionName).where(field, "==", value).limit(max).get();
    snap.docs.forEach((doc) => found.set(doc.id, doc));
  }
  return [...found.values()];
}

async function propertyIdsForOwner(ownerId: string) {
  const snap = await db.collection("properties").where("ownerId", "==", ownerId).limit(200).get();
  const ids = new Set(snap.docs.map((doc) => doc.id));
  const legacy = await db.collection("properties").where("ownerUid", "==", ownerId).limit(200).get();
  legacy.docs.forEach((doc) => ids.add(doc.id));
  return ids;
}

async function ownerArtifacts(actor: VaultActor) {
  const ownerPairs: Array<[string, string]> = [
    ["ownerId", actor.uid], ["ownerUid", actor.uid], ["userId", actor.uid],
    ["ownerEmail", actor.email], ["recipientEmail", actor.email],
  ];
  const collections = ["contracts", "invoices", "owner_property_reports", "propertyInspections", "inspections"];

  const propertyIds = await propertyIdsForOwner(actor.uid);
  const library: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const propertyId of propertyIds) {
    const snap = await db.collection("documentLibrary").where("propertyId", "==", propertyId).limit(80).get();
    snap.docs.forEach((doc) => library.push(doc));
  }

  return [
    ...(
      await Promise.all(collections.map(async (name) =>
        (await queryMany(name, ownerPairs)).map((doc) => toArtifact(name, doc.id, doc.data()))
      ))
    ).flat(),
    ...library.map((doc) => toArtifact("documentLibrary", doc.id, doc.data())),
  ];
}

async function tenantArtifacts(actor: VaultActor) {
  const pairs: Array<[string, string]> = [
    ["tenantId", actor.uid], ["tenantUid", actor.uid], ["userId", actor.uid],
    ["tenantEmail", actor.email], ["recipientEmail", actor.email],
  ];
  const direct = (
    await Promise.all(["tenantDocuments", "leases", "propertyInspections", "inspections"].map(async (name) =>
      (await queryMany(name, pairs)).map((doc) => toArtifact(name, doc.id, doc.data()))
    ))
  ).flat();

  const profile = await db.collection("users").doc(actor.uid).get();
  const propertyId = text(profile.data()?.propertyId);
  if (propertyId) {
    const shared = await db.collection("documentLibrary").where("propertyId", "==", propertyId).limit(80).get();
    shared.docs.forEach((doc) => {
      const data = doc.data();
      const audience = lower(data.audience || "tenant");
      if (["tenant", "all"].includes(audience)) direct.push(toArtifact("documentLibrary", doc.id, data));
    });
  }
  return direct;
}

async function brokerArtifacts(actor: VaultActor) {
  return (await queryMany("brokerDocuments", [["brokerId", actor.uid]])).map((doc) =>
    toArtifact("brokerDocuments", doc.id, doc.data())
  );
}

async function staffArtifacts(actor: VaultActor) {
  const pairs: Array<[string, string]> = [
    ["uid", actor.uid], ["staffId", actor.uid], ["userId", actor.uid], ["technicianId", actor.uid],
  ];
  const collections = ["staffDocuments", "pdf_reports", "staffLetters"];
  const artifacts = (
    await Promise.all(collections.map(async (name) =>
      (await queryMany(name, pairs)).map((doc) => toArtifact(name, doc.id, doc.data()))
    ))
  ).flat();

  if (actor.role === "technician") {
    const tickets = await queryMany("maintenanceTickets", [
      ["assignedTechnicianId", actor.uid], ["technicianId", actor.uid],
      ["assignedTechId", actor.uid], ["technicianUid", actor.uid],
    ]);
    tickets.forEach((doc) => {
      const artifact = toArtifact("maintenanceTickets", doc.id, doc.data());
      if (artifact.storagePath) artifacts.push(artifact);
    });
  }
  return artifacts;
}

async function adminArtifacts(actor: VaultActor) {
  const collections = new Set<string>();
  if (actor.isOps) ["contracts", "owner_property_reports", "propertyInspections", "inspections", "tenantDocuments", "documentLibrary"].forEach((x) => collections.add(x));
  if (actor.isFinance) ["contracts", "invoices"].forEach((x) => collections.add(x));
  if (actor.isHr) ["staffDocuments", "pdf_reports", "staffLetters"].forEach((x) => collections.add(x));
  if (actor.isAdmin) ["brokerDocuments"].forEach((x) => collections.add(x));

  const artifacts: VaultArtifact[] = [];
  for (const name of collections) {
    const snap = await db.collection(name).limit(100).get();
    snap.docs.forEach((doc) => artifacts.push(toArtifact(name, doc.id, doc.data())));
  }
  return artifacts;
}

function dedupe(items: VaultArtifact[]) {
  const map = new Map<string, VaultArtifact>();
  items.forEach((item) => map.set(item.artifactId, item));
  return [...map.values()].sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt))).slice(0, 250);
}

export const listUnifiedDocumentVault = onCall(SECURE, async (request) => {
  const actor = await requireActor(request.auth);
  let artifacts: VaultArtifact[] = [];

  if (actor.isAdmin || actor.isHr || actor.isFinance || actor.isOps) {
    artifacts = await adminArtifacts(actor);
  } else if (actor.role === "owner") {
    artifacts = await ownerArtifacts(actor);
  } else if (actor.role === "tenant") {
    artifacts = await tenantArtifacts(actor);
  } else if (actor.role === "broker") {
    artifacts = await brokerArtifacts(actor);
  } else if (actor.role === "technician") {
    artifacts = await staffArtifacts(actor);
  } else {
    throw new HttpsError("permission-denied", "This role has no document vault.");
  }

  return {
    ok: true,
    role: actor.role,
    artifacts: dedupe(artifacts),
    linkage: "SOURCE_COLLECTION_AND_ID",
    looseUrlsPersisted: false,
  };
});

async function authorizeArtifact(actor: VaultActor, collectionName: string, sourceId: string) {
  const allowedSources = new Set(Object.keys(SOURCE_CATEGORIES));
  if (!allowedSources.has(collectionName)) throw new HttpsError("invalid-argument", "Unsupported document source.");

  const snap = await db.collection(collectionName).doc(sourceId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Document record not found.");
  const data = snap.data() || {};

  if (actor.isAdmin || actor.isHr || actor.isFinance || actor.isOps) {
    const allowed = new Set((await adminArtifacts(actor)).map((item) => item.artifactId));
    if (!allowed.has(`${collectionName}:${sourceId}`)) {
      throw new HttpsError("permission-denied", "Your admin role is not authorized for this document.");
    }
  } else {
    let own: VaultArtifact[] = [];
    if (actor.role === "owner") own = await ownerArtifacts(actor);
    if (actor.role === "tenant") own = await tenantArtifacts(actor);
    if (actor.role === "broker") own = await brokerArtifacts(actor);
    if (actor.role === "technician") own = await staffArtifacts(actor);
    if (!own.some((item) => item.artifactId === `${collectionName}:${sourceId}`)) {
      throw new HttpsError("permission-denied", "This document is not in your authorized vault.");
    }
  }

  return toArtifact(collectionName, sourceId, data);
}

export const getUnifiedDocumentFile = onCall(SECURE, async (request) => {
  const actor = await requireActor(request.auth);
  const artifactId = text(request.data?.artifactId);
  const split = artifactId.indexOf(":");
  if (split <= 0) throw new HttpsError("invalid-argument", "artifactId is required.");

  const collectionName = artifactId.slice(0, split);
  const sourceId = artifactId.slice(split + 1);
  const artifact = await authorizeArtifact(actor, collectionName, sourceId);
  if (!artifact.storagePath) throw new HttpsError("failed-precondition", "This document has no canonical Storage path.");

  const file = bucket.file(artifact.storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("not-found", "The linked document file is missing.");

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 5 * 60 * 1000,
  });

  await db.collection("audit_logs").add({
    actorId: actor.uid,
    actorRole: actor.role,
    action: "DOCUMENT_VAULT_FILE_ACCESSED",
    targetType: collectionName,
    targetId: sourceId,
    metadata: { artifactId, storagePath: artifact.storagePath },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    artifactId,
    sourceCollection: collectionName,
    sourceId,
    expiresInSeconds: 300,
    url,
  };
});
