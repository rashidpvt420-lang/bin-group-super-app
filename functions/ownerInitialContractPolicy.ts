/**
 * Initial owner contract commercial policy.
 * New legal wording in this file is a draft for UAE legal review. All legal citations are for counsel to confirm.
 * Pasted research is unverified and is not law. Do not invent a TRN, RERA ORN, ADREC registration, or a
 * separate property-management licence number.
 *
 * Legal entity wording is the founder-approved formula (answers A,B on 12 November 2026) and is flagged
 * in the pull request for Rashid to confirm.
 */

export const OWNER_INITIAL_CONTRACT_TERM_MONTHS = 13;
export const OWNER_RENEWAL_CONTRACT_TERM_MONTHS = 12;
export const OWNER_SERVICE_TERM_MONTHS = 12;
export const OWNER_COMPLIMENTARY_MONTHS = 1;
export const OWNER_CANCELLATION_GRACE_DAYS = 7;
/** @deprecated The flat 30-day window was withdrawn. Grace is 7 days; percentage bands run for the term. */
export const OWNER_INITIAL_CANCELLATION_WINDOW_DAYS = OWNER_CANCELLATION_GRACE_DAYS;

/** Official legal name. Founder-supplied; flagged in the PR for Rashid to confirm. */
export const BIN_GROUP_LEGAL_ENTITY_NAME =
  'All Kind Building Projects Contracting L.L.C S.P.C, trading as BIN GROUP L.L.C - S.P.C';
export const BIN_GROUP_TRADE_NAME = 'BIN GROUP L.L.C - S.P.C';
export const BIN_GROUP_TRADE_LICENCE_EMIRATE = 'Abu Dhabi';

export const LEGAL_CONSENT_VERSION = 'legal-review-2026-11-12';
export const SIGNED_CONTRACT_AUDIT_RETENTION_YEARS = 10;
export const SIGNED_CONTRACT_AUDIT_COLLECTION = 'contract_acceptance_audit';
export const TECHNICIAN_GPS_CONSENT_COLLECTION = 'technician_gps_consents';
export const LEGAL_CITATION_DISCLAIMER_EN = 'for counsel to confirm';
export const LEGAL_CITATION_DISCLAIMER_AR = 'للتأكيد من المستشار القانوني';


export const LEGAL_DRAFT_MARK_EN = 'Draft, for UAE legal review; legal citations are for counsel to confirm';
export const LEGAL_DRAFT_MARK_AR = 'مسودة، للمراجعة القانونية في دولة الإمارات؛ والاستشهادات القانونية للتأكيد من المستشار القانوني';
export const UNVERIFIED_RESEARCH_CITATION_NOTE_EN =
  'Citations named here come from unverified research and are for counsel to confirm; they are not presented as verified law.';
export const UNVERIFIED_RESEARCH_CITATION_NOTE_AR =
  'الاستشهادات المذكورة هنا مصدرها بحث غير محقَّق يجب أن يؤكدها محامٍ إماراتي، ولا تُعرض بوصفها قانوناً مثبتاً.';

/**
 * Flat AED cancellation fee stays unset on purpose. The live model is the founder-approved
 * percentage-band schedule. Honesty checks must reject any invented flat AED amount.
 */
export const OWNER_INITIAL_CANCELLATION_FEE_AED: number | null = null;

export const OWNER_INITIAL_CANCELLATION_FEE_STATUS = 'PERCENTAGE_BANDS_CONFIGURED' as const;
export const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN =
  'days 1–7: 0%; days 8–90: 4%; days 91–180: 6%; days 181–270: 8%; days 271+: 10% of total annual contract value excluding VAT';
export const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR =
  'الأيام 1–7: 0٪؛ الأيام 8–90: 4٪؛ الأيام 91–180: 6٪؛ الأيام 181–270: 8٪؛ من اليوم 271 فما فوق: 10٪ من القيمة السنوية الإجمالية للعقد باستثناء ضريبة القيمة المضافة';
export const OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE = 'OWNER_CANCELLATION_FEE_BANDS_INVALID';
export const OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN =
  'a cancellation fee calculated as a percentage of the total annual contract value excluding VAT';
export const OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR =
  'رسم إلغاء يُحسب كنسبة من القيمة السنوية الإجمالية للعقد باستثناء ضريبة القيمة المضافة';

export const OWNER_CANCELLATION_FEE_MODEL = 'PERCENTAGE_BANDS_OF_ANNUAL_CONTRACT_VALUE_EXCLUDING_VAT';
export const OWNER_CANCELLATION_FEE_BASIS = 'TOTAL_ANNUAL_CONTRACT_VALUE_EXCLUDING_VAT';
export const OWNER_CANCELLATION_GRACE_WAIVES_PENALTY_ONLY = true;
export const OWNER_CANCELLATION_GRACE_DOES_NOT_WAIVE_MOBILISATION_WORK = true;

export type OwnerCancellationFeeBand = {
  fromDayInclusive: number;
  toDayInclusive: number | null;
  percent: number;
};

