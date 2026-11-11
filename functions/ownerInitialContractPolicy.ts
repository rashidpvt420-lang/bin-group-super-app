/**
 * Initial owner contract commercial policy.
 * The 30-day cancellation fee is a founder / Finance Admin decision and must not be invented.
 * New legal wording in this file is a draft for UAE legal review. Pasted research is unverified and is not law.
 */

export const OWNER_INITIAL_CONTRACT_TERM_MONTHS = 13;
export const OWNER_RENEWAL_CONTRACT_TERM_MONTHS = 12;
export const OWNER_SERVICE_TERM_MONTHS = 12;
export const OWNER_COMPLIMENTARY_MONTHS = 1;
export const OWNER_INITIAL_CANCELLATION_WINDOW_DAYS = 30;

export const LEGAL_DRAFT_MARK_EN = 'Draft, for UAE legal review';
export const LEGAL_DRAFT_MARK_AR = 'مسودة، للمراجعة القانونية في دولة الإمارات';
export const UNVERIFIED_RESEARCH_CITATION_NOTE_EN =
  'Citations named here come from unverified research a UAE lawyer must confirm; they are not presented as verified law.';
export const UNVERIFIED_RESEARCH_CITATION_NOTE_AR =
  'الاستشهادات المذكورة هنا مصدرها بحث غير محقَّق يجب أن يؤكدها محامٍ إماراتي، ولا تُعرض بوصفها قانوناً مثبتاً.';

/**
 * Pending founder / Finance Admin decision.
 * Must stay null until a confirmed AED amount is set. Never invent a number.
 */
export const OWNER_INITIAL_CANCELLATION_FEE_AED: number | null = null;

export const OWNER_INITIAL_CANCELLATION_FEE_STATUS = 'PENDING_FOUNDER_DECISION' as const;
export const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN = 'to be confirmed';
export const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR = 'يُؤكد لاحقاً';
export const OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE = 'OWNER_INITIAL_CANCELLATION_FEE_UNSET';
export const OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN =
  'an administrative disbursement fee covering documented onboarding and property assessment costs';
export const OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR =
  'رسم مصروفات إدارية يغطي تكاليف بدء التعاقد وتقييم العقار الموثقة';

/**
 * Unverified market research cited AED 1,500–3,000. That range is listed for founder awareness only.
 * It is not applied and must not be written into the live fee or the contract as a confirmed amount.
 */
export const OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_EN =
  'Unverified market research cited a range of AED 1,500 to AED 3,000. That range is not applied. Rashid must decide the amount.';
export const OWNER_INITIAL_CANCELLATION_FEE_RESEARCH_RANGE_NOTE_AR =
  'أشار بحث سوقي غير محقَّق إلى نطاق من 1,500 إلى 3,000 درهم. ولا يُطبَّق ذلك النطاق. ويجب أن يقرر رشيد المبلغ.';

/**
 * Pending Rashid's decision: keep the administrative disbursement fee during the waived first month, or drop it.
 * Current disclosed design (until he decides otherwise) is that the fee still applies if the Owner cancels within 30 days.
 * Do not silently drop the fee.
 */
export const OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH: boolean | null = null;
export const OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH_STATUS = 'PENDING_FOUNDER_DECISION' as const;

/**
 * Pending legal insertion. Never invent a licence number.
 */
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF: string | null = null;
export const BIN_GROUP_TRADE_LICENCE_REF: string | null = null;
export const BIN_GROUP_RERA_ORN_REF: string | null = null;
export const BIN_GROUP_ADREC_REG_REF: string | null = null;
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN = 'to be inserted';
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR = 'يُدرج لاحقاً';

/**
 * Default design for mobilisation if the owner cancels within 30 days, flagged as Rashid's decision.
 * Retain only verifiable incurred expenses (itemised) and refund the rest.
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

/**
 * Cash-acceptance threshold. Pending founder / Finance Admin decision.
 * Must stay null until a confirmed AED amount is set. Unverified research cited AED 55,000
 * goAML reporting; that figure is not applied as a live threshold. Payments stay PHASE1_CASH_CHEQUE_V1.
 */
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_AED: number | null = null;
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_STATUS = 'PENDING_FOUNDER_DECISION' as const;
export const OWNER_PAYMENT_POLICY_VERSION = 'PHASE1_CASH_CHEQUE_V1' as const;
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_EN =
  'Unverified research cited AED 55,000 reporting under the goAML rules. That figure is not applied as a live threshold. Rashid must decide the amount.';
