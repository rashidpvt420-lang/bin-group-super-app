import { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileText,
  Home,
  MapPin,
  Paintbrush,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import RoleJourneyStrip from '../../components/RoleJourneyStrip';

const CLOSED_STATUSES = new Set(['CLOSED', 'COMPLETED', 'CANCELLED', 'CANCELED']);

const surfaceSx = {
  bgcolor: binThemeTokens.card,
  border: `1px solid ${binThemeTokens.border}`,
  borderRadius: 5,
  boxShadow: binThemeTokens.cardShadow,
} as const;

const innerCardSx = {
  bgcolor: binThemeTokens.softCanvas,
  border: `1px solid ${binThemeTokens.border}`,
  borderRadius: 4,
} as const;

export default function TenantDashboardLightPage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTickets, setActiveTickets] = useState<any[]>([]);
  const [ticketWarning, setTicketWarning] = useState('');

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const buckets: Record<string, any[]> = {};
    const publish = () => {
      const deduped = new Map<string, any>();
      Object.values(buckets).flat().forEach((ticket) => {
        const status = String(ticket?.status || '').toUpperCase();
        if (ticket?.id && !CLOSED_STATUSES.has(status)) deduped.set(ticket.id, ticket);
      });
      setActiveTickets(Array.from(deduped.values()).slice(0, 4));
      setLoading(false);
    };

    const sources = [
      { key: 'tenantId', value: user.uid },
      { key: 'createdBy', value: user.uid },
    ];

    const unsubscribers = sources.map((source) => {
      const ticketQuery = query(
        collection(db, 'maintenanceTickets'),
        where(source.key, '==', source.value),
        limit(12),
      );

      return onSnapshot(
        ticketQuery,
        (snapshot) => {
          buckets[source.key] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          publish();
        },
        (error) => {
          console.warn(`[TenantDashboardLight] ${source.key} ticket read failed:`, error);
          setTicketWarning(tx('dash.ticketReadWarning', 'Some ticket records could not load. Please refresh or contact BIN GROUP Operations.'));
          setLoading(false);
        },
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [user?.uid, tx]);

  const primaryActions = useMemo(() => [
    {
      title: tx('dash.newRequestBtn', 'Report Issue'),
      description: tx('tenant.light.reportDesc', 'Create a photo-backed maintenance request without making a call.'),
      icon: <Wrench size={25} />,
      route: '/tenant/request',
      tone: 'gold',
    },
    {
      title: tx('dash.active_tickets', 'Track Requests'),
      description: tx('tenant.light.trackDesc', 'See status, technician assignment, ETA, proof and dispute options.'),
      icon: <Activity size={25} />,
      route: '/tenant/tickets',
      tone: 'gold',
    },
    {
      title: tx('dash.emergency_dispatch', 'Emergency Help'),
      description: tx('tenant.light.emergencyDesc', 'Open the priority emergency route for urgent safety issues.'),
      icon: <AlertTriangle size={25} />,
      route: '/tenant/emergency',
      tone: 'danger',
    },
    {
      title: tx('dash.paymentsDocsReceipts', 'Payments & Documents'),
      description: tx('tenant.light.documentsDesc', 'Open receipts, payment records and your secure document vault.'),
      icon: <CreditCard size={25} />,
      route: '/tenant/payments',
      tone: 'gold',
    },
  ], [tx]);

  const quickServices = useMemo(() => [
    { label: tx('service.aiConcierge', 'BIN AI Concierge'), icon: <Sparkles size={21} />, route: '/tenant/ai-concierge' },
    { label: tx('nav.ai_studio', 'AI Design Studio'), icon: <Paintbrush size={21} />, route: '/tenant/design-studio' },
    { label: tx('dash.residency_details', 'Residency Details'), icon: <Home size={21} />, route: '/tenant/unit' },
    { label: tx('dash.open_vault', 'Document Vault'), icon: <FileText size={21} />, route: '/tenant/documents' },
  ], [tx]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.goldHover }} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 7, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Stack
          direction={isRTL ? 'row-reverse' : 'row'}
          justifyContent="space-between"
          alignItems="center"
          spacing={2}
        >
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>
              {tx('dash.terminal.tenant', 'TENANT DASHBOARD')}
            </Typography>
            <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 0.75 }}>
              {tx('dash.hello', 'Hello')}, {user?.displayName?.split(' ')[0] || tx('dash.resident', 'Resident')}
            </Typography>
            <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 720, lineHeight: 1.7 }}>
              {tx('tenant.light.dashboardDesc', 'Everything important is shown in a clear, no-call workspace: report, track, verify, pay and access documents.')}
            </Typography>
          </Box>
          <Avatar
            sx={{
              width: 64,
              height: 64,
              bgcolor: alpha(binThemeTokens.gold, 0.14),
              color: binThemeTokens.goldHover,
              border: `1px solid ${alpha(binThemeTokens.gold, 0.38)}`,
              fontWeight: 950,
            }}
          >
            {user?.displayName?.charAt(0) || 'R'}
          </Avatar>
        </Stack>

        <RoleJourneyStrip role="tenant" />

        {ticketWarning && <Alert severity="warning" sx={{ borderRadius: 3 }}>{ticketWarning}</Alert>}

        <Grid container spacing={2.5}>
          {primaryActions.map((action) => {
            const danger = action.tone === 'danger';
            const accent = danger ? binThemeTokens.danger : binThemeTokens.goldHover;
            return (
              <Grid item xs={12} sm={6} key={action.title}>
                <Button
                  fullWidth
                  onClick={() => navigate(action.route)}
                  sx={{
                    ...surfaceSx,
                    minHeight: 156,
                    p: 3,
                    justifyContent: 'flex-start',
                    alignItems: 'flex-start',
                    textAlign: isRTL ? 'right' : 'left',
                    color: binThemeTokens.textPrimary,
                    '&:hover': {
                      bgcolor: danger ? alpha(binThemeTokens.danger, 0.045) : alpha(binThemeTokens.gold, 0.07),
                      borderColor: alpha(accent, 0.5),
                      boxShadow: binThemeTokens.cardShadowHover,
                    },
                  }}
                >
                  <Stack spacing={1.1} alignItems={isRTL ? 'flex-end' : 'flex-start'} sx={{ width: '100%' }}>
                    <Box sx={{ color: accent }}>{action.icon}</Box>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                      {action.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6 }}>
                      {action.description}
                    </Typography>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={0.7} alignItems="center" sx={{ color: accent, pt: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 950 }}>{tx('common.open', 'Open')}</Typography>
                      <ArrowRight size={15} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                    </Stack>
                  </Stack>
                </Button>
              </Grid>
            );
          })}
        </Grid>

        <Paper sx={{ ...surfaceSx, p: { xs: 2.5, md: 3.5 } }}>
          <Stack spacing={2.5}>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2 }}>
                {tx('tenant.workflow.overline', 'NO-CALL SERVICE WORKFLOW')}
              </Typography>
              <Typography variant="h5" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                {tx('tenant.workflow.title', 'Report, track, then approve or dispute with proof')}
              </Typography>
              <Typography sx={{ color: binThemeTokens.textSecondary, mt: 0.75 }}>
                {tx('tenant.light.workflowDesc', 'Use these three steps to complete maintenance without phone calls or unclear updates.')}
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {[
                [tx('tenant.workflow.report.title', '1. Report the issue'), tx('tenant.light.workflowReport', 'Add the exact location, details and photo evidence.'), <Wrench size={22} />],
                [tx('tenant.workflow.track.title', '2. Track status'), tx('tenant.light.workflowTrack', 'Follow assignment, arrival, work status and updates.'), <MapPin size={22} />],
                [tx('tenant.workflow.proof.title', '3. Verify the proof'), tx('tenant.light.workflowProof', 'Review before-and-after evidence, then approve or dispute.'), <CheckCircle2 size={22} />],
              ].map(([title, description, icon]) => (
                <Grid item xs={12} md={4} key={String(title)}>
                  <Box sx={{ ...innerCardSx, p: 2.5, height: '100%', textAlign: isRTL ? 'right' : 'left' }}>
                    <Box sx={{ color: binThemeTokens.goldHover, mb: 1 }}>{icon}</Box>
                    <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{title}</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.75, lineHeight: 1.6 }}>
                      {description}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Paper sx={{ ...surfaceSx, p: { xs: 2.5, md: 3.5 } }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2.5 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                    {tx('dash.active_tickets', 'Active Tickets')}
                  </Typography>
                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>
                    {tx('tenant.light.activeDesc', 'Your current maintenance and service requests.')}
                  </Typography>
                </Box>
                <Chip label={activeTickets.length} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.goldHover, fontWeight: 950 }} />
              </Stack>

              {activeTickets.length ? (
                <Stack spacing={1.5}>
                  {activeTickets.map((ticket) => (
                    <Box key={ticket.id} sx={{ ...innerCardSx, p: 2.25 }}>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" spacing={2}>
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                            {ticket.description || ticket.category || tx('dash.maintenanceRequest', 'Maintenance request')}
                          </Typography>
                          <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>
                            REF: {String(ticket.id).slice(0, 8)} · {String(ticket.status || 'OPEN').replaceAll('_', ' ')}
                          </Typography>
                        </Box>
                        <Button size="small" onClick={() => navigate(`/tenant/ticket/${ticket.id}`)} sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>
                          {tx('common.view_details', 'View Details')}
                        </Button>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Box sx={{ ...innerCardSx, p: 5, textAlign: 'center' }}>
                  <CheckCircle2 color="#10B981" size={42} />
                  <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 1.5 }}>
                    {tx('dash.no_tickets', 'No active maintenance tickets')}
                  </Typography>
                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>
                    {tx('tenant.light.noTicketsDesc', 'New requests will appear here immediately after submission.')}
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ ...surfaceSx, p: 3 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mb: 2 }}>
                {tx('dash.quick_services', 'Quick Services')}
              </Typography>
              <Grid container spacing={1.5}>
                {quickServices.map((service) => (
                  <Grid item xs={6} key={service.label}>
                    <Button
                      fullWidth
                      onClick={() => navigate(service.route)}
                      sx={{
                        ...innerCardSx,
                        minHeight: 104,
                        p: 1.5,
                        flexDirection: 'column',
                        gap: 1,
                        color: binThemeTokens.textPrimary,
                        fontWeight: 900,
                        '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.07), borderColor: alpha(binThemeTokens.gold, 0.42) },
                      }}
                    >
                      <Box sx={{ color: binThemeTokens.goldHover }}>{service.icon}</Box>
                      {service.label}
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
}
