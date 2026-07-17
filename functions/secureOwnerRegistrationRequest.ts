import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  previewOwnerOnboardingQuote,
  previewOwnerOnboardingQuoteHandler,
  submitOwnerOnboardingPaymentPackageHandler,
  submitPendingOwnerRegistration,
} from "./ownerRegistrationRequest";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";
import { assertOwnerPortfolioQuoteRecord } from "./ownerPortfolioQuote";

const SUPPORTED_METHODS = new Set(["STRIPE", "BANK_TRANSFER", "CHEQUE", "CASH"]);
const MANUAL_METHODS = new Set(["BANK_TRANSFER", "CHEQUE", "CASH"]);
const PAYMENT_PLANS = new Set(["annual", "quarterly", "monthly"]);

type ContractMode = "FM_ONLY" | "PM_ONLY" | "BOTH";
type UnknownRecord = Record<string, unknown>;

const CONTRACT_MODE_NAMES = new Map<ContractMode, string>([
  ["FM_ONLY", "MAINTENANCE ONLY"],
  ["PM_ONLY", "PROPERTY MANAGEMENT"],
  ["BOTH", "TOTAL CARE HYBRID"],
]);

const text = (value: unknown) => String(value || "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const compactUpper = (value: unknown) => upper(value).replace(/\s+/g, "");
const money = (value: unknown) => Math.round(Number(value) * 100) / 100;
const record = (value: unknown): UnknownRecord => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
);
const boundedText = (value: unknown, maxLength: number) => text(value).slice(0, maxLength);
const finiteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown) => value === true;
const stringList = (value: unknown, limit = 50) => (
  Array.isArray(value)
    ? value.map((entry) => boundedText(entry, 120)).filter(Boolean).slice(0, limit)
    : []
);

function canonicalGeo(value: unknown) {
  const geo = record(value);
  const point = record(geo.point);
  return {
    point: {
      latitude: finiteNumber(point.latitude),
      longitude: finiteNumber(point.longitude),
    },
    lat: finiteNumber(geo.lat),
    lng: finiteNumber(geo.lng),
    geohash: boundedText(geo.geohash, 32),
    source: boundedText(geo.source, 80),
    placeId: boundedText(geo.placeId, 160),
    address: boundedText(geo.address, 500),
    emirate: boundedText(geo.emirate, 80),
    city: boundedText(geo.city, 120),
    area: boundedText(geo.area, 160),
    verified: bool(geo.verified),
    dispatchReady: bool(geo.dispatchReady),
    requiresGeoReview: bool(geo.requiresGeoReview),
    verifiedAt: boundedText(geo.verifiedAt, 80),
    updatedAt: boundedText(geo.updatedAt, 80),
  };
}

function canonicalMosqueProfile(value: unknown) {
  const profile = record(value);
  return {
    grossFloorAreaSqft: finiteNumber(profile.grossFloorAreaSqft),
    maxWorshipperCapacity: finiteNumber(profile.maxWorshipperCapacity),
    propertyAgeYears: finiteNumber(profile.propertyAgeYears),
    cctvInstalled: bool(profile.cctvInstalled),
    cctvCameraCount: finiteNumber(profile.cctvCameraCount),
  };
}

function canonicalProperty(value: unknown, index: number) {
  const property = record(value);
  const rawId = boundedText(property.id, 160);
  const id = /^[A-Za-z0-9_-]{1,160}$/.test(rawId) ? rawId : `property_${index + 1}`;
  return {
    id,
    emirate: boundedText(property.emirate, 80),
    area: boundedText(property.area, 160),
    zone: boundedText(property.zone, 10),
    propertyType: boundedText(property.propertyType, 120),
    subType: boundedText(property.subType, 120),
    useType: boundedText(property.useType, 80),
    ownerType: boundedText(property.ownerType, 80),
    floors: finiteNumber(property.floors),
    units: finiteNumber(property.units),
    bedrooms: finiteNumber(property.bedrooms),
    bathrooms: finiteNumber(property.bathrooms),
    shops: finiteNumber(property.shops),
    offices: finiteNumber(property.offices),
    rooms: finiteNumber(property.rooms),
    sqft: finiteNumber(property.sqft),
    age: finiteNumber(property.age),
    annualRent: finiteNumber(property.annualRent),
    annualRevenue: finiteNumber(property.annualRevenue),
    pool: bool(property.pool),
    lifts: finiteNumber(property.lifts),
    tank: bool(property.tank),
    bmu: bool(property.bmu),
    sira: bool(property.sira),
    fireAlarm: bool(property.fireAlarm),
    firePump: bool(property.firePump),
    escalators: bool(property.escalators),
    centralLPG: bool(property.centralLPG),
    wasteMan: bool(property.wasteMan),
    gen: bool(property.gen),
    hvac: bool(property.hvac),
    hvacCount: finiteNumber(property.hvacCount),
    districtCooling: bool(property.districtCooling),
    electrical: bool(property.electrical),
    plumbing: bool(property.plumbing),
    drainage: bool(property.drainage),
    pumps: bool(property.pumps),
    emergencyLighting: bool(property.emergencyLighting),
    accessControl: bool(property.accessControl),
    bms: bool(property.bms),
    iotSensors: bool(property.iotSensors),
    gym: bool(property.gym),
    majlis: bool(property.majlis),
    majlisType: boundedText(property.majlisType, 80),
    missions: stringList(property.missions),
    condition: boundedText(property.condition, 40),
    assetGrade: boundedText(property.assetGrade, 40),
    assetClass: boundedText(property.assetClass, 80),
    serviceModel: boundedText(property.serviceModel, 80),
    currentStatus: boundedText(property.currentStatus, 80),
    address: boundedText(property.address, 500),
    strategy: boundedText(property.strategy, 40).toLowerCase(),
    slaTier: boundedText(property.slaTier, 40).toLowerCase(),
    paymentPlan: boundedText(property.paymentPlan || "annual", 40).toLowerCase(),
    titleDeedStatus: boundedText(property.titleDeedStatus, 80),
    geo: canonicalGeo(property.geo),
    mosqueProfile: canonicalMosqueProfile(property.mosqueProfile),
  };
}

