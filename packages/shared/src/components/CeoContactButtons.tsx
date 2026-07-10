import React from 'react';
import { Box, Button, Stack, Typography, alpha } from '@mui/material';
import { Mail, MessageCircle, Phone, ShieldAlert } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

export type CeoContactButtonsProps = {
  variant?: 'minimal' | 'full';
  compact?: boolean;
};

export const CeoContactButtons: React.FC<CeoContactButtonsProps> = ({ variant = 'full', compact = false }) => {
  const minimal = compact || variant === 'minimal';
  const size = compact ? 'small' : 'medium';

  const buttons = (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center">
      <Button
        component="a"
        href="https://wa.me/971552423233"
        target="_blank"
        rel="noreferrer"
        size={size}
        variant="outlined"
        startIcon={minimal ? <Phone size={15} /> : <MessageCircle size={17} />}
        sx={{ color: '#25D366', borderColor: alpha('#25D366', 0.55), fontWeight: 900, textTransform: 'none' }}
      >
        WhatsApp CEO Office
      </Button>
      <Button
        component="a"
        href="mailto:Ceo@bin-groups.com"
        size={size}
        variant="outlined"
        startIcon={<Mail size={16} />}
        sx={{ color: binThemeTokens.textPrimary, borderColor: alpha(binThemeTokens.textPrimary, 0.18), fontWeight: 900, textTransform: 'none' }}
      >
        Email CEO Office
      </Button>
    </Stack>
  );

  if (minimal) return buttons;

  return (
    <Box sx={{ p: 3, borderRadius: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
      <ShieldAlert color="#ef4444" size={32} style={{ marginBottom: 12 }} />
      <Typography variant="subtitle2" fontWeight={950} sx={{ color: '#ef4444', mb: 1 }}>
        ESCALATE TO CEO OFFICE
      </Typography>
      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, mb: 3, display: 'block' }}>
        Direct protocol for mission-critical failures or financial disputes.
      </Typography>
      {buttons}
    </Box>
  );
};

export default CeoContactButtons;
