// P1-2: payroll covers technicians and every provisioned staff role (never owner/tenant/broker
// and never the privileged admin/CEO accounts, which are not salaried through this batch).
export const PAYROLL_ELIGIBLE_ROLES: readonly string[] = [
    "technician",
    "manager",
    "operations_admin",
    "hr_admin",
    "support_admin",
    "hr_staff",
    "hr_manager",
    "finance_staff",
    "dispatcher",
    "admin_assistant",
    "account_manager",
    "operations_manager",
    "finance_admin",
    "finance_manager",
    "finance_controller",
    "payroll_admin",
];

/** Basic salary for payroll: private HR profile first, legacy users.baseSalary only as a flagged fallback. */
export function resolvePayrollBasicSalary(privateHrProfile: Record<string, any> | null | undefined, userDoc: Record<string, any> | null | undefined): { raw: unknown; source: string; overtimeEligible: boolean } {
    // Nov 9 follow-up (from #1992): HR can mark a salary package as not overtime-eligible.
    const overtimeEligible = privateHrProfile?.salaryPackage?.overtimeEligible !== false;
    const packaged = privateHrProfile?.salaryPackage?.basicSalary;
    if (packaged !== undefined && packaged !== null && String(packaged).trim() !== "" && Number(packaged) > 0) {
        return { raw: packaged, source: "PRIVATE_HR_PROFILE", overtimeEligible };
    }
    const legacy = userDoc?.baseSalary ?? userDoc?.basicSalary;
    if (legacy !== undefined && legacy !== null && String(legacy).trim() !== "" && Number(legacy) > 0) {
        return { raw: legacy, source: "LEGACY_USERS_BASE_SALARY", overtimeEligible };
    }
    return { raw: null, source: "NONE", overtimeEligible };
}