export const OWNER_CANCELLATION_FEE_BANDS: readonly OwnerCancellationFeeBand[] = Object.freeze([
  Object.freeze({ fromDayInclusive: 1, toDayInclusive: 7, percent: 0 }),
  Object.freeze({ fromDayInclusive: 8, toDayInclusive: 90, percent: 4 }),
  Object.freeze({ fromDayInclusive: 91, toDayInclusive: 180, percent: 6 }),
  Object.freeze({ fromDayInclusive: 181, toDayInclusive: 270, percent: 8 }),
  Object.freeze({ fromDayInclusive: 271, toDayInclusive: null, percent: 10 }),
]);
export const REQUIRED_OWNER_CANCELLATION_FEE_BANDS: readonly OwnerCancellationFeeBand[] = OWNER_CANCELLATION_FEE_BANDS;

/**
 * Unverified market research cited AED 1,500–3,000. That range is listed for founder awareness only.
 * It is not applied. The live fee is the founder-approved percentage-band schedule, not a flat AED amount.
 */
export const OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_EN =
  'Unverified market research cited a range of AED 1,500 to AED 3,000. That range is not applied. The founder-approved model is the percentage-band schedule of total annual contract value excluding VAT.';
export const OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_AR =
  'أشار بحث سوقي غير محقَّق إلى نطاق من 1,500 إلى 3,000 درهم. ولا يُطبَّق ذلك النطاق. والنموذج المعتمد من المؤسس هو جدول النسب من القيمة السنوية الإجمالية للعقد باستثناء ضريبة القيمة المضافة.';

/**
 * Founder decision: after the 7-day grace, the percentage cancellation fee applies even during the
 * waived first management-fee month. Grace waives the percentage penalty only.
 */
export const OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH: boolean | null = true;
export const OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH_STATUS = 'FOUNDER_DECISION_APPLIED' as const;

/**
 * Trade / company licence is founder-supplied (CN-5914744, Abu Dhabi). Never invent a RERA ORN,
 * ADREC registration, or a separate property-management licence number.
 */
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF: string | null = null;
export const BIN_GROUP_TRADE_LICENCE_REF: string | null = 'CN-5914744';
export const BIN_GROUP_TRADE_LICENCE_STATUS = 'FOUNDER_SUPPLIED' as const;
export const BIN_GROUP_RERA_ORN_REF: string | null = null;
export const BIN_GROUP_ADREC_REG_REF: string | null = null;
export const BIN_GROUP_ADREC_AUTHORISATION_REF: string | null = BIN_GROUP_ADREC_REG_REF;
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN = 'to be inserted';
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR = 'يُدرج لاحقاً';

/**
 * Default design for mobilisation if the owner cancels: retain only verifiable incurred expenses
 * (itemised) and refund the rest. The 7-day cancellation-fee grace does not waive payment for
 * verifiable mobilisation work already done.
 */
export const OWNER_INITIAL_MOBILISATION_REFUND_POLICY =
  'RETAIN_VERIFIABLE_INCURRED_EXPENSES_REFUND_REMAINDER' as const;
export const OWNER_INITIAL_MOBILISATION_REFUND_IS_FOUNDER_DEFAULT = true;

export const OWNER_CONTRACT_AUTO_RENEWAL = false;
export const OWNER_CONTRACT_RENEWAL_REQUIRES_EXPLICIT_CONSENT = true;

/**
 * Research asked that consumer contracts under AED 50,000 not carry mandatory arbitration.
 * This threshold is taken from that unverified research request, not invented as a fee, and remains a draft.
 */
export const CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED = 50000;

/**
 * High-rise office logistics uplift percent. Pending Rashid's decision.
 * Must stay null until a confirmed percentage is set. Unverified market research cited a 15-25% range;
 * that range is not applied and must not be treated as the live rate.
 */
export const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT: number | null = null;
export const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_STATUS = 'PENDING_FOUNDER_DECISION' as const;
export const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_FLOOR_THRESHOLD = 15;
export const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN =
  'Unverified market research cited a 15-25% range. That range is not applied. Rashid must decide the rate.';
export const OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR =
  'أشار بحث سوقي غير محقَّق إلى نطاق 15-25٪. ولا يُطبَّق ذلك النطاق. ويجب أن يقرر رشيد النسبة.';

/**
 * Live owner quotes from calculateUaeQuote2026 are VAT-exclusive. The onboarding UI already labels them
 * "VAT excluded". Invoices currently use vatTreatment NOT_APPLIED and vatAmount 0 until the company TRN
 * is verified (see src/utils/uaeVat.mjs). Do not change any quoted price here.
 */
export const OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT = 5;
export const OWNER_QUOTE_PRICES_ARE_VAT_EXCLUSIVE = true;
export const OWNER_INVOICE_VAT_TREATMENT_UNTIL_TRN_VERIFIED = 'NOT_APPLIED' as const;
export const OWNER_PRE_TRN_INVOICE_TITLE_EN = 'Commercial Invoice';
export const OWNER_PRE_TRN_INVOICE_TITLE_AR = 'فاتورة تجارية';
export const OWNER_TAX_INVOICE_TITLE_EN = 'Tax Invoice';
export const OWNER_TAX_INVOICE_TITLE_AR = 'فاتورة ضريبية';
export const UAE_VAT_ARTICLE_59_FULL_TAX_INVOICE_THRESHOLD_AED = 10000;
export const UAE_VAT_TAX_INVOICE_ISSUANCE_DEADLINE_DAYS = 14;
export const UAE_VAT_ARTICLE_59_CITATION_NOTE =
  'UAE VAT Executive Regulation Article 59 tax-invoice requirements (simplified versus full for B2B supplies above AED 10,000, and issuance within 14 days) are implemented for when a TRN is verified, and are for counsel to confirm.';