export const OWNER_CASH_ACCEPTANCE_THRESHOLD_RESEARCH_NOTE_AR =
  'أشار بحث غير محقَّق إلى إبلاغ عند 55,000 درهم بموجب قواعد goAML. ولا يُطبَّق ذلك الرقم كحد حي. ويجب أن يقرر رشيد المبلغ.';

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

export function isOwnerInitialCancellationFeeSet(
  fee: number | null | undefined = OWNER_INITIAL_CANCELLATION_FEE_AED,
): boolean {
  return typeof fee === 'number' && Number.isFinite(fee) && fee >= 0;
}

export function formatOwnerInitialCancellationFee(
  fee: number | null | undefined = OWNER_INITIAL_CANCELLATION_FEE_AED,
) {
  if (!isOwnerInitialCancellationFeeSet(fee)) {
    return {
      set: false,
      aed: null as number | null,
      status: OWNER_INITIAL_CANCELLATION_FEE_STATUS,
      displayEn: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN,
      displayAr: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR,
      natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
      natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
    };
  }
  const aed = Number(fee);
  return {
    set: true,
    aed,
    status: 'SET' as const,
    displayEn: `AED ${aed.toLocaleString('en-AE')}`,
    displayAr: `${aed.toLocaleString('ar-AE')} درهم`,
    natureEn: OWNER_INITIAL_CANCELLATION_FEE_NATURE_EN,
    natureAr: OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR,
  };
}

export function evaluateOwnerInitialCancellationFeeHonesty(
  fee: number | null | undefined = OWNER_INITIAL_CANCELLATION_FEE_AED,
) {
  if (!isOwnerInitialCancellationFeeSet(fee)) {
    return {
      ok: false,
      code: OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE,
      blocksHardPublicLaunch: true,
      message:
        'Owner initial 30-day cancellation fee is pending a founder / Finance Admin decision and is unset. Hard public launch must stay NO-GO until a confirmed AED amount is set. Do not invent an amount.',
    };
  }
  return {
    ok: true,
    code: 'OWNER_INITIAL_CANCELLATION_FEE_SET',
    blocksHardPublicLaunch: false,
    message: 'Owner initial 30-day cancellation fee has a confirmed AED amount.',
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
      displayEn: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN,
      displayAr: OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR,
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
      `يجوز للمالك طلب إلغاء العقد خلال ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} يوماً من تفعيل العقد / اعتماد التوقيع. وإذا أُلغي العقد خلال هذه المهلة يُستحق ${nature} بمبلغ ${feeText}. ويسري هذا الرسم خلال مهلة الثلاثين يوماً حتى أثناء الفترة التي تُعفى فيها رسوم الإدارة للشهر الأول. ويجب الإفصاح عن ذلك للمالك قبل التوقيع. ولا يُعتمد الإلغاء ولا أي مبلغ مالي تلقائياً؛ يلزم اعتماد إداري من إدارة المالية أو الإدارة المختصة. لا تعتمد الذكاء الاصطناعي المبالغ أو العقود. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المادة 390 من قانون المعاملات المدنية، والمادة 21 من القانون الاتحادي رقم 15 لسنة 2020، وقرار مجلس الوزراء رقم 66 لسنة 2023.`,
      true,
    )
    : withLegalDraftMark(
      `The Owner may request cancellation within ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} days of contract activation / signature approval. If the contract is cancelled within that window, ${nature} of ${feeText} shall apply. This fee applies within the 30-day window, including during the period when the first month's management fee is waived, and must be disclosed to the Owner before signing. Cancellation and any money amount are never auto-approved; Admin or Finance Admin approval is required. AI never approves money or contracts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include Civil Code Article 390, Federal Law 15 of 2020 Article 21, and Cabinet Resolution 66 of 2023.`,
      false,
    );
}

