import React from 'react';
import { Alert, Box, Button, Stack, Typography, alpha } from '@mui/material';
import { ShieldAlert } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';

type LaunchStatusBannerProps = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function LaunchStatusBanner({
  title = 'Setup-protected launch module',
  message = 'This page is visible for admin readiness, but live actions are locked until the backend workflow, permissions and production data are connected.',
  actionLabel,
  onAction,
}: LaunchStatusBannerProps) {
  return (
    <Alert
      icon={<ShieldAlert size={22} />}
      sx={{
        mb: 3,
        borderRadius: 4,
        bgcolor: '#FFF9E8',
        border: '1px solid rgba(184,147,47,0.28)',
        color: '#111827',
        '& .MuiAlert-icon': { color: binThemeTokens.gold || '#B8932F' },
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 950, color: '#111827' }}>{title}</Typography>
          <Typography variant="body2" sx={{ color: '#667085' }}>{message}</Typography>
        </Box>
        {actionLabel && onAction && (
          <Button size="small" variant="outlined" onClick={onAction} sx={{ borderColor: binThemeTokens.gold || '#B8932F', color: binThemeTokens.gold || '#B8932F', fontWeight: 900, whiteSpace: 'nowrap' }}>
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
