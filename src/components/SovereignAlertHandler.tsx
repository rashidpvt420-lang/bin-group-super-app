import React, { useEffect, useState } from 'react';
import { Snackbar, Alert, Box, IconButton, Typography } from '@mui/material';
import { X, ShieldAlert } from 'lucide-react';

export const setupSovereignAlertInterceptor = () => {
    if (typeof window !== 'undefined') {
        window.alert = (message?: any) => {
            const event = new CustomEvent('sovereign_alert', { detail: message });
            window.dispatchEvent(event);
        };
    }
};

export const SovereignAlertHandler: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const handleAlert = (e: Event) => {
            const customEvent = e as CustomEvent;
            setMessage(String(customEvent.detail || ''));
            setOpen(true);
        };

        window.addEventListener('sovereign_alert', handleAlert);
        return () => window.removeEventListener('sovereign_alert', handleAlert);
    }, []);

    const handleClose = () => {
        setOpen(false);
    };

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
                severity="error" 
                variant="filled"
                sx={{ 
                    bgcolor: '#0B0B0C',
                    color: '#FFF', 
                    border: '1px solid #ef4444', 
                    borderRadius: 3,
                    boxShadow: '0 8px 32px rgba(239, 68, 68, 0.2)',
                    '& .MuiAlert-icon': { color: '#ef4444' }
                }}
            >
                <Typography variant="body2" fontWeight={700}>
                    {message}
                </Typography>
            </Alert>
        </Snackbar>
    );
};
