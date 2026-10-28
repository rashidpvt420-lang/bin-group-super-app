import React from 'react';
import { Chip, alpha } from '@mui/material';
import { Clock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { computeSlaCountdown, type SlaCountdownState } from '../utils/slaCountdown';

// Text colours that stay >= 4.5:1 on white and on their 12% tint (same palette as the jobs page).
const SLA_COLOR: Record<Exclude<SlaCountdownState, 'none'>, string> = {
  green: '#047857',
  amber: '#92400E',
  red: '#B91C1C',
};

type Props = { job: Record<string, unknown> };

/** Live-ticking SLA chip for an active job card. Shows an honest "no deadline" chip when none is known. */
export default function TechnicianSlaCountdown({ job }: Props) {
  const { tx } = useLanguage();
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const countdown = React.useMemo(() => computeSlaCountdown(job, nowMs), [job, nowMs]);
  const live = countdown.state !== 'none';

  React.useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  if (!live) {
    return (
      <Chip
        data-testid="technician-sla-countdown"
        data-sla-state="none"
        size="small"
        icon={<Clock size={11} />}
        label={tx('tech.sla.none', 'No SLA deadline set')}
        sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: '#F2F4F7', color: '#475467', height: 22, '& .MuiChip-icon': { color: 'inherit' } }}
      />
    );
  }

  const color = SLA_COLOR[countdown.state as Exclude<SlaCountdownState, 'none'>];
  const stateLabel = countdown.state === 'red'
    ? tx('tech.sla.breached', 'SLA breached')
    : countdown.state === 'amber'
      ? tx('tech.sla.at_risk', 'SLA at risk')
      : tx('tech.sla.on_track', 'SLA on track');
  const sourceNote = countdown.source === 'response-window' ? ` (${tx('tech.sla.response_window', '24h response window')})` : '';
  const clock = (countdown.clock || '').replace(/^Overdue/, tx('tech.sla.overdue', 'Overdue'));

  return (
    <Chip
      data-testid="technician-sla-countdown"
      data-sla-state={countdown.state}
      data-sla-source={countdown.source}
      role="timer"
      aria-label={`${stateLabel}: ${clock}${sourceNote}`}
      size="small"
      icon={<Clock size={11} />}
      label={`${stateLabel} · ${clock}`}
      title={`${stateLabel}${sourceNote}`}
      sx={{
        fontSize: '0.65rem',
        fontWeight: 950,
        height: 22,
        bgcolor: alpha(color, 0.12),
        color,
        border: `1px solid ${alpha(color, 0.35)}`,
        fontVariantNumeric: 'tabular-nums',
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  );
}
