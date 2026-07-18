import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { BellRing } from 'lucide-react';
import { functions, getMessaging, getToken as getFcmToken, httpsCallable, isSupported, app } from '../lib/firebase';
import { useRole } from '../context/RoleContext';

const vapidKey = () => {
  // @ts-ignore Vite runtime environment.
  return String(import.meta.env?.VITE_FIREBASE_VAPID_KEY || '').trim();
};

const platform = () => {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  return {
    value: isIOS ? (isStandalone ? 'ios-pwa' : 'ios-browser') : isAndroid ? 'android-web' : 'web',
    isStandalone,
  };
};

export default function NotificationManager() {
  const { user } = useRole();
  const [status, setStatus] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async () => {
    if (!user?.uid) {
      setError('Sign in before enabling notifications.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supported = await isSupported();
      if (!supported || !('serviceWorker' in navigator)) throw new Error('FCM is not supported on this device/browser.');
      const permission = await Notification.requestPermission();
      setStatus(permission);
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const key = vapidKey();
      if (!key) throw new Error('Push notification configuration is unavailable.');
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getFcmToken(getMessaging(app), { vapidKey: key, serviceWorkerRegistration: registration });
      if (!token) throw new Error('Firebase did not issue a registration token.');
      const device = platform();
      if (device.value === 'ios-browser') throw new Error('Install the iOS PWA before enabling push notifications.');
      const registerToken = httpsCallable(functions, 'registerPushToken');
      const response = await registerToken({
        token,
        platform: device.value,
        permission,
        isStandalone: device.isStandalone,
      });
      const data = response.data as { enabled?: boolean };
      if (data.enabled !== true) throw new Error('Server-authorized push registration failed.');
      setStatus('granted');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Push notification registration failed.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'granted') return null;

  return (
    <Paper data-testid="owner-push-notification-manager" sx={{ p: 4, mb: 4, bgcolor: alpha('#C6A75E', 0.05), border: '1px solid #C6A75E', borderRadius: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <BellRing color="#C6A75E" /> ENABLE REAL-TIME ALERTS
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
            Receive mission-critical updates through authenticated, server-authorized push delivery.
          </Typography>
        </Box>
        <Button
          data-testid="owner-enable-push-notifications"
          variant="contained"
          onClick={handleEnable}
          disabled={loading || !user?.uid}
          sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 950, px: 4, borderRadius: 2 }}
        >
          {loading ? <CircularProgress size={20} /> : 'ACTIVATE NOTIFICATIONS'}
        </Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Paper>
  );
}
