import { Box } from '@mui/material';
import { toneColors, type UiTone } from '../../theme/uiTokens';

export default function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: UiTone }) {
  const c = toneColors[tone];
  return <Box component="span" sx={{ display: 'inline-block', fontSize: 13, fontWeight: 700, px: 1.25, py: 0.5, borderRadius: 99, bgcolor: c.bg, color: c.fg, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</Box>;
}
