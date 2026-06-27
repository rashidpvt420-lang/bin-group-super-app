import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Home,
  KeyRound,
  Landmark,
  LogIn,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import BrandWatermark from '../components/BrandWatermark';
import { CeoContactButtons } from '../components/CeoContactButtons';

type RoleKey = 'tenant' | 'landlord' | 'real_estate';

type ServiceOption = {
  title: string;
  desc: string;
  action: string;
  route: string;
  icon: React.ReactNode;
};

type RoleOption = {
  key: RoleKey;
  title: string;
  subtitle: string;
  desc: string;
  primaryRoute: string;
  primaryAction: string;
  icon: React.ReactNode;
  services: ServiceOption[];
};

const gold = binThemeTokens.gold;
const ink = '#111827';
const muted = '#667085';
const line = '#E8E3D7';

export default function RoleServiceLandingPage() {
  const navigate = useNavigate();
  const { isRTL } = useLanguage();
  const [selectedRole, setSelectedRole] = React.useState<RoleKey>('tenant');

  const copy = (en: string, ar: string) => (isRTL ? ar : en);

  const roleOptions: RoleOption[] = [
    {
      key: 'tenant',
      title: copy('Tenant', 'مستأجر'),
      subtitle: copy('I live in a property and need service', 'أنا مستأجر وأحتاج خدمة'),
      desc: copy(
        'Report maintenance, track the technician, see notices, payments, documents, parcels, keys, amenities, and approve or dispute completed work.',
        'ارفع بلاغ صيانة، تابع الفني، راجع التنبيهات والمدفوعات والمستندات والطرود والمفاتيح والخدمات، ثم وافق أو اعترض على العمل المنجز.'
      ),
      primaryRoute: '/login?role=tenant&next=/tenant/dashboard',
      primaryAction: copy('Enter tenant services', 'دخول خدمات المستأجر'),
      icon: <UserRound size={30} />,
      services: [
        {
          title: copy('Report an issue', 'بلاغ صيانة'),
          desc: copy('Photo/video request, priority, notifications, technician status, evidence, approve/dispute.', 'بلاغ بصورة أو فيديو، أولوية، إشعارات، حالة الفني، إثبات، موافقة أو اعتراض.'),
          action: copy('Start request', 'ابدأ البلاغ'),
          route: '/login?role=tenant&next=/tenant/request',
          icon: <Wrench size={22} />,
        },
        {
          title: copy('Documents and payments', 'المستندات والمدفوعات'),
          desc: copy('Open lease documents, receipts, payment status, notices, and verified records.', 'راجع عقود الإيجار والإيصالات وحالة الدفع والتنبيهات والسجلات الموثقة.'),
          action: copy('View tenant records', 'عرض سجلات المستأجر'),
          route: '/login?role=tenant&next=/tenant/documents',
          icon: <KeyRound size={22} />,
        },
        {
          title: copy('Building services', 'خدمات المبنى'),
          desc: copy('Amenities, gate pass, visitor parking, parcels, keys, staff directory, and community messages.', 'الخدمات، تصاريح الدخول، مواقف الزوار، الطرود، المفاتيح، دليل الموظفين، ورسائل المجتمع.'),
          action: copy('Open services', 'فتح الخدمات'),
          route: '/login?role=tenant&next=/tenant/amenities',
          icon: <Home size={22} />,
        },
      ],
    },
    {
      key: 'landlord',
      title: copy('Landlord / Owner', 'مالك / مؤجر'),
      subtitle: copy('I own property and need management or maintenance', 'أملك عقاراً وأحتاج إدارة أو صيانة'),
      desc: copy(
        'Add property details, get contract value, choose Maintenance Only, Property Management Only, or Full Coverage, then track tenants, rent, tickets, proof, passports, payments, and approvals.',
        'أضف بيانات العقار، احصل على قيمة العقد، اختر الصيانة فقط أو إدارة العقار فقط أو التغطية الكاملة، ثم تابع المستأجرين والإيجار والتذاكر والإثبات وجواز العقار والمدفوعات والموافقات.'
      ),
      primaryRoute: '/onboarding',
      primaryAction: copy('Start property onboarding', 'ابدأ تسجيل العقار'),
      icon: <Building2 size={30} />,
      services: [
        {
          title: copy('Maintenance only', 'الصيانة فقط'),
          desc: copy('BIN GROUP receives requests, dispatches technicians, controls SLA, collects before/after proof, and reports cost.', 'تستلم BIN GROUP الطلبات، ترسل الفنيين، تتابع SLA، تجمع صور قبل/بعد، وترفع التكلفة.'),
          action: copy('Calculate maintenance scope', 'احسب نطاق الصيانة'),
          route: '/onboarding?service=maintenance',
          icon: <Wrench size={22} />,
        },
        {
          title: copy('Property management only', 'إدارة العقار فقط'),
          desc: copy('Tenant registry, rent ledger, owner payout visibility, documents, notices, lease data, and unit readiness.', 'سجل المستأجرين، دفتر الإيجار، رؤية تحويلات المالك، المستندات، التنبيهات، بيانات العقود، وجاهزية الوحدات.'),
          action: copy('Start management plan', 'ابدأ خطة الإدارة'),
          route: '/onboarding?service=property-management',
          icon: <Landmark size={22} />,
        },
        {
          title: copy('Full coverage', 'تغطية كاملة'),
          desc: copy('Maintenance + property management with one owner dashboard, approvals, property passport, PDF reports, and audit trail.', 'صيانة + إدارة عقار من لوحة مالك واحدة، موافقات، جواز عقار، تقارير PDF، وسجل تدقيق.'),
          action: copy('Build full contract', 'إنشاء العقد الكامل'),
          route: '/onboarding?service=full-coverage',
          icon: <ShieldCheck size={22} />,
        },
      ],
    },
    {
      key: 'real_estate',
      title: copy('Real Estate / Broker', 'عقار / وسيط'),
      subtitle: copy('I bring owners, tenants, contracts, or leads', 'أجلب ملاكاً أو مستأجرين أو عقوداً أو فرصاً'),
      desc: copy(
        'Submit owner leads, tenant leads, properties, and contracts with attribution so the system knows who brought the deal and can calculate commission approval.',
        'أرسل فرص الملاك والمستأجرين والعقارات والعقود مع إثبات النسبة حتى يعرف النظام من جلب الصفقة ويحسب موافقة العمولة.'
      ),
      primaryRoute: '/brokers',
      primaryAction: copy('Open real estate path', 'فتح مسار الوسيط'),
      icon: <Landmark size={30} />,
      services: [
        {
          title: copy('Submit owner lead', 'إرسال فرصة مالك'),
          desc: copy('Capture owner/property details, lead source, referral evidence, and follow-up status.', 'تسجيل بيانات المالك والعقار ومصدر الفرصة وإثبات الإحالة وحالة المتابعة.'),
          action: copy('Submit lead', 'إرسال الفرصة'),
          route: '/login?role=broker&next=/broker/dashboard',
          icon: <Building2 size={22} />,
        },
        {
          title: copy('Bring a contract', 'إحضار عقد'),
          desc: copy('Attach contract/reference data so admin can verify the deal, link the broker, and approve commission.', 'أرفق بيانات العقد أو المرجع ليتحقق الأدمن من الصفقة ويربط الوسيط ويوافق على العمولة.'),
          action: copy('Track attribution', 'تتبع النسبة'),
          route: '/login?role=broker&next=/broker/dashboard',
          icon: <CheckCircle2 size={22} />,
        },
        {
          title: copy('Tenant placement', 'تسكين مستأجر'),
          desc: copy('Record which broker brought the tenant, property, unit, lease link, and commission status.', 'تسجيل الوسيط الذي جلب المستأجر والعقار والوحدة ورابط العقد وحالة العمولة.'),
          action: copy('Open broker portal', 'فتح بوابة الوسيط'),
          route: '/login?role=broker&next=/broker/dashboard',
          icon: <UserRound size={22} />,
        },
      ],
    },
  ];

  const activeRole = roleOptions.find((role) => role.key === selectedRole) ?? roleOptions[0];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.055} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: '#111827', py: 1, borderBottom: `1px solid ${alpha(gold, 0.22)}` }}>
          <Container maxWidth="lg">
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" flexWrap="wrap">
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22C55E', boxShadow: '0 0 8px #22C55E' }} />
              <Typography sx={{ color: 'rgba(255,255,255,.78)', fontSize: '.74rem', fontWeight: 850 }}>
                {copy('BIN GROUP · UAE property maintenance and management access layer', 'BIN GROUP · طبقة وصول لإدارة وصيانة العقارات في الإمارات')}
              </Typography>
            </Stack>
          </Container>
        </Box>

        <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg" sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
            <Button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}>
              <Stack direction="row" spacing={1.2} alignItems="center">
                <Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.1 }} />
                <Typography fontWeight={950}>BIN GROUP</Typography>
              </Stack>
            </Button>
            <Button onClick={() => navigate('/company-profile')} sx={{ color: gold, fontWeight: 950 }}>{copy('Company Profile', 'ملف الشركة')}</Button>
            <Button startIcon={<LogIn size={17} />} onClick={() => navigate('/gateway')} sx={{ color: gold, fontWeight: 950 }}>{copy('Portal Login', 'دخول البوابة')}</Button>
          </Container>
        </Box>

        <Box sx={{ background: 'linear-gradient(160deg, #0B0B0C 0%, #1A1A2E 55%, #111827 100%)', py: { xs: 7, md: 10 }, textAlign: 'center' }}>
          <Container maxWidth="lg">
            <Stack spacing={3.5} alignItems="center">
              <Chip label={copy('START HERE', 'ابدأ من هنا')} sx={{ bgcolor: alpha(gold, 0.13), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.28)}` }} />
              <Typography variant="h2" sx={{ color: '#fff', fontWeight: 950, maxWidth: 940, lineHeight: 1.12, letterSpacing: -1 }}>
                {copy('What are you here for?', 'ما نوع الخدمة التي تحتاجها؟')}
              </Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.68)', maxWidth: 870, lineHeight: 1.75, fontWeight: 700 }}>
                {copy(
                  'Choose Tenant, Landlord/Owner, or Real Estate/Broker. The page then narrows the app to the exact service path instead of forcing people through a long interface.',
                  'اختر مستأجر أو مالك/مؤجر أو عقار/وسيط. بعدها يختصر التطبيق الخيارات إلى مسار الخدمة الصحيح بدل صفحة طويلة يصعب البحث فيها.'
                )}
              </Typography>

              <Grid container spacing={2.5} sx={{ mt: 1 }}>
                {roleOptions.map((role) => {
                  const active = selectedRole === role.key;
                  return (
                    <Grid item xs={12} md={4} key={role.key}>
                      <Paper
                        component="button"
                        type="button"
                        onClick={() => setSelectedRole(role.key)}
                        sx={{
                          p: 3,
                          height: '100%',
                          width: '100%',
                          borderRadius: 4,
                          textAlign: isRTL ? 'right' : 'left',
                          bgcolor: active ? alpha(gold, 0.18) : 'rgba(255,255,255,.055)',
                          border: `1.5px solid ${active ? gold : alpha(gold, 0.18)}`,
                          color: '#fff',
                          cursor: 'pointer',
                          boxShadow: active ? `0 22px 52px ${alpha(gold, 0.22)}` : 'none',
                        }}
                      >
                        <Stack spacing={1.5}>
                          <Box sx={{ color: gold }}>{role.icon}</Box>
                          <Typography variant="h5" fontWeight={950}>{role.title}</Typography>
                          <Typography sx={{ color: 'rgba(255,255,255,.7)', fontWeight: 800 }}>{role.subtitle}</Typography>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.62)', lineHeight: 1.65 }}>{role.desc}</Typography>
                        </Stack>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Stack>
          </Container>
        </Box>

        <Box sx={{ py: 8, bgcolor: '#fff' }}>
          <Container maxWidth="lg">
            <Stack spacing={3} alignItems="center" textAlign="center" sx={{ mb: 4 }}>
              <Chip label={copy('NARROWED OPTIONS', 'خيارات مختصرة')} sx={{ bgcolor: alpha(gold, 0.1), color: '#6F5522', fontWeight: 950 }} />
              <Typography variant="h3" fontWeight={950} sx={{ color: ink }}>{activeRole.title}</Typography>
              <Typography sx={{ color: muted, maxWidth: 760, lineHeight: 1.75, fontWeight: 700 }}>{activeRole.desc}</Typography>
              <Button variant="contained" onClick={() => navigate(activeRole.primaryRoute)} endIcon={<ArrowRight />} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, borderRadius: 99, px: 4, py: 1.45 }}>
                {activeRole.primaryAction}
              </Button>
            </Stack>

            <Grid container spacing={3}>
              {activeRole.services.map((service) => (
                <Grid item xs={12} md={4} key={service.title}>
                  <Paper sx={{ p: 3, height: '100%', borderRadius: 4, border: `1px solid ${line}`, boxShadow: '0 16px 38px rgba(17,24,39,.05)' }}>
                    <Stack spacing={1.4} alignItems={isRTL ? 'flex-end' : 'flex-start'} textAlign={isRTL ? 'right' : 'left'}>
                      <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(gold, 0.12), color: gold, display: 'grid', placeItems: 'center' }}>{service.icon}</Box>
                      <Typography variant="h6" fontWeight={950} color={ink}>{service.title}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.7, fontWeight: 650 }}>{service.desc}</Typography>
                      <Button onClick={() => navigate(service.route)} sx={{ color: gold, fontWeight: 950, px: 0 }}>{service.action}</Button>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        <Box sx={{ py: 7, bgcolor: '#111827' }}>
          <Container maxWidth="lg">
            <Grid container spacing={2.5}>
              {[
                [copy('No-call operations', 'عمليات بدون مكالمات'), copy('Requests become tracked records with status, owner visibility, and notifications.', 'الطلبات تصبح سجلات متتبعة بالحالة ورؤية المالك والإشعارات.')],
                [copy('Proof before payment', 'إثبات قبل الدفع'), copy('Technician before/after photos, GPS context, timestamps, and approval/dispute controls.', 'صور الفني قبل/بعد، سياق GPS، الوقت، وأدوات الموافقة أو الاعتراض.')],
                [copy('Broker attribution', 'إثبات نسبة الوسيط'), copy('Every owner lead, tenant lead, contract, and unit placement can keep source attribution.', 'كل فرصة مالك أو مستأجر أو عقد أو وحدة يمكن أن تحفظ مصدرها.')],
                [copy('Admin approval control', 'تحكم موافقات الأدمن'), copy('Owner/property approval, payment proof review, staff access, contracts, PDFs, maps, and launch health stay controlled centrally.', 'موافقة المالك والعقار، مراجعة إثبات الدفع، صلاحيات الموظفين، العقود، PDF، الخرائط، وصحة الإطلاق تبقى مركزية.')],
              ].map(([title, body]) => (
                <Grid item xs={12} md={3} key={title}>
                  <Paper sx={{ p: 3, height: '100%', borderRadius: 3, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(gold, 0.18)}` }}>
                    <Typography fontWeight={950} sx={{ color: gold, mb: 1 }}>{title}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.67)', lineHeight: 1.7, fontWeight: 650 }}>{body}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        <Box sx={{ py: 8, bgcolor: '#fff', textAlign: 'center' }}>
          <Container maxWidth="md">
            <Stack spacing={3} alignItems="center">
              <Sparkles size={34} color={gold} />
              <Typography variant="h4" fontWeight={950} color={ink}>{copy('Still not sure?', 'غير متأكد؟')}</Typography>
              <Typography sx={{ color: muted, lineHeight: 1.75, fontWeight: 700 }}>
                {copy('Open the company profile for the full explanation, or contact BIN GROUP directly.', 'افتح ملف الشركة للشرح الكامل أو تواصل مباشرة مع BIN GROUP.')}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
                <Button variant="outlined" onClick={() => navigate('/company-profile')} sx={{ borderColor: gold, color: gold, fontWeight: 950 }}>
                  {copy('Read company profile', 'قراءة ملف الشركة')}
                </Button>
                <Button variant="contained" onClick={() => navigate('/gateway')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>
                  {copy('Login / access portal', 'دخول البوابة')}
                </Button>
              </Stack>
              <CeoContactButtons variant="minimal" />
            </Stack>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
