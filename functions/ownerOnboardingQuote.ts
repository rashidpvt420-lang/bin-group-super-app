import { createHash } from "crypto";
import {
  ASSET_PROFILE_PROPERTY_TYPES,
  calculateUaeQuote2026,
  resolveAssetClassIdForPropertyType,
  type QuoteInput,
} from "./pricing/calculateUaeQuote2026";
import { UAE_PRICING_MATRIX_2026 } from "./pricing/uaePricingMatrix2026";
import { normalizeAedMoney } from "./shared/aedMoney";

const QUOTE_VERSION = "uae-owner-onboarding-2026-v3-server-authority";
const QUOTE_TTL_MS = 72 * 60 * 60 * 1000;
const VALID_CONTRACT_MODES = new Set(["FM_ONLY", "PM_ONLY", "BOTH"]);
const BED_PRICED_ASSET_IDS = new Set(["lab-camp", "staff-accom"]);

type PropertyInput = Record<string, any>;
type ContractMode = "FM_ONLY" | "PM_ONLY" | "BOTH";

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "string"
    ? Number.parseFloat(value.replace(/x/gi, "").trim())
    : Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : fallback;
}

const money = normalizeAedMoney;

function text(value: unknown) {
  return String(value || "").trim();
}

function descriptorFor(property: PropertyInput) {
  return [
    property.propertyType,
    property.subType,
    property.assetClass,
    property.serviceModel,
    property.majlisType,
  ]
    .map(text)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

/**
 * Server-side property classification must resolve to the same canonical class
 * used by the browser/shared calculator. Unknown property types fail closed.
 */
export function resolveOwnerOnboardingPricingClass(property: PropertyInput): string {
  const requestedType = text(property.propertyType);
  const canonicalType = ASSET_PROFILE_PROPERTY_TYPES.find(
    (candidate) => candidate.toLowerCase() === requestedType.toLowerCase(),
  );
  const grade = text(property.assetGrade) || "Standard";
  const explicit = resolveAssetClassIdForPropertyType(canonicalType || requestedType, grade);
  if (explicit) return explicit;

  const descriptor = descriptorFor(property);
  // Private must be checked before generic/government Majlis flags.
  if (descriptor.includes("private_majlis") || text(property.majlisType).toLowerCase() === "private") return "private_majlis";
  if (descriptor.includes("government_majlis") || text(property.majlisType).toLowerCase() === "government" || property.majlis === true) return "government_majlis";
  if (descriptor.includes("mosque") || descriptor.includes("masjid") || descriptor.includes("religious_facility") || descriptor.includes("mosque_fm")) return "mosque_fm";
  if (descriptor.includes("data_center") || descriptor.includes("data_centre")) return "data-ctr";
  if (descriptor.includes("short_term")) return "apt-sht";
  if (descriptor.includes("commercial_tower")) return "com-twr";
  if (descriptor.includes("residential_building")) return "res-bldg";
  if (descriptor.includes("mixed_use")) return "mix-dev";
  if (descriptor.includes("high_rise") || descriptor.includes("highrise")) return "highrise";

  const rawAssetClass = text(property.assetClass);
  if (rawAssetClass && UAE_PRICING_MATRIX_2026.assetClasses.some((asset) => asset.id === rawAssetClass)) {
    return rawAssetClass;
  }

  throw new Error(`Unsupported property type '${requestedType || "(blank)"}'. Select a configured Asset Profile type before pricing.`);
}

function contractType(property: PropertyInput): ContractMode {
  const strategy = text(
    property.strategy ||
    property.serviceModel ||
    property.contractMode ||
    property.contractType ||
    property.selectedPlan?.type ||
    property.selectedPlan?.id,
  ).toLowerCase();
  let mode = "";
  if (["pm", "pm_only", "rent", "property_management"].includes(strategy)) mode = "PM_ONLY";
  if (["fm", "fm_only", "maintenance", "maintenance_only", "mosque_fm"].includes(strategy)) mode = "FM_ONLY";
  if (["both", "hybrid", "combined", "total_care", "total-care"].includes(strategy)) mode = "BOTH";
  if (!VALID_CONTRACT_MODES.has(mode)) {
    throw new Error("Every property requires a valid Maintenance, Property Management, or Hybrid contract mode.");
  }
  return mode as ContractMode;
}

function safeZone(value: unknown): QuoteInput["zone"] {
  const zone = text(value).toUpperCase();
  return zone === "A" || zone === "C" ? zone : "B";
}

function safeSlaTier(value: unknown): QuoteInput["slaTier"] {
  const tier = text(value).toLowerCase();
  if (tier === "premium" || tier === "elite") return tier;
  return "standard";
}

function safePaymentPlan(value: unknown): QuoteInput["paymentPlan"] {
  const plan = text(value).toLowerCase();
  if (plan === "monthly" || plan === "quarterly") return plan;
  return "annual";
}

function quoteInputForProperty(
  property: PropertyInput,
  selectedAddOns: string[],
  mode: ContractMode,
): { assetClassId: string; pricingDriver: string; input: QuoteInput } {
  const assetClassId = resolveOwnerOnboardingPricingClass(property);
  const mosqueProfile = property.mosqueProfile && typeof property.mosqueProfile === "object"
    ? property.mosqueProfile as PropertyInput
    : {};
  const isMosque = assetClassId === "mosque_fm";
  const isBedPriced = BED_PRICED_ASSET_IDS.has(assetClassId);
  const matrixClass = UAE_PRICING_MATRIX_2026.assetClasses.find((asset) => asset.id === assetClassId);
  const pricingDriver = isMosque ? "sqft+capacity" : text(matrixClass?.pricingUnit);
  if (!pricingDriver) throw new Error(`Pricing class '${assetClassId}' has no configured pricing driver.`);

  const units = isMosque
    ? number(mosqueProfile.maxWorshipperCapacity || property.units || property.rooms)
    : number(property.units);
  const beds = isBedPriced
    ? number(property.beds || property.bedrooms || property.units || property.rooms)
    : number(property.beds);

  return {
    assetClassId,
    pricingDriver,
    input: {
      assetClassId,
      emirate: text(property.emirate),
      zone: safeZone(property.zone),
      contractType: mode,
      sqft: isMosque ? number(mosqueProfile.grossFloorAreaSqft || property.sqft) : number(property.sqft),
      units,
      beds,
      annualRent: number(property.annualRent),
      annualRevenue: number(property.annualRevenue),
      propertyAge: isMosque ? number(mosqueProfile.propertyAgeYears || property.age) : number(property.age),
      floors: number(property.floors),
      lifts: number(property.lifts),
      hasPool: property.pool === true,
      hasGym: property.gym === true,
      hasCentralHVAC: isMosque ? true : property.hvac === true,
      hasDistrictCooling: property.districtCooling === true,
      hasCivilDefenseSystem: property.fireAlarm === true || property.firePump === true,
      hasSiraCctv: isMosque
        ? property.sira === true || mosqueProfile.cctvInstalled === true || number(mosqueProfile.cctvCameraCount) > 0
        : property.sira === true,
      hasGenerator: property.gen === true,
      hasBmu: property.bmu === true,
      addOns: selectedAddOns,
      slaTier: safeSlaTier(property.slaTier || (isMosque ? "premium" : "standard")),
      paymentPlan: safePaymentPlan(property.paymentPlan),
      hasWaterTank: property.tank === true,
      hvacCount: isMosque ? number(mosqueProfile.hvacUnitsCount || property.hvacCount) : number(property.hvacCount),
      offices: number(property.offices),
      shops: number(property.shops),
    },
  };
}

export function calculateOwnerOnboardingQuote(properties: unknown, addOns: unknown, nowMs = Date.now()) {
  if (!Array.isArray(properties) || properties.length < 1 || properties.length > 100) {
    throw new Error("One to 100 properties are required.");
  }
  if (!Number.isFinite(nowMs) || nowMs <= 0) throw new Error("A valid quotation timestamp is required.");

  const selectedAddOns = Array.isArray(addOns) ? addOns.map(text).filter(Boolean) : [];
  const normalizedProperties: PropertyInput[] = properties.map((property: unknown) => (
    property && typeof property === "object" ? property as PropertyInput : {}
  ));
  const contractModes = normalizedProperties.map((property: PropertyInput) => contractType(property));
  if (contractModes.some((mode: ContractMode) => mode !== contractModes[0])) {
    throw new Error("All properties in a portfolio quote must use the same contract mode.");
  }
  const contractMode = contractModes[0];

  const propertyQuotes = normalizedProperties.map((cleanProperty: PropertyInput, index: number) => {
    if (!text(cleanProperty.emirate) || !text(cleanProperty.propertyType)) {
      throw new Error(`Property ${index + 1} is missing emirate or property type.`);
    }

    const { assetClassId, pricingDriver, input } = quoteInputForProperty(cleanProperty, selectedAddOns, contractMode);
    const quote = calculateUaeQuote2026(input);
    if (!Number.isFinite(quote.annualTotal) || quote.annualTotal <= 0) {
      const reasons = quote.riskFlags.length ? quote.riskFlags.join(", ") : "automatic pricing returned no annual total";
      throw new Error(`Property ${index + 1} (${cleanProperty.propertyType}) could not be priced: ${reasons}.`);
    }

    return {
      propertyId: text(cleanProperty.id || cleanProperty.propertyId || `property_${index + 1}`),
      contractMode,
      pricingClass: assetClassId,
      pricingDriver,
      annualTotal: money(quote.annualTotal),
    };
  });

  const portfolioAnnualTotal = money(propertyQuotes.reduce((sum: number, quote) => sum + quote.annualTotal, 0));
  if (portfolioAnnualTotal <= 0) throw new Error("Portfolio annual total must be positive.");
  const activationDeposit = money(portfolioAnnualTotal * 0.15);
  const remainingAmount = money(portfolioAnnualTotal - activationDeposit);
  if (activationDeposit <= 0) throw new Error("Server quotation mobilisation deposit must be positive.");

  const quotedAtMs = nowMs;
  const expiresAtMs = quotedAtMs + QUOTE_TTL_MS;
  const unsignedQuote = {
    version: QUOTE_VERSION,
    currency: "AED",
    contractMode,
    portfolioAnnualTotal,
    annualContractValue: portfolioAnnualTotal,
    mobilizationPercent: 15,
    activationDeposit,
    remainingAmount,
    vatAmount: 0,
    vatTreatment: "NOT_APPLIED",
    selectedAddOns,
    propertyQuotes,
    quotedAtMs,
    expiresAtMs,
  };
  const quoteHash = createHash("sha256").update(JSON.stringify(unsignedQuote)).digest("hex");
  return { ...unsignedQuote, quoteHash };
}
