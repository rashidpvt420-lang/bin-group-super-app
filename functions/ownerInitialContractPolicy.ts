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
  'a pre-estimate of administrative and onboarding expenses';
export const OWNER_INITIAL_CANCELLATION_FEE_NATURE_AR =
  'تقديراً مسبقاً للمصروفات الإدارية ومصروفات بدء التعاقد';

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

export function ownerComplimentaryMonthCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      'الشهر الأول هو شهر خدمة مجاني تكون فيه رسوم الإدارة المتكررة 0 درهم. ولا يُعفي ذلك من دفعة التفعيل البالغة 15٪، إذ تبقى مستحقة وفق جدول الدفع. وتُفوتر الأشهر من 2 إلى 13 حسب سعر العقد. ولا يسري الشهر المجاني على التجديدات. ولا يتجدد العقد تلقائياً؛ وأي تجديد يتطلب موافقة صريحة من المالك.',
      true,
    )
    : withLegalDraftMark(
      'Month 1 is a complimentary service month in which the recurring management fee is AED 0. This does not waive the 15% mobilisation fee, which remains due as set out in the payment schedule. Months 2 to 13 are billed at the contract rate. The complimentary month does not apply to renewals. The contract does not auto-renew; any renewal requires the Owner’s explicit consent.',
      false,
    );
}

export function ownerCancellationWindowCopy(arabic = false, fee = formatOwnerInitialCancellationFee()): string {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  const nature = arabic ? fee.natureAr : fee.natureEn;
  return arabic
    ? withLegalDraftMark(
      `يجوز للمالك طلب إلغاء العقد خلال ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} يوماً من تفعيل العقد / اعتماد التوقيع. وإذا أُلغي العقد خلال هذه المهلة تُستحق رسوم إلغاء قدرها ${feeText} بوصفها ${nature}. ولا يُعتمد الإلغاء ولا أي مبلغ مالي تلقائياً؛ يلزم اعتماد إداري من إدارة المالية أو الإدارة المختصة. لا تعتمد الذكاء الاصطناعي المبالغ أو العقود. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المادة 340 من المرسوم بقانون اتحادي رقم 25 لسنة 2025 (قانون المعاملات المدنية الجديد).`,
      true,
    )
    : withLegalDraftMark(
      `The owner may request cancellation within ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} days of contract activation / signature approval. If the contract is cancelled within that window, a cancellation fee of ${feeText} shall apply as ${nature}. Cancellation and any money amount are never auto-approved; Admin or Finance Admin approval is required. AI never approves money or contracts. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} One citation to confirm is Article 340 of Federal Decree-Law 25 of 2025 (New Civil Code).`,
      false,
    );
}

export function ownerMobilisationRefundCopy(arabic = false): string {
  return arabic
    ? withLegalDraftMark(
      'هذا هو التصميم الافتراضي بانتظار تأكيد رشيد. تغطي دفعة التفعيل البالغة 15٪ تكاليف الإعداد والربط الأولية. وإذا ألغى المالك خلال مهلة الثلاثين يوماً، تحتفظ BIN GROUP فقط بالجزء من دفعة التفعيل الذي يقابل مصروفات فعلية يمكن التحقق منها، وتُعرض بنداً بنداً، ويُرد الباقي. ويجب أن تعتمد الإدارة أو إدارة المالية أي مبلغ يُحتفظ به أو يُرد. ولا تعتمد الذكاء الاصطناعي المبالغ أو العقود.',
      true,
    )
    : withLegalDraftMark(
      'This is the default design pending Rashid’s confirmation. The 15% mobilisation fee covers initial setup and integration. If the Owner cancels within the 30-day window, BIN GROUP shall retain only the portion of mobilisation that corresponds to verifiable incurred expenses, which will be itemised, and shall refund the remainder. Admin or Finance Admin must approve any retained or refunded amount. AI never approves money or contracts.',
      false,
    );
}

export function ownerGoverningLawJurisdictionCopy(arabic = false): string {
  const threshold = CONSUMER_NO_MANDATORY_ARBITRATION_THRESHOLD_AED.toLocaleString(arabic ? 'ar-AE' : 'en-AE');
  return arabic
    ? withLegalDraftMark(
      `تخضع هذه الاتفاقية لقوانين دولة الإمارات العربية المتحدة. وتختص محاكم الإمارة التي يقع فيها العقار فعلياً اختصاصاً حصرياً بالنظر في النزاعات الناشئة عن هذه الاتفاقية. أما نزاعات رسوم الخدمة في العقارات المشتركة الملكية في دبي فتُحال إلى مركز تسوية المنازعات الإيجارية (RDC). ولا تفرض هذه الاتفاقية تحكيماً إلزامياً على عقد استهلاكي تقل قيمته عن ${threshold} درهم. ${UNVERIFIED_RESEARCH_CITATION_NOTE_AR} ومن ذلك المرسوم بقانون اتحادي رقم 42 لسنة 2022 المادة 34، وقانون دبي رقم 6 لسنة 2019، والمرسوم بقانون اتحادي رقم 14 لسنة 2023.`,
      true,
    )
    : withLegalDraftMark(
      `This Agreement is governed by the laws of the United Arab Emirates. Disputes arising from this Agreement shall be subject to the exclusive jurisdiction of the courts of the Emirate where the Property is physically located. For Dubai jointly owned properties, service-charge disputes shall be referred to the Rental Disputes Settlement Centre (RDC). This Agreement does not impose mandatory arbitration on a consumer contract valued under AED ${threshold}. ${UNVERIFIED_RESEARCH_CITATION_NOTE_EN} Citations to confirm include Federal Decree-Law 42 of 2022 Article 34, Dubai Law 6 of 2019, and Federal Decree-Law 14 of 2023.`,
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
