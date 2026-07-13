import { Box, Button, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bot, Droplets, Fan, PlugZap, Wrench } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import RoleQuickActionsPanel from '../../components/RoleQuickActionsPanel';
import { CANONICAL_SLA_POLICY } from '../../config/uaeDominationBlueprint';
import { binThemeTokens } from '../../theme/binGroupTheme';

const issueShortcuts = [
  { en: 'AC not cooling', ar: 'المكيف لا يبرد', category: 'ac', icon: <Fan size={22} />, priority: 'urgent' },
  { en: 'Water leak', ar: 'تسرب مياه', category: 'plumbing', icon: <Droplets size={22} />, priority: 'urgent' },
  { en: 'Electrical issue', ar: 'مشكلة كهربائية', category: 'electrical', icon: <PlugZap size={22} />, priority: 'urgent' },
  { en: 'Other repair', ar: 'إصلاح آخر', category: 'other', icon: <Wrench size={22} />, priority: 'normal' },
];

export default function TenantSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, tx, lang } = useLanguage();
  const ar = lang === 'ar';

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{tx('tenant.simple.overline', 'TENANT SIMPLE MODE')}</Typography>
          <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>{tx('tenant.simple.title', 'What do you need today?')}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1, maxWidth: 760 }}>{tx('tenant.simple.desc', 'Report a problem, track a request, open emergency help, or find payments and documents without searching through the full app.')}</Typography>
        </Box>

        <RoleQuickActionsPanel role="tenant" isRTL={isRTL} title={tx('tenant.simple.primaryTitle', 'Main tenant actions')} subtitle={tx('tenant.simple.primarySubtitle', 'The fastest no-call path for maintenance and property support.')} />

        <Button
          fullWidth
          onClick={() => navigate('/tenant/ai-concierge')}
          startIcon={<Bot size={22} />}
          sx={{ minHeight: 72, justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#000', bgcolor: binThemeTokens.gold, borderRadius: 5, fontWeight: 950, px: 3, flexDirection: isRTL ? 'row-reverse' : 'row', '&:hover': { bgcolor: binThemeTokens.goldHover || binThemeTokens.gold } }}
        >
          {tx('tenant.simple.aiConcierge', 'Ask BIN AI — describe your issue, we prepare the ticket (no call)')}
        </Button>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.045), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
          <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{tx('tenant.simple.oneTap', 'ONE-TAP MAINTENANCE')}</Typography>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{tx('tenant.simple.oneTapTitle', 'Common issues')}</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.5 }}>{tx('tenant.simple.oneTapDesc', 'Choose the issue, then add exact room/location and photo evidence before dispatch.')}</Typography>
            </Box>
            <Grid container spacing={2}>
              {issueShortcuts.map((item) => {
                const itemLabel = ar ? item.ar : item.en;
                return (
                  <Grid item xs={12} sm={6} md={3} key={item.category}>
                    <Button fullWidth aria-label={itemLabel} onClick={() => navigate(`/tenant/request?category=${item.category}`)} sx={{ minHeight: 112, p: 2, justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1), borderColor: alpha(binThemeTokens.gold, 0.35) } }}>
                      <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                        <Box sx={{ color: binThemeTokens.gold }}>{item.icon}</Box>
                        <Typography sx={{ fontWeight: 950 }}>{itemLabel}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.54)' }}>{item.priority === 'urgent' ? (ar ? 'مسار أولوية عالية' : 'High priority path') : (ar ? 'مسار الخدمة العادي' : 'Standard service path')}</Typography>
                      </Stack>
                    </Button>
                  </Grid>
                );
              })}
            </Grid>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, bgcolor: alpha('#ef4444', 0.08), border: `1px solid ${alpha('#ef4444', 0.24)}`, borderRadius: 5 }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <AlertTriangle size={22} color="#fca5a5" />
            <Box>
              <Typography sx={{ color: '#fff', fontWeight: 950 }}>{tx('tenant.simple.emergencySla', 'Emergency SLA')}</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.66)' }}>
                {ar
                  ? `طوارئ: ${CANONICAL_SLA_POLICY.EMERGENCY.minutes} دقيقة. خطر على الحياة أو السلامة، تسرب نشط، خطر كهربائي، تعطل الدخول، أو عطل شديد في التكييف يتطلب إرسالاً فورياً.`
                  : `${CANONICAL_SLA_POLICY.EMERGENCY.label}: ${CANONICAL_SLA_POLICY.EMERGENCY.minutes} minutes. ${CANONICAL_SLA_POLICY.EMERGENCY.tenantCopy}`}
              </Typography>
            </Box>
          </Stack>
        </Paper>

        <Button onClick={() => navigate('/tenant/dashboard/full')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: binThemeTokens.gold, fontWeight: 950 }}>{tx('tenant.simple.advanced', 'Open advanced dashboard')}</Button>
      </Stack>
    </Box>
  );
}
