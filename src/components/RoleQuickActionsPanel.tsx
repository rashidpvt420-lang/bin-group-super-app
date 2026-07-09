import { Box, Button, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Briefcase, Building2, CheckSquare, CreditCard, FileText, Gauge, Handshake, Map, Megaphone, ShieldCheck, WalletCards, Wrench } from 'lucide-react';
import { ROLE_QUICK_ACTIONS, type PortalRole } from '../config/uaeDominationBlueprint';
import { binThemeTokens } from '../theme/binGroupTheme';

const ICONS: Record<string, JSX.Element> = {
  report_issue: <Wrench size={22} />,
  track_request: <Activity size={22} />,
  emergency: <AlertTriangle size={22} />,
  documents_payments: <CreditCard size={22} />,
  health: <Gauge size={22} />,
  approvals: <CheckSquare size={22} />,
  financials: <WalletCards size={22} />,
  passport: <Building2 size={22} />,
  jobs: <Briefcase size={22} />,
  map: <Map size={22} />,
  offline: <ShieldCheck size={22} />,
  proof: <FileText size={22} />,
  leads: <Megaphone size={22} />,
  referrals: <Handshake size={22} />,
  commissions: <WalletCards size={22} />,
  documents: <FileText size={22} />,
  sla: <Gauge size={22} />,
  payments: <CreditCard size={22} />,
  dispatch: <Map size={22} />,
  launch: <ShieldCheck size={22} />,
};

type Props = {
  role: PortalRole;
  title?: string;
  subtitle?: string;
  isRTL?: boolean;
};

export default function RoleQuickActionsPanel({ role, title = 'Simple Mode', subtitle = 'The most important actions first. Everything else stays under More Services.', isRTL = false }: Props) {
  const navigate = useNavigate();
  const actions = ROLE_QUICK_ACTIONS[role];

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.045), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{title}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.5 }}>{subtitle}</Typography>
        </Box>
        <Grid container spacing={2}>
          {actions.map((action) => (
            <Grid item xs={12} sm={6} md={3} key={action.id}>
              <Button
                fullWidth
                onClick={() => navigate(action.target)}
                sx={{
                  height: '100%',
                  minHeight: 118,
                  p: 2,
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  textAlign: isRTL ? 'right' : 'left',
                  color: '#fff',
                  bgcolor: 'rgba(15,23,42,0.72)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1), borderColor: alpha(binThemeTokens.gold, 0.35) },
                }}
              >
                <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Box sx={{ color: binThemeTokens.gold }}>{ICONS[action.id] || <Activity size={22} />}</Box>
                  <Typography sx={{ fontWeight: 950 }}>{action.label}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.54)', lineHeight: 1.45 }}>{action.whyItMatters}</Typography>
                </Stack>
              </Button>
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Paper>
  );
}