function canonicalPaymentManifest(value: unknown) {
  const manifest = record(value);
  return {
    method: boundedText(manifest.method, 60),
    amount: finiteNumber(manifest.amount),
    activationDeposit: finiteNumber(manifest.activationDeposit),
    annualContractValue: finiteNumber(manifest.annualContractValue),
    currency: boundedText(manifest.currency, 10),
    configVersion: boundedText(manifest.configVersion, 160),
    paymentConfigVersion: boundedText(manifest.paymentConfigVersion, 160),
    configHash: boundedText(manifest.configHash, 128),
    paymentConfigHash: boundedText(manifest.paymentConfigHash, 128),
    configEffectiveAtMs: finiteNumber(manifest.configEffectiveAtMs),
    legalBeneficiary: boundedText(manifest.legalBeneficiary, 200),
    payableTo: boundedText(manifest.payableTo, 200),
    bankName: boundedText(manifest.bankName, 160),
    accountNumber: boundedText(manifest.accountNumber, 100),
    iban: boundedText(manifest.iban, 100),
    swiftBic: boundedText(manifest.swiftBic, 40),
    officeLocation: boundedText(manifest.officeLocation, 500),
    paymentPlan: boundedText(manifest.paymentPlan, 40).toLowerCase(),
    reference: boundedText(manifest.reference, 160),
    receiptUrl: boundedText(manifest.receiptUrl, 2000),
    receiptPath: boundedText(manifest.receiptPath, 1000),
    receiptName: boundedText(manifest.receiptName, 240),
    receiptHash: boundedText(manifest.receiptHash, 128).toLowerCase(),
    receiptGeneration: boundedText(manifest.receiptGeneration, 160),
  };
}

function canonicalCompanyProfile(value: unknown) {
  const profile = record(value);
  return {
    name: boundedText(profile.name, 200),
    licenseNumber: boundedText(profile.licenseNumber, 160),
    contactPerson: boundedText(profile.contactPerson, 160),
    email: boundedText(profile.email, 200).toLowerCase(),
    phone: boundedText(profile.phone, 60),
  };
}

function canonicalDocumentUrls(value: unknown) {
  const urls = record(value);
  return {
    propertyProof: boundedText(urls.propertyProof, 2000),
    emiratesId: boundedText(urls.emiratesId, 2000),
    passport: boundedText(urls.passport, 2000),
    tradeLicense: boundedText(urls.tradeLicense, 2000),
    tenancySupport: boundedText(urls.tenancySupport, 2000),
  };
}

function contractModeForProperty(property: UnknownRecord): ContractMode {
  const strategy = text(property.strategy).toLowerCase();
  if (["pm_only", "rent"].includes(strategy)) return "PM_ONLY";
  if (["fm_only", "fm"].includes(strategy)) return "FM_ONLY";
  if (["both", "hybrid", "combined"].includes(strategy)) return "BOTH";
  throw new HttpsError("invalid-argument", "Every property must use maintenance, property management, or hybrid service mode.");
}

