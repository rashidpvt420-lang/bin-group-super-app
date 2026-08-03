import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import UnifiedLogin from '../../components/UnifiedLogin';
import AdminAppCheckGate from '../../components/security/AdminAppCheckGate';
import { useAuth } from '../../context/AuthContext';
import { adminReturnToFromSearch } from '../../lib/adminAuthRedirect';

const LoginPage = () => {
    const { isAuthenticated, status } = useAuth();
    const { search } = useLocation();

    // An already-authorized Firebase session must leave /login before the
    // credential/App Check gate mounts. This prevents a restored session from
    // being trapped in a second login or MFA loop while preserving the same
    // sanitized same-origin returnTo policy used after fresh MFA resolution.
    if (isAuthenticated && status === 'authorized') {
        return <Navigate to={adminReturnToFromSearch(search)} replace />;
    }

    return (
        <AdminAppCheckGate>
            <UnifiedLogin />
        </AdminAppCheckGate>
    );
};

export default LoginPage;
