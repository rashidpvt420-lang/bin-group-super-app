import React from 'react';
import { Box, Typography } from '@mui/material';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import OwnerPaymentProofReviewPanel from '../components/OwnerPaymentProofReviewPanel';
import Bi from '../../components/Bi';

export default function OwnerPaymentProofPage() {
  const { isRTL } = useLanguage();
  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="overline" sx={{ color: binThemeTokens.goldText, fontWeight: 950, letterSpacing: 3 }}>
        OWNER PAYMENT PROOF
      </Typography>
      <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 1, mb: 1 }}>
        <Bi en={"Proof Review Center"} ar={"مركز مراجعة الإثباتات"} />
      </Typography>
      <Typography sx={{ color: binThemeTokens.textSecondary, mb: 4, fontWeight: 700 }}>
        <Bi en={"Review submitted payment evidence, payer, property/contract link, amount, verification status, and uploaded proof file."} ar={"راجع إثباتات الدفع المرسلة والدافع والعقار/العقد والمبلغ وحالة التحقق والملف المرفوع."} />
      </Typography>
      <OwnerPaymentProofReviewPanel />
    </Box>
  );
}
