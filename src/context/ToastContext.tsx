import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Snackbar, Alert } from '@mui/material';

type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

interface ToastContextType {
    showToast: (message: string, severity?: ToastSeverity) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<ToastSeverity>('info');

    const showToast = (msg: string, sev: ToastSeverity = 'info') => {
        setMessage(msg);
        setSeverity(sev);
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <Snackbar
                open={open}
                autoHideDuration={6000}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={handleClose} severity={severity} sx={{ width: '100%', borderRadius: 3 }}>
                    {message}
                </Alert>
            </Snackbar>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