/**
 * Founder-set cash cap: AED 50,000 per property contract, including a single payment or
 * linked/cumulative cash payments. Amounts above the cap must be paid by cheque or bank transfer.
 * Unverified research cited AED 55,000 goAML reporting; That figure is not applied. Payments stay PHASE1_CASH_CHEQUE_V1.
 */
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_AED: number | null = 50000;
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_STATUS = 'SET' as const;
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_SCOPE = 'PER_PROPERTY_CONTRACT_SINGLE_OR_CUMULATIVE_LINKED';
export const OWNER_PAYMENT_POLICY_VERSION = 'PHASE1_CASH_CHEQUE_V1' as const;
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_EN =
  'Founder-set cash cap: AED 50,000 per property contract, single or linked/cumulative cash payments. Amounts above the cap must be paid by cheque or bank transfer. Unverified research cited AED 55,000 reporting under the goAML rules; that figure is not applied.';
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_AR =
  'حد النقد المعتمد من المؤسس: 50,000 درهم لكل عقد عقار، للدفعات النقدية الواحدة أو المرتبطة أو التراكمية. وما يزيد على الحد يُسدد بشيك أو تحويل بنكي. وأشار بحث غير محقَّق إلى إبلاغ عند 55,000 درهم بموجب قواعد goAML، ولا يُطبَّق ذلك الرقم.';

/**
 * Emergency HVAC / leak repair per-incident limit. Pending Rashid's decision on the amount and the human approver.
 * Must stay null until a confirmed AED amount is set. Never invent a number. This clause does not raise or
 * replace the existing operational gates in ownerSpendingLimits.ts (FIXED_OWNER_APPROVAL_LIMIT_AED and
 * EMERGENCY_SPEND_LIMIT_AED). Approval is by a human only; AI never approves money.
 */
export const OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED: number | null = null;
export const OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_STATUS = 'PENDING_FOUNDER_DECISION' as const;
export const OWNER_EMERGENCY_REPAIR_APPROVER: string | null = null;
export const OWNER_EMERGENCY_REPAIR_APPROVER_STATUS = 'PENDING_FOUNDER_DECISION' as const;

export const OWNER_MOBILISATION_DELIVERABLES_EN = [
  'initial inspection and inventory',
  'property photographs',
  'Ejari / Tawtheeq setup',
  'compliance checks',
] as const;
export const OWNER_MOBILISATION_DELIVERABLES_AR = [
  'المعاينة والجرد الأوليان',
  'صور العقار',
  'إعداد إيجاري / توثيق',
  'فحوصات الامتثال',
] as const;

export function withLegalDraftMark(text: string, arabic = false): string {
  const mark = arabic ? LEGAL_DRAFT_MARK_AR : LEGAL_DRAFT_MARK_EN;
  const trimmed = String(text || '').trim();
  if (!trimmed) return `${mark}.`;
  if (trimmed.startsWith(mark)) return trimmed;
  return `${mark}. ${trimmed}`;
}

