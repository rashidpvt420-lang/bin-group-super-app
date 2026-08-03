import React from 'react';
import UnifiedLogin from '../../components/UnifiedLogin';
import AdminAppCheckGate from '../../components/security/AdminAppCheckGate';

const LoginPage = () => (
    <AdminAppCheckGate>
        <UnifiedLogin />
    </AdminAppCheckGate>
);

export default LoginPage;
