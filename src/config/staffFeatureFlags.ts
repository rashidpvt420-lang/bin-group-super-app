/**
 * Sovereign Feature Flags for Staff-First Company Operating System
 * Incomplete modules default to false (DISABLED / COMING SOON) for production safety.
 */
export const STAFF_FEATURE_FLAGS = {
  // Core Active Modules
  ENABLE_TODAY_DASHBOARD: true,
  ENABLE_SHIFT_ROSTER: true,
  ENABLE_ATTENDANCE_ENGINE: true,
  ENABLE_OVERTIME_ENGINE: true,
  ENABLE_ATOMIC_INVENTORY_MUTATION: true,
  ENABLE_PURPOSE_BOUND_LOCATION_PRIVACY: true,
  ENABLE_SECURE_PDF_REPORTING: true,
  ENABLE_CROSS_DEPT_AUTOMATION: true,

  // 8 Incomplete Modules — Feature-Flagged OFF for Staging/Production Pilot
  ENABLE_ORG_CHART_TREE: false, // #4 Organization Chart
  ENABLE_PROBATION_CARD: false, // #7 Probation
  ENABLE_CAREER_TRANSITIONS: false, // #8 Promotions/Transfers
  ENABLE_SHIFT_SWAP_MODAL: false, // #13 Shift Swaps
  ENABLE_ACTING_MANAGER_DRAWER: false, // #14 Delegation/Acting Manager
  ENABLE_SUPPLIERS_PORTAL: false, // #46 Suppliers
  ENABLE_RECRUITMENT_PIPELINE: false, // #78 Recruitment
  ENABLE_CANDIDATE_MESSAGING: false, // #79 Candidate Messaging
} as const;

export function isStaffFeatureEnabled(featureKey: keyof typeof STAFF_FEATURE_FLAGS): boolean {
  return STAFF_FEATURE_FLAGS[featureKey] === true;
}