function roundAed(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function ownerCancellationFeeBandsAreValid(
  bands: readonly OwnerCancellationFeeBand[] = OWNER_CANCELLATION_FEE_BANDS,
): boolean {
  if (!Array.isArray(bands) || bands.length !== REQUIRED_OWNER_CANCELLATION_FEE_BANDS.length) return false;
  return REQUIRED_OWNER_CANCELLATION_FEE_BANDS.every((required, index) => {
    const band = bands[index];
    return (
      band != null
      && band.fromDayInclusive === required.fromDayInclusive
      && band.toDayInclusive === required.toDayInclusive
      && band.percent === required.percent
    );
  });
}

export function isOwnerCancellationFeeModelConfigured(): boolean {
  return (
    OWNER_INITIAL_CANCELLATION_FEE_AED == null
    && ownerCancellationFeeBandsAreValid()
    && OWNER_CANCELLATION_FEE_BASIS === 'TOTAL_ANNUAL_CONTRACT_VALUE_EXCLUDING_VAT'
    && OWNER_CANCELLATION_GRACE_WAIVES_PENALTY_ONLY === true
    && OWNER_CANCELLATION_GRACE_DOES_NOT_WAIVE_MOBILISATION_WORK === true
    && OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH === true
  );
}

/**
 * True only when the founder-approved percentage-band model is configured and no flat AED
 * amount has been invented. Passing a numeric fee (the old flat-AED API) returns false.
 */
export function isOwnerInitialCancellationFeeSet(
  fee: number | null | undefined = OWNER_INITIAL_CANCELLATION_FEE_AED,
): boolean {
  if (fee != null) return false;
  return isOwnerCancellationFeeModelConfigured();
}

export function formatOwnerInitialCancellationFee(
  fee: number | null | undefined = OWNER_INITIAL_CANCELLATION_FEE_AED,
) {
  if (!isOwnerInitialCancellationFeeSet(fee)) {
    return {
      set: false,
      aed: null as number | null,
      status: fee != null ? 'FLAT_AED_NOT_ALLOWED' as const : OWNER_INITIAL_CANCELLATION_FEE_STATUS,
      displayEn: fee != null ? 'flat AED fee not allowed' : 'to be confirmed',
      displayAr: fee != null ? 'لا يُسمح برسم إلغاء مقطوع بالدرهم' : 'يُؤكد لاحقاً',
      natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
      natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
    };
  }
  return {
    set: true,
    aed: null as number | null,
    status: OWNER_INITIAL_CANCELLATION_FEE_STATUS,
    displayEn: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN,
    displayAr: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR,
    natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
    natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
  };
}

export function cancellationFeeBandForDay(
  daysSinceActivation: number,
  bands: readonly OwnerCancellationFeeBand[] = OWNER_CANCELLATION_FEE_BANDS,
): OwnerCancellationFeeBand | null {
  const days = Math.floor(Number(daysSinceActivation));
  if (!Number.isFinite(days) || days < 1) return null;
  for (const band of bands) {
    if (days < band.fromDayInclusive) continue;
    if (band.toDayInclusive == null || days <= band.toDayInclusive) return band;
  }
  return bands[bands.length - 1] || null;
}

export function computeOwnerCancellationPenaltyPercent(daysSinceActivation: number): number {
  const band = cancellationFeeBandForDay(daysSinceActivation);
  return band ? band.percent : 0;
}

export type OwnerCancellationFeeComputation = {
  daysSinceActivation: number;
  percent: number;
  feeAed: number;
  annualContractValueExVatAed: number;
  penaltyWaived: boolean;
  mobilisationWorkRemainsPayable: boolean;
  basis: typeof OWNER_CANCELLATION_FEE_BASIS;
};

export function computeOwnerCancellationFeeAed(
  annualContractValueExVatAed: number,
  daysSinceActivation: number,
): OwnerCancellationFeeComputation {
  const annual = roundAed(Number(annualContractValueExVatAed));
  const days = Math.floor(Number(daysSinceActivation));
  if (!Number.isFinite(annual) || annual < 0 || !Number.isFinite(days) || days < 1) {
    throw new Error('Cancellation fee computation requires a non-negative annual contract value excluding VAT and a day count of 1 or more.');
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
    basis: OWNER_CANCELLATION_FEE_BASIS,
  };
}

export function evaluateOwnerInitialCancellationFeeHonesty(
  fee: number | null | undefined = OWNER_INITIAL_CANCELLATION_FEE_AED,
) {
  if (fee != null) {
    return {
      ok: false,
      code: 'OWNER_CANCELLATION_FEE_FLAT_AED_NOT_ALLOWED',
      blocksHardPublicLaunch: true,
      message:
        'Hard launch is blocked because a flat Owner cancellation fee in AED is not the approved model. Configure the founder-approved percentage bands (0/4/6/8/10 of total annual contract value excluding VAT) and leave OWNER_INITIAL_CANCELLATION_FEE_AED unset. Do not invent a flat amount.',
    };
  }
  if (!isOwnerCancellationFeeModelConfigured()) {
    return {
      ok: false,
      code: OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE,
      blocksHardPublicLaunch: true,
      message:
        'Hard launch is blocked because the Owner cancellation-fee bands are missing or do not match the founder-approved schedule: days 1–7 0%; 8–90 4%; 91–180 6%; 181–270 8%; 271+ 10% of total annual contract value excluding VAT. The 7-day grace must waive the percentage penalty only, not payment for verifiable mobilisation work already done. Do not invent a flat AED amount.',
    };
  }
  return {
    ok: true,
    code: 'OWNER_CANCELLATION_FEE_BANDS_CONFIGURED',
    blocksHardPublicLaunch: false,
    message: 'Owner cancellation fee uses the founder-approved percentage-band schedule of total annual contract value excluding VAT.',
  };
}

export function cashPaymentWouldExceedCap(args: {
  amountAed: number;
  recordedCashAed?: number;
  capAed?: number | null;
}): boolean {
  const cap = args.capAed ?? OWNER_CASH_ACCEPTANCE_THRESHOLD_AED;
  const amount = Number(args.amountAed);
  const recorded = Number(args.recordedCashAed || 0);
  if (cap == null || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(recorded) || recorded < 0) return true;
  return roundAed(recorded + amount) > cap;
}

export function ownerCashCapRejectionMessage(capAed: number | null = OWNER_CASH_ACCEPTANCE_THRESHOLD_AED): string {
  const cap = capAed == null ? 'the configured cash cap' : `AED ${Number(capAed).toLocaleString('en-AE')}`;
  return `Cash is not accepted above ${cap} cumulative per property contract (a single payment or linked/cumulative cash payments). Use cheque or bank transfer.`;
}

export function invoiceDocumentTitle(vatApplied: boolean): string {
  return vatApplied
    ? `${OWNER_TAX_INVOICE_TITLE_EN} / ${OWNER_TAX_INVOICE_TITLE_AR}`
    : `${OWNER_PRE_TRN_INVOICE_TITLE_EN} / ${OWNER_PRE_TRN_INVOICE_TITLE_AR}`;
}

export function requiresFullArticle59TaxInvoice(args: {
  vatApplied: boolean;
  isB2B: boolean;
  taxableAmountAed: number;
}): boolean {
  return args.vatApplied === true && args.isB2B === true && Number(args.taxableAmountAed) > UAE_VAT_ARTICLE_59_FULL_TAX_INVOICE_THRESHOLD_AED;
}

export function taxInvoiceIssuanceDeadlineIso(supplyOrIssueDate: Date | string, now = new Date()) {
  const start = new Date(supplyOrIssueDate);
  const deadline = new Date(start.getTime() + UAE_VAT_TAX_INVOICE_ISSUANCE_DEADLINE_DAYS * 86400000);
  return {
    deadlineIso: deadline.toISOString(),
    issuanceDays: UAE_VAT_TAX_INVOICE_ISSUANCE_DEADLINE_DAYS,
    overdue: now.getTime() > deadline.getTime(),
  };
}

export function formatUnsetLegalRef(
  value: string | null | undefined,
) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return {
      set: false,
      value: null as string | null,
      displayEn: BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN,
      displayAr: BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR,
    };
  }
  return { set: true, value: trimmed, displayEn: trimmed, displayAr: trimmed };
}

