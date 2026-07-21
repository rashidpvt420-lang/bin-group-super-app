export const FULL_ADMIN_ROLES = new Set(['admin', 'super_admin', 'ceo']);

export const STAFF_PORTAL_ROLES = new Set([
    'manager',
    'operations_admin',
    'finance_admin',
    'hr_admin',
    'support_admin',
    'hr_manager',
    'hr_staff',
    'finance_staff',
    'dispatcher',
    'account_manager',
    'operations_manager',
]);

export const PROVISIONABLE_STAFF_ROLE_OPTIONS = [
    { value: 'technician', label: 'Technician', description: 'Technician mobile portal only' },
    { value: 'operations_admin', label: 'Operations Admin', description: 'Tickets, technicians, map' },
    { value: 'operations_manager', label: 'Operations Manager', description: 'Operations oversight and dispatch' },
    { value: 'dispatcher', label: 'Dispatcher', description: 'Ticket assignment and duty command' },
    { value: 'finance_admin', label: 'Finance Admin', description: 'Financials, payments and payroll' },
    { value: 'finance_staff', label: 'Finance Staff', description: 'Assigned finance workflows' },
    { value: 'hr_admin', label: 'HR Admin', description: 'Staff management and approvals' },
    { value: 'hr_manager', label: 'HR Manager', description: 'HR review and confidential cases' },
    { value: 'hr_staff', label: 'HR Staff', description: 'Assigned HR workflows' },
    { value: 'support_admin', label: 'Support Admin', description: 'Tenants, complaints and messages' },
    { value: 'account_manager', label: 'Account Manager', description: 'Owners, contracts and documents' },
    { value: 'manager', label: 'Manager', description: 'Reports and assigned management modules' },
] as const;

export const PROVISIONABLE_STAFF_ROLES = PROVISIONABLE_STAFF_ROLE_OPTIONS.map((role) => role.value);

export const MODULE_OPTIONS = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'owners', label: 'Owner Management', icon: '🏠' },
    { key: 'tenants', label: 'Tenant Management', icon: '👤' },
    { key: 'tickets', label: 'Tickets / Maintenance', icon: '🔧' },
    { key: 'technicians', label: 'Technician Management', icon: '👷' },
    { key: 'financials', label: 'Financials & Payroll', icon: '💰' },
    { key: 'transactions', label: 'Transactions & Payments', icon: '💳' },
    { key: 'broker', label: 'Broker Management', icon: '🤝' },
    { key: 'documents', label: 'Document Vault', icon: '📁' },
    { key: 'properties', label: 'Properties & Passports', icon: '🏢' },
    { key: 'contracts', label: 'Contract Control', icon: '📝' },
    { key: 'reports', label: 'Reports & Analytics', icon: '📈' },
    { key: 'audit', label: 'Audit Log', icon: '🔍' },
    { key: 'compliance', label: 'Compliance & Launch Controls', icon: '✅' },
    { key: 'map', label: 'Live Map', icon: '🗺️' },
    { key: 'sos', label: 'SOS Feed', icon: '🚨' },
    { key: 'settings', label: 'System Settings', icon: '⚙️' },
    { key: 'hr', label: 'HR Management', icon: '👥' },
    { key: 'pricing', label: 'Pricing Matrix', icon: '💲' },
] as const;

export type StaffModule = typeof MODULE_OPTIONS[number]['key'];

const MODULE_KEYS = new Set<string>(MODULE_OPTIONS.map((module) => module.key));

export const ROLE_DEFAULT_MODULES: Record<string, StaffModule[]> = {
    technician: [],
    operations_admin: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties'],
    operations_manager: ['dashboard', 'tickets', 'technicians', 'map', 'sos', 'properties', 'reports'],
    dispatcher: ['dashboard', 'tickets', 'technicians', 'map', 'sos'],
    finance_admin: ['dashboard', 'financials', 'transactions', 'reports'],
    finance_staff: ['dashboard', 'financials', 'transactions'],
    hr_admin: ['dashboard', 'technicians', 'hr', 'reports'],
    hr_manager: ['dashboard', 'technicians', 'hr', 'reports'],
    hr_staff: ['dashboard', 'technicians', 'hr'],
    support_admin: ['dashboard', 'tenants', 'tickets', 'sos'],
    account_manager: ['dashboard', 'owners', 'contracts', 'documents', 'properties'],
    manager: ['dashboard', 'reports', 'audit', 'owners', 'tenants'],
};

