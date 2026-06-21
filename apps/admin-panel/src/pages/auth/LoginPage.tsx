import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UnifiedLogin from '../../components/UnifiedLogin';
import { useAuth } from '../../context/AuthContext';
import BrandWatermark from '../../components/BrandWatermark';

const LoginPage = () => {
    const { isAuthenticated } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    return (
        <>
            <BrandWatermark opacity={0.035} />
            <UnifiedLogin />
        </>
    );
};

export default LoginPage;
