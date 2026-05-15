import React from 'react';
import { Alert, Box, Chip, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { MapPin, Navigation, UserRound } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { etaMinutes, staleLocationLabel } from '../../utils/eta';

type Props = {
  ticket: any;
  technician?: any;
};

const activeStatuses = new Set(['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS']);
const clean = (value: unknown) => String(value || '').replace(/[\s-]+/g, '_').toUpperCase();

export default function TechnicianArrivalCard({ ticket, technician }: Props) {
  const status = clean(ticket?.status || ticket?.lifecycleStatus || '');
  const isActive = activeStatuses.has(status);
  if (!isActive && !ticket?.assignedTechnicianId && !ticket?.technicianId) return null;

  const techLocation = ticket?.technicianLocation || technician?.lastLocation || technician?.currentLocation;
  const jobLocation = ticket?.location || ticket?.propertyLocation || ticket?.tenantLocation;
  const eta = etaMinutes(techLocation, jobLocation);
  const techName = ticket?.technicianName || technician?.displayName || technician?.name || 'Assigned technician';
  const locationLabel = staleLocationLabel(ticket?.technicianLocationUpdatedAt || technician?.lastSeenAt || technician?.updatedAt);

  return (
    <Paper sx={{ p: 3, borderRadius: 5, bgcolor: 'rgba(15,23,42,0.62)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}><Navigation size={20} /></Box>
            <Box>
              <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>Technician Arrival</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 800 }}>{locationLabel}</Typography>
            </Box>
          </Stack>
          <Chip label={status.replaceAll('_', ' ') || 'PENDING'} sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 950 }} />
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <UserRound size={16} color={binThemeTokens.gold} />
          <Typography sx={{ color: '#FFF', fontWeight: 850 }}>{techName}</Typography>
        </Stack>

        {eta ? (
          <Alert severity="success" sx={{ bgcolor: alpha('#10b981', 0.08), color: '#f8fafc', border: `1px solid ${alpha('#10b981', 0.22)}` }}>
            Estimated arrival: approximately {eta} minutes.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: '#f8fafc', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
            Technician has been assigned. Live ETA appears once route tracking starts.
          </Alert>
        )}

        <LinearProgress variant="determinate" value={status === 'ARRIVED' || status === 'IN_PROGRESS' ? 85 : status === 'ON_THE_WAY' ? 60 : status === 'ACCEPTED' ? 35 : 15} sx={{ height: 8, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />

        <Stack direction="row" spacing={1} alignItems="center">
          <MapPin size={14} color="rgba(255,255,255,0.45)" />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>
            Live map requires technician route tracking to be active on the technician device.
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}
