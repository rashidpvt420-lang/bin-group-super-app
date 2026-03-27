const { hasPermission } = require('../config/roles');
const GovernanceService = require('../services/governanceService');

/**
 * RBAC Middleware — Role-Based Access Enforcement
 * Safeguards institutional endpoints and truth layers.
 */

const requirePermission = (permission) => {
    return async (req, res, next) => {
        // [SECURITY HARDENING] Identity is derived exclusively from the verified Firebase ID Token.
        // Client-supplied headers like 'x-user-role' are ignored for authorization.
        const userRole = req.user?.role || 'UNKNOWN';
        const userId = req.user?.uid || 'ANONYMOUS';

        const authorized = hasPermission(userRole, permission);

        if (!authorized) {
            console.error(`🚨 [AUTH_DENIED] Access denied: ${permission} for Role: ${userRole}`);
            
            // 🛡️ Log Security Breach/Error to Governance Audit
            await GovernanceService.logInstitutionalAction({
                actorId: userId,
                actorRole: userRole,
                actionType: 'UNAUTHORIZED_ACCESS_DENIED',
                entityType: 'ENDPOINT',
                entityId: req.originalUrl,
                payload: { requestedPermission: permission, method: req.method },
                metadata: { description: 'Security Violation: Permission Check Failed' }
            });

            return res.status(403).json({
                error: 'Institutional Access Denied',
                code: 'PERMISSION_REQUIRED',
                required: permission,
                ref: `SEC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
            });
        }

        next();
    };
};

module.exports = {
    requirePermission
};