function assertCanonicalCommercialTerms(rawData: unknown) {
  const data = record(rawData);
  const rawProperties = Array.isArray(data.properties) ? data.properties : [];
  if (!rawProperties.length || rawProperties.length > 100) {
    throw new HttpsError("invalid-argument", "One to 100 properties are required for the contract package.");
  }
  const properties = rawProperties.map((property, index) => canonicalProperty(property, index));
  const propertyRecords = properties.map((property) => property as UnknownRecord);
  const resolvedModes = propertyRecords.map((property) => contractModeForProperty(property));
  const contractMode = resolvedModes[0];
  if (!contractMode || resolvedModes.some((mode) => mode !== contractMode)) {
    throw new HttpsError("failed-precondition", "A single contract cannot mix maintenance, property-management, and hybrid service modes.");
  }

  const canonicalPlanName = CONTRACT_MODE_NAMES.get(contractMode);
  if (!canonicalPlanName) {
    throw new HttpsError("failed-precondition", "The contract service mode could not be resolved.");
  }
  const serviceDetails = record(data.serviceDetails);
  const submittedPlanName = upper(serviceDetails.selectedPlan);
  if (submittedPlanName !== canonicalPlanName) {
    throw new HttpsError("failed-precondition", "The selected contract plan does not match the server-priced property strategy.");
  }

  const paymentPlans = propertyRecords.map((property) => text(property.paymentPlan || "annual").toLowerCase());
  if (paymentPlans.some((plan) => !PAYMENT_PLANS.has(plan))) {
    throw new HttpsError("invalid-argument", "Payment plan must be annual, quarterly, or monthly.");
  }
  const paymentPlan = paymentPlans[0];
  if (!paymentPlan || paymentPlans.some((plan) => plan !== paymentPlan)) {
    throw new HttpsError("failed-precondition", "All properties in one contract must use the same payment plan.");
  }

  const manifest = canonicalPaymentManifest(data.paymentManifest);
  const submittedCadences = [
    data.paymentPlan,
    serviceDetails.paymentPlan,
    manifest.paymentPlan,
  ].map((value) => text(value).toLowerCase()).filter(Boolean);
  if (submittedCadences.some((plan) => !PAYMENT_PLANS.has(plan) || plan !== paymentPlan)) {
    throw new HttpsError("failed-precondition", "The submitted payment cadence does not match the server-priced property cadence.");
  }

  const totalUnits = propertyRecords.reduce((total, property) => {
    const units = finiteNumber(property.units || property.bedrooms || 0);
    return total + (units > 0 ? units : 0);
  }, 0);
  const selectedAddOns = stringList(serviceDetails.selectedAddOns);

  return {
    data: {
      ownerUid: boundedText(data.ownerUid, 120),
      ownerEmail: boundedText(data.ownerEmail, 200).toLowerCase(),
      intakeId: boundedText(data.intakeId, 120),
      onboardingSessionId: boundedText(data.onboardingSessionId, 160),
      paymentMethod: boundedText(data.paymentMethod, 60).toUpperCase(),
      amount: finiteNumber(data.amount),
      activationDeposit: finiteNumber(data.activationDeposit),
      annualContractValue: finiteNumber(data.annualContractValue),
      quoteId: boundedText(data.quoteId, 180),
      quoteHash: boundedText(data.quoteHash, 128).toLowerCase(),
      quoteInputHash: boundedText(data.quoteInputHash, 128).toLowerCase(),
      inputHash: boundedText(data.inputHash, 128).toLowerCase(),
      quoteQuotedAtMs: finiteNumber(data.quoteQuotedAtMs),
      paymentConfigVersion: boundedText(data.paymentConfigVersion, 160),
      paymentConfigurationVersion: boundedText(data.paymentConfigurationVersion, 160),
      paymentConfigHash: boundedText(data.paymentConfigHash, 128).toLowerCase(),
      paymentConfigurationHash: boundedText(data.paymentConfigurationHash, 128).toLowerCase(),
      paymentManifest: manifest,
      companyProfile: canonicalCompanyProfile(data.companyProfile),
      serviceDetails: {
        properties: properties.length,
        totalUnits,
        selectedPlan: canonicalPlanName,
        selectedAddOns,
        contractMode,
        paymentPlan,
      },
      properties,
      signatureName: boundedText(data.signatureName, 120),
      otpVerificationId: boundedText(data.otpVerificationId, 180),
      documentUrls: canonicalDocumentUrls(data.documentUrls),
      paymentPlan,
    },
    contractMode,
    canonicalPlanName,
    paymentPlan,
    propertyCount: properties.length,
    totalUnits,
  };
}