/** Short, prominent pre-signature notice that the 30-day fee still applies during the waived first month. */
export function ownerCancellationFeePreSignNoticeCopy(arabic = false, fee = formatOwnerInitialCancellationFee()): string {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  return arabic
    ? withLegalDraftMark(
      `يُرجى العلم قبل التوقيع: مدة العقد 13 شهراً، وتُعفى رسوم الإدارة للشهر الأول. وإذا طلب المالك الإلغاء خلال ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} يوماً، يُستحق رسم مصروفات إدارية يغطي تكاليف بدء التعاقد وتقييم العقار الموثقة بمبلغ ${feeText}. ويسري هذا الرسم خلال تلك المهلة حتى أثناء فترة الإعفاء.`,
      true,
    )
    : withLegalDraftMark(
      `Please note before signing: this Agreement is for a 13-month term, and the first month's management fee is waived. If the Owner requests cancellation within ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} days, an administrative disbursement fee covering documented onboarding and property assessment costs of ${feeText} shall apply. That fee applies within the 30-day window, including during the waived first month.`,
      false,
    );
}

export function ownerMobilisationRefundCopy(arabic = false): string {
  const deliverablesEn = OWNER_MOBILISATION_DELIVERABLES_EN.join(', ');
  const deliverablesAr = OWNER_MOBILISATION_DELIVERABLES_AR.join('، ');
  return arabic
    ? withLegalDraftMark(
      `هذا هو التصميم الافتراضي بانتظار تأكيد رشيد. تغطي دفعة التفعيل البالغة 15٪ أعمال بدء التعاقد الأولية، وتشمل: ${deliverablesAr}. وإذا ألغى المالك خلال مهلة الثلاثين يوماً، تحتفظ BIN GROUP فقط بالجزء من دفعة التفعيل الذي يقابل مصروفات مكتسبة أو فعلية يمكن التحقق منها، وتُعرض بنداً بنداً، ويُرد الرصيد غير المكتسب. ويجب أن تعتمد الإدارة أو إدارة المالية أي مبلغ يُحتفظ به أو يُرد. ولا تعتمد الذكاء الاصطناعي المبالغ أو العقود.`,
      true,
    )
    : withLegalDraftMark(
      `This is the default design pending Rashid's confirmation. The 15% mobilisation fee covers initial onboarding deliverables, including: ${deliverablesEn}. If the Owner cancels within the 30-day window, BIN GROUP shall retain only the portion of mobilisation that corresponds to verifiable earned or incurred expenses, which will be itemised, and shall refund the unearned balance. Admin or Finance Admin must approve any retained or refunded amount. AI never approves money or contracts.`,
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
      `تُعالج البيانات الشخصية، بما في ذلك صور العقار والمراسلات، فقط لتنفيذ هذه الاتفاقية. ولا تُستخدم للتسويق إلا بموافقة اشتراك منفصلة يمكن سحبها في أي وقت، وليست تلك الموافقة شرطاً للحصول على الخدمة المتعاقد عليها. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المرسوم بقانون اتحادي رقم 45 لسنة 2021 بشأن حماية البيانات الشخصية.`,
      true,
    )
    : withLegalDraftMark(
      `Personal data, including property images and communications, is processed only to perform this Agreement. It shall not be used for marketing without a separate opt-in, which the Owner may withdraw at any time. Marketing consent is not a condition of receiving the contracted service. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 45 of 2021 (PDPL).`,
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
      `بيانات المدير: BIN GROUP. رقم الرخصة التجارية: ${block.tradeLicence.displayAr}. رقم تسجيل ريرا (ORN): ${block.reraOrn.displayAr}. رقم تسجيل مركز أبوظبي العقاري (ADREC): ${block.adrecReg.displayAr}. ويخضع هذا العقد للتسجيل عبر النظام البلدي المحلي (مثل إيجاري أو توثيق). وهذه حقول مؤقتة وليست أرقام تراخيص مخترعة إلى حين إدراج البيانات الفعلية.`,
      true,
    )
    : withLegalDraftMark(
      `Manager details: BIN GROUP. Trade licence no.: ${block.tradeLicence.displayEn}. RERA ORN: ${block.reraOrn.displayEn}. ADREC registration no.: ${block.adrecReg.displayEn}. This contract is subject to registration via the local municipal system (for example Ejari or Tawtheeq). These are placeholders, not invented licence numbers, until the real particulars are inserted.`,
      false,
    );
}

