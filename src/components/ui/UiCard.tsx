import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ui, uiType } from '../../theme/uiTokens';

export interface UiCardProps {
  label?: string;
  title?: string;
  children?: ReactNode;
  highlight?: boolean;
  isRTL?: boolean;
  testId?: string;
}

export default function UiCard({ label, title, children, highlight, isRTL, testId }: UiCardProps) {
  return (
    <Box component="section" data-testid={testId} sx={{ bgcolor: ui.card, borderRadius: `${ui.radiusCard}px`, p: 2, boxShadow: ui.shadow, border: highlight ? `2px solid ${ui.gold}` : `1px solid ${ui.line}`, textAlign: isRTL ? 'right' : 'left', minWidth: 0, overflow: 'hidden' }}>
      {label && <Typography sx={{ ...uiType.caption, color: ui.goldText, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>}
      {title && <Typography component="h2" sx={{ ...uiType.title, color: ui.ink, mt: label ? 0.5 : 0 }}>{title}</Typography>}
      {children}
    </Box>
  );
}