export function formatPropertyManagementLicenceRef(
  value: string | null | undefined = BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF,
) {
  return formatUnsetLegalRef(value);
}

export function formatOwnerLicenceBlock(options: {
  tradeLicence?: string | null;
  reraOrn?: string | null;
  adrecReg?: string | null;
} = {}) {
  const trade = formatUnsetLegalRef(options.tradeLicence ?? BIN_GROUP_TRADE_LICENCE_REF);
  if (trade.set && trade.value === 'CN-5914744') {
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
    anySet: trade.set || reraOrn.set || adrec.set,
  };
}

export function isOfficeHighRiseLogisticsUpliftSet(
  percent: number | null | undefined = OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT,
): boolean {
  return typeof percent === 'number' && Number.isFinite(percent) && percent >= 0;
}

export function formatOfficeHighRiseLogisticsUplift(
  percent: number | null | undefined = OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT,
) {
  if (!isOfficeHighRiseLogisticsUpliftSet(percent)) {
    return {
      set: false,
      percent: null as number | null,
      status: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_STATUS,
      applied: false,
      displayEn: 'not applied — to be confirmed',
      displayAr: 'غير مطبقة — يُؤكد لاحقاً',
      researchNoteEn: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN,
      researchNoteAr: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR,
    };
  }
  const value = Number(percent);
  return {
    set: true,
    percent: value,
    status: 'SET' as const,
    applied: value > 0,
    displayEn: `${value}%`,
    displayAr: `${value}٪`,
    researchNoteEn: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_EN,
    researchNoteAr: OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_RESEARCH_RANGE_NOTE_AR,
  };
}

export function formatUnsetAedAmount(
  value: number | null | undefined,
) {
  if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    return {
      set: false,
      aed: null as number | null,
      status: 'PENDING_FOUNDER_DECISION' as const,
      displayEn: 'to be confirmed',
      displayAr: 'يُؤكد لاحقاً',
    };
  }
  const aed = Number(value);
  return {
    set: true,
    aed,
    status: 'SET' as const,
    displayEn: `AED ${aed.toLocaleString('en-AE')}`,
    displayAr: `${aed.toLocaleString('ar-AE')} درهم`,
  };
}

export function formatOwnerCashAcceptanceThreshold(
  value: number | null | undefined = OWNER_CASH_ACCEPTANCE_THRESHOLD_AED,
) {
  return formatUnsetAedAmount(value);
}

export function formatOwnerEmergencyRepairLimit(
  value: number | null | undefined = OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED,
) {
  return formatUnsetAedAmount(value);
}

export function ownerComplimentaryMonthCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      'مدة هذه الاتفاقية 13 شهراً. وتُعفى رسوم الإدارة للشهر الأول. ولا يُعفي ذلك من دفعة التفعيل البالغة 15٪، إذ تبقى مستحقة وفق جدول الدفع. وتُفوتر الأشهر من 2 إلى 13 حسب سعر العقد. ولا يسري الإعفاء على التجديدات. ولا يتجدد العقد تلقائياً؛ وأي تجديد يتطلب موافقة صريحة من المالك.',
      true,
    )
    : withLegalDraftMark(
      "This Agreement is for a 13-month term. The first month's management fee is waived. This does not waive the 15% mobilisation fee, which remains due as set out in the payment schedule. Months 2 to 13 are billed at the contract rate. The waiver does not apply to renewals. The contract does not auto-renew; any renewal requires the Owner's explicit consent.",
      false,
    );
}

/** Alias used by UI and contract surfaces that must avoid "free month" / "complimentary" wording. */
export function ownerWaivedFirstMonthCopy(arabic = false): string {
  return ownerComplimentaryMonthCopy(arabic);
}

