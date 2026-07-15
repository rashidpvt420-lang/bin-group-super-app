const QUOTE_VERSION = "uae-owner-onboarding-2026-v2-server";
const QUOTE_TTL_MS = 72 * 60 * 60 * 1000;

type PropertyInput = Record<string, any>;

type AssetPrice = {
  minimum: number;
  unit: "unit" | "sqft" | "bed";
  maintenance: number;
  management: number;
  combined: number;
};

const ASSETS: Record<string, AssetPrice> = {
  "apt-std": { minimum: 1500, unit: "unit", maintenance: 1200, management: 5, combined: 6500 },
  "apt-lux": { minimum: 6500, unit: "unit", maintenance: 4500, management: 7, combined: 12000 },
  "villa-std": { minimum: 6000, unit: "unit", maintenance: 5000, management: 5, combined: 10000 },
  "villa-lux": { minimum: 15000, unit: "unit", maintenance: 12000, management: 8, combined: 30000 },
  "apt-sht": { minimum: 2500, unit: "unit", maintenance: 2000, management: 15, combined: 10000 },
  "off-sml": { minimum: 3500, unit: "sqft", maintenance: 8, management: 4, combined: 15 },
  "com-twr": { minimum: 50000, unit: "sqft", maintenance: 12, management: 3, combined: 20 },
  "rtl-mall": { minimum: 150000, unit: "sqft", maintenance: 30, management: 5, combined: 50 },
  "lab-camp": { minimum: 20000, unit: "bed", maintenance: 60, management: 5, combined: 100 },
  hosp: { minimum: 75000, unit: "sqft", maintenance: 70, management: 4, combined: 100 },
  "data-ctr": { minimum: 250000, unit: "sqft", maintenance: 50, management: 10, combined: 150 },
  "mix-dev": { minimum: 100000, unit: "sqft", maintenance: 15, management: 4, combined: 25 },
  government_majlis: { minimum: 25000, unit: "unit", maintenance: 25000, management: 0, combined: 25000 },
  private_majlis: { minimum: 12000, unit: "unit", maintenance: 12000, management: 0, combined: 12000 },
  mid_scale_hotel: { minimum: 150000, unit: "unit", maintenance: 100000, management: 10, combined: 200000 },
};

const ADD_ON_BASE: Record<string, number> = {
  fire_safety: 8000,
  water_tank: 2200,
  elevator_amc: 7500,
  hvac_pm: 6680,
  cleaning: 18450,
  security: 36600,
  pest_control: 2475,
  landscaping: 12000,
  move_in_out_inspection: 1200,
  mep_support: 13500,
  waste_management: 6600,
  pool_care: 9600,
  facade_access: 18000,
  "façade_access": 18000,
  dist_cooling: 12000,
  sira_renewal: 8500,
  grease_trap: 4800,
  pca_audit: 6500,
  majlis_deep_care: 12000,
  majlis_landscaping: 12000,
  majlis_exterior_wash: 4500,
  majlis_standby: 4500,
  manpower: 30000,
  concierge: 42000,
  generator: 7500,
  cctv: 8500,
  office_units: 6500,
  retail_shops: 8500,
  parking_management: 9000,
  fit_out_quotation: 0,
  emergency_priority: 2500,
  technician_standby: 7500,
  tech_standby: 7500,
  event_support: 7500,
  cleaning_team: 18000,
  deep_cleaning: 4500,
  cctv_security: 8500,
  inspection_move: 1200,
};

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "string"
    ? Number.parseFloat(value.replace(/x/gi, "").trim())
    : Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : fallback;
}

function text(value: unknown) {
  return String(value || "").trim();
}

function assetId(property: PropertyInput): string {
  const type = text(property.propertyType).toLowerCase();
  const subType = text(property.subType).toLowerCase();
  const assetClass = text(property.assetClass).toLowerCase();
  const serviceModel = text(property.serviceModel).toLowerCase();
  const descriptor = `${type} ${subType} ${assetClass} ${serviceModel}`.replace(/[^a-z0-9]+/g, "_");
  if (descriptor.includes("mosque") || descriptor.includes("masjid") || descriptor.includes("religious_facility")) return "mosque_fm";
  if (descriptor.includes("government_majlis") || property.majlis === true) return "government_majlis";
  if (descriptor.includes("private_majlis")) return "private_majlis";
  if (descriptor.includes("hotel")) return "mid_scale_hotel";
  if (descriptor.includes("hospital") || descriptor.includes("clinic")) return "hosp";
  if (descriptor.includes("data_center") || descriptor.includes("data_centre")) return "data-ctr";
  if (descriptor.includes("mixed_use")) return "mix-dev";
  if (descriptor.includes("retail_mall") || descriptor.includes("mall")) return "rtl-mall";
  if (descriptor.includes("labor_camp") || descriptor.includes("labour_camp") || descriptor.includes("warehouse")) return "lab-camp";
  if (descriptor.includes("short_term")) return "apt-sht";
  if (type === "villa") return ["luxury", "ultra-luxury"].includes(text(property.assetGrade).toLowerCase()) ? "villa-lux" : "villa-std";
  if (descriptor.includes("luxury_apartment")) return "apt-lux";
  if (type === "building" || descriptor.includes("commercial_tower")) return "com-twr";
  if (type === "commercial" || descriptor.includes("office")) return "off-sml";
  return "apt-std";
}

