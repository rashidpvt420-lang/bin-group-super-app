import React, { useMemo } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import {
  Bell,
  Briefcase,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  Globe,
  Home,
  Key,
  LogIn,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Users,
  WalletCards,
  Wrench,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import BrandWatermark from '../../components/BrandWatermark';

const CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'ceo@bin-groups.com' };
const ink = '#111827';
const muted = '#667085';
const line = '#E8E3D7';
const platinum = '#F8F9FB';
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const radius = { section: 3, card: 2.25, button: 2 };

function getCopy(lang: 'en' | 'ar') {
  const ar = lang === 'ar';
  return {
    ar,
    brand: ar ? 'مجموعة بن' : 'BIN GROUP',
    navHome: ar ? 'الرئيسية' : 'Home',
    navStart: ar ? 'ابدأ تفاصيل العقار' : 'Start Property Details',
    navLogin: ar ? 'دخول البوابة' : 'Portal Login',
    navDemo: ar ? 'العرض التوضيحي' : 'Demo Reel',

    badge1: ar ? 'جذور من العين منذ 2010' : 'Rooted in Al Ain since 2010',
    badge2: ar ? 'شركة مرخصة في الإمارات' : 'Licensed UAE Company',
    badge3: ar ? 'صيانة + إدارة عقارات' : 'Maintenance + Property Management',

    heroTitle: ar
      ? 'بن جروب — الصيانة الذكية وإدارة العقارات'
      : 'BIN GROUP — Smart Maintenance & Property Management',
    heroSubtitle: ar
      ? 'نحمي عقارك، نُدار المستأجرين، ونُوثّق كل خدمة بإثبات فعلي قبل الإغلاق. مالك العقار يرى كل شيء في لوحة واحدة.'
      : 'We protect your property, manage your tenants, and document every service with verified proof before closeout. Property owners see everything in one dashboard.',

    missionTitle: ar ? 'مهمتنا' : 'Our Mission',
    mission: ar
      ? 'تقديم خدمات صيانة وإدارة عقارات موثوقة تحمي ممتلكات العملاء، تُقلّل الضغط التشغيلي، وتُوفّر متابعة واضحة عبر السجلات الرقمية والمساءلة الميدانية — حتى يتمكن كل مالك من الاسترخاء مع اليقين الكامل أن عقاره في أيدٍ أمينة.'
      : 'To deliver dependable maintenance and property management services that protect client properties, reduce operational stress, and provide full visibility through digital records and accountable field execution — so every owner can rest knowing their asset is in expert hands.',

    problemTitle: ar ? 'ما الذي نحلّه' : 'What We Solve',
    problemSubtitle: ar
      ? 'ملاك العقارات والمستأجرون في الإمارات يعانون من نفس المشاكل. BIN GROUP بُنيت لحلها.'
      : 'Property owners and tenants across the UAE face the same frustrations. BIN GROUP was built to solve them.',

    ownerProblems: ar
      ? [
          'لا رؤية لما يحدث فعلياً في العقار',
          'مقاولون غير موثوقين بلا إثبات على العمل المنجز',
          'إدارة ورقية فوضوية للعقود والفواتير',
          'صعوبة إدارة أكثر من عقار في وقت واحد',
          'تأخير في الصيانة يُتلف الأصول ويرفع التكاليف',
        ]
      : [
          'No visibility into what is actually happening at the property',
          'Unreliable contractors with no proof of work done',
          'Chaotic paper-based contract and invoice management',
          'Difficulty managing multiple properties at once',
          'Delayed maintenance that damages assets and inflates costs',
        ],

    tenantProblems: ar
      ? [
          'استجابة بطيئة لطلبات الصيانة',
          'لا تحديثات على حالة الطلب بعد التقديم',
          'صعوبة التواصل مع الإدارة',
          'العيش مع مشاكل معلقة دون حل واضح',
        ]
      : [
          'Slow response to maintenance requests',
          'No status updates after a request is submitted',
          'Hard to reach property management directly',
          'Living with unresolved issues and no clear timeline',
        ],

    ownerGetsTitle: ar ? 'ما يحصل عليه المالك' : 'What Owners Get',
    ownerGets: ar
      ? [
          ['لوحة تحكم كاملة', 'عرض فوري لجميع العقارات، الطلبات النشطة، الحالة المالية، والمخاطر المكشوفة.'],
          ['جواز العقار الرقمي', 'سجل رقمي شامل لكل عقار: العقود، الفواتير، التقارير، سجل الصيانة، وتحديثات الأنظمة.'],
          ['إثبات قبل وبعد لكل خدمة', 'صور موثقة قبل وبعد كل عمل — لا دفع يتم بدون إثبات فعلي.'],
          ['مؤشر صحة العقار (BPI)', 'درجة صحية تلقائية مع توصيات ذكية لكل عقار تُحدّث مع كل خدمة.'],
          ['تقويم الصيانة الوقائية', 'مواعيد صيانة مجدولة تلقائياً حسب نوع وعمر العقار.'],
          ['التحكم المالي الكامل', 'سجل الإيرادات، خصومات الإدارة، صافي المدفوعات، وتصدير التقارير.'],
          ['إدارة الشواغر والتسليم', 'بروتوكول Hard-Reset™ بين المستأجرين: مفاتيح، طلاء، تنظيف، توثيق.'],
          ['تقارير قابلة للتنزيل', 'تقارير PDF فورية لأي عقار — للمشاركة مع الجهات الحكومية أو الشركاء.'],
        ]
      : [
          ['Full Property Dashboard', 'Instant view of all properties, active requests, financial position, and exposed risks.'],
          ['Digital Property Passport', 'Comprehensive digital record per property: contracts, invoices, reports, maintenance history, and system updates.'],
          ['Before & After Proof on Every Job', 'Documented photos before and after every job — no payment released without verified evidence.'],
          ['Building Performance Index (BPI)', 'Automatic health score with smart recommendations per property, updated after every service.'],
          ['Preventive Maintenance Calendar', 'Automatically scheduled maintenance dates based on property type and age.'],
          ['Full Financial Control', 'Revenue ledger, management deductions, net payouts, and report exports.'],
          ['Vacancy & Turnover Management', 'Hard-Reset™ protocol between tenants: keys, paint, cleaning, full documentation.'],
          ['Downloadable Reports', 'Instant PDF reports for any property — shareable with government bodies or partners.'],
        ],

    tenantGetsTitle: ar ? 'ما يحصل عليه المستأجر' : 'What Tenants Get',
    tenantGets: ar
      ? [
          ['تقديم طلب بصورة في ثوانٍ', 'أرفق صورة، حدد الأولوية، واضغط إرسال — لا مكالمات، لا انتظار.'],
          ['تتبع فوري للحالة', 'كل طلب يُحدّث تلقائياً: مُعيَّن → في الطريق → مكتمل — مع إشعارات مباشرة.'],
          ['SOS للطوارئ', 'زر طارئ يصل لفريق BIN GROUP فوراً لحالات الأعطال الحرجة.'],
          ['مكان نظيف ومُصان', 'خطة صيانة وقائية منتظمة تمنع الأعطال قبل حدوثها.'],
          ['تواصل مباشر مع الإدارة', 'قناة تواصل مؤسسية آمنة بدلاً من الرسائل المتناثرة.'],
        ]
      : [
          ['Submit a Request with a Photo in Seconds', 'Attach a photo, set the priority, and hit submit — no phone calls, no waiting on hold.'],
          ['Real-Time Status Tracking', 'Every request auto-updates: Assigned → En Route → Completed — with live notifications.'],
          ['SOS Emergency Button', 'Direct emergency escalation to the BIN GROUP team for critical faults.'],
          ['A Clean, Well-Maintained Home', 'Regular preventive maintenance plans stop problems before they happen.'],
          ['Direct Management Channel', 'Secure institutional communication instead of scattered messages.'],
        ],

    demoTitle: ar ? 'عرض BIN GROUP التشغيلي' : 'BIN GROUP Operations Demo',
    demoSubtitle: ar
      ? 'رحلة كاملة: من طلب المالك إلى إرسال الفني عبر GPS، إثبات قبل وبعد، العقد، الدفع، والتقرير.'
      : 'The full journey: from owner request to GPS technician dispatch, before-and-after proof, contract, payment, and final report.',
    demoScenes: ar
      ? [
          ['تطبيق المالك', 'عرض السعر، العقد، خطة الدفع، لوحة التحكم.'],
          ['طلب المستأجر', 'طلب خدمة مع صورة، أولوية، وتتبع الحالة.'],
          ['إرسال الفني عبر GPS', 'توجيه أقرب فني موثق إلى العقار.'],
          ['إثبات قبل وبعد', 'صور قبل وبعد قبل إغلاق الخدمة أو تحرير الدفع.'],
          ['العقد / الدفع / التقرير', 'عقد PDF، فاتورة، خطة دفع، تقرير، وسجل العقار.'],
          ['تدفق الوسيط', 'تسجيل الإحالة، تسليم المالك، ووضوح العمولة.'],
          ['استوديو التصميم AI', 'خيارات داخلية وخارجية قبل موافقة المالك.'],
        ]
      : [
          ['Owner App', 'Quote, contract, payment plan, and active dashboard.'],
          ['Tenant Photo Request', 'Service request with image, priority, and status tracking.'],
          ['Technician GPS Dispatch', 'Nearest verified technician routed to the property.'],
          ['Before / After Evidence', 'Visual proof before closeout or payment release.'],
          ['Contract / Payment / Report', 'PDF contract, invoice, payment plan, report, and property history.'],
          ['Broker Flow', 'Referral registration, owner handover, and commission visibility.'],
          ['AI Design Studio', 'Interior and exterior concept options before owner approval.'],
        ],

    trustTitle: ar ? 'كيف نبني الثقة' : 'How We Build Trust',
    trust: ar
      ? ['بيانات الشركة والرخصة معروضة بوضوح', 'نطاق خدمة واضح بدون وعود مبالغ فيها', 'إثبات قبل وبعد لكل عمل', 'تواصل مباشر عبر الهاتف والواتساب والبريد', 'دعم ثنائي اللغة مع واجهة عربية كاملة']
      : ['Clear company and licence information displayed', 'Defined service scope with no exaggerated promises', 'Before-and-after proof on every job', 'Direct phone, WhatsApp, and email contact', 'Full bilingual English/Arabic support with RTL layout'],

    contactTitle: ar ? 'تواصل الإدارة' : 'Executive Contact',
    location: ar ? 'العين، الإمارات العربية المتحدة' : 'Al Ain, United Arab Emirates',
    footer: ar ? 'عناية موثوقة بالعقارات، بجذور من مدينة العين.' : 'Trusted property care, rooted in Al Ain.',
    ctaStart: ar ? 'ابدأ عقدك الآن' : 'Start Your Contract',
    ctaWhatsapp: ar ? 'تواصل عبر واتساب' : 'WhatsApp BIN GROUP',
  };
}

