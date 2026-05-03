import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UnifiedLogin from '../../components/UnifiedLogin';
import { useAuth } from '../../context/AuthContext';

const LoginPage = () => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    return <UnifiedLogin />;
};

export default LoginPage;
