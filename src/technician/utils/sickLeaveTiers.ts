// P2-15: same split as functions/hrLeaveEngine.ts splitSickDays, so the HR page preview
// starts from the sick days already used this service year (Decree-Law 33/2021, Art. 31).
export const SICK_LEAVE_TIERS = { fullPayDays: 15, halfPayDays: 30, unpaidDays: 45 } as const;

export function splitSickDays(alreadyUsedThisYear: number, requestedDays: number) {
  const tiers = [
    ['fullPayDays', SICK_LEAVE_TIERS.fullPayDays],
    ['halfPayDays', SICK_LEAVE_TIERS.halfPayDays],
    ['unpaidDays', SICK_LEAVE_TIERS.unpaidDays],
  ] as const;
  const out = { fullPayDays: 0, halfPayDays: 0, unpaidDays: 0, beyondStatutoryDays: 0 };
  let used = Math.max(0, Number(alreadyUsedThisYear) || 0);
  let remaining = Math.max(0, Number(requestedDays) || 0);
  let floor = 0;
  for (const [key, size] of tiers) {
    const ceiling = floor + size;
    const room = Math.max(0, ceiling - Math.max(used, floor));
    const take = Math.min(room, remaining);
    out[key] += take;
    remaining -= take;
    used += take;
    floor = ceiling;
  }
  out.beyondStatutoryDays = remaining;
  return out;
}
