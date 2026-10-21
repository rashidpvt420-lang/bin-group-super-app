import { Box, Button, Typography } from '@mui/material';
import { ui, uiType } from '../../theme/uiTokens';

export function EmptyState({ title, detail, isRTL }: { title: string; detail?: string; isRTL?: boolean }) {
  return (
    <Box sx={{ py: 2, textAlign: isRTL ? 'right' : 'left' }}>
      <Typography sx={{ ...uiType.body, fontWeight: 700, color: ui.ink }}>{title}</Typography>
      {detail && <Typography sx={{ ...uiType.small, color: ui.muted }}>{detail}</Typography>}
    </Box>
  );
}

/** Shown when live data fails to load. Never replace an error with a fake 0. */
export function ErrorState({ title, onRetry, retryLabel = 'Try again', isRTL }: { title: string; onRetry?: () => void; retryLabel?: string; isRTL?: boolean }) {
  return (
    <Box role="alert" sx={{ py: 1.5, px: 1.5, borderRadius: '12px', bgcolor: ui.badBg, color: ui.badText, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
      <Typography sx={{ ...uiType.small, fontWeight: 700, color: ui.badText }}>{title}</Typography>
      {onRetry && <Button onClick={onRetry} sx={{ minHeight: 40, color: ui.badText, fontWeight: 800 }}>{retryLabel}</Button>}
    </Box>
  );
}

/** Feature not live yet: say so plainly instead of showing invented numbers. */
export function ComingSoon({ title, detail, isRTL }: { title: string; detail?: string; isRTL?: boolean }) {
  return (
    <Box data-placeholder="true" sx={{ py: 1.5, px: 1.5, borderRadius: '12px', border: `1px dashed ${ui.line}`, bgcolor: ui.cream, textAlign: isRTL ? 'right' : 'left' }}>
      <Typography sx={{ ...uiType.small, fontWeight: 700, color: ui.ink }}>{title}</Typography>
      {detail && <Typography sx={{ ...uiType.small, color: ui.muted }}>{detail}</Typography>}
    </Box>
  );
}
