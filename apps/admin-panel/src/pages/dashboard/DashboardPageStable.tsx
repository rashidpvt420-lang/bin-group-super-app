import React from 'react';
import { Box, Button, Grid, Paper, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function DashboardPageStable() {
  const navigate = useNavigate();

  return (
    <AdminPageFrame
      title="Executive Command Center"
      subtitle="Production-safe dashboard fallback"
      lastUpdated={new Date()}
      onRefresh={() => window.location.reload()}
    >
      <Stack spacing={3} sx={{ pb: 8 }}>
        <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 1 }}>
            Admin Dashboard Recovery Mode
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>
            The dashboard is running a stable shell while the full command dashboard is rebuilt module by module.
          </Typography>
        </Paper>

        <Grid container spacing={2}>
          <QuickCard title="Properties" action="Open passports" onClick={() => navigate('/properties/passport')} />
          <QuickCard title="Tickets" action="Open missions" onClick={() => navigate('/tickets')} />
          <QuickCard title="Payments" action="Verify payments" onClick={() => navigate('/admin/payments')} />
          <QuickCard title="Contracts" action="Review controls" onClick={() => navigate('/contracts/termination')} />
          <QuickCard title="Property Review" action="Open review" onClick={() => navigate('/properties/approvals')} />
          <QuickCard title="Reports" action="Open reports" onClick={() => navigate('/reports')} />
        </Grid>
      </Stack>
    </AdminPageFrame>
  );
}

function QuickCard({ title, action, onClick }: { title: string; action: string; onClick: () => void }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Paper sx={{ p: 2.5, bgcolor: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
        <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>{title}</Typography>
        <Box sx={{ mt: 1 }}>
          <Button variant="outlined" onClick={onClick}>{action}</Button>
        </Box>
      </Paper>
    </Grid>
  );
}
