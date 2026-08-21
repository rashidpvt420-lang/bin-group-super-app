export const STAFF_ROLE_OPTIONS = [
  { value: 'technician', label: 'Technician', description: 'Physical-device field technician access' },
  { value: 'operations_admin', label: 'Operations Admin', description: 'Tickets, technicians, map and SOS' },
  { value: 'operations_manager', label: 'Operations Manager', description: 'Operations oversight and reporting' },
  { value: 'finance_admin', label: 'Finance Admin', description: 'Financial operations and reporting' },
  { value: 'finance_staff', label: 'Finance Staff', description: 'Restricted finance support' },
  { value: 'hr_admin', label: 'HR Admin', description: 'Staff lifecycle and HR administration' },
  { value: 'hr_manager', label: 'HR Manager', description: 'HR approvals and reporting' },
  { value: 'hr_staff', label: 'HR Staff', description: 'Restricted HR support' },
  { value: 'support_admin', label: 'Support Admin', description: 'Tenant support, tickets and SOS' },
  { value: 'account_manager', label: 'Account Manager', description: 'Owners, contracts and documents' },
  { value: 'dispatcher', label: 'Dispatcher', description: 'Ticket assignment and live dispatch' },
  { value: 'manager', label: 'Manager', description: 'Restricted management reports' },
  { value: 'admin_assistant', label: 'Admin Assistant', description: 'Restricted administrative support' },
] as const;

export const STAFF_ROLE_VALUES = STAFF_ROLE_OPTIONS.map((role) => role.value);
export type StaffRole = (typeof STAFF_ROLE_OPTIONS)[number]['value'];

export const STAFF_MODULE_ACCESS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'owners', label: 'Owner Management' },
  { key: 'tenants', label: 'Tenant Management' },
  { key: 'tickets', label: 'Tickets / Maintenance' },
  { key: 'technicians', label: 'Technician Management' },
  { key: 'financials', label: 'Financials' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'documents', label: 'Document Vault' },
  { key: 'properties', label: 'Properties' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'map', label: 'Live Map' },
  { key: 'sos', label: 'SOS Feed' },
  { key: 'hr', label: 'HR Management' },
] as const;

export const STAFF_ROLE_ALLOWED_MODULES: Record<StaffRole, string[]> = {
  technician: [],
  manager: ['dashboard', 'reports', 'audit', 'owners', 'tenants', 'properties'],
  operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties', 'owners', 'tenants', 'documents'],
  hr_admin: ['dashboard', 'technicians', 'hr', 'reports', 'audit'],
  support_admin: ['dashboard', 'tenants', 'tickets', 'sos', 'documents'],
  hr_staff: ['dashboard', 'technicians', 'hr'],
  hr_manager: ['dashboard', 'technicians', 'hr', 'reports', 'audit'],
  finance_staff: ['dashboard', 'financials', 'transactions', 'reports'],
  dispatcher: ['dashboard', 'tickets', 'technicians', 'map', 'sos'],
  admin_assistant: ['dashboard', 'owners', 'tenants', 'tickets', 'documents', 'properties'],
  account_manager: ['dashboard', 'owners', 'contracts', 'documents', 'properties'],
  operations_manager: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties', 'reports'],
  finance_admin: ['dashboard', 'financials', 'transactions', 'reports', 'audit'],
};

export const STAFF_ROLE_DEFAULT_MODULES: Record<StaffRole, string[]> = {
  technician: [],
  manager: ['dashboard', 'reports'],
  operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos'],
  hr_admin: ['dashboard', 'technicians', 'hr'],
  support_admin: ['dashboard', 'tenants', 'tickets'],
  hr_staff: ['dashboard', 'hr'],
  hr_manager: ['dashboard', 'technicians', 'hr', 'reports'],
  finance_staff: ['dashboard', 'financials', 'transactions'],
  dispatcher: ['dashboard', 'tickets', 'technicians', 'map'],
  admin_assistant: ['dashboard', 'owners', 'tenants', 'documents'],
  account_manager: ['dashboard', 'owners', 'contracts', 'documents', 'properties'],
  operations_manager: ['dashboard', 'tickets', 'technicians', 'reports'],
  finance_admin: ['dashboard', 'financials', 'transactions', 'reports'],
};

export const isStaffRole = (value: unknown): value is StaffRole =>
  STAFF_ROLE_VALUES.includes(String(value || '').trim().toLowerCase() as StaffRole);
