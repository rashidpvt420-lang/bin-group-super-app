import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { OWNER_CONTRACT_TERM_MONTHS } from "./ownerContractTerm";

const MOBILIZATION_PERCENT = 15;
const DEFAULT_CURRENCY = "AED";
const BIN_GROUP_ADMIN_STAMP = "BIN GROUP APPROVED";
const LEGAL_EXCLUSION_EN = "Anything not expressly listed in the covered items is excluded and requires a separate written quotation and BIN GROUP admin approval before execution.";
const LEGAL_EXCLUSION_AR = "أي بند غير مذكور صراحة ضمن البنود المشمولة يعتبر مستثنى ويتطلب عرض سعر كتابي منفصل وموافقة إدارية من BIN GROUP قبل التنفيذ.";

type AnyRecord = Record<string, any>;

type ApprovalPatchResult = {
  contractPatch: AnyRecord;
  paymentPatch: AnyRecord;
  auditMetadata: AnyRecord;
  commercialSchedule: AnyRecord;
  [key: string]: any;
};

const scopeDefaults = {
  maintenance: {
    coveredItems: [
      "Corrective maintenance request handling",
      "Preventive maintenance scheduling",
      "Emergency triage according to approved SLA",
      "Before/after evidence where applicable",
      "Admin-supervised technician coordination",
    ],
    notCoveredItems: [
      "Property management, rent collection, or tenant leasing",
      "Major capital works without separate quotation",
      "Authority fines, permits, or government fees",
      "Materials, spare parts, and replacement assets unless expressly included",
    ],
  },
  propertyManagement: {
    coveredItems: [
      "Tenant coordination and owner reporting",
      "Rent/payment follow-up workflow",
      "Lease and document coordination support",
      "Move-in/move-out coordination where selected",
      "Owner dashboard governance records",
    ],
    notCoveredItems: [
      "Facility repairs and maintenance labour",
      "Materials, spare parts, and replacement assets",
      "Capital works or authority fees",
      "Emergency technical callouts unless separately approved",
    ],
  },
  hybrid: {
    coveredItems: [
      "Property management coordination",
      "Facility maintenance ticket handling",
      "Preventive maintenance planning",
      "Technician/contractor dispatch governance",
      "Tenant services, move-in, and move-out coordination where selected",
      "Owner dashboard and property passport records",
    ],
    notCoveredItems: [
      "Major capital works without separate quotation",
      "Authority fines, permits, or government fees",
      "Major material replacement not included in the package",
      "Owner-requested upgrades outside approved scope",
    ],
  },
};

function isFirestoreFieldValue(value: any): boolean {
  const ctorName = String(value?.constructor?.name || "");
  return Boolean(value && typeof value === "object" && (ctorName.includes("FieldValue") || typeof value.isEqual === "function"));
}

function cleanPlainValue(value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof admin.firestore.GeoPoint) return value;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof Date) return value;
  if (isFirestoreFieldValue(value)) return value;
  if (Array.isArray(value)) return value.map(cleanPlainValue);
  if (typeof value === "object") {
    const output: AnyRecord = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (typeof entry !== "function") output[key] = cleanPlainValue(entry);
    });
    return output;
  }
  return value;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (value && typeof value === "object" && !isFirestoreFieldValue(value)) return Object.values(value);
  return [];
}

function labelOf(value: any): string {
  if (typeof value === "string") return value;
  return firstText(value?.name, value?.title, value?.label, value?.packageName, value?.id);
}

function labelsOf(value: any): string[] {
  return asArray(value).map(labelOf).filter(Boolean);
}

function normalizeContractType(rawValue: unknown): string {
  const raw = firstText(rawValue).toLowerCase();
  if (raw.includes("maintenance +") || raw.includes("maintenance and property") || raw.includes("hybrid") || raw.includes("both") || raw.includes("pm + fm")) return "Maintenance + Property Management";
  if (raw.includes("property management only") || raw.includes("pm_only") || raw === "pm" || raw.includes("management")) return "Property Management Only";
  return "Maintenance Only";
}

function defaultsFor(contractType: string) {
  if (contractType === "Property Management Only") return scopeDefaults.propertyManagement;
  if (contractType === "Maintenance + Property Management") return scopeDefaults.hybrid;
  return scopeDefaults.maintenance;
}

function coerceTimestamp(value: any): admin.firestore.Timestamp {
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof Date) return admin.firestore.Timestamp.fromDate(value);
  if (typeof value?.toDate === "function") return admin.firestore.Timestamp.fromDate(value.toDate());
  return admin.firestore.Timestamp.now();
}

