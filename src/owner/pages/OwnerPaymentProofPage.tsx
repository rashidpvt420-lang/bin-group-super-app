import React from 'react';
import { Box, Typography } from '@mui/material';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import OwnerPaymentProofReviewPanel from '../components/OwnerPaymentProofReviewPanel';

export default function OwnerPaymentProofPage() {
  const { isRTL } = useLanguage();
  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
        OWNER PAYMENT PROOF
      </Typography>
      <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, mt: 1, mb: 1 }}>
        Proof Review Center
      </Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.55)', mb: 4, fontWeight: 700 }}>
        Review submitted payment evidence, payer, property/contract link, amount, verification status, and uploaded proof file.
      </Typography>
      <OwnerPaymentProofReviewPanel />
    </Box>
  );
}
