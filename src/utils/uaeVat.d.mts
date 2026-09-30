export function roundAed(value: unknown): number;
export function uaeVatAmount(netAmount: unknown): number;
export function aedTotalWithVat(netAmount: unknown): { net: number; vat: number; total: number };
export type VatRegistration = { readonly trnVerified: boolean; readonly trn: string | null };
export const BIN_GROUP_VAT_REGISTRATION: VatRegistration;
export function isVerifiedVatRegistration(registration: unknown): boolean;
export function invoiceTotals(
  netAmount: unknown,
  registration?: VatRegistration,
): { net: number; vat: number; total: number; vatApplied: boolean; vatTreatment: 'NOT_APPLIED' | 'STANDARD_RATED_5' };
