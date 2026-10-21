import { Box, Typography } from '@mui/material';
import { ui, uiType } from '../../theme/uiTokens';

export interface StatTileProps {
  label: string;
  /** null = not available yet (shows the placeholder, never a fake 0). */
  value: string | number | null;
  placeholder?: string;
  onClick?: () => void;
  isRTL?: boolean;
}

export default function StatTile({ label, value, placeholder = '—', onClick, isRTL }: StatTileProps) {
  const empty = value === null || value === undefined;
  return (
    <Box component={onClick ? 'button' : 'div'} type={onClick ? 'button' : undefined} onClick={onClick} sx={{ all: 'unset', boxSizing: 'border-box', cursor: onClick ? 'pointer' : 'default', bgcolor: ui.card, borderRadius: '16px', p: 1.75, border: `1px solid ${ui.line}`, minHeight: 84, minWidth: 0, display: 'block', textAlign: isRTL ? 'right' : 'left', '&:focus-visible': { outline: `3px solid ${ui.gold}` } }}>
      <Typography sx={{ ...uiType.stat, color: empty ? ui.muted : ui.ink, overflowWrap: 'anywhere' }}>{empty ? placeholder : value}</Typography>
      <Typography sx={{ ...uiType.small, color: ui.muted }}>{label}</Typography>
    </Box>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.25 }}>{children}</Box>;
}
