// apps/owner-app/src/components/NotificationManager.tsx
import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Paper, Stack, 
    CircularProgress, Alert, alpha 
} from '@mui/material';
import { BellRing, ShieldCheck, Info } from 'lucide-react';
import { 
    app, db, serverTimestamp, 
    getMessaging, isSupported, getToken as getFcmToken 
} from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useRole } from '../context/RoleContext';

export default function NotificationManager() {
    const { user } = useRole();
    const [status, setStatus] = useState<NotificationPermission>(typeof Notification !== 'undefined' ? Notification.permission : 'default');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleEnable = async () => {
        setLoading(true);
        setError(null);
        try {
            const supported = await isSupported();
            if (!supported) throw new Error("FCM not supported on this device/browser.");

            const permission = await Notification.requestPermission();
            setStatus(permission);

            if (permission === 'granted') {
                const messaging = getMessaging(app);
                const token = await getFcmToken(messaging, { 
                    vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ' 
                });

                if (token && user?.uid) {
                    await updateDoc(doc(db, 'users', user.uid), {
                        fcmTokens: arrayUnion(token),
                        notifEnabled: true,
                        updatedAt: serverTimestamp()
                    });
                }
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (status === 'granted') return null;

    return (
        <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#C6A75E', 0.05), border: '1px solid #C6A75E', borderRadius: 4 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center" justifyContent="space-between">
                <Box>
                    <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <BellRing color="#C6A75E" /> ENABLE REAL-TIME ALERTS
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
                        Receive mission critical updates for dispatches, approvals, and status changes instantly.
                    </Typography>
                </Box>
                <Button 
                    variant="contained" 
                    onClick={handleEnable} 
                    disabled={loading}
                    sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 950, px: 4, borderRadius: 2 }}
                >
                    {loading ? <CircularProgress size={20} /> : 'ACTIVATE NOTIFICATIONS'}
                </Button>
            </Stack>
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </Paper>
    );
}
