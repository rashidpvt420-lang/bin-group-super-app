const OWNER_INITIAL_CONTRACT_TERM_MONTHS = 13;
const OWNER_RENEWAL_CONTRACT_TERM_MONTHS = 12;
const OWNER_SERVICE_TERM_MONTHS = 12;
const OWNER_COMPLIMENTARY_MONTHS = 1;
const OWNER_INITIAL_CANCELLATION_WINDOW_DAYS = 30;
const LEGAL_DRAFT_MARK_EN = "Draft, for UAE legal review";
const LEGAL_DRAFT_MARK_AR = "\u0645\u0633\u0648\u062F\u0629\u060C \u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0641\u064A \u062F\u0648\u0644\u0629 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A";
const UNVERIFIED_RESEARCH_CITATION_NOTE_EN = "Citations named here come from unverified research a UAE lawyer must confirm; they are not presented as verified law.";
const UNVERIFIED_RESEARCH_CITATION_NOTE_AR = "\u0627\u0644\u0627\u0633\u062A\u0634\u0647\u0627\u062F\u0627\u062A \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629 \u0647\u0646\u0627 \u0645\u0635\u062F\u0631\u0647\u0627 \u0628\u062D\u062B \u063A\u064A\u0631 \u0645\u062D\u0642\u0651\u064E\u0642 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0624\u0643\u062F\u0647\u0627 \u0645\u062D\u0627\u0645\u064D \u0625\u0645\u0627\u0631\u0627\u062A\u064A\u060C \u0648\u0644\u0627 \u062A\u064F\u0639\u0631\u0636 \u0628\u0648\u0635\u0641\u0647\u0627 \u0642\u0627\u0646\u0648\u0646\u0627\u064B \u0645\u062B\u0628\u062A\u0627\u064B.";
const OWNER_INITIAL_CANCELLATION_FEE_AED = null;
const OWNER_INITIAL_CANCELLATION_FEE_STATUS = "PENDING_FOUNDER_DECISION";
const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN = "to be confirmed";
const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR = "\u064A\u064F\u0624\u0643\u062F \u0644\u0627\u062D\u0642\u0627\u064B";
const OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE = "OWNER_INITIAL_CANCELLATION_FEE_UNSET";
const OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN = "a pre-estimate of administrative and onboarding expenses";
const OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR = "\u062A\u0642\u062F\u064A\u0631\u0627\u064B \u0645\u0633\u0628\u0642\u0627\u064B \u0644\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629 \u0648\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0628\u062F\u0621 \u0627\u0644\u062A\u0639\u0627\u0642\u062F";
const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF = null;
const BIN_GROUP_TRADE_LICENCE_REF = null;
const BIN_GROUP_RERA_ORN_REF = null;
const BIN_GROUP_ADREC_REG_REF = null;
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
function withLegalDraftMark(text, arabic = false) {
  const mark = arabic ? LEGAL_DRAFT_MARK_AR : LEGAL_DRAFT_MARK_EN;
  const trimmed = String(text || "").trim();
  if (!trimmed) return `${mark}.`;
  if (trimmed.startsWith(mark)) return trimmed;
  return `${mark}. ${trimmed}`;
}
function isOwnerInitialCancellationFeeSet(fee = OWNER_INITIAL_CANCELLATION_FEE_AED) {
  return typeof fee === "number" && Number.isFinite(fee) && fee >= 0;
}
function formatOwnerInitialCancellationFee(fee = OWNER_INITIAL_CANCELLATION_FEE_AED) {
  if (!isOwnerInitialCancellationFeeSet(fee)) {
    return {
      set: false,
      aed: null,
      status: OWNER_INITIAL_CANCELLATION_FEE_STATUS,
      displayEn: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN,
      displayAr: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR,
      natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
      natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR
    };
  }
  const aed = Number(fee);
  return {
    set: true,
    aed,
    status: "SET",
    displayEn: `AED ${aed.toLocaleString("en-AE")}`,
    displayAr: `${aed.toLocaleString("ar-AE")} \u062F\u0631\u0647\u0645`,
    natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
    natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR
  };
}
function evaluateOwnerInitialCancellationFeeHonesty(fee = OWNER_INITIAL_CANCELLATION_FEE_AED) {
  if (!isOwnerInitialCancellationFeeSet(fee)) {
    return {
      ok: false,
      code: OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE,
      blocksHardPublicLaunch: true,
      message: "Owner initial 30-day cancellation fee is pending a founder / Finance Admin decision and is unset. Hard public launch must stay NO-GO until a confirmed AED amount is set. Do not invent an amount."
    };
  }
  return {
    ok: true,
    code: "OWNER_INITIAL_CANCELLATION_FEE_SET",
    blocksHardPublicLaunch: false,
    message: "Owner initial 30-day cancellation fee has a confirmed AED amount."
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
function ownerComplimentaryMonthCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    "\u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0623\u0648\u0644 \u0647\u0648 \u0634\u0647\u0631 \u062E\u062F\u0645\u0629 \u0645\u062C\u0627\u0646\u064A \u062A\u0643\u0648\u0646 \u0641\u064A\u0647 \u0631\u0633\u0648\u0645 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062A\u0643\u0631\u0631\u0629 0 \u062F\u0631\u0647\u0645. \u0648\u0644\u0627 \u064A\u064F\u0639\u0641\u064A \u0630\u0644\u0643 \u0645\u0646 \u062F\u0641\u0639\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0628\u0627\u0644\u063A\u0629 15\u066A\u060C \u0625\u0630 \u062A\u0628\u0642\u0649 \u0645\u0633\u062A\u062D\u0642\u0629 \u0648\u0641\u0642 \u062C\u062F\u0648\u0644 \u0627\u0644\u062F\u0641\u0639. \u0648\u062A\u064F\u0641\u0648\u062A\u0631 \u0627\u0644\u0623\u0634\u0647\u0631 \u0645\u0646 2 \u0625\u0644\u0649 13 \u062D\u0633\u0628 \u0633\u0639\u0631 \u0627\u0644\u0639\u0642\u062F. \u0648\u0644\u0627 \u064A\u0633\u0631\u064A \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u062C\u0627\u0646\u064A \u0639\u0644\u0649 \u0627\u0644\u062A\u062C\u062F\u064A\u062F\u0627\u062A. \u0648\u0644\u0627 \u064A\u062A\u062C\u062F\u062F \u0627\u0644\u0639\u0642\u062F \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B\u061B \u0648\u0623\u064A \u062A\u062C\u062F\u064A\u062F \u064A\u062A\u0637\u0644\u0628 \u0645\u0648\u0627\u0641\u0642\u0629 \u0635\u0631\u064A\u062D\u0629 \u0645\u0646 \u0627\u0644\u0645\u0627\u0644\u0643.",
    true
  ) : withLegalDraftMark(
    "Month 1 is a complimentary service month in which the recurring management fee is AED 0. This does not waive the 15% mobilisation fee, which remains due as set out in the payment schedule. Months 2 to 13 are billed at the contract rate. The complimentary month does not apply to renewals. The contract does not auto-renew; any renewal requires the Owner\u2019s explicit consent.",
    false
  );
}
function ownerCancellationWindowCopy(arabic = false, fee = formatOwnerInitialCancellationFee()) {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  const nature = arabic ? fee.natureAr : fee.natureEn;
  return arabic ? withLegalDraftMark(
    `\u064A\u062C\u0648\u0632 \u0644\u0644\u0645\u0627\u0644\u0643 \u0637\u0644\u0628 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0639\u0642\u062F \u062E\u0644\u0627\u0644 ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} \u064A\u0648\u0645\u0627\u064B \u0645\u0646 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0639\u0642\u062F / \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062A\u0648\u0642\u064A\u0639. \u0648\u0625\u0630\u0627 \u0623\u064F\u0644\u063A\u064A \u0627\u0644\u0639\u0642\u062F \u062E\u0644\u0627\u0644 \u0647\u0630\u0647 \u0627\u0644\u0645\u0647\u0644\u0629 \u062A\u064F\u0633\u062A\u062D\u0642 \u0631\u0633\u0648\u0645 \u0625\u0644\u063A\u0627\u0621 \u0642\u062F\u0631\u0647\u0627 ${feeText} \u0628\u0648\u0635\u0641\u0647\u0627 ${nature}. \u0648\u0644\u0627 \u064A\u064F\u0639\u062A\u0645\u062F \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0648\u0644\u0627 \u0623\u064A \u0645\u0628\u0644\u063A \u0645\u0627\u0644\u064A \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B\u061B \u064A\u0644\u0632\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0625\u062F\u0627\u0631\u064A \u0645\u0646 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0623\u0648 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062E\u062A\u0635\u0629. \u0644\u0627 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0623\u0648 \u0627\u0644\u0639\u0642\u0648\u062F. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0627\u062F\u0629 340 \u0645\u0646 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 25 \u0644\u0633\u0646\u0629 2025 (\u0642\u0627\u0646\u0648\u0646 \u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0627\u0644\u0645\u062F\u0646\u064A\u0629 \u0627\u0644\u062C\u062F\u064A\u062F).`,
    true
  ) : withLegalDraftMark(
    `The owner may request cancellation within ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} days of contract activation / signature approval. If the contract is cancelled within that window, a cancellation fee of ${feeText} shall apply as ${nature}. Cancellation and any money amount are never auto-approved; Admin or Finance Admin approval is required. AI never approves money or contracts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Article 340 of Federal Decree-Law 25 of 2025 (New Civil Code).`,
    false
  );
}
function ownerMobilisationRefundCopy(arabic = false) {
  return arabic ? withLegalDraftMark(
    "\u0647\u0630\u0627 \u0647\u0648 \u0627\u0644\u062A\u0635\u0645\u064A\u0645 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u062A\u0623\u0643\u064A\u062F \u0631\u0634\u064A\u062F. \u062A\u063A\u0637\u064A \u062F\u0641\u0639\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0628\u0627\u0644\u063A\u0629 15\u066A \u062A\u0643\u0627\u0644\u064A\u0641 \u0627\u0644\u0625\u0639\u062F\u0627\u062F \u0648\u0627\u0644\u0631\u0628\u0637 \u0627\u0644\u0623\u0648\u0644\u064A\u0629. \u0648\u0625\u0630\u0627 \u0623\u0644\u063A\u0649 \u0627\u0644\u0645\u0627\u0644\u0643 \u062E\u0644\u0627\u0644 \u0645\u0647\u0644\u0629 \u0627\u0644\u062B\u0644\u0627\u062B\u064A\u0646 \u064A\u0648\u0645\u0627\u064B\u060C \u062A\u062D\u062A\u0641\u0638 BIN GROUP \u0641\u0642\u0637 \u0628\u0627\u0644\u062C\u0632\u0621 \u0645\u0646 \u062F\u0641\u0639\u0629 \u0627\u0644\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0630\u064A \u064A\u0642\u0627\u0628\u0644 \u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0641\u0639\u0644\u064A\u0629 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646\u0647\u0627\u060C \u0648\u062A\u064F\u0639\u0631\u0636 \u0628\u0646\u062F\u0627\u064B \u0628\u0646\u062F\u0627\u064B\u060C \u0648\u064A\u064F\u0631\u062F \u0627\u0644\u0628\u0627\u0642\u064A. \u0648\u064A\u062C\u0628 \u0623\u0646 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0623\u0648 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629 \u0623\u064A \u0645\u0628\u0644\u063A \u064A\u064F\u062D\u062A\u0641\u0638 \u0628\u0647 \u0623\u0648 \u064A\u064F\u0631\u062F. \u0648\u0644\u0627 \u062A\u0639\u062A\u0645\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0623\u0648 \u0627\u0644\u0639\u0642\u0648\u062F.",
    true
  ) : withLegalDraftMark(
    "This is the default design pending Rashid\u2019s confirmation. The 15% mobilisation fee covers initial setup and integration. If the Owner cancels within the 30-day window, BIN GROUP shall retain only the portion of mobilisation that corresponds to verifiable incurred expenses, which will be itemised, and shall refund the remainder. Admin or Finance Admin must approve any retained or refunded amount. AI never approves money or contracts.",
    false
  );
}
function ownerGoverningLawJurisdictionCopy(arabic = false) {
  const threshold = CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED.toLocaleString(arabic ? "ar-AE" : "en-AE");
  return arabic ? withLegalDraftMark(
    `\u062A\u062E\u0636\u0639 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u0644\u0642\u0648\u0627\u0646\u064A\u0646 \u062F\u0648\u0644\u0629 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0645\u062A\u062D\u062F\u0629. \u0648\u062A\u062E\u062A\u0635 \u0645\u062D\u0627\u0643\u0645 \u0627\u0644\u0625\u0645\u0627\u0631\u0629 \u0627\u0644\u062A\u064A \u064A\u0642\u0639 \u0641\u064A\u0647\u0627 \u0627\u0644\u0639\u0642\u0627\u0631 \u0641\u0639\u0644\u064A\u0627\u064B \u0627\u062E\u062A\u0635\u0627\u0635\u0627\u064B \u062D\u0635\u0631\u064A\u0627\u064B \u0628\u0627\u0644\u0646\u0638\u0631 \u0641\u064A \u0627\u0644\u0646\u0632\u0627\u0639\u0627\u062A \u0627\u0644\u0646\u0627\u0634\u0626\u0629 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629. \u0623\u0645\u0627 \u0646\u0632\u0627\u0639\u0627\u062A \u0631\u0633\u0648\u0645 \u0627\u0644\u062E\u062F\u0645\u0629 \u0641\u064A \u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629 \u0627\u0644\u0645\u0644\u0643\u064A\u0629 \u0641\u064A \u062F\u0628\u064A \u0641\u062A\u064F\u062D\u0627\u0644 \u0625\u0644\u0649 \u0645\u0631\u0643\u0632 \u062A\u0633\u0648\u064A\u0629 \u0627\u0644\u0645\u0646\u0627\u0632\u0639\u0627\u062A \u0627\u0644\u0625\u064A\u062C\u0627\u0631\u064A\u0629 (RDC). \u0648\u0644\u0627 \u062A\u0641\u0631\u0636 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629 \u062A\u062D\u0643\u064A\u0645\u0627\u064B \u0625\u0644\u0632\u0627\u0645\u064A\u0627\u064B \u0639\u0644\u0649 \u0639\u0642\u062F \u0627\u0633\u062A\u0647\u0644\u0627\u0643\u064A \u062A\u0642\u0644 \u0642\u064A\u0645\u062A\u0647 \u0639\u0646 ${threshold} \u062F\u0631\u0647\u0645. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 42 \u0644\u0633\u0646\u0629 2022 \u0627\u0644\u0645\u0627\u062F\u0629 34\u060C \u0648\u0642\u0627\u0646\u0648\u0646 \u062F\u0628\u064A \u0631\u0642\u0645 6 \u0644\u0633\u0646\u0629 2019\u060C \u0648\u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 14 \u0644\u0633\u0646\u0629 2023.`,
    true
  ) : withLegalDraftMark(
    `This Agreement is governed by the laws of the United Arab Emirates. Disputes arising from this Agreement shall be subject to the exclusive jurisdiction of the courts of the Emirate where the Property is physically located. For Dubai jointly owned properties, service-charge disputes shall be referred to the Rental Disputes Settlement Centre (RDC). This Agreement does not impose mandatory arbitration on a consumer contract valued under AED ${threshold}. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include Federal Decree-Law 42 of 2022 Article 34, Dubai Law 6 of 2019, and Federal Decree-Law 14 of 2023.`,
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
    `\u062A\u064F\u0639\u0627\u0644\u062C \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0634\u062E\u0635\u064A\u0629\u060C \u0628\u0645\u0627 \u0641\u064A \u0630\u0644\u0643 \u0635\u0648\u0631 \u0627\u0644\u0639\u0642\u0627\u0631 \u0648\u0627\u0644\u0645\u0631\u0627\u0633\u0644\u0627\u062A\u060C \u0641\u0642\u0637 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0647 \u0627\u0644\u0627\u062A\u0641\u0627\u0642\u064A\u0629. \u0648\u0644\u0627 \u062A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u062A\u0633\u0648\u064A\u0642 \u0625\u0644\u0627 \u0628\u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0634\u062A\u0631\u0627\u0643 \u0645\u0646\u0641\u0635\u0644\u0629 \u064A\u0645\u0643\u0646 \u0633\u062D\u0628\u0647\u0627 \u0641\u064A \u0623\u064A \u0648\u0642\u062A\u060C \u0648\u0644\u064A\u0633\u062A \u062A\u0644\u0643 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0634\u0631\u0637\u0627\u064B \u0644\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u0627\u0644\u062E\u062F\u0645\u0629 \u0627\u0644\u0645\u062A\u0639\u0627\u0642\u062F \u0639\u0644\u064A\u0647\u0627. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} \u0648\u0645\u0646 \u0630\u0644\u0643 \u0627\u0644\u0645\u0631\u0633\u0648\u0645 \u0628\u0642\u0627\u0646\u0648\u0646 \u0627\u062A\u062D\u0627\u062F\u064A \u0631\u0642\u0645 45 \u0644\u0633\u0646\u0629 2021 \u0628\u0634\u0623\u0646 \u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0634\u062E\u0635\u064A\u0629.`,
    true
  ) : withLegalDraftMark(
    `Personal data, including property images and communications, is processed only to perform this Agreement. It shall not be used for marketing without a separate opt-in, which the Owner may withdraw at any time. Marketing consent is not a condition of receiving the contracted service. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 45 of 2021 (PDPL).`,
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
    `\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062F\u064A\u0631: BIN GROUP. \u0631\u0642\u0645 \u0627\u0644\u0631\u062E\u0635\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629: ${block.tradeLicence.displayAr}. \u0631\u0642\u0645 \u062A\u0633\u062C\u064A\u0644 \u0631\u064A\u0631\u0627 (ORN): ${block.reraOrn.displayAr}. \u0631\u0642\u0645 \u062A\u0633\u062C\u064A\u0644 \u0645\u0631\u0643\u0632 \u0623\u0628\u0648\u0638\u0628\u064A \u0627\u0644\u0639\u0642\u0627\u0631\u064A (ADREC): ${block.adrecReg.displayAr}. \u0648\u064A\u062E\u0636\u0639 \u0647\u0630\u0627 \u0627\u0644\u0639\u0642\u062F \u0644\u0644\u062A\u0633\u062C\u064A\u0644 \u0639\u0628\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0628\u0644\u062F\u064A \u0627\u0644\u0645\u062D\u0644\u064A (\u0645\u062B\u0644 \u0625\u064A\u062C\u0627\u0631\u064A \u0623\u0648 \u062A\u0648\u062B\u064A\u0642). \u0648\u0647\u0630\u0647 \u062D\u0642\u0648\u0644 \u0645\u0624\u0642\u062A\u0629 \u0648\u0644\u064A\u0633\u062A \u0623\u0631\u0642\u0627\u0645 \u062A\u0631\u0627\u062E\u064A\u0635 \u0645\u062E\u062A\u0631\u0639\u0629 \u0625\u0644\u0649 \u062D\u064A\u0646 \u0625\u062F\u0631\u0627\u062C \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0641\u0639\u0644\u064A\u0629.`,
    true
  ) : withLegalDraftMark(
    `Manager details: BIN GROUP. Trade licence no.: ${block.tradeLicence.displayEn}. RERA ORN: ${block.reraOrn.displayEn}. ADREC registration no.: ${block.adrecReg.displayEn}. This contract is subject to registration via the local municipal system (for example Ejari or Tawtheeq). These are placeholders, not invented licence numbers, until the real particulars are inserted.`,
    false
  );
}
export {
  BIN_GROUP_ADREC_REG_REF,
  BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR,
  BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN,
  BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF,
  BIN_GROUP_RERA_ORN_REF,
  BIN_GROUP_TRADE_LICENCE_REF,
  CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED,
  LEGAL_DRAFT_MARK_AR,
  LEGAL_DRAFT_MARK_EN,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_FLOOR_THRESHOLD,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_STATUS,
  OWNER_COMPLIMENTARY_MONTHS,
  OWNER_CONTRACT_AUTO_RENEWAL,
  OWNER_CONTRACT_RENEWAL_REQUIRES_EXPLICIT_CONSENT,
  OWNER_INITIAL_CANCELLATION_FEE_AED,
  OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR,
  OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN,
  OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE,
  OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
  OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
  OWNER_INITIAL_CANCELLATION_FEE_STATUS,
  OWNER_INITIAL_CANCELLATION_WINDOW_DAYS,
  OWNER_INITIAL_CONTRACT_TERM_MONTHS,
  OWNER_INITIAL_MOBILISATION_REFUND_IS_FOUNDER_DEFAULT,
  OWNER_INITIAL_MOBILISATION_REFUND_POLICY,
  OWNER_RENEWAL_CONTRACT_TERM_MONTHS,
  OWNER_SERVICE_TERM_MONTHS,
  UNVERIFIED_RESEARCH_CITATION_NOTE_AR,
  UNVERIFIED_RESEARCH_CITATION_NOTE_EN,
  evaluateOwnerInitialCancellationFeeHonesty,
  formatOfficeHighRiseLogisticsUplift,
  formatOwnerInitialCancellationFee,
  formatOwnerLicenceBlock,
  formatPropertyManagementLicenceRef,
  formatUnsetLegalRef,
  isOfficeHighRiseLogisticsUpliftSet,
  isOwnerInitialCancellationFeeSet,
  ownerCancellationWindowCopy,
  ownerComplimentaryMonthCopy,
  ownerDecennialAndMollakCopy,
  ownerGoverningLawJurisdictionCopy,
  ownerLanguagePrecedenceCopy,
  ownerLicenceBlockCopy,
  ownerMobilisationRefundCopy,
  ownerPdplCopy,
  withLegalDraftMark
};