function normalizeInput(input: AnyRecord): AnyRecord {
  const contractData = input.contractData || input.contract || input;
  const payment = input.payment || input.paymentData || input;
  const intakeData = input.intakeData || input.intake || {};
  const annualContractValue = firstPositiveNumber(input.annualContractValue, contractData.annualContractValue, contractData.annualValue, contractData.quoteTotal, payment.annualContractValue);
  const mobilizationAmount = firstPositiveNumber(input.mobilizationAmount, input.amountReceived, input.amount, payment.mobilizationAmount, payment.amount, annualContractValue > 0 ? annualContractValue * 0.15 : 0);
  const amountReceived = firstPositiveNumber(input.amountReceived, input.amount, payment.amount, mobilizationAmount);
  const remainingBalance = Math.max(firstPositiveNumber(input.remainingBalance, annualContractValue - amountReceived), 0);
  const approvedAt = coerceTimestamp(input.approvedAt || input.approvedTimestamp);
  const now = input.now || FieldValue.serverTimestamp();
  return {
    requestData: input.requestData || input.request || {},
    payment,
    contractData,
    intakeData,
    amountReceived,
    annualContractValue,
    mobilizationAmount,
    remainingBalance,
    paymentPlan: firstText(input.paymentPlan, payment.paymentPlan, contractData.paymentPlan, "manual"),
    paymentReferenceId: firstText(input.paymentReferenceId, input.paymentId, payment.paymentReferenceId, payment.paymentId, payment.id, input.contractId, contractData.contractId),
    termFields: input.termFields || {},
    approvedAt,
    approvedAtIso: firstText(input.approvedAtIso, approvedAt.toDate().toISOString()),
    now,
    adminUid: firstText(input.adminUid, input.approvedBy, input.adminId, "admin"),
  };
}

function selectedPlanOf(contractData: AnyRecord, intakeData: AnyRecord, payment: AnyRecord): AnyRecord {
  return cleanPlainValue(contractData.commercialSchedule?.selectedPlan || contractData.selectedPlan || contractData.servicePlan || intakeData.selectedPlan || payment.selectedPlan || {
    id: firstText(contractData.planType, contractData.contractType, payment.planType, "institutional"),
    name: firstText(contractData.packageName, intakeData.servicePlan?.name, "Institutional Package"),
  });
}

function buildPropertyDetails(contractData: AnyRecord, intakeData: AnyRecord, payment: AnyRecord): AnyRecord[] {
  const properties = asArray(contractData.commercialSchedule?.propertyDetails || contractData.propertyDetails || contractData.properties || intakeData.propertyDetails || intakeData.properties || payment.propertyDetails);
  if (properties.length) {
    return properties.map((property, index) => cleanPlainValue({
      propertyName: firstText(property?.propertyName, property?.name, property?.title, property?.address, contractData.propertyName, `Property ${index + 1}`),
      propertyType: firstText(property?.propertyType, property?.type, contractData.propertyType, contractData.sector),
      emirate: firstText(property?.emirate, property?.geo?.emirate, contractData.emirate, "UAE"),
      city: firstText(property?.city, property?.geo?.city, property?.area, contractData.city),
      area: firstText(property?.area, property?.geo?.area, contractData.area),
      fullAddress: firstText(property?.fullAddress, property?.addressLine, property?.address, property?.geo?.address, contractData.address, contractData.location),
      unitCount: firstPositiveNumber(property?.unitCount, property?.units, property?.totalUnits, contractData.unitCount, contractData.totalUnits),
      floorCount: firstPositiveNumber(property?.floorCount, property?.floors, contractData.floorCount, contractData.floors),
      liftCount: firstPositiveNumber(property?.liftCount, property?.lifts, contractData.liftCount, contractData.lifts),
      gps: property?.gps || property?.geo || property?.location || property?.coordinates || null,
    }));
  }
  return [cleanPlainValue({
    propertyName: firstText(contractData.propertyName, payment.propertyName, "Portfolio"),
    propertyType: firstText(contractData.propertyType, contractData.sector, "Institutional Portfolio"),
    emirate: firstText(contractData.emirate, "UAE"),
    city: firstText(contractData.city, contractData.area),
    area: firstText(contractData.area),
    fullAddress: firstText(contractData.fullAddress, contractData.address, contractData.location),
    unitCount: firstPositiveNumber(contractData.unitCount, contractData.totalUnits),
    floorCount: firstPositiveNumber(contractData.floorCount, contractData.floors),
    liftCount: firstPositiveNumber(contractData.liftCount, contractData.lifts),
    gps: contractData.gps || contractData.geo || null,
  })];
}