export function ownerCancellationWindowCopy(arabic = false, fee = formatOwnerInitialCancellationFee()): string {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  const nature = arabic ? fee.natureAr : fee.natureEn;
  return arabic
    ? withLegalDraftMark(
      `يجوز لأي طرف إنهاء هذه الاتفاقية بموجب إشعار كتابي. ويُستحق ${nature} وفق الجدول التالي: ${feeText}. وتعفي فترة السماح البالغة 7 أيام من غرامة الإلغاء فقط، ولا تعفي من سداد أعمال التعبئة الموثقة التي أُنجزت فعلاً. وبعد اليوم 7 تسري النسبة حتى خلال شهر الإعفاء من رسوم الإدارة. ويجب الإفصاح عن ذلك للمالك قبل التوقيع. ولا يُعتمد الإلغاء ولا أي مبلغ مالي تلقائياً؛ يلزم اعتماد إداري من إدارة المالية أو الإدارة المختصة. لا تعتمد الذكاء الاصطناعي المبالغ أو العقود. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المادة 390 من قانون المعاملات المدنية، والمادة 21 من القانون الاتحادي رقم 15 لسنة 2020، وقرار مجلس الوزراء رقم 66 لسنة 2023.`,
      true,
    )
    : withLegalDraftMark(
      `Either party may end this Agreement by written notice. ${nature.charAt(0).toUpperCase()}${nature.slice(1)} shall apply as follows: ${feeText}. The 7-day grace period waives the cancellation penalty only; it does not waive payment for verifiable mobilisation work already done. After day 7 the percentage applies even during the waived first management-fee month, and must be disclosed to the Owner before signing. Cancellation and any money amount are never auto-approved; Admin or Finance Admin approval is required. AI never approves money or contracts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include Civil Code Article 390, Federal Law 15 of 2020 Article 21, and Cabinet Resolution 66 of 2023.`,
      false,
    );
}

/** Short, prominent pre-signature notice of the percentage-band cancellation fee and grace rule. */
export function ownerCancellationFeePreSignNoticeCopy(arabic = false, fee = formatOwnerInitialCancellationFee()): string {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  return arabic
    ? withLegalDraftMark(
      `يُرجى العلم قبل التوقيع: مدة العقد 13 شهراً، وتُعفى رسوم الإدارة للشهر الأول. وجدول رسوم الإلغاء هو ${feeText}. وتعفي فترة السماح البالغة 7 أيام من الغرامة فقط، وليس من سداد أعمال التعبئة الموثقة المنجزة. وبعد اليوم 7 تسري النسبة حتى خلال شهر الإعفاء.`,
      true,
    )
    : withLegalDraftMark(
      `Please note before signing: this Agreement is for a 13-month term, and the first month's management fee is waived. The cancellation fee schedule is ${feeText}. The 7-day grace period waives the penalty only, not payment for verifiable mobilisation work already done. After day 7 the percentage applies even during the waived first month.`,
      false,
    );
}

export function ownerMobilisationRefundCopy(arabic = false): string {
  const deliverablesEn = OWNER_MOBILISATION_DELIVERABLES_EN.join(', ');
  const deliverablesAr = OWNER_MOBILISATION_DELIVERABLES_AR.join('، ');
  return arabic
    ? withLegalDraftMark(
      `تغطي دفعة التفعيل البالغة 15٪ أعمال بدء التعاقد الأولية، وتشمل: ${deliverablesAr}. وإذا أُلغيت الاتفاقية قبل اكتمال أعمال التعبئة، تحتفظ BIN GROUP فقط بالجزء من دفعة التفعيل الذي يقابل مصروفات مكتسبة أو فعلية يمكن التحقق منها، وتُعرض بنداً بنداً، ويُرد الرصيد غير المكتسب. ولا تعفي فترة السماح البالغة 7 أيام من سداد أعمال التعبئة الموثقة المنجزة. ويجب أن تعتمد الإدارة أو إدارة المالية أي مبلغ يُحتفظ به أو يُرد. ولا تعتمد الذكاء الاصطناعي المبالغ أو العقود.`,
      true,
    )
    : withLegalDraftMark(
      `The 15% mobilisation fee covers initial onboarding deliverables, including: ${deliverablesEn}. If this Agreement ends before mobilisation work is completed, BIN GROUP shall retain only the portion of mobilisation that corresponds to verifiable earned or incurred expenses, which will be itemised, and shall refund the unearned balance. The 7-day cancellation-fee grace does not waive payment for verifiable mobilisation work already done. Admin or Finance Admin must approve any retained or refunded amount. AI never approves money or contracts.`,
      false,
    );
}

export function ownerGoverningLawJurisdictionCopy(arabic = false): string {
  const threshold = CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED.toLocaleString(arabic ? 'ar-AE' : 'en-AE');
  return arabic
    ? withLegalDraftMark(
      `تخضع هذه الاتفاقية لقوانين دولة الإمارات العربية المتحدة. وتختص لجنة الإيجارات أو مركز تسوية المنازعات الإيجارية (RDC) في الإمارة التي يقع فيها العقار اختصاصاً حصرياً بنزاعات الإيجار بين المالك (أو المدير بالنيابة عن المالك) والمستأجر. أما النزاعات بين المالك والمدير الناشئة عن هذه الاتفاقية فتختص بها اختصاصاً حصرياً محاكم الإمارة التي يقع فيها العقار فعلياً. ولا تفرض هذه الاتفاقية تحكيماً إلزامياً على عقد استهلاكي تقل قيمته عن ${threshold} درهم. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المرسوم بقانون اتحادي رقم 42 لسنة 2022 المادة 34، ومرسوم دبي رقم 26 لسنة 2013، وقانون دبي رقم 6 لسنة 2019، والمرسوم بقانون اتحادي رقم 14 لسنة 2023.`,
      true,
    )
    : withLegalDraftMark(
      `This Agreement is governed by the laws of the United Arab Emirates. Tenancy disputes between the Owner (or the Manager acting on the Owner's behalf) and a tenant shall be subject to the exclusive jurisdiction of the rent committee or Rental Disputes Settlement Centre (RDC) in the emirate where the Property is located. Disputes between the Owner and the Manager arising from this Agreement shall be subject to the exclusive jurisdiction of the courts of the Emirate where the Property is physically located. This Agreement does not impose mandatory arbitration on a consumer contract valued under AED ${threshold}. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include Federal Decree-Law 42 of 2022 Article 34, Dubai Decree 26 of 2013, Dubai Law 6 of 2019, and Federal Decree-Law 14 of 2023.`,
      false,
    );
}

export function ownerLanguagePrecedenceCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      'حُررت هذه الاتفاقية باللغتين الإنجليزية والعربية. وفي حال أي اختلاف أو تعارض في التفسير بين النصين، يُعتد بالنص العربي ويسود.',
      true,
    )
    : withLegalDraftMark(
      'This Agreement is drafted in both English and Arabic. In the event of any discrepancy or conflict in interpretation between the two texts, the Arabic version shall prevail.',
      false,
    );
}

export function ownerPdplCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      `تُعالج البيانات الشخصية، بما في ذلك صور العقار والمراسلات، فقط لتنفيذ هذه الاتفاقية، وتُحفظ وفق فترات الاحتفاظ المعلنة، بما في ذلك مسار تدقيق العقود الموقعة لمدة 10 سنوات. وقد تُنقل بعض البيانات عبر الحدود عبر معالجي ذكاء اصطناعي من أطراف ثالثة للوظائف التي يختارها المستخدم أو تتطلبها الخدمة، وذلك بموافقة صريحة. ولا تُستخدم للتسويق إلا بموافقة اشتراك منفصلة يمكن سحبها في أي وقت، وليست تلك الموافقة شرطاً للحصول على الخدمة المتعاقد عليها. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المرسوم بقانون اتحادي رقم 45 لسنة 2021 بشأن حماية البيانات الشخصية.`,
      true,
    )
    : withLegalDraftMark(
      `Personal data, including property images and communications, is processed only to perform this Agreement and is retained in line with the published retention periods, including a 10-year signed-contract audit trail. Some data may be transferred across borders through third-party AI processors for features the user chooses or that the service requires, with explicit consent. It shall not be used for marketing without a separate opt-in, which the Owner may withdraw at any time. Marketing consent is not a condition of receiving the contracted service. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 45 of 2021 (PDPL).`,
      false,
    );
}

export function ownerDecennialAndMollakCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      `لا تتحمل الجهة المديرة المسؤولية عن العيوب الإنشائية السابقة المشمولة بالضمان العشري للمطوّر. وبالنسبة للعقارات المشتركة الملكية في دبي، تُدفع جميع رسوم الخدمة عبر نظام ملاك إلى حساب الضمان المعتمد من ريرا، ولا تحصّلها BIN GROUP مباشرة أبداً. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك أحكام الضمان العشري وقانون دبي رقم 6 لسنة 2019.`,
      true,
    )
    : withLegalDraftMark(
      `The Manager assumes no liability for pre-existing structural defects that are subject to developer decennial liability. For Dubai jointly owned properties, all service charges must be paid via the Mollak system into the RERA-approved escrow, and are never collected by BIN GROUP directly. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include the decennial-liability provisions and Dubai Law 6 of 2019.`,
      false,
    );
}

export function ownerLicenceBlockCopy(
  arabic = false,
  options: {
    tradeLicence?: string | null;
    reraOrn?: string | null;
    adrecReg?: string | null;
  } = {},
): string {
  const block = formatOwnerLicenceBlock(options);
  return arabic
    ? withLegalDraftMark(
      `بيانات المدير: ${BIN_GROUP_LEGAL_ENTITY_NAME}. رقم الرخصة التجارية: ${block.tradeLicence.displayAr}. رقم تسجيل ريرا (ORN): ${block.reraOrn.displayAr}. رقم تسجيل مركز أبوظبي العقاري (ADREC): ${block.adrecReg.displayAr}. ويخضع هذا العقد للتسجيل عبر النظام البلدي المحلي (مثل إيجاري أو توثيق). والرخصة التجارية مقدمة من المؤسس. أما رقم ريرا وتسجيل ADREC وأي رخصة إدارة عقارات منفصلة فحقول مؤقتة وليست أرقاماً مخترعة إلى حين إدراجها.`,
      true,
    )
    : withLegalDraftMark(
      `Manager details: ${BIN_GROUP_LEGAL_ENTITY_NAME}. Trade licence no.: ${block.tradeLicence.displayEn}. RERA ORN: ${block.reraOrn.displayEn}. ADREC registration no.: ${block.adrecReg.displayEn}. This contract is subject to registration via the local municipal system (for example Ejari or Tawtheeq). The trade licence is founder-supplied. The RERA ORN, ADREC registration and any separate property-management licence remain placeholders, not invented numbers, until the real particulars are inserted.`,
      false,
    );
}

