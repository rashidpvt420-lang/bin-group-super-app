import { normalizeAedMoney } from "./aedMoney";

/** 15% mobilisation kept in fils, matching owner portfolio quote money(). */
export function mobilisationDepositFromAnnual(annual: unknown): number {
  return normalizeAedMoney(normalizeAedMoney(annual) * 0.15);
}