const PATH_MODULES: Array<{ prefixes: string[]; module: StaffModule }> = [
    { prefixes: ['/technicians/map', '/live-map'], module: 'map' },
    { prefixes: ['/admin/payments', '/manual-approvals', '/payments', '/transactions'], module: 'transactions' },
    { prefixes: ['/financials', '/profitability'], module: 'financials' },
    { prefixes: ['/broker-attributions', '/broker-commissions', '/broker'], module: 'broker' },
    { prefixes: ['/ops/public-launch-command', '/ops/pilot-completion', '/ops/data-governance', '/ops/public', '/pilot', '/compliance'], module: 'compliance' },
    { prefixes: ['/ops/document-library', '/ops/rfq', '/ops/vendors', '/document-vault', '/vault'], module: 'documents' },
    { prefixes: ['/admin/unit-status', '/admin/units', '/properties/passport', '/onboard-property', '/bulk-import', '/units'], module: 'properties' },
    { prefixes: ['/ops/whatsapp-triage', '/ops/bin-connect', '/tickets'], module: 'tickets' },
    { prefixes: ['/ops/technicians', '/technicians'], module: 'technicians' },
    { prefixes: ['/ops/amenity-control', '/ops/announcements', '/ops/key-register', '/ops/parcel-desk', '/ops/visitor-parking', '/ops/marketplace-approvals', '/ops/messages', '/ops/community-moderation', '/tenant-services', '/unit-links', '/tenants'], module: 'tenants' },
    { prefixes: ['/control-center', '/design-studio', '/admin/bin-gpt-engineer', '/bin-gpt-engineer', '/settings'], module: 'settings' },
    { prefixes: ['/ops/staff-directory', '/hr'], module: 'hr' },
    { prefixes: ['/admin/pricing-matrix', '/pricing-matrix'], module: 'pricing' },
    { prefixes: ['/audit-shield', '/orphans', '/audit'], module: 'audit' },
    { prefixes: ['/reports'], module: 'reports' },
    { prefixes: ['/contracts'], module: 'contracts' },
    { prefixes: ['/owners'], module: 'owners' },
    { prefixes: ['/sos'], module: 'sos' },
    { prefixes: ['/dashboard'], module: 'dashboard' },
];

const normalizeRole = (value: unknown) => String(value || '').trim().toLowerCase();

const pathMatches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export const normalizeStaffModules = (value: unknown): StaffModule[] => {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => String(item || '').trim()).filter((item) => MODULE_KEYS.has(item)))] as StaffModule[];
};

export const moduleForAdminPath = (pathname: string): StaffModule | null => {
    const normalizedPath = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
    for (const entry of PATH_MODULES) {
        if (entry.prefixes.some((prefix) => pathMatches(normalizedPath, prefix))) return entry.module;
    }
    return null;
};

export const isFullAdminUser = (user: any): boolean => {
    const role = normalizeRole(user?.role || user?.claims?.role || user?.claims?.userRole || user?.claims?.primaryRole);
    return Boolean(
        user?.claims?.admin === true ||
        user?.claims?.isAdmin === true ||
        user?.claims?.super_admin === true ||
        user?.claims?.superAdmin === true ||
        user?.claims?.ceo === true ||
        FULL_ADMIN_ROLES.has(role)
    );
};

export const canAccessAdminPath = (user: any, pathname: string): boolean => {
    if (!user) return false;
    if (pathname === '/profile' || pathname.startsWith('/profile?')) return true;
    if (isFullAdminUser(user)) return true;

    const role = normalizeRole(user?.role || user?.claims?.role || user?.claims?.userRole || user?.claims?.primaryRole);
    if (!STAFF_PORTAL_ROLES.has(role)) return false;
    if (pathname === '/mfa-recovery' || pathname.startsWith('/mfa-recovery/')) return false;

    const requiredModule = moduleForAdminPath(pathname);
    if (!requiredModule) return false;
    const modules = normalizeStaffModules(user?.claims?.modules ?? user?.staffModules);
    return modules.includes(requiredModule);
};
