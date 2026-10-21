import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SafeIcon from '../SafeIcon';
import { ui, uiType } from '../../theme/uiTokens';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  isRTL?: boolean;
}

/** One row in a list card. The chevron stays inside the card (no overflow). */
export default function ListRow({ title, subtitle, trailing, onClick, isRTL }: ListRowProps) {
  return (
    <Box component={onClick ? 'button' : 'div'} type={onClick ? 'button' : undefined} onClick={onClick} sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 1.25, minHeight: ui.touchTarget, py: 1.25, borderTop: `1px solid #F1EDE2`, '&:first-of-type': { borderTop: 0 }, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left', '&:focus-visible': { outline: `3px solid ${ui.gold}` } }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ ...uiType.body, fontWeight: 700, color: ui.ink, overflowWrap: 'anywhere' }}>{title}</Typography>
        {subtitle && <Typography sx={{ ...uiType.small, color: ui.muted, overflowWrap: 'anywhere' }}>{subtitle}</Typography>}
      </Box>
      {trailing}
      {onClick && <Box sx={{ flex: '0 0 20px', color: ui.muted, display: 'flex' }}><SafeIcon icon={isRTL ? ChevronLeft : ChevronRight} size={20} /></Box>}
    </Box>
  );
}
