/**
 * BIN-AUTH™ — Institutional Permissions Matrix
 * Defines granular access levels for UAE Property Operations.
 */

const PERMISSIONS = {
    // 🏢 Asset Governance
    ASSET_VIEW: 'asset:view',
    ASSET_EDIT: 'asset:edit',
    ASSET_ONBOARD: 'asset:onboard',
    QUOTE_GENERATE: 'quote:generate',

    // 📄 Legal & Compliance
    KYC_SUBMIT: 'kyc:submit',
    KYC_VERIFY: 'kyc:verify', // Admin only
    CONTRACT_SIGN: 'contract:sign',
    CONTRACT_CREATE: 'contract:create',
    CONTRACT_SUPERSEDE: 'contract:supersede',

    // 🌉 Regulator Bridge
    EJARI_MANAGE: 'ejari:manage',

    // 💰 Financial Execution
    FINANCIAL_VIEW: 'financial:view',
    FINANCIAL_OVERSIGHT: 'financial:oversight', // CFO Dashboard
    PAYMENT_APPROVE: 'payment:approve',
    QUOTATION_APPROVE: 'quotation:approve',
    FINANCIAL_INVOICE_CREATE: 'financial:invoice_create',

    // 🚦 Governance & Approval Workflows
    APPROVAL_INITIATE: 'approval:initiate',
    APPROVAL_VOTE: 'approval:vote',

    // 🏭 Vendor Management
    VENDOR_COMPLIANCE_MANAGE: 'vendor:compliance_manage',

    // 🚦 Operational Intelligence
    TELEMETRY_ACCESS: 'telemetry:access', // Live GPS tracking
    ASSISTANT_QUERY: 'assistant:query', // AI access
    DISPATCH_OVERRIDE: 'dispatch:override',

    // 👷 Field Operations
    JOB_UPDATE: 'job:update',
    JOB_CLOSE: 'job:close',
};

const ROLES = {
    ADMIN_GOD: {
        id: 'ADMIN_GOD',
        label: 'Global Administrator',
        permissions: Object.values(PERMISSIONS), // Everything
    },
    PORTFOLIO_OWNER: {
        id: 'PORTFOLIO_OWNER',
        label: 'Institutional Owner',
        permissions: [
            PERMISSIONS.ASSET_VIEW,
            PERMISSIONS.KYC_SUBMIT,
            PERMISSIONS.CONTRACT_SIGN,
            PERMISSIONS.FINANCIAL_VIEW,
            PERMISSIONS.QUOTATION_APPROVE,
            PERMISSIONS.TELEMETRY_ACCESS,
            PERMISSIONS.ASSISTANT_QUERY,
            PERMISSIONS.QUOTE_GENERATE,
        ],
    },
    ASSET_MANAGER: {
        id: 'ASSET_MANAGER',
        label: 'Senior Asset Manager',
        permissions: [
            PERMISSIONS.ASSET_VIEW,
            PERMISSIONS.ASSET_EDIT,
            PERMISSIONS.FINANCIAL_VIEW,
            PERMISSIONS.TELEMETRY_ACCESS,
            PERMISSIONS.ASSISTANT_QUERY,
            PERMISSIONS.DISPATCH_OVERRIDE,
            PERMISSIONS.JOB_UPDATE,
            PERMISSIONS.CONTRACT_SUPERSEDE,
            PERMISSIONS.EJARI_MANAGE,
            PERMISSIONS.APPROVAL_INITIATE,
            PERMISSIONS.APPROVAL_VOTE,
            PERMISSIONS.VENDOR_COMPLIANCE_MANAGE,
            PERMISSIONS.QUOTE_GENERATE,
        ],
    },
    FINANCE_CONTROLLER: {
        id: 'FINANCE_CONTROLLER',
        label: 'Finance & CFO',
        permissions: [
            PERMISSIONS.FINANCIAL_VIEW,
            PERMISSIONS.FINANCIAL_OVERSIGHT,
            PERMISSIONS.PAYMENT_APPROVE,
            PERMISSIONS.QUOTATION_APPROVE,
            PERMISSIONS.FINANCIAL_INVOICE_CREATE,
            PERMISSIONS.CONTRACT_SUPERSEDE,
            PERMISSIONS.APPROVAL_VOTE,
        ],
    },
    FIELD_OPERATIVE: {
        id: 'FIELD_OPERATIVE',
        label: 'Certified Technician',
        permissions: [
            PERMISSIONS.JOB_UPDATE,
            PERMISSIONS.JOB_CLOSE,
            PERMISSIONS.TELEMETRY_ACCESS, // Self-tracking permission
        ],
    },
};

/**
 * Check if a role has a specific permission
 */
const hasPermission = (roleId, permission) => {
    const role = ROLES[roleId];
    if (!role) return false;
    return role.permissions.includes(permission);
};

module.exports = {
    PERMISSIONS,
    ROLES,
    hasPermission
};