function contractType(property: PropertyInput) {
  const strategy = text(property.strategy).toLowerCase();
  if (strategy === "pm_only" || strategy === "rent") return "PM_ONLY";
  if (strategy === "fm_only" || strategy === "fm") return "FM_ONLY";
  return "BOTH";
}

function emirateMultiplier(property: PropertyInput) {
  const emirate = text(property.emirate).toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (emirate.includes("dubai")) return 1.15;
  if (emirate.includes("abudhabi")) return 1.1;
  if (emirate.includes("sharjah")) return 0.9;
  if (
    emirate === "rak" ||
    emirate.includes("rasalkhaimah") ||
    emirate.includes("ajman") ||
    emirate.includes("fujairah") ||
    emirate === "uaq" ||
    emirate.includes("ummalquwain")
  ) return 0.8;
  return 1;
}

function slaMultiplier(property: PropertyInput) {
  const tier = text(property.slaTier).toLowerCase();
  if (tier === "elite") return 1.3;
  if (tier === "premium") return 1.15;
  return 1;
}

function paymentPlanSurcharge(property: PropertyInput) {
  const plan = text(property.paymentPlan).toLowerCase();
  if (plan === "monthly") return 0.06;
  if (plan === "quarterly") return 0.03;
  return 0;
}

function mandatoryAddOns(property: PropertyInput, id: string) {
  const ids = new Set<string>(["fire_safety"]);
  if (id === "mosque_fm") {
    ["water_tank", "hvac_pm", "cleaning", "sira_renewal", "emergency_priority"].forEach((item) => ids.add(item));
  }
  if (property.tank === true) ids.add("water_tank");
  if (id !== "government_majlis" && id !== "private_majlis" && id !== "majlis" && (number(property.floors) > 1 || number(property.lifts) > 0)) ids.add("elevator_amc");
  if (property.sira === true) ids.add("sira_renewal");
  if (property.bmu === true) ids.add("facade_access");
  if (number(property.age) > 15) ids.add("pca_audit");
  if (property.pool === true) ids.add("pool_care");
  if (property.hvac === true || number(property.hvacCount) > 0) ids.add("hvac_pm");
  return ids;
}

function addOnTotal(property: PropertyInput, id: string, selectedAddOns: string[]) {
  const ids = mandatoryAddOns(property, id);
  selectedAddOns.forEach((item) => ids.add(item === "façade_access" ? "facade_access" : item));
  return Array.from(ids).reduce((total, item) => total + (ADD_ON_BASE[item] || 0), 0);
}

function calculateMosque(property: PropertyInput, selectedAddOns: string[]) {
  const profile = property.mosqueProfile || {};
  const sqft = Math.max(number(profile.grossFloorAreaSqft || property.sqft), 1000);
  const age = number(profile.propertyAgeYears || property.age);
  const capacity = Math.max(number(profile.maxWorshipperCapacity || property.rooms || property.units), 1);
  const type = contractType(property);
  const mepRate = type === "FM_ONLY" ? 20 : type === "BOTH" ? 38 : 30;
  const ageCoefficient = age <= 3 ? 1 : age <= 9 ? 1.18 : age <= 15 ? 1.35 : 1.55;
  const capacityMultiplier = capacity <= 300 ? 1 : capacity <= 1000 ? 1.15 : capacity <= 3000 ? 1.35 : 1.6;
  const baseQuote = sqft * mepRate * ageCoefficient;
  const softServices = sqft * 8 * capacityMultiplier;
  const wuduAreaProxySqft = Math.min(Math.max(Math.ceil(capacity * 0.12), 35), 650);
  const wuduCleaning = wuduAreaProxySqft * 35 * 26;
  // The onboarding UI treats mosque HVAC coverage as mandatory.
  const ramadanSurge = 15500 + 2500;
  const compliancePremium = Math.max(baseQuote * 0.04, 2500);
  const complexityPremium = (baseQuote + softServices) * 0.1;
  return (baseQuote + softServices + wuduCleaning + ramadanSurge + compliancePremium + complexityPremium + addOnTotal(property, "mosque_fm", selectedAddOns)) *
    slaMultiplier(property) *
    (1 + paymentPlanSurcharge(property));
}

