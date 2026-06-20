import React from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, Stack, Typography } from '@mui/material';
import { Building2, Camera, CheckCircle2, FileText, MapPin, ShieldCheck, Smartphone, Users, Wrench } from 'lucide-react';
import SafeIcon from '../../components/SafeIcon';

const roles = [
  { title: 'Owner', detail: 'Portfolio dashboard, contracts, invoices, property passport, tenant visibility, reports.' },
  { title: 'Tenant', detail: 'Maintenance request, evidence upload, emergency flow, ticket tracking, documents.' },
  { title: 'Technician', detail: 'Assigned jobs, arrival flow, location-aware status, before/after evidence, completion notes.' },
  { title: 'Broker', detail: 'Lead submission, referrals, commissions, documents, partner workflow.' },
  { title: 'Admin', detail: 'Dedicated admin panel for approvals, dispatch, contracts, technicians, payments, and audit.' },
];

const permissionCards = [
  { icon: Camera, title: 'Camera and Photos', text: 'Used for maintenance evidence, before/after photos, property inspections, and document images.' },
  { icon: MapPin, title: 'Location', text: 'Used for technician navigation, arrival confirmation, dispatch visibility, and service tracking.' },
  { icon: Smartphone, title: 'Notifications', text: 'Used for ticket updates, service alerts, owner approvals, technician dispatch, and tenant status changes.' },
  { icon: FileText, title: 'Files', text: 'Used for contracts, invoices, certificates, reports, and property evidence records.' },
];

export default function AppReviewDemoPage() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: '#111827', py: { xs: 4, md: 8 } }}>
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Box sx={{ textAlign: 'center' }}>
            <Chip label="APP REVIEW DEMO" sx={{ bgcolor: '#C9A646', color: '#111827', fontWeight: 950, mb: 2 }} />
            <Typography variant="h2" sx={{ fontWeight: 950, letterSpacing: -2, mb: 2 }}>
              BIN GROUP Mobile Review Center
            </Typography>
            <Typography variant="h6" sx={{ color: '#667085', maxWidth: 820, mx: 'auto', lineHeight: 1.7 }}>
              This page explains the app purpose, role-based access, native permission usage, support links,
              and review workflow for TestFlight and Google Play internal testing.
            </Typography>
          </Box>

          <Card sx={{ borderRadius: 4, border: '1px solid #E5E7EB', boxShadow: '0 20px 60px rgba(17,24,39,0.06)' }}>
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
                <Box sx={{ p: 2, bgcolor: '#F8F9FB', borderRadius: 4 }}>
                  <SafeIcon icon={Building2} size={52} color="#C9A646" />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h4" fontWeight="950" sx={{ mb: 1 }}>Property Asset Reliability OS</Typography>
                  <Typography sx={{ color: '#667085', lineHeight: 1.8 }}>
                    BIN GROUP is designed for UAE property maintenance, asset reliability, tenant service requests,
                    technician field operations, broker referrals, owner reporting, verified evidence, contracts, and recurring service packages.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip icon={<CheckCircle2 size={16} />} label="5 Roles" />
                  <Chip icon={<ShieldCheck size={16} />} label="Verified Evidence" />
                  <Chip icon={<Wrench size={16} />} label="Maintenance SLA" />
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Grid container spacing={2}>
            {roles.map((role) => (
              <Grid item xs={12} md={6} lg={4} key={role.title}>
                <Card sx={{ height: '100%', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                      <SafeIcon icon={Users} size={22} color="#C9A646" />
                      <Typography variant="h6" fontWeight="950">{role.title}</Typography>
                    </Stack>
                    <Typography sx={{ color: '#667085', lineHeight: 1.7 }}>{role.detail}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Box>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 2 }}>Native permission usage</Typography>
            <Grid container spacing={2}>
              {permissionCards.map((item) => (
                <Grid item xs={12} md={6} key={item.title}>
                  <Card sx={{ height: '100%', borderRadius: 4, border: '1px solid #E5E7EB' }}>
                    <CardContent>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <SafeIcon icon={item.icon} size={22} color="#C9A646" />
                        <Typography variant="h6" fontWeight="950">{item.title}</Typography>
                      </Stack>
                      <Typography sx={{ color: '#667085', lineHeight: 1.7 }}>{item.text}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>

          <Card sx={{ borderRadius: 4, bgcolor: '#111827', color: '#FFFFFF' }}>
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Typography variant="h4" fontWeight="950" sx={{ mb: 2 }}>Reviewer notes</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.72)', lineHeight: 1.8, mb: 3 }}>
                Store reviewers should use the private review notes supplied in the store console. Production data is protected by role-based Firebase access rules.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button variant="contained" href="/login" sx={{ bgcolor: '#C9A646', color: '#111827', fontWeight: 950 }}>
                  Open Login
                </Button>
                <Button variant="outlined" href="/privacy" sx={{ borderColor: '#C9A646', color: '#C9A646', fontWeight: 950 }}>
                  Privacy Policy
                </Button>
                <Button variant="outlined" href="/support" sx={{ borderColor: '#C9A646', color: '#C9A646', fontWeight: 950 }}>
                  Support URL
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
