import { Button, type ButtonProps } from '@mui/material';
import { ui } from '../../theme/uiTokens';

type Variant = 'primary' | 'dark' | 'outline';
const styles: Record<Variant, object> = {
  primary: { bgcolor: ui.gold, color: ui.ink, '&:hover': { bgcolor: ui.goldHover } },
  dark: { bgcolor: ui.ink, color: '#FFFFFF', '&:hover': { bgcolor: '#1F2937' } },
  outline: { bgcolor: ui.card, color: ui.goldText, border: `1.5px solid ${ui.gold}` },
};

export default function UiButton({ tone = 'primary', sx, ...rest }: Omit<ButtonProps, 'variant'> & { tone?: Variant }) {
  return <Button disableElevation {...rest} sx={{ minHeight: ui.touchTarget, flex: 1, borderRadius: `${ui.radiusButton}px`, fontSize: 16, fontWeight: 800, textTransform: 'none', ...styles[tone], ...(sx as object) }} />;
}