function TrustChip({ label }: { label: string }) {
  return <Chip label={label} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, 0.12), color: '#6F5522', border: `1px solid ${alpha(gold, 0.22)}`, fontWeight: 950 }} />;
}

function NavButton({ children, onClick, contained = false, icon }: { children: React.ReactNode; onClick: () => void; contained?: boolean; icon?: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      startIcon={icon}
      sx={{
        minHeight: 46,
        px: 2.2,
        borderRadius: radius.button,
        fontWeight: 950,
        color: contained ? '#111827' : gold,
        border: contained ? 'none' : `1px solid ${alpha(gold, 0.38)}`,
        background: contained ? `linear-gradient(135deg, ${goldLight}, ${gold})` : '#FFFFFF',
        boxShadow: contained ? `0 12px 28px ${alpha(gold, 0.22)}` : 'none',
      }}
    >
      {children}
    </Button>
  );
}

const OWNER_ICONS = [<TrendingUp key="0" />, <FileText key="1" />, <Camera key="2" />, <Star key="3" />, <ClipboardCheck key="4" />, <WalletCards key="5" />, <Key key="6" />, <Briefcase key="7" />];
const TENANT_ICONS = [<Zap key="0" />, <Bell key="1" />, <ShieldCheck key="2" />, <Home key="3" />, <MessageSquare key="4" />];
const DEMO_ICONS = [<Building2 key="0" />, <Camera key="1" />, <Navigation key="2" />, <ClipboardCheck key="3" />, <CreditCard key="4" />, <Users key="5" />, <Sparkles key="6" />];

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { lang, setLang, isRTL } = useLanguage();
  const copy = useMemo(() => getCopy(lang), [lang]);
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const textAlign = isRTL ? 'right' : 'left';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.07} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>

        {/* Nav */}
        <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg" sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
            <Button onClick={() => navigate('/')} sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}>
              <Stack direction="row" spacing={1.2} alignItems="center">
                <Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.1, boxShadow: '0 10px 22px rgba(17,24,39,.10)' }} />
                <Typography fontWeight={950}>{copy.brand}</Typography>
              </Stack>
            </Button>
            <NavButton onClick={() => navigate('/')} icon={<Home size={17} />}>{copy.navHome}</NavButton>
            <NavButton onClick={() => navigate('/onboarding')} contained>{copy.navStart}</NavButton>
            <NavButton onClick={() => navigate('/login')} icon={<LogIn size={17} />}>{copy.navLogin}</NavButton>
            <NavButton onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} icon={<PlayCircle size={17} />}>{copy.navDemo}</NavButton>
            <NavButton onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} icon={<Globe size={17} />}>{lang === 'ar' ? 'EN' : 'AR'}</NavButton>
          </Container>
        </Box>

        {/* Hero */}
        <Box sx={{ borderBottom: `1px solid ${line}`, background: `linear-gradient(135deg, ${platinum} 0%, #FFFFFF 58%, ${alpha(gold, 0.08)} 100%)` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 7, md: 12 } }}>
            <Grid container spacing={5} alignItems="center">
              <Grid item xs={12} md={7}>
                <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                    <TrustChip label={copy.badge1} />
                    <TrustChip label={copy.badge2} />
                    <TrustChip label={copy.badge3} />
                  </Stack>
                  <Typography variant="h1" fontWeight={950} sx={{ fontSize: { xs: '2.35rem', md: '3.8rem' }, lineHeight: 1.05, textAlign }}>{copy.heroTitle}</Typography>
                  <Typography variant="h5" sx={{ color: muted, fontWeight: 750, lineHeight: 1.65, textAlign, maxWidth: 720 }}>{copy.heroSubtitle}</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ borderRadius: radius.button, bgcolor: gold, color: '#111827', fontWeight: 950, px: 4, py: 1.5 }}>{copy.ctaStart}</Button>
                    <Button variant="outlined" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ borderRadius: radius.button, color: ink, borderColor: '#D6C99F', fontWeight: 950, px: 4, py: 1.5 }}>{copy.ctaWhatsapp}</Button>
                  </Stack>
                </Stack>
              </Grid>
              <Grid item xs={12} md={5}>
                <Paper sx={{ p: 4, borderRadius: radius.section, bgcolor: '#111827', border: `1px solid rgba(212,175,55,.30)`, boxShadow: '0 24px 70px rgba(17,24,39,.18)' }}>
                  <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                    <Sparkles color={gold} size={36} />
                    <Typography variant="h5" fontWeight={950} sx={{ color: gold, textAlign }}>{copy.missionTitle}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,.78)', fontWeight: 700, lineHeight: 1.9, textAlign }}>{copy.mission}</Typography>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* What We Solve */}
        <Box sx={{ py: 9, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Typography variant="h2" fontWeight={950} sx={{ color: ink, mb: 1.5 }}>{copy.problemTitle}</Typography>
              <Typography variant="h6" sx={{ color: muted, fontWeight: 700, maxWidth: 640, mx: 'auto' }}>{copy.problemSubtitle}</Typography>
            </Box>
            <Grid container spacing={4}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: radius.section, border: `1px solid ${line}`, height: '100%', bgcolor: '#fff' }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                    <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2 }}><Building2 size={22} color={gold} /></Box>
                    <Typography variant="h5" fontWeight={950} sx={{ textAlign }}>{copy.ar ? 'مشاكل المالك' : 'Owner Pain Points'}</Typography>
                  </Stack>
                  <Stack spacing={2}>
                    {copy.ownerProblems.map((p) => (
                      <Stack key={p} direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start">
                        <Box sx={{ mt: 0.4, flexShrink: 0, color: '#EF4444' }}><Wrench size={16} /></Box>
                        <Typography sx={{ color: '#374151', fontWeight: 750, lineHeight: 1.6 }}>{p}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: radius.section, border: `1px solid ${line}`, height: '100%', bgcolor: '#fff' }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                    <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2 }}><Users size={22} color={gold} /></Box>
                    <Typography variant="h5" fontWeight={950} sx={{ textAlign }}>{copy.ar ? 'مشاكل المستأجر' : 'Tenant Pain Points'}</Typography>
                  </Stack>
                  <Stack spacing={2}>
                    {copy.tenantProblems.map((p) => (
                      <Stack key={p} direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="flex-start">
                        <Box sx={{ mt: 0.4, flexShrink: 0, color: '#EF4444' }}><Wrench size={16} /></Box>
                        <Typography sx={{ color: '#374151', fontWeight: 750, lineHeight: 1.6 }}>{p}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* What Owners Get */}
        <Box sx={{ py: 9, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 5, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
              <Box sx={{ p: 1.4, bgcolor: alpha(gold, 0.12), borderRadius: 2.5 }}><Building2 size={26} color={gold} /></Box>
              <Typography variant="h2" fontWeight={950}>{copy.ownerGetsTitle}</Typography>
            </Stack>
            <Grid container spacing={3}>
              {copy.ownerGets.map(([title, desc], i) => (
                <Grid item xs={12} sm={6} md={3} key={title}>
                  <Card sx={{ height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, boxShadow: '0 8px 24px rgba(17,24,39,.05)', transition: 'box-shadow .2s', '&:hover': { boxShadow: `0 16px 40px ${alpha(gold, 0.14)}` } }}>
                    <CardContent sx={{ p: 3, textAlign }}>
                      <Box sx={{ color: gold, mb: 2 }}>{OWNER_ICONS[i]}</Box>
                      <Typography variant="subtitle1" fontWeight={950} sx={{ color: ink, mb: 1 }}>{title}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75 }}>{desc}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* What Tenants Get */}
        <Box sx={{ py: 9, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 5, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
              <Box sx={{ p: 1.4, bgcolor: alpha(gold, 0.12), borderRadius: 2.5 }}><Users size={26} color={gold} /></Box>
              <Typography variant="h2" fontWeight={950}>{copy.tenantGetsTitle}</Typography>
            </Stack>
            <Grid container spacing={3} justifyContent="center">
              {copy.tenantGets.map(([title, desc], i) => (
                <Grid item xs={12} sm={6} md={4} key={title}>
                  <Paper sx={{ p: 3.5, height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: '#fff', boxShadow: '0 8px 24px rgba(17,24,39,.05)' }}>
                    <Stack spacing={1.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                      <Box sx={{ color: gold }}>{TENANT_ICONS[i]}</Box>
                      <Typography variant="subtitle1" fontWeight={950} sx={{ color: ink }}>{title}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75 }}>{desc}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Demo Reel */}
        <Box id="demo" sx={{ scrollMarginTop: 96, py: 9, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, border: `1px solid ${line}`, bgcolor: '#FFFFFF', boxShadow: '0 22px 60px rgba(17,24,39,.07)' }}>
              <Grid container spacing={4} alignItems="center">
                <Grid item xs={12} md={4}>
                  <Chip label={copy.navDemo} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .12), color: '#6F5522', fontWeight: 950, mb: 2 }} />
                  <Typography variant="h3" fontWeight={950} sx={{ color: ink, letterSpacing: '-0.03em', mb: 2, textAlign }}>{copy.demoTitle}</Typography>
                  <Typography sx={{ color: muted, lineHeight: 1.8, fontWeight: 750, textAlign }}>{copy.demoSubtitle}</Typography>
                  <Button onClick={() => navigate('/request-demo')} startIcon={<PlayCircle size={19} />} sx={{ mt: 3, borderRadius: radius.button, bgcolor: gold, color: '#111827', fontWeight: 950, px: 3, py: 1.3 }}>
                    {copy.navDemo}
                  </Button>
                </Grid>
                <Grid item xs={12} md={8}>
                  <Grid container spacing={2}>
                    {copy.demoScenes.map((scene, idx) => (
                      <Grid item xs={12} sm={6} key={scene[0]}>
                        <Paper sx={{ p: 2.4, height: '100%', minHeight: 120, borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: idx % 2 ? '#FFFFFF' : platinum }}>
                          <Stack direction="row" spacing={1.5} alignItems="flex-start">
                            <Box sx={{ color: gold, mt: 0.35, flexShrink: 0 }}>{DEMO_ICONS[idx]}</Box>
                            <Box>
                              <Typography fontWeight={950} sx={{ color: ink }}>{scene[0]}</Typography>
                              <Typography variant="body2" sx={{ color: muted, fontWeight: 700, lineHeight: 1.65, mt: 0.8 }}>{scene[1]}</Typography>
                            </Box>
                          </Stack>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Grid>
              </Grid>
            </Paper>
          </Container>
        </Box>

        {/* Trust */}
        <Box sx={{ py: 7, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Typography variant="h3" fontWeight={950} sx={{ textAlign: 'center', mb: 4 }}>{copy.trustTitle}</Typography>
            <Grid container spacing={2} justifyContent="center">
              {copy.trust.map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ p: 2.5, borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: platinum }}>
                    <CheckCircle2 size={20} color={gold} style={{ flexShrink: 0 }} />
                    <Typography sx={{ color: '#374151', fontWeight: 800 }}>{item}</Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        {/* Contact */}
        <Container maxWidth="lg" sx={{ py: 9 }}>
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, bgcolor: '#111827', color: '#fff', border: '1px solid rgba(212,175,55,.30)', boxShadow: '0 24px 70px rgba(17,24,39,.18)' }}>
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={5}>
                <Typography variant="h3" fontWeight={950} sx={{ color: gold, textAlign }}>{copy.contactTitle}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.68)', fontWeight: 800, mt: 1.5, lineHeight: 1.7, textAlign }}>{copy.footer}</Typography>
                <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ mt: 3, borderRadius: radius.button, bgcolor: gold, color: '#111827', fontWeight: 950, px: 3.5, py: 1.4 }}>
                  {copy.ctaStart}
                </Button>
              </Grid>
              <Grid item xs={12} md={7}>
                <Stack spacing={2.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Phone size={18} color={gold} /><Typography sx={{ color: '#FFF', fontWeight: 850 }}>{CONTACT.phone}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><MessageSquare size={18} color={gold} /><Typography sx={{ color: '#FFF', fontWeight: 850 }}>{CONTACT.whatsapp}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Mail size={18} color={gold} /><Typography sx={{ color: '#FFF', fontWeight: 850 }}>{CONTACT.email}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><MapPin size={18} color={gold} /><Typography sx={{ color: '#FFF', fontWeight: 850 }}>{copy.location}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Timer size={18} color={gold} /><Typography sx={{ color: '#FFF', fontWeight: 850 }}>Request → Quote → Contract → Verified Service Record</Typography></Stack>
                </Stack>
              </Grid>
            </Grid>
          </Paper>
        </Container>

      </Box>
    </Box>
  );
}
