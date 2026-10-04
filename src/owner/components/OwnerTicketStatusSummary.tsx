/**
 * Owner-facing ticket status: plain-language stage (Pending / Assigned / In progress / Solved),
 * who is assigned, and completion evidence counts. Colours are chosen for the white owner shell
 * (the previous chips used white text, which the white-platinum shell made invisible).
 */
import { Chip, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, Clock, UserCheck, AlertCircle } from 'lucide-react';
import { ticketLifecycleStage, type TicketLifecycleStage } from '../../utils/ticketLifecycleStage';

export const OWNER_STAGE_COLORS: Record<TicketLifecycleStage['tone'], string> = {
  error: '#B91C1C',
  warning: '#B45309',
  info: '#1D4ED8',
  success: '#047857',
  default: '#475569',
};

type Translate = (key: string, fallback: string) => string;
const passthrough: Translate = (_key, fallback) => fallback;

const STAGE_KEYS: Record<string, string> = {
  'Pending assignment': 'owner.ticketStage.pending',
  'Pending – needs manual dispatch': 'owner.ticketStage.pendingManual',
  Assigned: 'owner.ticketStage.assigned',
  'In progress': 'owner.ticketStage.inProgress',
  'Completed – awaiting approval': 'owner.ticketStage.awaitingApproval',
  Solved: 'owner.ticketStage.solved',
  Cancelled: 'owner.ticketStage.cancelled',
};

export function ownerStageLabel(ticket: Record<string, any>, tx: Translate = passthrough): string {
  const stage = ticketLifecycleStage(ticket);
  // Owners see that operations is handling it; the internal dispatch reason stays in Admin.
  const label = stage.needsManualDispatch ? 'Pending – BIN GROUP is arranging a technician' : stage.label;
  return tx(STAGE_KEYS[stage.label] || 'owner.ticketStage.other', label);
}

function photoCount(value: unknown): number {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function formatDate(value: any): string {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
}

export function OwnerTicketStageChip({ ticket, tx = passthrough }: { ticket: Record<string, any>; tx?: Translate }) {
  const stage = ticketLifecycleStage(ticket);
  const color = OWNER_STAGE_COLORS[stage.tone];
  const Icon = stage.stage === 'SOLVED' ? CheckCircle2 : stage.stage === 'PENDING' ? (stage.needsManualDispatch ? AlertCircle : Clock) : UserCheck;
  return (
    <Chip
      data-testid="owner-ticket-stage"
      icon={<Icon size={13} />}
      label={ownerStageLabel(ticket, tx)}
      size="small"
      sx={{
        bgcolor: alpha(color, 0.1),
        color,
        fontWeight: 900,
        fontSize: '0.7rem',
        height: 24,
        border: `1px solid ${alpha(color, 0.3)}`,
        '& .MuiChip-icon': { color },
      }}
    />
  );
}

export function OwnerTicketAssignmentLine({ ticket, tx = passthrough }: { ticket: Record<string, any>; tx?: Translate }) {
  const stage = ticketLifecycleStage(ticket);
  const technician = String(ticket.assignedTechnicianName || '').trim();
  const before = photoCount(ticket.photos);
  const after = photoCount(ticket.afterPhotos) + photoCount(ticket.completionPhotos);
  const completedAt = formatDate(ticket.completedAt);
  return (
    <Stack spacing={0.25} sx={{ mt: 1 }} data-testid="owner-ticket-assignment">
      <Typography variant="caption" sx={{ color: stage.assigned ? '#1F2937' : OWNER_STAGE_COLORS.error, fontWeight: 800 }}>
        {stage.assigned
          ? `${tx('owner.ticketStage.technician', 'Technician')}: ${technician || tx('owner.ticketStage.technicianAssigned', 'Assigned')}`
          : stage.stage === 'CANCELLED'
            ? tx('owner.ticketStage.noTechnician', 'No technician')
            : tx('owner.ticketStage.awaitingTechnician', 'Awaiting technician assignment')}
      </Typography>
      {(stage.stage === 'SOLVED' || stage.stage === 'AWAITING_APPROVAL') && (
        <Typography variant="caption" sx={{ color: OWNER_STAGE_COLORS.success, fontWeight: 800 }}>
          {tx('owner.ticketStage.completed', 'Completed')}{completedAt ? ` ${completedAt}` : ''}
        </Typography>
      )}
      {(before > 0 || after > 0) && (
        <Typography variant="caption" sx={{ color: '#475569', fontWeight: 700 }}>
          {`${tx('owner.ticketStage.photos', 'Photos')}: ${before} ${tx('owner.ticketStage.before', 'before')} · ${after} ${tx('owner.ticketStage.after', 'after')}`}
        </Typography>
      )}
    </Stack>
  );
}
