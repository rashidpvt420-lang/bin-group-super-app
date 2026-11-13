const OWNER_INITIAL_CONTRACT_TERM_MONTHS = 13;
const OWNER_RENEWAL_CONTRACT_TERM_MONTHS = 12;
const OWNER_SERVICE_TERM_MONTHS = 12;
const OWNER_COMPLIMENTARY_MONTHS = 1;
const OWNER_CANCELLATION_GRACE_DAYS = 7;
const OWNER_INITIAL_CANCELLATION_WINDOW_DAYS = OWNER_CANCELLATION_GRACE_DAYS;
const BIN_GROUP_LEGAL_ENTITY_NAME = "All Kind Building Projects Contracting L.L.C S.P.C, trading as BIN GROUP L.L.C - S.P.C";
const BIN_GROUP_TRADE_NAME = "BIN GROUP L.L.C - S.P.C";
const BIN_GROUP_TRADE_LICENCE_EMIRATE = "Abu Dhabi";
const LEGAL_CONSENT_VERSION = "legal-review-2026-11-12";
const SIGNED_CONTRACT_AUDIT_RETENTION_YEARS = 10;
const SIGNED_CONTRACT_AUDIT_COLLECTION = "contract_acceptance_audit";
const TECHNICIAN_GPS_CONSENT_COLLECTION = "technician_gps_consents";
const LEGAL_CITATION_DISCLAIMER_EN = "for counsel to confirm";
const LEGAL_CITATION_DISCLAIMER_AR = "\u0644\u0644\u062A\u0623\u0643\u064A\u062F \u0645\u0646 \u0627\u0644\u0645\u0633\u062A\u0634\u0627\u0631 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A";
const LEGAL_DRAFT_MARK_EN = "Draft, for UAE legal review; legal citations are for counsel to confirm";
const LEGAL_DRAFT_MARK_AR = "\u0645\u0633\u0648\u062F\u0629\u060C \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0641\u064A \u062F\u0648\u0644\u0629 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A\u061B \u0648\u0627\u0644\u0627\u0633\u062A\u0634\u0647\u0627\u062F\u0627\u062A \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0644\u0644\u062A\u0623\u0643\u064A\u062F \u0645\u0646 \u0627\u0644\u0645\u0633\u062A\u0634\u0627\u0631 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A";
const UNVERIFIED_RESEARCH_CITATION_NOTE_EN = "Citations named here come from unverified research and are for counsel to confirm; they are not presented as verified law.";
const UNVERIFIED_RESEARCH_CITATION_NOTE_AR = "\u0627\u0644\u0627\u0633\u062A\u0634\u0647\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629 \u0647\u0646\u0627 \u0645\u0635\u062F\u0631\u0647\u0627 \u0628\u062D\u062B \u063A\u064A\u0631 \u0645\u062D\u0642\u0651\u064E\u0642 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0624\u0643\u062F\u0647\u0627 \u0645\u062D\u0627\u0645\u064D \u0625\u0645\u0627\u0631\u0627\u062A\u064A\u060C \u0648\u0644\u0627 \u062A\u064F\u0639\u0631\u0636 \u0628\u0648\u0635\u0641\u0647\u0627 \u0642\u0627\u0646\u0648\u0646\u0627\u064B \u0645\u062B\u0628\u062A\u0627\u064B.";
const OWNER_INITIAL_CANCELLATION_FEE_AED = null;
const OWNER_INITIAL_CANCELLATION_FEE_STATUS = "PERCENTAGE_BANDS_CONFIGURED";
const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN = "days 1\u20137: 0%; days 8\u201390: 4%; days 91\u2013180: 6%; days 181\u2013270: 8%; days 271+: 10% of total annual contract value excluding VAT";
const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR = "\u0627\u0644\u0623\u064A\u0627\u0645 1\u20137: 0\u066A\u061B \u0627\u0644\u0623\u064A\u0627\u0645 8\u201390: 4\u066A\u061B \u0627\u0644\u0623\u064A\u0627\u0645 91\u2013180: 6\u066A\u061B \u0627\u0644\u0623\u064A\u0627\u0645 181\u2013270: 8\u066A\u061B \u0645\u0646 \u0627\u0644\u064A\u0648\u0645 271 \u0641\u0645\u0627 \u0641\u0648\u0642: 10\u066A \u0645\u0646 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0646\u0648\u064A\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629 \u0644\u0644\u0639\u0642\u062F \u0628\u0627\u0633\u062A\u062B\u0646\u0627\u0621 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629";
const OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE = "OWNER_CANCELLATION_FEE_BANDS_INVALID";
const OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN = "a cancellation fee calculated as a percentage of the total annual contract value excluding VAT";
const OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR = "\u0631\u0633\u0645 \u0625\u0644\u063A\u0627\u0621 \u064A\u064F\u062D\u0633\u0628 \u0643\u0646\u0633\u0628\u0629 \u0645\u0646 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0646\u0648\u064A\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629 \u0644\u0644\u0639\u0642\u062F \u0628\u0627\u0633\u062A\u062B\u0646\u0627\u0621 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629";
const OWNER_CANCELLATION_FEE_MODEL = "PERCENTAGE_BANDS_OF_ANNUAL_CONTRACT_VALUE_EXCLUDING_VAT";
const OWNER_CANCELLATION_FEE_BASIS = "TOTAL_ANNUAL_CONTRACT_VALUE_EXCLUDING_VAT";
const OWNER_CANCELLATION_GRACE_WAIVES_PENALTY_ONLY = true;
const OWNER_CANCELLATION_GRACE_DOES_NOT_WAIVE_MOBILISATION_WORK = true;
const OWNER_CANCELLATION_FEE_BANDS = Object.freeze([
  Object.freeze({ fromDayInclusive: 1, toDayInclusive: 7, percent: 0 }),
  Object.freeze({ fromDayInclusive: 8, toDayInclusive: 90, percent: 4 }),
  Object.freeze({ fromDayInclusive: 91, toDayInclusive: 180, percent: 6 }),
  Object.freeze({ fromDayInclusive: 181, toDayInclusive: 270, percent: 8 }),
  Object.freeze({ fromDayInclusive: 271, toDayInclusive: null, percent: 10 })
]);
const REQUIRED_OWNER_CANCELLATION_FEE_BANDS = OWNER_CANCELLATION_FEE_BANDS;
const OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_EN = "Unverified market research cited a range of AED 1,500 to AED 3,000. That range is not applied. The founder-approved model is the percentage-band schedule of total annual contract value excluding VAT.";
const OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_AR = "\u0623\u0634\u0627\u0631 \u0628\u062D\u062B \u0633\u0648\u0642\u064A \u063A\u064A\u0631 \u0645\u062D\u0642\u0651\u064E\u0642 \u0625\u0644\u0649 \u0646\u0637\u0627\u0642 \u0645\u0646 1,500 \u0625\u0644\u0649 3,000 \u062F\u0631\u0647\u0645. \u0648\u0644\u0627 \u064A\u064F\u0637\u0628\u0651\u064E\u0642 \u0630\u0644\u0643 \u0627\u0644\u0646\u0637\u0627\u0642. \u0648\u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0645\u0646 \u0627\u0644\u0645\u0624\u0633\u0633 \u0647\u0648 \u062C\u062F\u0648\u0644 \u0627\u0644\u0646\u0633\u0628 \u0645\u0646 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0646\u0648\u064A\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629 \u0644\u0644\u0639\u0642\u062F \u0628\u0627\u0633\u062A\u062B\u0646\u0627\u0621 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629.";
const OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH = true;
const OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH_STATUS = "FOUNDER_DECISION_APPLIED";
const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF = null;
const BIN_GROUP_TRADE_LICENCE_REF = "CN-5914744";
const BIN_GROUP_TRADE_LICENCE_STATUS = "FOUNDER_SUPPLIED";
const BIN_GROUP_RERA_ORN_REF = null;
const BIN_GROUP_ADREC_REG_REF = null;
const BIN_GROUP_ADREC_AUTHORISATION_REF = BIN_GROUP_ADREC_REG_REF;
const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN = "to be inserted";
const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR = "\u064A\u064F\u062F\u0631\u062C \u0644\u0627\u062D\u0642\u0627\u064B";
const OWNER_INITIAL_MOBILISATION_REFUND_POLICY = "RETAIN_VERIFIABLE_INCURRED_EXPENSES_REFUND_REMAINDER";
const OWNER_INITIAL_MOBILISATION_REFUND_IS_FOUNDER_DEFAULT = true;
const OWNER_CONTRACT_AUTO_RENEWAL = false;
const OWNER_CONTRACT_RENEWAL_REQUIRES_EXPLICIT_CONSENT = true;
const CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED = 5e4;
const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT = null;
const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_STATUS = "PENDING_FOUNDER_DECISION";
const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_FLOOR_THRESHOLD = 15;
const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN = "Unverified market research cited a 15-25% range. That range is not applied. Rashid must decide the rate.";
const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR = "\u0623\u0634\u0627\u0631 \u0628\u062D\u062B \u0633\u0648\u0642\u064A \u063A\u064A\u0631 \u0645\u062D\u0642\u0651\u064E\u0642 \u0625\u0644\u0649 \u0646\u0637\u0627\u0642 15-25\u066A. \u0648\u0644\u0627 \u064A\u064F\u0637\u0628\u0651\u064E\u0642 \u0630\u0644\u0643 \u0627\u0644\u0646\u0637\u0627\u0642. \u0648\u064A\u062C\u0628 \u0623\u0646 \u064A\u0642\u0631\u0631 \u0631\u0634\u064A\u062F \u0627\u0644\u0646\u0633\u0628\u0629.";
const OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT = 5;
const OWNER_QUOTE_PRICES_ARE_VAT_EXCLUSIVE = true;
const OWNER_INVOICE_VAT_TREATMENT_UNTIL_TRN_VERIFIED = "NOT_APPLIED";
const OWNER_PRE_TRN_INVOICE_TITLE_EN = "Commercial Invoice";
const OWNER_PRE_TRN_INVOICE_TITLE_AR = "\u0641\u0627\u062A\u0648\u0631\u0629 \u062A\u062C\u0627\u0631\u064A\u0629";
const OWNER_TAX_INVOICE_TITLE_EN = "Tax Invoice";
const OWNER_TAX_INVOICE_TITLE_AR = "\u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629";
const UAE_VAT_ARTICLE_59_FULL_TAX_INVOICE_THRESHOLD_AED = 1e4;
const UAE_VAT_TAX_INVOICE_ISSUANCE_DEADLINE_DAYS = 14;
const UAE_VAT_ARTICLE_59_CITATION_NOTE = "UAE VAT Executive Regulation Article 59 tax-invoice requirements (simplified versus full for B2B supplies above AED 10,000, and issuance within 14 days) are implemented for when a TRN is verified, and are for counsel to confirm.";
const OWNER_CASH_ACCEPTANCE_THRESHOLD_AED = 5e4;
const OWNER_CASH_ACCEPTANCE_THRESHOLD_STATUS = "SET";
const OWNER_CASH_ACCEPTANCE_THRESHOLD_SCOPE = "PER_PROPERTY_CONTRACT_SINGLE_OR_CUMULATIVE_LINKED";
const OWNER_PAYMENT_POLICY_VERSION = "PHASE1_CASH_CHEQUE_V1";
const OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_EN = "Founder-set cash cap: AED 50,000 per property contract, single or linked/cumulative cash payments. Amounts above the cap must be paid by cheque or bank transfer. Unverified research cited AED 55,000 reporting under the goAML rules; that figure is not applied.";
const OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_AR = "\u062D\u062F \u0627\u0644\u0646\u0642\u062F \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0645\u0646 \u0627\u0644\u0645\u0624\u0633\u0633: 50,000 \u062F\u0631\u0647\u0645 \u0644\u0643\u0644 \u0639\u0642\u062F \u0639\u0642\u0627\u0631\u060C \u0644\u0644\u062F\u0641\u0639\u0627\u062A \u0627\u0644\u0646\u0642\u062F\u064A\u0629 \u0627\u0644\u0648\u0627\u062D\u062F\u0629 \u0623\u0648 \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0629 \u0623\u0648 \u0627\u0644\u062A\u0631\u0627\u0643\u0645\u064A\u0629. \u0648\u0645\u0627 \u064A\u0632\u064A\u062F \u0639\u0644\u0649 \u0627\u0644\u062D\u062F \u064A\u064F\u0633\u062F\u062F \u0628\u0634\u064A\u0643 \u0623\u0648 \u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A. \u0648\u0623\u0634\u0627\u0631 \u0628\u062D\u062B \u063A\u064A\u0631 \u0645\u062D\u0642\u0651\u064E\u0642 \u0625\u0644\u0649 \u0625\u0628\u0644\u0627\u063A \u0639\u0646\u062F 55,000 \u062F\u0631\u0647\u0645 \u0628\u0645\u0648\u062C\u0628 \u0642\u0648\u0627\u0639\u062F goAML\u060C \u0648\u0644\u0627 \u064A\u064F\u0637\u0628\u0651\u064E\u0642 \u0630\u0644\u0643 \u0627\u0644\u0631\u0642\u0645.";
const OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED = null;
const OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_STATUS = "PENDING_FOUNDER_DECISION";
const OWNER_EMERGENCY_REPAIR_APPROVER = null;
const OWNER_EMERGENCY_REPAIR_APPROVER_STATUS = "PENDING_FOUNDER_DECISION";
const OWNER_MOBILISATION_DELIVERABLES_EN = [
  "initial inspection and inventory",
  "property photographs",
  "Ejari / Tawtheeq setup",
  "compliance checks"
];
const OWNER_MOBILISATION_DELIVERABLES_AR = [
  "\u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629 \u0648\u0627\u0644\u062C\u0631\u062F \u0627\u0644\u0623\u0648\u0644\u064A\u0627\u0646",
  "\u0635\u0648\u0631 \u0627\u0644\u0639\u0642\u0627\u0631",
  "\u0625\u0639\u062F\u0627\u062F \u0625\u064A\u062C\u0627\u0631\u064A / \u062A\u0648\u062B\u064A\u0642",
  "\u0641\u062D\u0648\u0635\u0627\u062A \u0627\u0644\u0627\u0645\u062A\u062B\u0627\u0644"
];
function withLegalDraftMark(text, arabic = false) {
  const mark = arabic ? LEGAL_DRAFT_MARK_AR : LEGAL_DRAFT_MARK_EN;
  const trimmed = String(text || "").trim();
  if (!trimmed) return `${mark}.`;
  if (trimmed.startsWith(mark)) return trimmed;
  return `${mark}. ${trimmed}`;
}
function roundAed(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
function ownerCancellationFeeBandsAreValid(bands = OWNER_CANCELLATION_FEE_BANDS) {
  if (!Array.isArray(bands) || bands.length !== REQUIRED_OWNER_CANCELLATION_FEE_BANDS.length) return false;
  return REQUIRED_OWNER_CANCELLATION_FEE_BANDS.every((required, index) => {
    const band = bands[index];
    return band != null && band.fromDayInclusive === required.fromDayInclusive && band.toDayInclusive === required.toDayInclusive && band.percent === required.percent;
  });
}
function isOwnerCancellationFeeModelConfigured() {
  return OWNER_INITIAL_CANCELLATION_FEE_AED == null && ownerCancellationFeeBandsAreValid() && OWNER_CANCELLATION_FEE_BASIS === "TOTAL_ANNUAL_CONTRACT_VALUE_EXCLUDING_VAT" && OWNER_CANCELLATION_GRACE_WAIVES_PENALTY_ONLY === true && OWNER_CANCELLATION_GRACE_DOES_NOT_WAIVE_MOBILISATION_WORK === true && OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH === true;
}
function isOwnerInitialCancellationFeeSet(fee = OWNER_INITIAL_CANCELLATION_FEE_AED) {
  if (fee != null) return false;
  return isOwnerCancellationFeeModelConfigured();
}
function formatOwnerInitialCancellationFee(fee = OWNER_INITIAL_CANCELLATION_FEE_AED) {
  if (!isOwnerInitialCancellationFeeSet(fee)) {
    return {
      set: false,
      aed: null,
      status: fee != null ? "FLAT_AED_NOT_ALLOWED" : OWNER_INITIAL_CANCELLATION_FEE_STATUS,
      displayEn: fee != null ? "flat AED fee not allowed" : "to be confirmed",
      displayAr: fee != null ? "\u0644\u0627 \u064A\u064F\u0633\u0645\u062D \u0628\u0631\u0633\u0645 \u0625\u0644\u063A\u0627\u0621 \u0645\u0642\u0637\u0648\u0639 \u0628\u0627\u0644\u062F\u0631\u0647\u0645" : "\u064A\u064F\u0624\u0643\u062F \u0644\u0627\u062D\u0642\u0627\u064B",
      natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
      natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR
    };
  }
  return {
    set: true,
    aed: null,
    status: OWNER_INITIAL_CANCELLATION_FEE_STATUS,
    displayEn: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN,
    displayAr: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR,
    natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
    natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR
  };
}
function cancellationFeeBandForDay(daysSinceActivation, bands = OWNER_CANCELLATION_FEE_BANDS) {
  const days = Math.floor(Number(daysSinceActivation));
  if (!Number.isFinite(days) || days < 1) return null;
  for (const band of bands) {
    if (days < band.fromDayInclusive) continue;
    if (band.toDayInclusive == null || days <= band.toDayInclusive) return band;
  }
  return bands[bands.length - 1] || null;
}
function computeOwnerCancellationPenaltyPercent(daysSinceActivation) {
  const band = cancellationFeeBandForDay(daysSinceActivation);
  return band ? band.percent : 0;
}
function computeOwnerCancellationFeeAed(annualContractValueExVatAed, daysSinceActivation) {
  const annual = roundAed(Number(annualContractValueExVatAed));
  const days = Math.floor(Number(daysSinceActivation));
  if (!Number.isFinite(annual) || annual < 0 || !Number.isFinite(days) || days < 1) {
    throw new Error("Cancellation fee computation requires a non-negative annual contract value excluding VAT and a day count of 1 or more.");
  }
  const percent = computeOwnerCancellationPenaltyPercent(days);
  const penaltyWaived = percent === 0 && days <= OWNER_CANCELLATION_GRACE_DAYS;
  return {
    daysSinceActivation: days,
    percent,
    feeAed: roundAed(annual * (percent / 100)),
    annualContractValueExVatAed: annual,
    penaltyWaived,
    mobilisationWorkRemainsPayable: true,
    basis: OWNER_CANCELLATION_FEE_BASIS
  };
}
function evaluateOwnerInitialCancellationFeeHonesty(fee = OWNER_INITIAL_CANCELLATION_FEE_AED) {
  if (fee != null) {
    return {
      ok: false,
      code: "OWNER_CANCELLATION_FEE_FLAT_AED_NOT_ALLOWED",
      blocksHardPublicLaunch: true,
      message: "Hard launch is blocked because a flat Owner cancellation fee in AED is not the approved model. Configure the founder-approved percentage bands (0/4/6/8/10 of total annual contract value excluding VAT) and leave OWNER_INITIAL_CANCELLATION_FEE_AED unset. Do not invent a flat amount."
    };
  }
  if (!isOwnerCancellationFeeModelConfigured()) {
    return {
      ok: false,
      code: OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE,
      blocksHardPublicLaunch: true,
      message: "Hard launch is blocked because the Owner cancellation-fee bands are missing or do not match the founder-approved schedule: days 1\u20137 0%; 8\u201390 4%; 91\u2013180 6%; 181\u2013270 8%; 271+ 10% of total annual contract value excluding VAT. The 7-day grace must waive the percentage penalty only, not payment for verifiable mobilisation work already done. Do not invent a flat AED amount."
    };
  }
  return {
    ok: true,
    code: "OWNER_CANCELLATION_FEE_BANDS_CONFIGURED",
    blocksHardPublicLaunch: false,
    message: "Owner cancellation fee uses the founder-approved percentage-band schedule of total annual contract value excluding VAT."
  };
}
function cashPaymentWouldExceedCap(args) {
  const cap = args.capAed ?? OWNER_CASH_ACCEPTANCE_THRESHOLD_AED;
  const amount = Number(args.amountAed);
  const recorded = Number(args.recordedCashAed || 0);
  if (cap == null || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(recorded) || recorded < 0) return true;
  return roundAed(recorded + amount) > cap;
}
function ownerCashCapRejectionMessage(capAed = OWNER_CASH_ACCEPTANCE_THRESHOLD_AED) {
  const cap = capAed == null ? "the configured cash cap" : `AED ${Number(capAed).toLocaleString("en-AE")}`;
  return `Cash is not accepted above ${cap} cumulative per property contract (a single payment or linked/cumulative cash payments). Use cheque or bank transfer.`;
}
function invoiceDocumentTitle(vatApplied) {
  return vatApplied ? `${OWNER_TAX_INVOICE_TITLE_EN} / ${OWNER_TAX_INVOICE_TITLE_AR}` : `${OWNER_PRE_TRN_INVOICE_TITLE_EN} / ${OWNER_PRE_TRN_INVOICE_TITLE_AR}`;
}
function requiresFullArticle59TaxInvoice(args) {
  return args.vatApplied === true && args.isB2B === true && Number(args.taxableAmountAed) > UAE_VAT_ARTICLE_59_FULL_TAX_INVOICE_THRESHOLD_AED;
}
function taxInvoiceIssuanceDeadlineIso(supplyOrIssueDate, now = /* @__PURE__ */ new Date()) {
  const start = new Date(supplyOrIssueDate);
  const deadline = new Date(start.getTime() + UAE_VAT_TAX_INVOICE_ISSUANCE_DEADLINE_DAYS * 864e5);
  return {
    deadlineIso: deadline.toISOString(),
    issuanceDays: UAE_VAT_TAX_INVOICE_ISSUANCE_DEADLINE_DAYS,
    overdue: now.getTime() > deadline.getTime()
  };
}
function formatUnsetLegalRef(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return {
      set: false,
      value: null,
      displayEn: BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN,
      displayAr: BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR
    };
  }
  return { set: true, value: trimmed, displayEn: trimmed, displayAr: trimmed };
}
function formatPropertyManagementLicenceRef(value = BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF) {
  return formatUnsetLegalRef(value);
}
function formatOwnerLicenceBlock(options = {}) {
  const trade = formatUnsetLegalRef(options.tradeLicence ?? BIN_GROUP_TRADE_LICENCE_REF);
  if (trade.set && trade.value === "CN-5914744") {
    const labelled = `${trade.value}, ${BIN_GROUP_TRADE_LICENCE_EMIRATE}`;
    trade.displayEn = labelled;
    trade.displayAr = labelled;
  }
  const reraOrn = formatUnsetLegalRef(options.reraOrn ?? BIN_GROUP_RERA_ORN_REF);
  const adrec = formatUnsetLegalRef(options.adrecReg ?? BIN_GROUP_ADREC_REG_REF);
  return {
    tradeLicence: trade,
    reraOrn,
    adrecReg: adrec,
    anySet: trade.set || reraOrn.set || adrec.set
  };
}
function isOfficeHighRiseLogisticsUpliftSet(percent = OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT) {
  return typeof percent === "number" && Number.isFinite(percent) && percent >= 0;
}
function formatOfficeHighRiseLogisticsUplift(percent = OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT) {
  if (!isOfficeHighRiseLogisticsUpliftSet(percent)) {
    return {
      set: false,
      percent: null,
      status: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_STATUS,
      applied: false,
      displayEn: "not applied \u2014 to be confirmed",
      displayAr: "\u063A\u064A\u0631 \u0645\u0637\u0628\u0642\u0629 \u2014 \u064A\u064F\u0624\u0643\u062F \u0644\u0627\u062D\u0642\u0627\u064B",
      researchNoteEn: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN,
      researchNoteAr: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR
    };
  }
  const value = Number(percent);
  return {
    set: true,
    percent: value,
    status: "SET",
    applied: value > 0,
    displayEn: `${value}%`,
    displayAr: `${value}\u066A`,
    researchNoteEn: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN,
    researchNoteAr: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR
  };
}
function formatUnsetAedAmount(value) {
  if (!(typeof value === "number" && Number.isFinite(value) && value >= 0)) {
    return {
      set: false,
      aed: null,
      status: "PENDING_FOUNDER_DECISION",
      displayEn: "to be confirmed",
      displayAr: "\u064A\u064F\u0624\u0643\u062F \u0644\u0627\u062D\u0642\u0627\u064B"
    };
  }
  const aed = Number(value);
  return {
    set: true,
    aed,
    status: "SET",
    displayEn: `AED ${aed.toLocaleString("en-AE")}`,
    displayAr: `${aed.toLocaleString("ar-AE")} \u062F\u0631\u0647\u0645`
  };
}
function formatOwnerCashAcceptanceThreshold(value = OWNER_CASH_ACCEPTANCE_THRESHOLD_AED) {
  return formatUnsetAedAmount(value);
}
function formatOwnerEmergencyRepairLimit(value = OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED) {
  return formatUnsetAedAmount(value);
}
function ownerComplimentaryMonthCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    "\u0645\u062F\u0629 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 13 \u0634\u0647\u0631\u0627\u064B. \u0648\u062A\u064F\u0639\u0641\u0649 \u0631\u0633\u0648\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u0644\u0634\u0647\u0631 \u0627\u0644\u0623\u0648\u0644. \u0648\u0644\u0627 \u064A\u064F\u0639\u0641\u064A \u0630\u0644\u0643 \u0645\u0646 \u062F\u0641\u0639\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0628\u0627\u0644\u063A\u0629 15\u066A\u060C \u0625\u0630 \u062A\u0628\u0642\u0649 \u0645\u0633\u062A\u062D\u0642\u0629 \u0648\u0641\u0642 \u062C\u062F\u0648\u0644 \u0627\u0644\u062F\u0641\u0639. \u0648\u062A\u064F\u0641\u0648\u062A\u0631 \u0627\u0644\u0623\u0634\u0647\u0631 \u0645\u0646 2 \u0625\u0644\u0649 13 \u062D\u0633\u0628 \u0633\u0639\u0631 \u0627\u0644\u0639\u0642\u062F. \u0648\u0644\u0627 \u064A\u0633\u0631\u064A \u0627\u0644\u0625\u0639\u0641\u0627\u0621 \u0639\u0644\u0649 \u0627\u0644\u062A\u062C\u062F\u064A\u062F\u0627\u062A. \u0648\u0644\u0627 \u064A\u062A\u062C\u062F\u062F \u0627\u0644\u0639\u0642\u062F \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B\u061B \u0648\u0623\u064A \u062A\u062C\u062F\u064A\u062F \u064A\u062A\u0637\u0644\u0628 \u0645\u0648\u0627\u0641\u0642\u0629 \u0635\u0631\u064A\u062D\u0629 \u0645\u0646 \u0627\u0644\u0645\u0627\u0644\u0643.",
    true
  ) : withLegalDraftMark(
    "This Agreement is for a 13-month term. The first month's management fee is waived. This does not waive the 15% mobilisation fee, which remains due as set out in the payment schedule. Months 2 to 13 are billed at the contract rate. The waiver does not apply to renewals. The contract does not auto-renew; any renewal requires the Owner's explicit consent.",
    false
  );
}
function ownerWaivedFirstMonthCopy(arabic = false) {
  return ownerComplimentaryMonthCopy(arabic);
}
function ownerCancellationWindowCopy(arabic = false, fee = formatOwnerInitialCancellationFee()) {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  const nature = arabic ? fee.natureAr : fee.natureEn;
  return arabic ? withLegalDraftMark(
    `\u064A\u062C\u0648\u0632 \u0644\u0623\u064A \u0637\u0631\u0641 \u0625\u0646\u0647\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0628\u0645\u0648\u062C\u0628 \u0625\u0634\u0639\u0627\u0631 \u0643\u062A\u0627\u0628\u064A. \u0648\u064A\u064F\u0633\u062A\u062D\u0642 ${nature} \u0648\u0641\u0642 \u0627\u0644\u062C\u062F\u0648\u0644 \u0627\u0644\u062A\u0627\u0644\u064A: ${feeText}. \u0648\u062A\u0639\u0641\u064A \u0641\u062A\u0631\u0629 \u0627\u0644\u0633\u0645\u0627\u062D \u0627\u0644\u0628\u0627\u0644\u063A\u0629 7 \u0623\u064A\u0627\u0645 \u0645\u0646 \u063A\u0631\u0627\u0645\u0629 \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0641\u0642\u0637\u060C \u0648\u0644\u0627 \u062A\u0639\u0641\u064A \u0645\u0646 \u0633\u062F\u0627\u062F \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062A\u0639\u0628\u0626\u0629 \u0627\u0644\u0645\u0648\u062B\u0642\u0629 \u0627\u0644\u062A\u064A \u0623\u064F\u0646\u062C\u0632\u062A \u0641\u0639\u0644\u0627\u064B. \u0648\u0628\u0639\u062F \u0627\u0644\u064A\u0648\u0645 7 \u062A\u0633\u0631\u064A \u0627\u0644\u0646\u0633\u0628\u0629 \u062D\u062A\u0649 \u062E\u0644\u0627\u0644 \u0634\u0647\u0631 \u0627\u0644\u0625\u0639\u0641\u0627\u0621 \u0645\u0646 \u0631\u0633\u0648\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u0629. \u0648\u064A\u062C\u0628 \u0627\u0644\u0625\u0641\u0635\u0627\u062D \u0639\u0646 \u0630\u0644\u0643 \u0644\u0644\u0645\u0627\u0644\u0643 \u0642\u0628\u0644 \u0627\u0644\u062A\u0648\u0642\u064A\u0639. \u0648\u0644\u0627 \u064A\u064F\u0639\u062A\u0645\u062F \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0648\u0644\u0627 \u0623\u064A \u0645\u0628\u0644\u063A \u0645\u0627\u0644\u064A \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B\u061B \u064A\u0644\u0632\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0625\u062F\u0627\u0631\u064A \u0645\u0646 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0623\u0648 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062E\u062A\u0635\u0629. \u0644\u0627 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0623\u0648 \u0627\u0644\u0639\u0642\u0648\u062F. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0627\u062F\u0629 390 \u0645\u0646 \u0642\u0627\u0646\u0648\u0646 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0627\u0644\u0645\u062F\u0646\u064A\u0629\u060C \u0648\u0627\u0644\u0645\u0627\u062F\u0629 21 \u0645\u0646 \u0627\u0644\u0642\u0627\u0646\u0648\u0646 \u0627\u0644\u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 15 \u0644\u0633\u0646\u0629 2020\u060C \u0648\u0642\u0631\u0627\u0631 \u0645\u062C\u0644\u0633 \u0627\u0644\u0648\u0632\u0631\u0627\u0621 \u0631\u0642\u0645 66 \u0644\u0633\u0646\u0629 2023.`,
    true
  ) : withLegalDraftMark(
    `Either party may end this Agreement by written notice. ${nature.charAt(0).toUpperCase()}${nature.slice(1)} shall apply as follows: ${feeText}. The 7-day grace period waives the cancellation penalty only; it does not waive payment for verifiable mobilisation work already done. After day 7 the percentage applies even during the waived first management-fee month, and must be disclosed to the Owner before signing. Cancellation and any money amount are never auto-approved; Admin or Finance Admin approval is required. AI never approves money or contracts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include Civil Code Article 390, Federal Law 15 of 2020 Article 21, and Cabinet Resolution 66 of 2023.`,
    false
  );
}
function ownerCancellationFeePreSignNoticeCopy(arabic = false, fee = formatOwnerInitialCancellationFee()) {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  return arabic ? withLegalDraftMark(
    `\u064A\u064F\u0631\u062C\u0649 \u0627\u0644\u0639\u0644\u0645 \u0642\u0628\u0644 \u0627\u0644\u062A\u0648\u0642\u064A\u0639: \u0645\u062F\u0629 \u0627\u0644\u0639\u0642\u062F 13 \u0634\u0647\u0631\u0627\u064B\u060C \u0648\u062A\u064F\u0639\u0641\u0649 \u0631\u0633\u0648\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u0644\u0634\u0647\u0631 \u0627\u0644\u0623\u0648\u0644. \u0648\u062C\u062F\u0648\u0644 \u0631\u0633\u0648\u0645 \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0647\u0648 ${feeText}. \u0648\u062A\u0639\u0641\u064A \u0641\u062A\u0631\u0629 \u0627\u0644\u0633\u0645\u0627\u062D \u0627\u0644\u0628\u0627\u0644\u063A\u0629 7 \u0623\u064A\u0627\u0645 \u0645\u0646 \u0627\u0644\u063A\u0631\u0627\u0645\u0629 \u0641\u0642\u0637\u060C \u0648\u0644\u064A\u0633 \u0645\u0646 \u0633\u062F\u0627\u062F \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062A\u0639\u0628\u0626\u0629 \u0627\u0644\u0645\u0648\u062B\u0642\u0629 \u0627\u0644\u0645\u0646\u062C\u0632\u0629. \u0648\u0628\u0639\u062F \u0627\u0644\u064A\u0648\u0645 7 \u062A\u0633\u0631\u064A \u0627\u0644\u0646\u0633\u0628\u0629 \u062D\u062A\u0649 \u062E\u0644\u0627\u0644 \u0634\u0647\u0631 \u0627\u0644\u0625\u0639\u0641\u0627\u0621.`,
    true
  ) : withLegalDraftMark(
    `Please note before signing: this Agreement is for a 13-month term, and the first month's management fee is waived. The cancellation fee schedule is ${feeText}. The 7-day grace period waives the penalty only, not payment for verifiable mobilisation work already done. After day 7 the percentage applies even during the waived first month.`,
    false
  );
}
function ownerMobilisationRefundCopy(arabic = false) {
  const deliverablesEn = OWNER_MOBILISATION_DELIVERABLES_EN.join(", ");
  const deliverablesAr = OWNER_MOBILISATION_DELIVERABLES_AR.join("\u060C ");
  return arabic ? withLegalDraftMark(
    `\u062A\u063A\u0637\u064A \u062F\u0641\u0639\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0628\u0627\u0644\u063A\u0629 15\u066A \u0623\u0639\u0645\u0627\u0644 \u0628\u062F\u0621 \u0627\u0644\u062A\u0639\u0627\u0642\u062F \u0627\u0644\u0623\u0648\u0644\u064A\u0629\u060C \u0648\u062A\u0634\u0645\u0644: ${deliverablesAr}. \u0648\u0625\u0630\u0627 \u0623\u064F\u0644\u063A\u064A\u062A \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0642\u0628\u0644 \u0627\u0643\u062A\u0645\u0627\u0644 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062A\u0639\u0628\u0626\u0629\u060C \u062A\u062D\u062A\u0641\u0638 BIN GROUP \u0641\u0642\u0637 \u0628\u0627\u0644\u062C\u0632\u0621 \u0645\u0646 \u062F\u0641\u0639\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0630\u064A \u064A\u0642\u0627\u0628\u0644 \u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0645\u0643\u062A\u0633\u0628\u0629 \u0623\u0648 \u0641\u0639\u0644\u064A\u0629 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646\u0647\u0627\u060C \u0648\u062A\u064F\u0639\u0631\u0636 \u0628\u0646\u062F\u0627\u064B \u0628\u0646\u062F\u0627\u064B\u060C \u0648\u064A\u064F\u0631\u062F \u0627\u0644\u0631\u0635\u064A\u062F \u063A\u064A\u0631 \u0627\u0644\u0645\u0643\u062A\u0633\u0628. \u0648\u0644\u0627 \u062A\u0639\u0641\u064A \u0641\u062A\u0631\u0629 \u0627\u0644\u0633\u0645\u0627\u062D \u0627\u0644\u0628\u0627\u0644\u063A\u0629 7 \u0623\u064A\u0627\u0645 \u0645\u0646 \u0633\u062F\u0627\u062F \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062A\u0639\u0628\u0626\u0629 \u0627\u0644\u0645\u0648\u062B\u0642\u0629 \u0627\u0644\u0645\u0646\u062C\u0632\u0629. \u0648\u064A\u062C\u0628 \u0623\u0646 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0623\u0648 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0623\u064A \u0645\u0628\u0644\u063A \u064A\u064F\u062D\u062A\u0641\u0638 \u0628\u0647 \u0623\u0648 \u064A\u064F\u0631\u062F. \u0648\u0644\u0627 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0623\u0648 \u0627\u0644\u0639\u0642\u0648\u062F.`,
    true
  ) : withLegalDraftMark(
    `The 15% mobilisation fee covers initial onboarding deliverables, including: ${deliverablesEn}. If this Agreement ends before mobilisation work is completed, BIN GROUP shall retain only the portion of mobilisation that corresponds to verifiable earned or incurred expenses, which will be itemised, and shall refund the unearned balance. The 7-day cancellation-fee grace does not waive payment for verifiable mobilisation work already done. Admin or Finance Admin must approve any retained or refunded amount. AI never approves money or contracts.`,
    false
  );
}
function ownerGoverningLawJurisdictionCopy(arabic = false) {
  const threshold = CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED.toLocaleString(arabic ? "ar-AE" : "en-AE");
  return arabic ? withLegalDraftMark(
    `\u062A\u062E\u0636\u0639 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0644\u0642\u0648\u0627\u0646\u064A\u0646 \u062F\u0648\u0644\u0629 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0645\u062A\u062D\u062F\u0629. \u0648\u062A\u062E\u062A\u0635 \u0644\u062C\u0646\u0629 \u0627\u0644\u0625\u064A\u062C\u0627\u0631\u0627\u062A \u0623\u0648 \u0645\u0631\u0643\u0632 \u062A\u0633\u0648\u064A\u0629 \u0627\u0644\u0645\u0646\u0627\u0632\u0639\u0627\u062A \u0627\u0644\u0625\u064A\u062C\u0627\u0631\u064A\u0629 (RDC) \u0641\u064A \u0627\u0644\u0625\u0645\u0627\u0631\u0629 \u0627\u0644\u062A\u064A \u064A\u0642\u0639 \u0641\u064A\u0647\u0627 \u0627\u0644\u0639\u0642\u0627\u0631 \u0627\u062E\u062A\u0635\u0627\u0635\u0627\u064B \u062D\u0635\u0631\u064A\u0627\u064B \u0628\u0646\u0632\u0627\u0639\u0627\u062A \u0627\u0644\u0625\u064A\u062C\u0627\u0631 \u0628\u064A\u0646 \u0627\u0644\u0645\u0627\u0644\u0643 (\u0623\u0648 \u0627\u0644\u0645\u062F\u064A\u0631 \u0628\u0627\u0644\u0646\u064A\u0627\u0628\u0629 \u0639\u0646 \u0627\u0644\u0645\u0627\u0644\u0643) \u0648\u0627\u0644\u0645\u0633\u062A\u0623\u062C\u0631. \u0623\u0645\u0627 \u0627\u0644\u0646\u0632\u0627\u0639\u0627\u062A \u0628\u064A\u0646 \u0627\u0644\u0645\u0627\u0644\u0643 \u0648\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0627\u0634\u0626\u0629 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0641\u062A\u062E\u062A\u0635 \u0628\u0647\u0627 \u0627\u062E\u062A\u0635\u0627\u0635\u0627\u064B \u062D\u0635\u0631\u064A\u0627\u064B \u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u0625\u0645\u0627\u0631\u0629 \u0627\u0644\u062A\u064A \u064A\u0642\u0639 \u0641\u064A\u0647\u0627 \u0627\u0644\u0639\u0642\u0627\u0631 \u0641\u0639\u0644\u064A\u0627\u064B. \u0648\u0644\u0627 \u062A\u0641\u0631\u0636 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u062A\u062D\u0643\u064A\u0645\u0627\u064B \u0625\u0644\u0632\u0627\u0645\u064A\u0627\u064B \u0639\u0644\u0649 \u0639\u0642\u062F \u0627\u0633\u062A\u0647\u0644\u0627\u0643\u064A \u062A\u0642\u0644 \u0642\u064A\u0645\u062A\u0647 \u0639\u0646 ${threshold} \u062F\u0631\u0647\u0645. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 42 \u0644\u0633\u0646\u0629 2022 \u0627\u0644\u0645\u0627\u062F\u0629 34\u060C \u0648\u0645\u0631\u0633\u0648\u0645 \u062F\u0628\u064A \u0631\u0642\u0645 26 \u0644\u0633\u0646\u0629 2013\u060C \u0648\u0642\u0627\u0646\u0648\u0646 \u062F\u0628\u064A \u0631\u0642\u0645 6 \u0644\u0633\u0646\u0629 2019\u060C \u0648\u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 14 \u0644\u0633\u0646\u0629 2023.`,
    true
  ) : withLegalDraftMark(
    `This Agreement is governed by the laws of the United Arab Emirates. Tenancy disputes between the Owner (or the Manager acting on the Owner's behalf) and a tenant shall be subject to the exclusive jurisdiction of the rent committee or Rental Disputes Settlement Centre (RDC) in the emirate where the Property is located. Disputes between the Owner and the Manager arising from this Agreement shall be subject to the exclusive jurisdiction of the courts of the Emirate where the Property is physically located. This Agreement does not impose mandatory arbitration on a consumer contract valued under AED ${threshold}. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include Federal Decree-Law 42 of 2022 Article 34, Dubai Decree 26 of 2013, Dubai Law 6 of 2019, and Federal Decree-Law 14 of 2023.`,
    false
  );
}
function ownerLanguagePrecedenceCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    "\u062D\u064F\u0631\u0631\u062A \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0628\u0627\u0644\u0644\u063A\u062A\u064A\u0646 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u0648\u0627\u0644\u0639\u0631\u0628\u064A\u0629. \u0648\u0641\u064A \u062D\u0627\u0644 \u0623\u064A \u0627\u062E\u062A\u0644\u0627\u0641 \u0623\u0648 \u062A\u0639\u0627\u0631\u0636 \u0641\u064A \u0627\u0644\u062A\u0641\u0633\u064A\u0631 \u0628\u064A\u0646 \u0627\u0644\u0646\u0635\u064A\u0646\u060C \u064A\u064F\u0639\u062A\u062F \u0628\u0627\u0644\u0646\u0635 \u0627\u0644\u0639\u0631\u0628\u064A \u0648\u064A\u0633\u0648\u062F.",
    true
  ) : withLegalDraftMark(
    "This Agreement is drafted in both English and Arabic. In the event of any discrepancy or conflict in interpretation between the two texts, the Arabic version shall prevail.",
    false
  );
}
function ownerPdplCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    `\u062A\u064F\u0639\u0627\u0644\u062C \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0634\u062E\u0635\u064A\u0629\u060C \u0628\u0645\u0627 \u0641\u064A \u0630\u0644\u0643 \u0635\u0648\u0631 \u0627\u0644\u0639\u0642\u0627\u0631 \u0648\u0627\u0644\u0645\u0631\u0627\u0633\u0644\u0627\u062A\u060C \u0641\u0642\u0637 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629\u060C \u0648\u062A\u064F\u062D\u0641\u0638 \u0648\u0641\u0642 \u0641\u062A\u0631\u0627\u062A \u0627\u0644\u0627\u062D\u062A\u0641\u0627\u0638 \u0627\u0644\u0645\u0639\u0644\u0646\u0629\u060C \u0628\u0645\u0627 \u0641\u064A \u0630\u0644\u0643 \u0645\u0633\u0627\u0631 \u062A\u062F\u0642\u064A\u0642 \u0627\u0644\u0639\u0642\u0648\u062F \u0627\u0644\u0645\u0648\u0642\u0639\u0629 \u0644\u0645\u062F\u0629 10 \u0633\u0646\u0648\u0627\u062A. \u0648\u0642\u062F \u062A\u064F\u0646\u0642\u0644 \u0628\u0639\u0636 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0639\u0628\u0631 \u0627\u0644\u062D\u062F\u0648\u062F \u0639\u0628\u0631 \u0645\u0639\u0627\u0644\u062C\u064A \u0630\u0643\u0627\u0621 \u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0645\u0646 \u0623\u0637\u0631\u0627\u0641 \u062B\u0627\u0644\u062B\u0629 \u0644\u0644\u0648\u0638\u0627\u0626\u0641 \u0627\u0644\u062A\u064A \u064A\u062E\u062A\u0627\u0631\u0647\u0627 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u062A\u062A\u0637\u0644\u0628\u0647\u0627 \u0627\u0644\u062E\u062F\u0645\u0629\u060C \u0648\u0630\u0644\u0643 \u0628\u0645\u0648\u0627\u0641\u0642\u0629 \u0635\u0631\u064A\u062D\u0629. \u0648\u0644\u0627 \u062A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u062A\u0633\u0648\u064A\u0642 \u0625\u0644\u0627 \u0628\u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0634\u062A\u0631\u0627\u0643 \u0645\u0646\u0641\u0635\u0644\u0629 \u064A\u0645\u0643\u0646 \u0633\u062D\u0628\u0647\u0627 \u0641\u064A \u0623\u064A \u0648\u0642\u062A\u060C \u0648\u0644\u064A\u0633\u062A \u062A\u0644\u0643 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0634\u0631\u0637\u0627\u064B \u0644\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0645\u062A\u0639\u0627\u0642\u062F \u0639\u0644\u064A\u0647\u0627. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 45 \u0644\u0633\u0646\u0629 2021 \u0628\u0634\u0623\u0646 \u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0634\u062E\u0635\u064A\u0629.`,
    true
  ) : withLegalDraftMark(
    `Personal data, including property images and communications, is processed only to perform this Agreement and is retained in line with the published retention periods, including a 10-year signed-contract audit trail. Some data may be transferred across borders through third-party AI processors for features the user chooses or that the service requires, with explicit consent. It shall not be used for marketing without a separate opt-in, which the Owner may withdraw at any time. Marketing consent is not a condition of receiving the contracted service. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 45 of 2021 (PDPL).`,
    false
  );
}
function ownerDecennialAndMollakCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    `\u0644\u0627 \u062A\u062A\u062D\u0645\u0644 \u0627\u0644\u062C\u0647\u0629 \u0627\u0644\u0645\u062F\u064A\u0631\u0629 \u0627\u0644\u0645\u0633\u0624\u0648\u0644\u064A\u0629 \u0639\u0646 \u0627\u0644\u0639\u064A\u0648\u0628 \u0627\u0644\u0625\u0646\u0634\u0627\u0626\u064A\u0629 \u0627\u0644\u0633\u0627\u0628\u0642\u0629 \u0627\u0644\u0645\u0634\u0645\u0648\u0644\u0629 \u0628\u0627\u0644\u0636\u0645\u0627\u0646 \u0627\u0644\u0639\u0634\u0631\u064A \u0644\u0644\u0645\u0637\u0648\u0651\u0631. \u0648\u0628\u0627\u0644\u0646\u0633\u0628\u0629 \u0644\u0644\u0639\u0642\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629 \u0627\u0644\u0645\u0644\u0643\u064A\u0629 \u0641\u064A \u062F\u0628\u064A\u060C \u062A\u064F\u062F\u0641\u0639 \u062C\u0645\u064A\u0639 \u0631\u0633\u0648\u0645 \u0627\u0644\u062E\u062F\u0645\u0629 \u0639\u0628\u0631 \u0646\u0638\u0627\u0645 \u0645\u0644\u0627\u0643 \u0625\u0644\u0649 \u062D\u0633\u0627\u0628 \u0627\u0644\u0636\u0645\u0627\u0646 \u0627\u0644\u0645\u0639\u062A\u0645\u062F \u0645\u0646 \u0631\u064A\u0631\u0627\u060C \u0648\u0644\u0627 \u062A\u062D\u0635\u0651\u0644\u0647\u0627 BIN GROUP \u0645\u0628\u0627\u0634\u0631\u0629 \u0623\u0628\u062F\u0627\u064B. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0623\u062D\u0643\u0627\u0645 \u0627\u0644\u0636\u0645\u0627\u0646 \u0627\u0644\u0639\u0634\u0631\u064A \u0648\u0642\u0627\u0646\u0648\u0646 \u062F\u0628\u064A \u0631\u0642\u0645 6 \u0644\u0633\u0646\u0629 2019.`,
    true
  ) : withLegalDraftMark(
    `The Manager assumes no liability for pre-existing structural defects that are subject to developer decennial liability. For Dubai jointly owned properties, all service charges must be paid via the Mollak system into the RERA-approved escrow, and are never collected by BIN GROUP directly. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include the decennial-liability provisions and Dubai Law 6 of 2019.`,
    false
  );
}
function ownerLicenceBlockCopy(arabic = false, options = {}) {
  const block = formatOwnerLicenceBlock(options);
  return arabic ? withLegalDraftMark(
    `\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062F\u064A\u0631: ${BIN_GROUP_LEGAL_ENTITY_NAME}. \u0631\u0642\u0645 \u0627\u0644\u0631\u062E\u0635\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629: ${block.tradeLicence.displayAr}. \u0631\u0642\u0645 \u062A\u0633\u062C\u064A\u0644 \u0631\u064A\u0631\u0627 (ORN): ${block.reraOrn.displayAr}. \u0631\u0642\u0645 \u062A\u0633\u062C\u064A\u0644 \u0645\u0631\u0643\u0632 \u0623\u0628\u0648\u0638\u0628\u064A \u0627\u0644\u0639\u0642\u0627\u0631\u064A (ADREC): ${block.adrecReg.displayAr}. \u0648\u064A\u062E\u0636\u0639 \u0647\u0630\u0627 \u0627\u0644\u0639\u0642\u062F \u0644\u0644\u062A\u0633\u062C\u064A\u0644 \u0639\u0628\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0628\u0644\u062F\u064A \u0627\u0644\u0645\u062D\u0644\u064A (\u0645\u062B\u0644 \u0625\u064A\u062C\u0627\u0631\u064A \u0623\u0648 \u062A\u0648\u062B\u064A\u0642). \u0648\u0627\u0644\u0631\u062E\u0635\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629 \u0645\u0642\u062F\u0645\u0629 \u0645\u0646 \u0627\u0644\u0645\u0624\u0633\u0633. \u0623\u0645\u0627 \u0631\u0642\u0645 \u0631\u064A\u0631\u0627 \u0648\u062A\u0633\u062C\u064A\u0644 ADREC \u0648\u0623\u064A \u0631\u062E\u0635\u0629 \u0625\u062F\u0627\u0631\u0629 \u0639\u0642\u0627\u0631\u0627\u062A \u0645\u0646\u0641\u0635\u0644\u0629 \u0641\u062D\u0642\u0648\u0644 \u0645\u0624\u0642\u062A\u0629 \u0648\u0644\u064A\u0633\u062A \u0623\u0631\u0642\u0627\u0645\u0627\u064B \u0645\u062E\u062A\u0631\u0639\u0629 \u0625\u0644\u0649 \u062D\u064A\u0646 \u0625\u062F\u0631\u0627\u062C\u0647\u0627.`,
    true
  ) : withLegalDraftMark(
    `Manager details: ${BIN_GROUP_LEGAL_ENTITY_NAME}. Trade licence no.: ${block.tradeLicence.displayEn}. RERA ORN: ${block.reraOrn.displayEn}. ADREC registration no.: ${block.adrecReg.displayEn}. This contract is subject to registration via the local municipal system (for example Ejari or Tawtheeq). The trade licence is founder-supplied. The RERA ORN, ADREC registration and any separate property-management licence remain placeholders, not invented numbers, until the real particulars are inserted.`,
    false
  );
}
function ownerVatTreatmentCopy(arabic = false) {
  const rate = OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT;
  return arabic ? withLegalDraftMark(
    `\u0631\u0633\u0648\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0648\u0633\u0627\u0626\u0631 \u0631\u0633\u0648\u0645 \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0645\u0628\u064A\u0646\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u063A\u064A\u0631 \u0634\u0627\u0645\u0644\u0629 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 \u0641\u064A \u062F\u0648\u0644\u0629 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A \u0627\u0644\u0628\u0627\u0644\u063A\u0629 ${rate}\u066A\u060C \u0648\u0647\u064A \u062E\u0627\u0636\u0639\u0629 \u0644\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 \u0628\u0646\u0633\u0628\u0629 ${rate}\u066A \u062A\u064F\u062D\u0635\u0651\u064E\u0644 \u0639\u0646\u062F \u0625\u0635\u062F\u0627\u0631 \u0631\u0642\u0645 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0636\u0631\u064A\u0628\u064A (TRN) \u0648\u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646\u0647. \u0648\u0625\u0644\u0649 \u062D\u064A\u0646 \u0630\u0644\u0643 \u0627\u0644\u062A\u062D\u0642\u0642\u060C \u062A\u064F\u0635\u062F\u0631 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0628\u0639\u0646\u0648\u0627\u0646 "\u0641\u0627\u062A\u0648\u0631\u0629 \u062A\u062C\u0627\u0631\u064A\u0629" \u062F\u0648\u0646 \u0628\u0646\u062F \u0644\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629\u060C \u0648\u0644\u0627 \u064A\u062C\u0648\u0632 \u062A\u0633\u0645\u064A\u062A\u0647\u0627 \u0641\u0627\u062A\u0648\u0631\u0629 \u0636\u0631\u064A\u0628\u064A\u0629\u060C \u0648\u062A\u0643\u0648\u0646 \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0629 \u0645\u0633\u0627\u0648\u064A\u0629 \u0644\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0629. \u0648\u0628\u0639\u062F \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0631\u0642\u0645 \u062A\u064F\u0635\u062F\u0631 \u0641\u0648\u0627\u062A\u064A\u0631 \u0636\u0631\u064A\u0628\u064A\u0629 \u0648\u0641\u0642\u0627\u064B \u0644\u0644\u0645\u0627\u062F\u0629 59 (\u0644\u0644\u062A\u0623\u0643\u064A\u062F \u0645\u0646 \u0627\u0644\u0645\u0633\u062A\u0634\u0627\u0631 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A)\u060C \u0645\u0639 \u062D\u0642\u0648\u0644 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0645\u0628\u0633\u0637\u0629 \u0623\u0648 \u0627\u0644\u0643\u0627\u0645\u0644\u0629 \u0644\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0628\u064A\u0646 \u0627\u0644\u0645\u0646\u0634\u0622\u062A \u0627\u0644\u062A\u064A \u062A\u062A\u062C\u0627\u0648\u0632 10,000 \u062F\u0631\u0647\u0645\u060C \u0648\u062E\u0644\u0627\u0644 14 \u064A\u0648\u0645\u0627\u064B. \u0648\u0644\u0645 \u062A\u064F\u063A\u064A\u0651\u064E\u0631 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u0639\u0631\u0648\u0636\u0629 \u0644\u0625\u062F\u0631\u0627\u062C \u0627\u0644\u0636\u0631\u064A\u0628\u0629. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 8 \u0644\u0633\u0646\u0629 2017 \u0628\u0634\u0623\u0646 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629.`,
    true
  ) : withLegalDraftMark(
    `The management fees and other service fees shown in this Agreement are exclusive of ${rate}% UAE VAT and are subject to ${rate}% VAT, which will be collected once a Tax Registration Number (TRN) is issued and verified. Until that verification, invoices are titled \u201CCommercial Invoice\u201D, carry no VAT line, must not be titled \u201CTax Invoice\u201D, and the amounts due equal the quoted net figures. Once a TRN is verified, tax invoices will be issued under Article 59 (for counsel to confirm), with simplified or full B2B fields above AED 10,000, within 14 days of the supply. Quoted prices have not been changed to include VAT. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 8 of 2017 (VAT).`,
    false
  );
}
function ownerAmlCashThresholdCopy(arabic = false, threshold = formatOwnerCashAcceptanceThreshold()) {
  const amount = arabic ? threshold.displayAr : threshold.displayEn;
  return arabic ? withLegalDraftMark(
    `\u062A\u0628\u0642\u0649 \u0627\u0644\u062F\u0641\u0639\u0627\u062A \u0645\u0642\u0628\u0648\u0644\u0629 \u0628\u0627\u0644\u062F\u0631\u0647\u0645 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A\u064A \u0646\u0642\u062F\u0627\u064B \u0623\u0648 \u0628\u0634\u064A\u0643 \u0641\u0642\u0637 (${OWNER_PAYMENT_POLICY_VERSION}). \u0648\u062D\u062F \u0627\u0644\u0642\u0628\u0648\u0644 \u0627\u0644\u0646\u0642\u062F\u064A \u0647\u0648 ${amount} \u0644\u0643\u0644 \u0639\u0642\u062F \u0639\u0642\u0627\u0631\u060C \u0633\u0648\u0627\u0621 \u062F\u0641\u0639\u0629 \u0648\u0627\u062D\u062F\u0629 \u0623\u0648 \u062F\u0641\u0639\u0627\u062A \u0646\u0642\u062F\u064A\u0629 \u0645\u0631\u062A\u0628\u0637\u0629 \u0623\u0648 \u062A\u0631\u0627\u0643\u0645\u064A\u0629. \u0648\u0645\u0627 \u064A\u0632\u064A\u062F \u0639\u0644\u0649 \u0630\u0644\u0643 \u064A\u064F\u0633\u062F\u062F \u0628\u0634\u064A\u0643 \u0623\u0648 \u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A \u0641\u0642\u0637\u060C \u0648\u064A\u064F\u0637\u0628\u0642 \u0627\u0644\u0646\u0638\u0627\u0645 \u0647\u0630\u0627 \u0627\u0644\u062D\u062F \u0641\u064A \u062A\u062F\u0641\u0642\u0627\u062A \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0646\u0642\u062F. \u0648\u0644\u0627 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0645\u0628\u0627\u0644\u063A. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR}`,
    true
  ) : withLegalDraftMark(
    `Payments remain accepted only in AED by cash or cheque (${OWNER_PAYMENT_POLICY_VERSION}). The cash-acceptance cap is ${amount} per property contract, whether a single payment or linked/cumulative cash payments. Amounts above that cap must be paid by cheque or bank transfer only, and the cap is system-enforced in cash recording flows. AI never approves money amounts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN}`,
    false
  );
}
function ownerReturnedChequeCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    `\u064A\u064F\u0639\u062F \u0627\u0644\u0634\u064A\u0643 \u0627\u0644\u0645\u0631\u062A\u062C\u0639 \u0633\u0646\u062F\u0627\u064B \u062A\u0646\u0641\u064A\u0630\u064A\u0627\u064B \u0628\u0645\u0648\u062C\u0628 \u0627\u0644\u0642\u0648\u0627\u0646\u064A\u0646 \u0627\u0644\u0645\u0639\u0645\u0648\u0644 \u0628\u0647\u0627 \u0641\u064A \u062F\u0648\u0644\u0629 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A. \u0648\u0642\u0628\u0648\u0644 \u062F\u0641\u0639\u0629 \u062C\u0632\u0626\u064A\u0629 \u0644\u0627 \u064A\u0633\u0642\u0637 \u0627\u0644\u062D\u0642 \u0641\u064A \u0627\u0644\u0645\u0637\u0627\u0644\u0628\u0629 \u0628\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u062A\u0628\u0642\u064A. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 50 \u0644\u0633\u0646\u0629 2022 \u0628\u0634\u0623\u0646 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629.`,
    true
  ) : withLegalDraftMark(
    `A returned cheque constitutes an executive instrument under applicable UAE law. Acceptance of a partial payment does not waive the outstanding balance. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 50 of 2022 on Commercial Transactions.`,
    false
  );
}
function ownerAgencyNoGuaranteeCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    "\u064A\u062A\u0635\u0631\u0641 \u0627\u0644\u0645\u062F\u064A\u0631 \u0628\u0635\u0641\u062A\u0647 \u0648\u0643\u064A\u0644\u0627\u064B \u0639\u0646 \u0627\u0644\u0645\u0627\u0644\u0643\u060C \u0648\u0644\u0627 \u064A\u0636\u0645\u0646 \u0639\u0648\u0627\u0626\u062F \u0627\u0644\u0625\u064A\u062C\u0627\u0631 \u0648\u0644\u0627 \u0623\u062F\u0627\u0621 \u0627\u0644\u0645\u0633\u062A\u0623\u062C\u0631 \u0648\u0644\u0627 \u062D\u0627\u0644\u0629 \u0627\u0644\u0639\u0642\u0627\u0631.",
    true
  ) : withLegalDraftMark(
    "The Manager acts as the Owner's agent and does not guarantee rental yields, tenant performance, or property condition.",
    false
  );
}
function ownerEmergencyRepairCopy(arabic = false, limit = formatOwnerEmergencyRepairLimit()) {
  const amount = arabic ? limit.displayAr : limit.displayEn;
  const approverEn = OWNER_EMERGENCY_REPAIR_APPROVER || "to be confirmed";
  const approverAr = OWNER_EMERGENCY_REPAIR_APPROVER || "\u064A\u064F\u0624\u0643\u062F \u0644\u0627\u062D\u0642\u0627\u064B";
  return arabic ? withLegalDraftMark(
    `\u064A\u062C\u0648\u0632 \u0644\u0644\u0645\u062F\u064A\u0631 \u0623\u0646 \u064A\u0648\u062C\u0647 \u0628\u0625\u062C\u0631\u0627\u0621 \u0625\u0635\u0644\u0627\u062D\u0627\u062A \u0637\u0627\u0631\u0626\u0629 \u0644\u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062A\u0643\u064A\u064A\u0641 \u0623\u0648 \u0644\u062A\u0633\u0631\u0628 \u0627\u0644\u0645\u064A\u0627\u0647 \u0641\u064A \u062D\u062F\u0648\u062F \u0645\u0628\u0644\u063A \u0644\u0643\u0644 \u062D\u0627\u062F\u062B\u0629 \u0642\u062F\u0631\u0647 ${amount}\u060C \u0648\u0630\u0644\u0643 \u0641\u0642\u0637 \u0628\u0639\u062F \u0645\u0648\u0627\u0641\u0642\u0629 \u0625\u0646\u0633\u0627\u0646 (${approverAr}) \u0648\u0641\u0642\u0627\u064B \u0644\u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0645\u0627\u0644 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u0644\u062F\u0649 BIN\u060C \u0648\u0644\u064A\u0633 \u0645\u0646 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0623\u0628\u062F\u0627\u064B. \u0648\u0644\u0627 \u062A\u064F\u0639\u0644\u0651\u064E\u0642 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0637\u0648\u0627\u0631\u0626 \u0623\u0648 \u062A\u064F\u0648\u0642\u0641 \u062F\u0648\u0646 \u0625\u0634\u0639\u0627\u0631 \u0643\u062A\u0627\u0628\u064A \u0645\u0646\u0641\u0635\u0644. \u0648\u0644\u0627 \u064A\u0631\u0641\u0639 \u0647\u0630\u0627 \u0627\u0644\u0628\u0646\u062F \u062D\u062F\u0648\u062F \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0648\u0627\u0644\u0625\u0646\u0641\u0627\u0642 \u0627\u0644\u0637\u0627\u0631\u0626 \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0627\u0644\u0645\u0646\u0635\u0648\u0635 \u0639\u0644\u064A\u0647\u0627 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0648\u0644\u0627 \u064A\u062D\u0644 \u0645\u062D\u0644\u0647\u0627. \u0648\u0644\u0627 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0623\u064A \u0625\u0646\u0641\u0627\u0642. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR}`,
    true
  ) : withLegalDraftMark(
    `The Manager may instruct emergency HVAC or water-leak repairs up to a per-incident limit of ${amount}, and only after approval by a human (${approverEn}) in accordance with BIN money rules. AI systems may never approve any such spend. Emergency works are never suspended without separate written notice. This clause does not raise or replace the operational approval and emergency spending limits already stated in this Agreement. AI never approves money. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN}`,
    false
  );
}
export {
  BIN_GROUP_ADREC_AUTHORISATION_REF,
  BIN_GROUP_ADREC_REG_REF,
  BIN_GROUP_LEGAL_ENTITY_NAME,
  BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR,
  BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN,
  BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF,
  BIN_GROUP_RERA_ORN_REF,
  BIN_GROUP_TRADE_LICENCE_EMIRATE,
  BIN_GROUP_TRADE_LICENCE_REF,
  BIN_GROUP_TRADE_LICENCE_STATUS,
  BIN_GROUP_TRADE_NAME,
  CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED,
  LEGAL_CITATION_DISCLAIMER_AR,
  LEGAL_CITATION_DISCLAIMER_EN,
  LEGAL_CONSENT_VERSION,
  LEGAL_DRAFT_MARK_AR,
  LEGAL_DRAFT_MARK_EN,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_FLOOR_THRESHOLD,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_STATUS,
  OWNER_CANCELLATION_FEE_BANDS,
  OWNER_CANCELLATION_FEE_BASIS,
  OWNER_CANCELLATION_FEE_MODEL,
  OWNER_CANCELLATION_GRACE_DAYS,
  OWNER_CANCELLATION_GRACE_DOES_NOT_WAIVE_MOBILISATION_WORK,
  OWNER_CANCELLATION_GRACE_WAIVES_PENALTY_ONLY,
  OWNER_CASH_ACCEPTANCE_THRESHOLD_AED,
  OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_AR,
  OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_EN,
  OWNER_CASH_ACCEPTANCE_THRESHOLD_SCOPE,
  OWNER_CASH_ACCEPTANCE_THRESHOLD_STATUS,
  OWNER_COMPLIMENTARY_MONTHS,
  OWNER_CONTRACT_AUTO_RENEWAL,
  OWNER_CONTRACT_RENEWAL_REQUIRES_EXPLICIT_CONSENT,
  OWNER_EMERGENCY_REPAIR_APPROVER,
  OWNER_EMERGENCY_REPAIR_APPROVER_STATUS,
  OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED,
  OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_STATUS,
  OWNER_INITIAL_CANCELLATION_FEE_AED,
  OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR,
  OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN,
  OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH,
  OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH_STATUS,
  OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE,
  OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
  OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
  OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_AR,
  OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_EN,
  OWNER_INITIAL_CANCELLATION_FEE_STATUS,
  OWNER_INITIAL_CANCELLATION_WINDOW_DAYS,
  OWNER_INITIAL_CONTRACT_TERM_MONTHS,
  OWNER_INITIAL_MOBILISATION_REFUND_IS_FOUNDER_DEFAULT,
  OWNER_INITIAL_MOBILISATION_REFUND_POLICY,
  OWNER_INVOICE_VAT_TREATMENT_UNTIL_TRN_VERIFIED,
  OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT,
  OWNER_MOBILISATION_DELIVERABLES_AR,
  OWNER_MOBILISATION_DELIVERABLES_EN,
  OWNER_PAYMENT_POLICY_VERSION,
  OWNER_PRE_TRN_INVOICE_TITLE_AR,
  OWNER_PRE_TRN_INVOICE_TITLE_EN,
  OWNER_QUOTE_PRICES_ARE_VAT_EXCLUSIVE,
  OWNER_RENEWAL_CONTRACT_TERM_MONTHS,
  OWNER_SERVICE_TERM_MONTHS,
  OWNER_TAX_INVOICE_TITLE_AR,
  OWNER_TAX_INVOICE_TITLE_EN,
  REQUIRED_OWNER_CANCELLATION_FEE_BANDS,
  SIGNED_CONTRACT_AUDIT_COLLECTION,
  SIGNED_CONTRACT_AUDIT_RETENTION_YEARS,
  TECHNICIAN_GPS_CONSENT_COLLECTION,
  UAE_VAT_ARTICLE_59_CITATION_NOTE,
  UAE_VAT_ARTICLE_59_FULL_TAX_INVOICE_THRESHOLD_AED,
  UAE_VAT_TAX_INVOICE_ISSUANCE_DEADLINE_DAYS,
  UNVERIFIED_RESEARCH_CITATION_NOTE_AR,
  UNVERIFIED_RESEARCH_CITATION_NOTE_EN,
  cancellationFeeBandForDay,
  cashPaymentWouldExceedCap,
  computeOwnerCancellationFeeAed,
  computeOwnerCancellationPenaltyPercent,
  evaluateOwnerInitialCancellationFeeHonesty,
  formatOfficeHighRiseLogisticsUplift,
  formatOwnerCashAcceptanceThreshold,
  formatOwnerEmergencyRepairLimit,
  formatOwnerInitialCancellationFee,
  formatOwnerLicenceBlock,
  formatPropertyManagementLicenceRef,
  formatUnsetAedAmount,
  formatUnsetLegalRef,
  invoiceDocumentTitle,
  isOfficeHighRiseLogisticsUpliftSet,
  isOwnerCancellationFeeModelConfigured,
  isOwnerInitialCancellationFeeSet,
  ownerAgencyNoGuaranteeCopy,
  ownerAmlCashThresholdCopy,
  ownerCancellationFeeBandsAreValid,
  ownerCancellationFeePreSignNoticeCopy,
  ownerCancellationWindowCopy,
  ownerCashCapRejectionMessage,
  ownerComplimentaryMonthCopy,
  ownerDecennialAndMollakCopy,
  ownerEmergencyRepairCopy,
  ownerGoverningLawJurisdictionCopy,
  ownerLanguagePrecedenceCopy,
  ownerLicenceBlockCopy,
  ownerMobilisationRefundCopy,
  ownerPdplCopy,
  ownerReturnedChequeCopy,
  ownerVatTreatmentCopy,
  ownerWaivedFirstMonthCopy,
  requiresFullArticle59TaxInvoice,
  taxInvoiceIssuanceDeadlineIso,
  withLegalDraftMark
};
