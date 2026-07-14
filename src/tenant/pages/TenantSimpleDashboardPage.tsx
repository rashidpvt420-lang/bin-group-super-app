import { Box, Button, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bot, Bug, CalendarDays, Droplets, Fan, Plane, PlugZap, Sparkles, Truck, Wrench } from 'lucide-react';
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

const plannedServices = [
  {
    en: 'Deep Cleaning',
    ar: 'تنظيف عميق',
    descriptionEn: 'Choose the date, time, rooms and whether you will be home or away.',
    descriptionAr: 'اختر التاريخ والوقت والغرف وحدد ما إذا كنت ستكون في المنزل أو خارجه.',
    route: '/tenant/scheduled-service?service=deep-clean',
    icon: <Sparkles size={23} />,
  },
  {
    en: 'Pest Control',
    ar: 'مكافحة الآفات',
    descriptionEn: 'Tell us the pest, affected areas, pets or children and access method.',
    descriptionAr: 'حدد نوع الآفة والمناطق المتضررة والحيوانات أو الأطفال وطريقة الدخول.',
    route: '/tenant/scheduled-service?service=pest-control',
    icon: <Bug size={23} />,
  },
  {
    en: 'Vacation Home Care',
    ar: 'العناية بالمنزل أثناء السفر',
    descriptionEn: 'Mark the unit unoccupied and authorize the confirmed access method.',
    descriptionAr: 'حدد أن الوحدة غير مشغولة وصرّح بطريقة الدخول بعد تأكيد الموعد.',
    route: '/tenant/scheduled-service?service=vacation-care&occupancy=away',
    icon: <Plane size={23} />,
  },
  {
    en: 'Moving & Packing',
    ar: 'النقل والتغليف',
    descriptionEn: 'Schedule packing, moving support or move-in and move-out preparation.',
    descriptionAr: 'حدد موعد التغليف أو دعم النقل أو تجهيز الانتقال والدخول.',
    route: '/tenant/scheduled-service?service=moving',
    icon: <Truck size={23} />,
  },
];

const readableTextSx = {
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
} as const;

