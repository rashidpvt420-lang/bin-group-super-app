import React from 'react';
import { Container, Paper, Stack, Typography, alpha } from '@mui/material';
import { ClipboardCheck } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

const rooms = ['Entrance', 'Living room', 'Bedroom', 'Kitchen', 'Bathroom', 'Balcony', 'AC', 'Electrical', 'Water fixtures'];

export default function TenantMoveInspectionPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,.76)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>DIGITAL INSPECTION</Typography>
          <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>Move-In / Move-Out Inspection</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.56)', mt: 1 }}>Room checklist, meter readings, key handover, photo evidence, and owner/tenant sign-off.</Typography>
        </Paper>
        <Paper sx={{ p: 3, bgcolor: '#020617', border: '1px solid rgba(255,255,255,.08)', borderRadius: 6 }}>
          <Typography sx={{ color: '#fff', fontWeight: 950, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><ClipboardCheck color={binThemeTokens.gold} /> Inspection checklist</Typography>
          {rooms.map((room) => <Typography key={room} sx={{ color: 'rgba(255,255,255,.72)', py: 0.8 }}>□ {room}</Typography>)}
        </Paper>
      </Stack>
    </Container>
  );
}
