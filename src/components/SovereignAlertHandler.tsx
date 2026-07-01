import React, { useEffect, useState } from 'react';
import { Snackbar, Alert, Typography } from '@mui/material';
import { ShieldAlert } from 'lucide-react';

export type SovereignSeverity = 'success' | 'error' | 'warning' | 'info';

export const showSovereignToast = (message: string, severity: SovereignSeverity = 'error') => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sovereign_alert', { detail: { message, severity } }));
    }
};

export const setupSovereignAlertInterceptor = () => {
    if (typeof window !== 'undefined') {
        window.alert = (message?: any) => {
            showSovereignToast(String(message), 'info');
        };
    }
};

export const SovereignAlertHandler: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<SovereignSeverity>('error');

    useEffect(() => {
        const handleAlert = (e: Event) => {
            const customEvent = e as CustomEvent;
            const detail = customEvent.detail;
            if (typeof detail === 'object' && detail !== null && 'message' in detail) {
                setMessage(String(detail.message || ''));
                setSeverity(detail.severity || 'error');
            } else {
                setMessage(String(detail || ''));
                setSeverity('error');
            }
            setOpen(true);
        };

        window.addEventListener('sovereign_alert', handleAlert);
        return () => window.removeEventListener('sovereign_alert', handleAlert);
    }, []);

    const handleClose = () => setOpen(false);

    return (
        <Snackbar 
            open={open} 
            autoHideDuration={6000} 
            onClose={handleClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            sx={{ zIndex: 9999 }}
        >
            <Alert 
                icon={<ShieldAlert size={20} />}
                onClose={handleClose} 
                severity={severity} 
                variant="filled"
                sx={{ 
                    bgcolor: '#0B0B0C',
                    color: '#FFF', 
                    borderRadius: 3,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                }}
            >
                <Typography variant="body2" fontWeight={700}>
                    {message}
                </Typography>
            </Alert>
        </Snackbar>
    );
};
