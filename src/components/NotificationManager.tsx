import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { BellRing } from 'lucide-react';
import { useRole } from '../context/RoleContext';
import { registerPushNotifications } from '../services/pushNotificationService';

export default function NotificationManager() {
  const { user, role } = useRole();
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
      const result = await registerPushNotifications(user.uid, role);
      if (!result.enabled) throw new Error(result.reason || 'Push notification registration failed.');
      setStatus('granted');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Push notification registration failed.');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'granted') return null;

  return (
    <Paper data-testid="push-notification-manager" sx={{ p: 4, mb: 4, bgcolor: alpha('#C6A75E', 0.05), border: '1px solid #C6A75E', borderRadius: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <BellRing color="#C6A75E" /> ENABLE REAL-TIME ALERTS
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
            Receive mission-critical dispatch, approval, and status updates through server-authorized push delivery.
          </Typography>
        </Box>
        <Button
          data-testid="enable-push-notifications"
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