function calculateProperty(property: PropertyInput, selectedAddOns: string[]) {
  const id = assetId(property);
  if (id === "mosque_fm") return calculateMosque(property, selectedAddOns);
  const asset = ASSETS[id] || ASSETS["apt-std"];
  const type = contractType(property);
  const annualRent = number(property.annualRent);
  let rate = type === "FM_ONLY"
    ? asset.maintenance
    : type === "PM_ONLY"
      ? ((annualRent || 100000) * asset.management) / 100
      : asset.combined;
  if (asset.unit === "sqft" && number(property.sqft) > 0) rate *= number(property.sqft);
  else if (asset.unit === "unit" && number(property.units) > 0) rate *= number(property.units);
  else if (asset.unit === "bed" && number(property.bedrooms || property.beds) > 0) rate *= number(property.bedrooms || property.beds);
  const baseQuote = Math.max(rate, asset.minimum);
  const zone = text(property.zone).toUpperCase();
  const zoneMultiplier = zone === "A" ? 1.3 : zone === "C" ? 0.75 : 1;
  const emirateAdjusted = baseQuote * zoneMultiplier * emirateMultiplier(property);
  const age = number(property.age);
  const ageMultiplier = age > 20 ? 1.25 : age > 10 ? 1.15 : age > 5 ? 1.08 : 1;
  let complexityPercent = 0;
  if (number(property.floors) >= 40) complexityPercent += 15;
  else if (number(property.floors) >= 15) complexityPercent += 8;
  if (number(property.lifts) > 10) complexityPercent += 10;
  else if (number(property.lifts) > 4) complexityPercent += 5;
  if (property.hvac === true) complexityPercent += 5;
  if (property.districtCooling === true) complexityPercent -= 5;
  if (property.gen === true) complexityPercent += 4;
  if (property.bmu === true) complexityPercent += 6;
  if (property.fireAlarm === true || property.firePump === true) complexityPercent += 5;
  if (id === "hosp" || id === "data-ctr") complexityPercent += 20;
  const complexityPremium = emirateAdjusted * (complexityPercent / 100);
  return ((emirateAdjusted * ageMultiplier * slaMultiplier(property)) + complexityPremium + addOnTotal(property, id, selectedAddOns)) *
    (1 + paymentPlanSurcharge(property));
}

export function calculateOwnerOnboardingQuote(properties: unknown, addOns: unknown, nowMs = Date.now()) {
  if (!Array.isArray(properties) || properties.length < 1 || properties.length > 100) {
    throw new Error("One to 100 properties are required.");
  }
  const selectedAddOns = Array.isArray(addOns) ? addOns.map(text).filter(Boolean) : [];
  const propertyQuotes = properties.map((property, index) => {
    const cleanProperty = property && typeof property === "object" ? property as PropertyInput : {};
    if (!text(cleanProperty.emirate) || !text(cleanProperty.propertyType)) {
      throw new Error(`Property ${index + 1} is missing emirate or property type.`);
    }
    if (number(cleanProperty.units) <= 0 && number(cleanProperty.sqft) <= 0 && number(cleanProperty.bedrooms || cleanProperty.beds) <= 0) {
      throw new Error(`Property ${index + 1} has no valid pricing driver.`);
    }
    return {
      propertyId: text(cleanProperty.id || cleanProperty.propertyId || `property_${index + 1}`),
      annualTotal: calculateProperty(cleanProperty, selectedAddOns),
    };
  });
  const annualContractValue = Math.round(propertyQuotes.reduce((sum, quote) => sum + quote.annualTotal, 0));
  const activationDeposit = Math.round(annualContractValue * 0.15);
  if (annualContractValue <= 0 || activationDeposit <= 0) throw new Error("Server quote is invalid.");
  return {
    version: QUOTE_VERSION,
    currency: "AED",
    annualContractValue,
    mobilizationPercent: 15,
    activationDeposit,
    remainingAmount: annualContractValue - activationDeposit,
    vatAmount: 0,
    vatTreatment: "NOT_APPLIED",
    selectedAddOns,
    propertyQuotes,
    quotedAtMs: nowMs,
    expiresAtMs: nowMs + QUOTE_TTL_MS,
  };
}