export default function TenantSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, tx, lang } = useLanguage();
  const ar = lang === 'ar';

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', minWidth: 0, overflowX: 'hidden' }}>
      <Stack spacing={4} sx={{ minWidth: 0 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>
            {tx('tenant.simple.overline', 'TENANT SIMPLE MODE')}
          </Typography>
          <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 1, ...readableTextSx }}>
            {tx('tenant.simple.title', 'What do you need today?')}
          </Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 760, lineHeight: 1.7, ...readableTextSx }}>
            {tx('tenant.simple.desc', 'Report a repair, schedule cleaning or pest control, arrange vacation access, track requests, open emergency help, or find payments and documents.')}
          </Typography>
        </Box>

        <RoleQuickActionsPanel
          role="tenant"
          isRTL={isRTL}
          title={tx('tenant.simple.primaryTitle', 'Main tenant actions')}
          subtitle={tx('tenant.simple.primarySubtitle', 'The fastest no-call path for maintenance and property support.')}
        />

        <Button
          fullWidth
          onClick={() => navigate('/tenant/ai-concierge')}
          startIcon={<Bot size={22} />}
          sx={{
            minHeight: 72,
            justifyContent: 'flex-start',
            textAlign: isRTL ? 'right' : 'left',
            color: binThemeTokens.textPrimary,
            bgcolor: binThemeTokens.gold,
            borderRadius: 5,
            fontWeight: 950,
            px: 3,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            boxShadow: `0 10px 24px ${alpha(binThemeTokens.gold, 0.24)}`,
            flexDirection: isRTL ? 'row-reverse' : 'row',
            '&:hover': { bgcolor: binThemeTokens.goldHover },
          }}
        >
          {tx('tenant.simple.aiConcierge', 'Ask BIN AI — describe your issue and we prepare the correct request')}
        </Button>

        <Paper
          sx={{
            p: { xs: 2.5, md: 3.5 },
            bgcolor: binThemeTokens.card,
            border: `1px solid ${binThemeTokens.border}`,
            borderRadius: 6,
            boxShadow: binThemeTokens.cardShadow,
          }}
        >
          <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2 }}>
                {tx('tenant.simple.oneTap', 'ONE-TAP MAINTENANCE')}
              </Typography>
              <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                {tx('tenant.simple.oneTapTitle', 'Common repair issues')}
              </Typography>
              <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5, ...readableTextSx }}>
                {tx('tenant.simple.oneTapDesc', 'Choose the issue, then add the exact room or asset and photo evidence before dispatch.')}
              </Typography>
            </Box>
            <Grid container spacing={2}>
              {issueShortcuts.map((item) => {
                const itemLabel = ar ? item.ar : item.en;
                return (
                  <Grid item xs={12} sm={6} md={3} key={item.category} sx={{ minWidth: 0 }}>
                    <Button
                      fullWidth
                      aria-label={itemLabel}
                      onClick={() => navigate(`/tenant/request?category=${item.category}`)}
                      sx={{
                        minHeight: 112,
                        p: 2,
                        minWidth: 0,
                        overflow: 'hidden',
                        whiteSpace: 'normal',
                        justifyContent: 'flex-start',
                        textAlign: isRTL ? 'right' : 'left',
                        color: binThemeTokens.textPrimary,
                        bgcolor: binThemeTokens.softCanvas,
                        border: `1px solid ${binThemeTokens.border}`,
                        borderRadius: 4,
                        '&:hover': {
                          bgcolor: alpha(binThemeTokens.gold, 0.08),
                          borderColor: alpha(binThemeTokens.gold, 0.45),
                        },
                      }}
                    >
                      <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'} sx={{ width: '100%', minWidth: 0 }}>
                        <Box sx={{ color: binThemeTokens.goldHover }}>{item.icon}</Box>
                        <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, ...readableTextSx }}>{itemLabel}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, ...readableTextSx }}>
                          {item.priority === 'urgent'
                            ? (ar ? 'مسار أولوية عالية' : 'High priority path')
                            : (ar ? 'مسار الخدمة العادي' : 'Standard service path')}
                        </Typography>
                      </Stack>
                    </Button>
                  </Grid>
                );
              })}
            </Grid>
          </Stack>
        </Paper>

        <Paper
          sx={{
            p: { xs: 2.5, md: 3.5 },
            bgcolor: binThemeTokens.card,
            border: `1px solid ${binThemeTokens.border}`,
            borderRadius: 6,
            boxShadow: binThemeTokens.cardShadow,
          }}
        >
          <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2 }}>
                {tx('tenant.services.overline', 'PLANNED HOME SERVICES')}
              </Typography>
              <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                {tx('tenant.services.title', 'Cleaning, pest control, vacation care and moving')}
              </Typography>
              <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5, ...readableTextSx }}>
                {tx('tenant.services.simpleDesc', 'Select a service and record the preferred date, time, occupancy, access authorization, contact details and exact work scope.')}
              </Typography>
            </Box>

            <Grid container spacing={2}>
              {plannedServices.map((service) => (
                <Grid item xs={12} sm={6} md={3} key={service.en} sx={{ minWidth: 0 }}>
                  <Button
                    fullWidth
                    onClick={() => navigate(service.route)}
                    sx={{
                      minHeight: 164,
                      p: 2.2,
                      minWidth: 0,
                      overflow: 'hidden',
                      whiteSpace: 'normal',
                      justifyContent: 'flex-start',
                      textAlign: isRTL ? 'right' : 'left',
                      color: binThemeTokens.textPrimary,
                      bgcolor: binThemeTokens.softCanvas,
                      border: `1px solid ${binThemeTokens.border}`,
                      borderRadius: 4,
                      '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.08), borderColor: alpha(binThemeTokens.gold, 0.45) },
                    }}
                  >
                    <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'} sx={{ width: '100%', minWidth: 0 }}>
                      <Box sx={{ color: binThemeTokens.goldHover }}>{service.icon}</Box>
                      <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, ...readableTextSx }}>{ar ? service.ar : service.en}</Typography>
                      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.5, ...readableTextSx }}>{ar ? service.descriptionAr : service.descriptionEn}</Typography>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={0.6} alignItems="center" sx={{ color: binThemeTokens.goldHover }}>
                        <CalendarDays size={14} />
                        <Typography variant="caption" sx={{ fontWeight: 950 }}>{ar ? 'حجز الخدمة' : 'Schedule service'}</Typography>
                      </Stack>
                    </Stack>
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper
          sx={{
            p: 2.5,
            bgcolor: alpha(binThemeTokens.danger, 0.06),
            border: `1px solid ${alpha(binThemeTokens.danger, 0.24)}`,
            borderRadius: 5,
            boxShadow: 'none',
          }}
        >
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <AlertTriangle size={22} color={binThemeTokens.danger} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
                {tx('tenant.simple.emergencySla', 'Emergency SLA')}
              </Typography>
              <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, ...readableTextSx }}>
                {ar
                  ? `طوارئ: ${CANONICAL_SLA_POLICY.EMERGENCY.minutes} دقيقة. خطر على الحياة أو السلامة، تسرب نشط، خطر كهربائي، تعطل الدخول، أو عطل شديد في التكييف يتطلب إرسالاً فورياً.`
                  : `${CANONICAL_SLA_POLICY.EMERGENCY.label}: ${CANONICAL_SLA_POLICY.EMERGENCY.minutes} minutes. ${CANONICAL_SLA_POLICY.EMERGENCY.tenantCopy}`}
              </Typography>
            </Box>
          </Stack>
        </Paper>

        <Button
          onClick={() => navigate('/tenant/dashboard/full')}
          sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: binThemeTokens.goldHover, fontWeight: 950 }}
        >
          {tx('tenant.simple.advanced', 'Open advanced dashboard')}
        </Button>
      </Stack>
    </Box>
  );
}
