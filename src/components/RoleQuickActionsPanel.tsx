import { Box, Button, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, Briefcase, Building2, CheckSquare, CreditCard, FileText, Gauge, Handshake, Map, Megaphone, ShieldCheck, WalletCards, Wrench } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { ROLE_QUICK_ACTIONS, type PortalRole } from '../config/uaeDominationBlueprint';
import { binThemeTokens } from '../theme/binGroupTheme';

const ICONS: Record<string, JSX.Element> = {
  rooms: <Building2 size={22} />,
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

const ARABIC_ACTION_COPY: Record<string, { label: string; whyItMatters: string }> = {
  rooms: { label: 'غرفة للإيجار', whyItMatters: 'يعرض الغرف الشاغرة المدارة من BIN مع سجل الصيانة وإدارة العقد.' },
  report_issue: { label: 'الإبلاغ عن مشكلة', whyItMatters: 'أسرع طريقة لإنشاء طلب صيانة مدعوم بالصور.' },
  track_request: { label: 'متابعة الطلب', whyItMatters: 'يعرض الحالة ووقت الوصول والإثبات وخيارات الاعتراض.' },
  emergency: { label: 'حالة طارئة', whyItMatters: 'يفصل حالات الطوارئ الحقيقية عن طلبات الصيانة العادية.' },
  documents_payments: { label: 'المستندات والمدفوعات', whyItMatters: 'يقلل متابعة الملفات والمدفوعات عبر المكالمات والواتساب.' },
  health: { label: 'صحة العقار', whyItMatters: 'عرض موحد للمخاطر واتفاقية الخدمة والطلبات والتكاليف.' },
  approvals: { label: 'الموافقات المعلقة', whyItMatters: 'يعرض للمالك القرارات التي تحتاج إلى إجراء فقط.' },
  financials: { label: 'البيانات المالية', whyItMatters: 'يعرض قيمة العقود والفواتير والمدفوعات ومصاريف الصيانة.' },
  passport: { label: 'جواز العقار', whyItMatters: 'ينشئ سجلاً دائماً للأصول والصيانة والإثباتات القانونية.' },
  jobs: { label: 'المهام', whyItMatters: 'يبدأ الفني من المهام المسندة والمهام المتاحة.' },
  map: { label: 'الخريطة المباشرة', whyItMatters: 'للملاحة وإثبات الموقع والوصول.' },
  offline: { label: 'قائمة دون اتصال', whyItMatters: 'تحمي سير العمل الميداني عند ضعف الاتصال.' },
  proof: { label: 'الإثبات', whyItMatters: 'تطبيق قاعدة لا صورة، لا إغلاق، ولا دفع.' },
  leads: { label: 'العملاء المحتملون', whyItMatters: 'يسجل فرص الملاك والعقارات ويحفظ مصدرها.' },
  referrals: { label: 'الإحالات', whyItMatters: 'يثبت الإسناد قبل حدوث أي نزاع على العمولة.' },
  commissions: { label: 'العمولات', whyItMatters: 'يعرض حالة العمولة والدفع بشفافية.' },
  documents: { label: 'المستندات', whyItMatters: 'ينظم مستندات ريرا والتحقق من الهوية والامتثال.' },
  sla: { label: 'مركز اتفاقية الخدمة', whyItMatters: 'يمنع التجاوز قبل تصاعد شكوى العميل.' },
  payments: { label: 'موافقات المدفوعات', whyItMatters: 'يتحكم في التفعيل والتحصيل ومخاطر الاحتيال.' },
  dispatch: { label: 'توزيع المهام', whyItMatters: 'يعرض سعة الفنيين وأقرب فني للمهمة.' },
  launch: { label: 'التحكم في الإطلاق', whyItMatters: 'يربط جاهزية الإطلاق بالأدلة الحية.' },
};

type Props = {
  role: PortalRole;
  title?: string;
  subtitle?: string;
  isRTL?: boolean;
};

export default function RoleQuickActionsPanel({ role, title = 'Simple Mode', subtitle = 'The most important actions first. Everything else stays under More Services.', isRTL = false }: Props) {
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const actions = ROLE_QUICK_ACTIONS[role];
  const isDarkPortal = role === 'admin';
  const surface = isDarkPortal ? 'rgba(201,166,70,0.045)' : binThemeTokens.card;
  const subtitleColor = isDarkPortal ? 'rgba(255,255,255,0.68)' : binThemeTokens.textSecondary;
  const cardBackground = isDarkPortal ? 'rgba(15,23,42,0.82)' : binThemeTokens.card;
  const cardTextColor = isDarkPortal ? '#FFFFFF' : binThemeTokens.textPrimary;
  const cardDetailColor = isDarkPortal ? 'rgba(255,255,255,0.68)' : binThemeTokens.textSecondary;
  const cardBorder = isDarkPortal ? 'rgba(255,255,255,0.10)' : binThemeTokens.border;

  return (
    <Paper
      sx={{
        p: { xs: 2.5, md: 3.5 },
        bgcolor: surface,
        border: `1px solid ${isDarkPortal ? alpha(binThemeTokens.gold, 0.16) : binThemeTokens.border}`,
        borderRadius: 6,
        boxShadow: isDarkPortal ? 'none' : binThemeTokens.cardShadow,
      }}
    >
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2 }}>{title}</Typography>
          <Typography variant="body2" sx={{ color: subtitleColor, mt: 0.5 }}>{subtitle}</Typography>
        </Box>
        <Grid container spacing={2}>
          {actions.map((action) => {
            const copy = lang === 'ar' ? ARABIC_ACTION_COPY[action.id] : undefined;
            return (
              <Grid item xs={12} sm={6} md={3} key={action.id}>
                <Button
                  fullWidth
                  onClick={() => navigate(action.target)}
                  aria-label={copy?.label || action.label}
                  sx={{
                    height: '100%',
                    minHeight: 118,
                    p: 2,
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    textAlign: isRTL ? 'right' : 'left',
                    color: cardTextColor,
                    bgcolor: cardBackground,
                    border: `1px solid ${cardBorder}`,
                    borderRadius: 4,
                    boxShadow: isDarkPortal ? 'none' : '0 8px 22px rgba(17, 24, 39, 0.06)',
                    '&:hover': {
                      bgcolor: isDarkPortal ? alpha(binThemeTokens.gold, 0.16) : alpha(binThemeTokens.gold, 0.08),
                      borderColor: alpha(binThemeTokens.gold, 0.45),
                      boxShadow: isDarkPortal ? 'none' : '0 12px 28px rgba(17, 24, 39, 0.10)',
                    },
                  }}
                >
                  <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                    <Box sx={{ color: binThemeTokens.goldHover }}>{ICONS[action.id] || <Activity size={22} />}</Box>
                    <Typography sx={{ color: cardTextColor, fontWeight: 950 }}>{copy?.label || action.label}</Typography>
                    <Typography variant="caption" sx={{ color: cardDetailColor, lineHeight: 1.45 }}>{copy?.whyItMatters || action.whyItMatters}</Typography>
                  </Stack>
                </Button>
              </Grid>
            );
          })}
        </Grid>
      </Stack>
    </Paper>
  );
}