export function ownerVatTreatmentCopy(arabic = false): string {
  const rate = OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT;
  return arabic
    ? withLegalDraftMark(
      `رسوم الإدارة وسائر رسوم الخدمة المبينة في هذه الاتفاقية غير شاملة ضريبة القيمة المضافة في دولة الإمارات البالغة ${rate}٪، وهي خاضعة لضريبة القيمة المضافة بنسبة ${rate}٪ تُحصَّل عند إصدار رقم التسجيل الضريبي (TRN) والتحقق منه. وإلى حين ذلك التحقق، تُصدر الفواتير بعنوان "فاتورة تجارية" دون بند لضريبة القيمة المضافة، ولا يجوز تسميتها فاتورة ضريبية، وتكون المبالغ المستحقة مساوية لصافي المبالغ المعروضة. وبعد التحقق من الرقم تُصدر فواتير ضريبية وفقاً للمادة 59 (للتأكيد من المستشار القانوني)، مع حقول الفاتورة المبسطة أو الكاملة للمعاملات بين المنشآت التي تتجاوز 10,000 درهم، وخلال 14 يوماً. ولم تُغيَّر الأسعار المعروضة لإدراج الضريبة. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المرسوم بقانون اتحادي رقم 8 لسنة 2017 بشأن ضريبة القيمة المضافة.`,
      true,
    )
    : withLegalDraftMark(
      `The management fees and other service fees shown in this Agreement are exclusive of ${rate}% UAE VAT and are subject to ${rate}% VAT, which will be collected once a Tax Registration Number (TRN) is issued and verified. Until that verification, invoices are titled “Commercial Invoice”, carry no VAT line, must not be titled “Tax Invoice”, and the amounts due equal the quoted net figures. Once a TRN is verified, tax invoices will be issued under Article 59 (for counsel to confirm), with simplified or full B2B fields above AED 10,000, within 14 days of the supply. Quoted prices have not been changed to include VAT. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 8 of 2017 (VAT).`,
      false,
    );
}

export function ownerAmlCashThresholdCopy(arabic = false, threshold = formatOwnerCashAcceptanceThreshold()): string {
  const amount = arabic ? threshold.displayAr : threshold.displayEn;
  return arabic
    ? withLegalDraftMark(
      `تبقى الدفعات مقبولة بالدرهم الإماراتي نقداً أو بشيك فقط (${OWNER_PAYMENT_POLICY_VERSION}). وحد القبول النقدي هو ${amount} لكل عقد عقار، سواء دفعة واحدة أو دفعات نقدية مرتبطة أو تراكمية. وما يزيد على ذلك يُسدد بشيك أو تحويل بنكي فقط، ويُطبق النظام هذا الحد في تدفقات تسجيل النقد. ولا تعتمد الذكاء الاصطناعي المبالغ. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR}`,
      true,
    )
    : withLegalDraftMark(
      `Payments remain accepted only in AED by cash or cheque (${OWNER_PAYMENT_POLICY_VERSION}). The cash-acceptance cap is ${amount} per property contract, whether a single payment or linked/cumulative cash payments. Amounts above that cap must be paid by cheque or bank transfer only, and the cap is system-enforced in cash recording flows. AI never approves money amounts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN}`,
      false,
    );
}

export function ownerReturnedChequeCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      `يُعد الشيك المرتجع سنداً تنفيذياً بموجب القوانين المعمول بها في دولة الإمارات. وقبول دفعة جزئية لا يسقط الحق في المطالبة بالرصيد المتبقي. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المرسوم بقانون اتحادي رقم 50 لسنة 2022 بشأن المعاملات التجارية.`,
      true,
    )
    : withLegalDraftMark(
      `A returned cheque constitutes an executive instrument under applicable UAE law. Acceptance of a partial payment does not waive the outstanding balance. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 50 of 2022 on Commercial Transactions.`,
      false,
    );
}

export function ownerAgencyNoGuaranteeCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      'يتصرف المدير بصفته وكيلاً عن المالك، ولا يضمن عوائد الإيجار ولا أداء المستأجر ولا حالة العقار.',
      true,
    )
    : withLegalDraftMark(
      "The Manager acts as the Owner's agent and does not guarantee rental yields, tenant performance, or property condition.",
      false,
    );
}

export function ownerEmergencyRepairCopy(arabic = false, limit = formatOwnerEmergencyRepairLimit()): string {
  const amount = arabic ? limit.displayAr : limit.displayEn;
  const approverEn = OWNER_EMERGENCY_REPAIR_APPROVER || 'to be confirmed';
  const approverAr = OWNER_EMERGENCY_REPAIR_APPROVER || 'يُؤكد لاحقاً';
  return arabic
    ? withLegalDraftMark(
      `يجوز للمدير أن يوجه بإجراء إصلاحات طارئة لأجهزة التكييف أو لتسرب المياه في حدود مبلغ لكل حادثة قدره ${amount}، وذلك فقط بعد موافقة إنسان (${approverAr}) وفقاً لقواعد المال المعتمدة لدى BIN، وليس من الذكاء الاصطناعي أبداً. ولا تُعلَّق أعمال الطوارئ أو تُوقف دون إشعار كتابي منفصل. ولا يرفع هذا البند حدود الموافقة والإنفاق الطارئ التشغيلية المنصوص عليها في هذه الاتفاقية ولا يحل محلها. ولا تعتمد الذكاء الاصطناعي أي إنفاق. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR}`,
      true,
    )
    : withLegalDraftMark(
      `The Manager may instruct emergency HVAC or water-leak repairs up to a per-incident limit of ${amount}, and only after approval by a human (${approverEn}) in accordance with BIN money rules. AI systems may never approve any such spend. Emergency works are never suspended without separate written notice. This clause does not raise or replace the operational approval and emergency spending limits already stated in this Agreement. AI never approves money. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN}`,
      false,
    );
}
