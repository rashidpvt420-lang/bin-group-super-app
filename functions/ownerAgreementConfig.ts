// Commercial defaults for the Owner Service Agreement (approved by the owner, 14 Oct 2026).
// Values live here, not in the PDF prose. A UAE-licensed lawyer should review the final wording.

export const PM_SCHEDULE_DEFAULTS = {
  ownerApprovalThresholdAed: 1000, // owner's written approval required above this, per job
  emergencySpendLimitAed: 2500, // emergency spend allowed without prior approval, per event
  emergencyNotifyHours: 24, // owner notified within this many hours of emergency spend
  rentRemittanceWorkingDays: 7, // collected rent remitted to owner within this many working days
  handbackDays: 30, // handback period on expiry/termination
} as const;

/**
 * Official contractual response TARGETS (first response / dispatch, not completion, not guarantees).
 * Same minutes the owner maintenance ticket callable writes (ownerMaintenanceOperations.ts).
 * NOTE: functions/slaPolicy.ts (30/120/240/480/1440) is a separate operational table and diverges.
 */
export const OWNER_AGREEMENT_RESPONSE_TARGET_MINUTES = {
  emergency: 60,
  urgent: 240,
  standard: 1440,
} as const;

export function ownerTicketTargetMinutes(priority: string): number {
  if (priority === 'emergency') return OWNER_AGREEMENT_RESPONSE_TARGET_MINUTES.emergency;
  if (priority === 'urgent') return OWNER_AGREEMENT_RESPONSE_TARGET_MINUTES.urgent;
  return OWNER_AGREEMENT_RESPONSE_TARGET_MINUTES.standard;
}
