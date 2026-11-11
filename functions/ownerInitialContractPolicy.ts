/**
 * Initial owner contract commercial policy.
 * The 30-day cancellation fee is a founder / Finance Admin decision and must not be invented.
 */

export const OWNER_INITIAL_CONTRACT_TERM_MONTHS = 13;
export const OWNER_RENEWAL_CONTRACT_TERM_MONTHS = 12;
export const OWNER_SERVICE_TERM_MONTHS = 12;
export const OWNER_COMPLIMENTARY_MONTHS = 1;
export const OWNER_INITIAL_CANCELLATION_WINDOW_DAYS = 30;

/**
 * Pending founder / Finance Admin decision.
 * Must stay null until a confirmed AED amount is set. Never invent a number.
 */
export const OWNER_INITIAL_CANCELLATION_FEE_AED: number | null = null;

export const OWNER_INITIAL_CANCELLATION_FEE_STATUS = 'PENDING_FOUNDER_DECISION' as const;
export const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_EN = 'to be confirmed';
export const OWNER_INITIAL_CANCELLATION_FEE_DISPLAY_AR = 'يُؤكد لاحقاً';
export const OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE = 'OWNER_INITIAL_CANCELLATION_FEE_UNSET';

/**
 * Pending legal insertion of the actual RERA / DLD / emirate property-management licence reference.
 * Never invent a licence number.
 */
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF: string | null = null;
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_EN = 'to be inserted';
export const BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_DISPLAY_AR = 'يُدرج لاحقاً';

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
    };
  }
  const aed = Number(fee);
  return {
    set: true,
    aed,
    status: 'SET' as const,
    displayEn: `AED ${aed.toLocaleString('en-AE')}`,
    displayAr: `${aed.toLocaleString('ar-AE')} درهم`,
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

export function formatPropertyManagementLicenceRef(
  value: string | null | undefined = BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF,
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

export function ownerComplimentaryMonthCopy(arabic = false): string {
  return arabic
    ? 'يحصل كل مالك جديد على شهر خدمة مجاني واحد في بداية العقد الأولي. لا تُفوتر رسوم الخدمة المتكررة عن ذلك الشهر. تبقى دفعة التفعيل 15٪ مستحقة وفق جدول الدفع. لا يسري الشهر المجاني على عقود التجديد.'
    : 'Every new owner receives one complimentary service month at the start of the initial contract. No recurring service fee is invoiced for that month. The 15% mobilisation payment remains due as set out in the payment schedule. The complimentary month does not apply to renewals.';
}

export function ownerCancellationWindowCopy(arabic = false, fee = formatOwnerInitialCancellationFee()): string {
  const feeText = arabic ? fee.displayAr : fee.displayEn;
  return arabic
    ? `يجوز للمالك طلب إلغاء العقد خلال ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} يوماً من تفعيل العقد / اعتماد التوقيع. وإذا أُلغي العقد خلال هذه المهلة تُستحق رسوم إلغاء قدرها ${feeText}. ولا يُعتمد الإلغاء ولا أي مبلغ مالي تلقائياً؛ يلزم اعتماد إداري من إدارة المالية أو الإدارة المختصة. لا تعتمد الذكاء الاصطناعي المبالغ أو العقود.`
    : `The owner may request cancellation within ${OWNER_INITIAL_CANCELLATION_WINDOW_DAYS} days of contract activation / signature approval. If the contract is cancelled within that window, a cancellation fee of ${feeText} is payable. Cancellation and any money amount are never auto-approved; Admin or Finance Admin approval is required. AI never approves money or contracts.`;
}
