import { Box, Typography } from '@mui/material';
import { Check } from 'lucide-react';
import SafeIcon from '../../components/SafeIcon';
import { ui, uiType } from '../../theme/uiTokens';

export interface EvidenceStep { key: string; label: string; done: boolean }

/**
 * Redesign R3: the job's proof rules shown as steps inside the job (they used to be text cards on the home).
 * Display only: the close gate in TechnicianJobDetailPage (closeBlockers) and server rules stay authoritative.
 */
export default function JobEvidenceSteps({ steps, title, isRTL }: { steps: EvidenceStep[]; title: string; isRTL?: boolean }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <Box component="section" data-testid="technician-job-evidence-steps" sx={{ bgcolor: ui.card, border: `1px solid ${ui.line}`, borderRadius: `${ui.radiusCard}px`, p: 2, mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
      <Typography sx={{ ...uiType.caption, color: ui.goldText, textTransform: 'uppercase' }}>{title}</Typography>
      <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 0.75 }}>
        {steps.map((s, i) => (
          <Box component="li" key={s.key} data-done={s.done ? 'true' : 'false'} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexDirection: isRTL ? 'row-reverse' : 'row', minHeight: 36 }}>
            <Box aria-hidden sx={{ width: 28, height: 28, flex: '0 0 28px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, bgcolor: s.done ? ui.okBg : i === current ? ui.gold : '#F1EDE2', color: s.done ? ui.okText : ui.ink }}>
              {s.done ? <SafeIcon icon={Check} size={16} /> : i + 1}
            </Box>
            <Typography sx={{ ...uiType.body, fontWeight: i === current ? 800 : 500, color: s.done ? ui.muted : ui.ink }}>{s.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
