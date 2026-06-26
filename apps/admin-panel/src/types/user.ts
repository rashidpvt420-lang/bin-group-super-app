/**
 * BIN GROUP — Canonical User Profile Types
 * ══════════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH for user identity, roles, permissions, and status.
 *
 * Previously duplicated across:
 *   • src/context/RoleContext.tsx  (SovereignUser — runtime auth layer)
 *   • src/admin/types/models.ts   (BinUser — UPPERCASE roles, dead code)
 *   • apps/admin-panel/src/types/models.ts (BinUser copy)
 *
 * Now unified here. All other files import from this module.
 *
 * Firestore collection:  /users/{uid}
 * Firebase custom claims: role, isAdmin
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { User as FirebaseUser } from 'firebase/auth';

// ─── Role Registry ──────────────────────────────────────────────────────────
// Lowercase canonical values — matches Firestore security rules exactly.
// The rules enforce: 'owner' | 'tenant' | 'technician' | 'broker' for
// self-assignment, plus admin sub-roles assigned by admin-only writes.

export type UserRole =
  | 'owner'
  | 'tenant'
  | 'technician'
  | 'broker'
  | 'admin'
  | 'super_admin'
  | 'ceo'
  | 'manager'
  | 'operations_admin'
  | 'hr_manager'
  | 'hr_staff'
  | 'finance_staff'
  | 'dispatcher'
  | 'admin_assistant'
  | 'account_manager'
  | 'operations_manager'
  | 'finance_admin'
  | 'auditor'
  | 'institutional_auditor'
  | 'hr_admin'
  | 'support_admin';

/** Roles that grant admin-level access. */
export const ADMIN_ROLES: ReadonlySet<string> = new Set<string>([
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'operations_manager',
  'finance_admin',
  'finance_staff',
  'hr_admin',
  'hr_manager',
  'hr_staff',
  'support_admin',
  'account_manager',
  'dispatcher',
  'admin_assistant',
  'auditor',
  'institutional_auditor',
]);

// ─── Role Utilities ─────────────────────────────────────────────────────────

/** Normalize any raw role value to a lowercase trimmed string. */
export const normalizeRole = (value: unknown): string =>
  String(value || '').trim().toLowerCase();

/** True if the role grants admin-level access. */
export const isAdminRole = (value: unknown): boolean =>
  ADMIN_ROLES.has(normalizeRole(value));

/** All roles recognized by the platform. */
export const VALID_ROLES: readonly UserRole[] = [
  'owner',
  'tenant',
  'technician',
  'broker',
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'hr_manager',
  'hr_staff',
  'finance_staff',
  'dispatcher',
  'admin_assistant',
  'account_manager',
  'operations_manager',
  'finance_admin',
  'auditor',
  'institutional_auditor',
  'hr_admin',
  'support_admin',
];

export const VALID_ROLE_SET: ReadonlySet<UserRole> = new Set<UserRole>(VALID_ROLES);

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_ROLE_SET.has(role as UserRole);
}

// ─── Account Status ─────────────────────────────────────────────────────────

export type AccountStatus =
  | 'active'
  | 'pending_approval'
  | 'suspended'
  | 'role_required'
  | 'onboarding'
  | 'inactive';

// ─── Permission Grants ──────────────────────────────────────────────────────

export type SovereignPermission =
  | 'canViewPayments'
  | 'canVerifyPayments'
  | 'canManageTenants'
  | 'canManageTechnicians'
  | 'canManageContracts'
  | 'canViewFinancials'
  | 'canEditPricing'
  | 'canManageCompanyProfile'
  | 'canDispatchJobs'
  | 'canViewAuditLogs'
  | 'canExportReports';

// ─── SovereignUser (Runtime Auth Extension) ─────────────────────────────────
// Used in RoleContext — extends the live Firebase Auth User object with
// Firestore profile fields. This is the in-memory representation, never
// serialized directly to Firestore.

export interface SovereignUser extends FirebaseUser {
  designStudioBeta?: boolean;
  role?: string;
  status?: string;
  isAdmin?: boolean;
  propertyId?: string;
  unitId?: string;
  onDuty?: boolean;
  dutyStatus?: string;
  emirate?: string;
  fcmTokens?: string[];
  platform?: string;
  isStandalone?: boolean;
  userAgent?: string;
  legalAcceptedAt?: string;
  adminApproved?: boolean;
  onboardingComplete?: boolean;
  permissions?: Record<string, boolean>;
  hasActiveContract?: boolean;
}

// ─── BinUser (Legacy Compatibility) ─────────────────────────────────────────
// This interface was previously defined in admin/types/models.ts with
// UPPERCASE roles. It is preserved here as a compatibility alias that uses
// the canonical lowercase UserRole type. No existing code imports it, but
// it prevents breakage if any future admin code references it.

export interface BinUser {
  uid: string;
  phoneNumber: string;
  role: UserRole;
  isSuspended: boolean;
  hasActiveContract: boolean;
  displayName?: string;
  email?: string;
  createdAt: string;
  lastLoginAt?: string;
}