export function ownerVatTreatmentCopy(arabic = false): string {
  const rate = OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT;
  return arabic
    ? withLegalDraftMark(
      `رسوم الإدارة وسائر رسوم الخدمة المبينة في هذه الاتفاقية غير شاملة ضريبة القيمة المضافة في دولة الإمارات البالغة ${rate}٪. وحيثما يُلزم القانون بذلك، تُستحق ضريبة القيمة المضافة بنسبة ${rate}٪ إضافة إلى الرسوم المبيّنة، وذلك بعد التحقق من الرقم الضريبي للشركة. وإلى حين ذلك التحقق، تُصدر الفواتير بمعاملة ضريبية غير مطبقة، وتكون المبالغ المستحقة مساوية لصافي المبالغ المعروضة. ولم تُغيَّر الأسعار المعروضة لإدراج الضريبة. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المرسوم بقانون اتحادي رقم 8 لسنة 2017 بشأن ضريبة القيمة المضافة.`,
      true,
    )
    : withLegalDraftMark(
      `The management fees and other service fees shown in this Agreement are exclusive of ${rate}% UAE VAT. Where legally required, ${rate}% UAE VAT is payable in addition to those quoted fees once the Company's VAT tax registration number is verified. Until that verification, invoices are issued with VAT not applied, and the amounts due equal the quoted net figures. Quoted prices have not been changed to include VAT. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Federal Decree-Law 8 of 2017 (VAT).`,
      false,
    );
}

export function ownerAmlCashThresholdCopy(arabic = false, threshold = formatOwnerCashAcceptanceThreshold()): string {
  const amount = arabic ? threshold.displayAr : threshold.displayEn;
  return arabic
    ? withLegalDraftMark(
      `تبقى الدفعات مقبولة بالدرهم الإماراتي نقداً أو بشيك فقط (${OWNER_PAYMENT_POLICY_VERSION}). ولا يُقبل الدفع نقداً عند بلوغ حد قبول النقد أو تجاوزه، وهو ${amount} إلى حين تأكيد المبلغ. ولا يُعتمد أي حد نقدي تلقائياً، ولا تعتمد الذكاء الاصطناعي المبالغ. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR}`,
      true,
    )
    : withLegalDraftMark(
      `Payments remain accepted only in AED by cash or cheque (${OWNER_PAYMENT_POLICY_VERSION}). Cash at or above the cash-acceptance threshold, which is ${amount} until a confirmed amount is set, is not accepted. No cash threshold is auto-approved, and AI never approves money amounts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN}`,
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
      `يجوز للمدير أن يوجه بإجراء إصلاحات طارئة لأجهزة التكييف أو لتسرب المياه في حدود مبلغ لكل حادثة قدره ${amount}، وذلك فقط بعد موافقة إنسان (${approverAr}) وفقاً لقواعد المال المعتمدة لدى BIN، وليس من الذكاء الاصطناعي أبداً. ولا يرفع هذا البند حدود الموافقة والإنفاق الطارئ التشغيلية المنصوص عليها في هذه الاتفاقية ولا يحل محلها. ولا تعتمد الذكاء الاصطناعي أي إنفاق. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR}`,
      true,
    )
    : withLegalDraftMark(
      `The Manager may instruct emergency HVAC or water-leak repairs up to a per-incident limit of ${amount}, and only after approval by a human (${approverEn}) in accordance with BIN money rules. AI systems may never approve any such spend. This clause does not raise or replace the operational approval and emergency spending limits already stated in this Agreement. AI never approves money. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN}`,
      false,
    );
}