async function assertCurrentPaymentConfiguration(data: ReturnType<typeof assertCanonicalCommercialTerms>["data"]) {
  const method = upper(data.paymentMethod || data.paymentManifest.method);
  if (!SUPPORTED_METHODS.has(method)) throw new HttpsError("invalid-argument", "Unsupported payment method.");

  const activeConfiguration = await loadActivePaymentConfiguration();
  const manifest = data.paymentManifest;
  const submittedVersion = text(
    data.paymentConfigVersion || data.paymentConfigurationVersion || manifest.configVersion || manifest.paymentConfigVersion,
  );
  const submittedHash = text(
    data.paymentConfigHash || data.paymentConfigurationHash || manifest.configHash || manifest.paymentConfigHash,
  );

  if (
    submittedVersion !== activeConfiguration.version ||
    submittedHash !== activeConfiguration.configHash ||
    !activeConfiguration.approvedMethods.includes(method)
  ) {
    throw new HttpsError("failed-precondition", "The payment instructions are missing, stale or not approved. Generate a new payment manifest.");
  }
  if (text(manifest.legalBeneficiary || manifest.payableTo) !== activeConfiguration.legalBeneficiary) {
    throw new HttpsError("failed-precondition", "The submitted legal beneficiary does not match the active corporate configuration.");
  }
  if (upper(manifest.currency) !== activeConfiguration.currency) {
    throw new HttpsError("failed-precondition", "The submitted payment currency does not match the active corporate configuration.");
  }
  if (method === "BANK_TRANSFER" && (
    text(manifest.bankName) !== activeConfiguration.bankName ||
    compactUpper(manifest.accountNumber) !== compactUpper(activeConfiguration.accountNumber) ||
    compactUpper(manifest.iban) !== compactUpper(activeConfiguration.iban) ||
    compactUpper(manifest.swiftBic) !== compactUpper(activeConfiguration.swiftBic)
  )) {
    throw new HttpsError("failed-precondition", "The submitted bank-transfer instructions do not match the active corporate account.");
  }
  if (method === "CASH" && text(manifest.officeLocation) !== activeConfiguration.officeLocation) {
    throw new HttpsError("failed-precondition", "The submitted cash-payment location does not match the active corporate configuration.");
  }
  if (MANUAL_METHODS.has(method) && text(manifest.reference).length < 4) {
    throw new HttpsError("failed-precondition", "Manual payment instructions require a valid immutable reference.");
  }
}

async function assertServerQuote(request: any, data: ReturnType<typeof assertCanonicalCommercialTerms>["data"]) {
  if (text(data.quoteId)) {
    return assertOwnerPortfolioQuoteRecord(request.auth.uid, {
      quoteId: data.quoteId,
      quoteHash: data.quoteHash,
      inputHash: data.quoteInputHash || data.inputHash,
      portfolioAnnualTotal: data.annualContractValue,
      mobilisationDeposit: data.activationDeposit || data.amount,
    });
  }

  const previewResult = await previewOwnerOnboardingQuoteHandler({
    auth: request.auth,
    data: {
      properties: data.properties,
      selectedAddOns: data.serviceDetails.selectedAddOns,
    },
  });
  const quote = previewResult?.data || previewResult;
  if (
    !quote ||
    quote.currency !== "AED" ||
    Number(quote.expiresAtMs || 0) <= Date.now() ||
    text(quote.quoteHash) !== text(data.quoteHash) ||
    money(quote.annualContractValue) !== money(data.annualContractValue) ||
    money(quote.activationDeposit) !== money(data.activationDeposit || data.amount)
  ) {
    throw new HttpsError("failed-precondition", "The submitted onboarding quote is missing, expired or does not match the server calculation.");
  }
  return {
    valid: true,
    quoteId: null,
    quoteHash: quote.quoteHash,
    inputHash: null,
    portfolioAnnualTotal: money(quote.annualContractValue),
    mobilisationDeposit: money(quote.activationDeposit),
    currency: "AED" as const,
  };
}

export const submitOwnerOnboardingPaymentPackage = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication is required.");
    if (request.auth.token?.email_verified !== true) {
      throw new HttpsError("failed-precondition", "Verify the owner email before submitting payment evidence.");
    }
    if (request.auth.token?.suspended === true) {
      throw new HttpsError("permission-denied", "Suspended owner accounts cannot continue onboarding.");
    }

    const commercial = assertCanonicalCommercialTerms(request.data);
    const data = commercial.data;
    const quote = await assertServerQuote(request, data);
    if (
      money(data.paymentManifest.annualContractValue) !== quote.portfolioAnnualTotal ||
      money(data.paymentManifest.activationDeposit || data.paymentManifest.amount) !== quote.mobilisationDeposit
    ) {
      throw new HttpsError("failed-precondition", "The payment manifest does not match the active owner quote.");
    }

    await assertCurrentPaymentConfiguration(data);
    return submitOwnerOnboardingPaymentPackageHandler({ auth: request.auth, data });
  },
);

export {
  previewOwnerOnboardingQuote,
  submitPendingOwnerRegistration,
};
