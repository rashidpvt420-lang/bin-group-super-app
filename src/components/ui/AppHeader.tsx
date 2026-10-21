import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ui, uiType } from '../../theme/uiTokens';

export interface AppHeaderProps {
  eyebrow?: string;
  title: string;
  initials?: string;
  isRTL?: boolean;
  action?: ReactNode;
}

/** Dark brand header for role home screens. Plain words only: no internal names. */
export default function AppHeader({ eyebrow, title, initials, isRTL, action }: AppHeaderProps) {
  return (
    <Box component="header" sx={{ bgcolor: ui.ink, color: '#FFFFFF', px: 2.5, pt: 2, pb: 2.5, borderRadius: { xs: 0, md: `${ui.radiusCard}px` }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <Typography sx={{ ...uiType.small, color: ui.goldOnInk }}>{eyebrow}</Typography>}
        <Typography component="h1" sx={{ ...uiType.heading, color: '#FFFFFF', overflowWrap: 'anywhere' }}>{title}</Typography>
      </Box>
      {action ?? (initials ? (
        <Box aria-hidden sx={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: '50%', bgcolor: ui.gold, color: ui.ink, display: 'grid', placeItems: 'center', fontWeight: 800 }}>{initials.slice(0, 2).toUpperCase()}</Box>
      ) : null)}
    </Box>
  );
}