export function buildOwnerCommercialApprovalPatch(rawInput: AnyRecord): ApprovalPatchResult {
  const input = normalizeInput(rawInput || {});
  const selectedPlan = selectedPlanOf(input.contractData, input.intakeData, input.payment);
  const selectedContractType = normalizeContractType(input.requestData.selectedContractType || input.contractData.commercialSchedule?.selectedContractType || input.contractData.selectedContractType || input.contractData.contractType || input.contractData.managementScope || input.contractData.planType || selectedPlan.type || selectedPlan.name || input.intakeData.contractType || input.intakeData.servicePlan?.id);
  const defaults = defaultsFor(selectedContractType);
  const selectedAddOns = cleanPlainValue(input.contractData.commercialSchedule?.selectedAddOns || input.contractData.selectedAddOns || input.contractData.addOns || input.intakeData.selectedAddOns || input.payment.selectedAddOns || []);
  const propertyDetails = buildPropertyDetails(input.contractData, input.intakeData, input.payment);
  const propertyLocation = cleanPlainValue(input.contractData.commercialSchedule?.propertyLocation || input.contractData.propertyLocation || input.contractData.geo || input.intakeData.propertyLocation || input.payment.propertyLocation || propertyDetails[0] || {});
  const coveredItems = labelsOf(input.requestData.coveredItems || input.contractData.commercialSchedule?.coveredItems || input.contractData.coveredItems || input.contractData.coverage || selectedPlan.features || selectedPlan.coverage || defaults.coveredItems);
  const notCoveredItems = labelsOf(input.requestData.notCoveredItems || input.contractData.commercialSchedule?.notCoveredItems || input.contractData.notCoveredItems || input.contractData.exclusions || selectedPlan.exclusions || defaults.notCoveredItems);
  const excludedItems = Array.from(new Set([...labelsOf(input.requestData.excludedItems || input.contractData.excludedItems || []), ...notCoveredItems, LEGAL_EXCLUSION_EN, LEGAL_EXCLUSION_AR]));
  const ownerSelectedAt = input.contractData.ownerSelectedAt || input.contractData.selectedAt || input.contractData.createdAt || input.termFields.effectiveFrom || input.approvedAt;
  const ownerSignedAt = input.contractData.ownerSignature?.signedAt || input.contractData.ownerSignedAt || input.contractData.signedAt || input.termFields.effectiveFrom || input.approvedAt;

  const ownerSelectedScopeSnapshot = cleanPlainValue(input.contractData.ownerSelectedScopeSnapshot || {
    selectedPlan,
    selectedContractType,
    selectedAddOns,
    propertyDetails,
    propertyLocation,
    annualContractValue: input.annualContractValue,
    mobilizationPercent: MOBILIZATION_PERCENT,
    mobilizationAmount: input.mobilizationAmount,
    paymentPlan: input.paymentPlan,
    ownerSelectedAt,
    ownerSignedAt,
    lockedAgainstOwnerMutation: true,
  });

  const commercialSchedule = cleanPlainValue({
    selectedPlan,
    selectedContractType,
    selectedAddOns,
    tenantServices: input.contractData.tenantServices || input.intakeData.tenantServices || input.payment.tenantServices || [],
    moveInServices: input.contractData.moveInServices || input.intakeData.moveInServices || input.payment.moveInServices || [],
    moveOutServices: input.contractData.moveOutServices || input.intakeData.moveOutServices || input.payment.moveOutServices || [],
    propertyDetails,
    propertyLocation,
    coveredItems,
    notCoveredItems,
    excludedItems,
    ownerSelectedScopeSnapshot,
    ownerSelectedAt,
    ownerSignedAt,
    firstMonthWindowEndsAt: input.termFields.firstMonthWindowEndsAt,
    effectiveFrom: input.termFields.effectiveFrom,
    effectiveTo: input.termFields.effectiveTo,
    contractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
    annualContractValue: input.annualContractValue,
    mobilizationPercent: MOBILIZATION_PERCENT,
    mobilizationAmount: input.mobilizationAmount,
    amountReceived: input.amountReceived,
    remainingBalance: input.remainingBalance,
    paymentPlan: input.paymentPlan,
    paymentReferenceId: input.paymentReferenceId,
    currency: DEFAULT_CURRENCY,
    legalExclusionClause: { en: LEGAL_EXCLUSION_EN, ar: LEGAL_EXCLUSION_AR },
    lockedAt: input.approvedAt,
    lockedBy: input.adminUid,
    commercialScheduleLocked: true,
    bilingualContract: true,
    contractLanguage: "EN_AR",
  });

  const paymentSchedule = cleanPlainValue({
    annualContractValue: input.annualContractValue,
    mobilizationPercent: MOBILIZATION_PERCENT,
    mobilizationAmount: input.mobilizationAmount,
    depositAmount: input.mobilizationAmount,
    amountReceived: input.amountReceived,
    remainingBalance: input.remainingBalance,
    paymentPlan: input.paymentPlan,
    paymentReferenceId: input.paymentReferenceId,
    currency: DEFAULT_CURRENCY,
    lockedAt: input.approvedAt,
    lockedBy: input.adminUid,
  });

  const paymentPatch = cleanPlainValue({
    status: "VERIFIED",
    verificationState: "VERIFIED_BY_ADMIN",
    paymentVerified: true,
    verified: true,
    verifiedAt: input.now,
    paymentVerifiedAt: input.now,
    paymentApprovedAt: input.now,
    adminApprovedAt: input.now,
    adminApprovedBy: input.adminUid,
    verifiedBy: input.adminUid,
    paymentReferenceId: input.paymentReferenceId,
    amountReceived: input.amountReceived,
    amount: input.amountReceived,
    currency: DEFAULT_CURRENCY,
    mobilizationPercent: MOBILIZATION_PERCENT,
    mobilizationAmount: input.mobilizationAmount,
    annualContractValue: input.annualContractValue,
    remainingBalance: input.remainingBalance,
    paymentPlan: input.paymentPlan,
    contractActivated: true,
    updatedAt: input.now,
  });

  const contractPatch = cleanPlainValue({
    annualContractValue: input.annualContractValue,
    mobilizationPercent: MOBILIZATION_PERCENT,
    mobilizationAmount: input.mobilizationAmount,
    depositAmount: input.mobilizationAmount,
    amount: input.amountReceived,
    currency: DEFAULT_CURRENCY,
    remainingBalance: input.remainingBalance,
    paymentPlan: input.paymentPlan,
    paymentReferenceId: input.paymentReferenceId,
    amountReceived: input.amountReceived,
    paymentVerified: true,
    paymentVerifiedAt: input.now,
    paymentApprovedAt: input.now,
    adminApprovedAt: input.now,
    adminApprovedBy: input.adminUid,
    adminStamp: BIN_GROUP_ADMIN_STAMP,
    commercialScheduleLocked: true,
    bilingualContract: true,
    contractLanguage: "EN_AR",
    commercialSchedule,
    paymentSchedule,
    status: "ACTIVE",
    contractStatus: "active",
    activationStatus: "ACTIVE",
    activatedAt: input.now,
    approvedAt: input.now,
    amountScopeLocked: true,
    ownerScopeLocked: true,
    addOnsLocked: true,
    contractTypeLocked: true,
    ...input.termFields,
    binGroupsApproved: true,
    binGroupsApprovedAt: input.now,
    binGroupStamp: {
      stamped: true,
      stampedAt: input.approvedAt,
      stampedAtIso: input.approvedAtIso,
      stampedBy: input.adminUid,
      label: "BIN GROUP ADMIN APPROVED / DIGITAL STAMP",
    },
    signatureState: {
      ...(input.contractData.signatureState || {}),
      ownerSigned: input.contractData.ownerSigned === true || input.contractData.signatureStatus === "OWNER_SIGNED",
      binGroupsSigned: true,
      pdfGenerated: input.contractData.signatureState?.pdfGenerated === true,
      emailed: input.contractData.signatureState?.emailed === true,
    },
    updatedAt: input.now,
  });

  const auditMetadata = cleanPlainValue({
    amountReceived: input.amountReceived,
    annualContractValue: input.annualContractValue,
    mobilizationAmount: input.mobilizationAmount,
    remainingBalance: input.remainingBalance,
    paymentReferenceId: input.paymentReferenceId,
    commercialScheduleLocked: true,
    bilingualContract: true,
    contractLanguage: "EN_AR",
    contractTermMonths: OWNER_CONTRACT_TERM_MONTHS,
  });

  return { ...contractPatch, contractPatch, paymentPatch, auditMetadata, commercialSchedule };
}
