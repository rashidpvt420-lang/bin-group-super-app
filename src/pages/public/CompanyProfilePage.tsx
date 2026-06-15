import React, { useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import {
  Award,
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
  Play,
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

    aboutTitle: ar ? 'من نحن' : 'About BIN GROUP',
    aboutSubtitle: ar
      ? 'شركة إماراتية مرخصة تتخذ من مدينة العين مقراً لها، تُقدم خدمات الصيانة وإدارة العقارات لأصحاب العقارات والمستأجرين عبر دولة الإمارات.'
      : 'A licensed UAE company headquartered in Al Ain, delivering property maintenance and management services to owners and tenants across the Emirates.',
    aboutStats: ar
      ? [
          ['2010', 'سنة التأسيس', 'جذور راسخة في العين'],
          ['+500', 'عقار مُدار', 'في مختلف إمارات الدولة'],
          ['5', 'مناطق خدمة', 'العين، أبوظبي، دبي، الشارقة، ورأس الخيمة'],
          ['100%', 'رقمي وموثق', 'لا ورق، لا وعود فارغة — إثبات فعلي فقط'],
        ]
      : [
          ['2010', 'Founded', 'Rooted in Al Ain, UAE'],
          ['+500', 'Properties Managed', 'Across the UAE Emirates'],
          ['5', 'Service Zones', 'Al Ain, Abu Dhabi, Dubai, Sharjah, RAK'],
          ['100%', 'Digital & Documented', 'No paper, no empty promises — verified proof only'],
        ],
    aboutLicense: ar
      ? 'الاسم القانوني: شركة All Kind Building Projects Contracting LLC S.P.C — مرخصة في إمارة أبوظبي — رقم الترخيص: متاح عند الطلب.'
      : 'Legal name: All Kind Building Projects Contracting LLC S.P.C — Licensed in Abu Dhabi, UAE — Trade Licence: Available on request.',

    demoVideoTitle: ar ? 'العرض التشغيلي الكامل' : 'Full Operations Demo',
    demoVideoSubtitle: ar
      ? 'شاهد BIN GROUP من البداية إلى النهاية: طلب المالك، إرسال الفني، الإثبات، العقد، والدفع.'
      : 'Watch BIN GROUP end-to-end: owner request, technician dispatch, proof, contract, and payment.',
    demoVideoBtn: ar ? 'احجز عرضاً مباشراً' : 'Book a Live Demo',
    demoVideoCta: ar ? 'تواصل لعرض مخصص' : 'Request a Personalised Demo',
  };
}

const YOUTUBE_DEMO_URL = 'https://www.youtube.com/embed/dQw4w9WgXcQ'; // Replace with real demo video ID

function TrustChip({ label }: { label: string }) {
  return <Chip label={label} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, 0.12), color: '#6F5522', border: `1px solid ${alpha(gold, 0.22)}`, fontWeight: 950 }} />;
}

function PropertyHeroVisual() {
  return (
    <Box sx={{ position: 'relative', borderRadius: 4, overflow: 'hidden', minHeight: { xs: 280, md: 400 }, bgcolor: '#111827', border: `1px solid ${alpha(gold, 0.3)}`, boxShadow: `0 32px 80px ${alpha(gold, 0.18)}` }}>
      {/* Background gradient */}
      <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0B0B0C 0%, #1a1a2e 40%, #16213e 100%)' }} />
      {/* Gold grid overlay */}
      <Box sx={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${alpha(gold, 0.04)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(gold, 0.04)} 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      {/* Building silhouettes */}
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        {/* Tall building left */}
        <Box sx={{ position: 'absolute', bottom: 0, left: '8%', width: 48, height: 200, bgcolor: alpha(gold, 0.18), borderRadius: '4px 4px 0 0', border: `1px solid ${alpha(gold, 0.25)}` }}>
          {[0,1,2,3,4,5,6,7].map(row => [0,1,2].map(col => (
            <Box key={`${row}-${col}`} sx={{ position: 'absolute', width: 8, height: 8, bgcolor: Math.random() > 0.4 ? alpha(gold, 0.7) : 'transparent', top: 16 + row * 22, left: 8 + col * 14, borderRadius: 0.5 }} />
          )))}
        </Box>
        {/* Wide tower center-left */}
        <Box sx={{ position: 'absolute', bottom: 0, left: '22%', width: 70, height: 260, bgcolor: alpha(gold, 0.22), borderRadius: '4px 4px 0 0', border: `1px solid ${alpha(gold, 0.3)}` }}>
          {[0,1,2,3,4,5,6,7,8,9].map(row => [0,1,2,3].map(col => (
            <Box key={`${row}-${col}`} sx={{ position: 'absolute', width: 10, height: 10, bgcolor: (row + col) % 3 === 0 ? alpha(gold, 0.8) : 'transparent', top: 16 + row * 24, left: 8 + col * 16, borderRadius: 0.5 }} />
          )))}
        </Box>
        {/* Main hero building center */}
        <Box sx={{ position: 'absolute', bottom: 0, left: '40%', width: 100, height: 320, bgcolor: alpha(gold, 0.28), borderRadius: '6px 6px 0 0', border: `1.5px solid ${alpha(gold, 0.5)}`, boxShadow: `0 0 40px ${alpha(gold, 0.15)}` }}>
          {[0,1,2,3,4,5,6,7,8,9,10,11].map(row => [0,1,2,3,4].map(col => (
            <Box key={`${row}-${col}`} sx={{ position: 'absolute', width: 12, height: 12, bgcolor: (row * col) % 4 === 0 ? alpha(gold, 0.9) : alpha(gold, 0.15), top: 20 + row * 26, left: 10 + col * 18, borderRadius: 0.5 }} />
          )))}
        </Box>
        {/* Mid tower right of center */}
        <Box sx={{ position: 'absolute', bottom: 0, left: '60%', width: 60, height: 230, bgcolor: alpha(gold, 0.16), borderRadius: '4px 4px 0 0', border: `1px solid ${alpha(gold, 0.22)}` }}>
          {[0,1,2,3,4,5,6,7,8].map(row => [0,1,2].map(col => (
            <Box key={`${row}-${col}`} sx={{ position: 'absolute', width: 10, height: 10, bgcolor: (row + col) % 2 === 0 ? alpha(gold, 0.6) : 'transparent', top: 16 + row * 24, left: 8 + col * 16, borderRadius: 0.5 }} />
          )))}
        </Box>
        {/* Far right building */}
        <Box sx={{ position: 'absolute', bottom: 0, right: '6%', width: 55, height: 180, bgcolor: alpha(gold, 0.14), borderRadius: '4px 4px 0 0', border: `1px solid ${alpha(gold, 0.2)}` }}>
          {[0,1,2,3,4,5,6].map(row => [0,1].map(col => (
            <Box key={`${row}-${col}`} sx={{ position: 'absolute', width: 10, height: 10, bgcolor: row % 2 === col % 2 ? alpha(gold, 0.5) : 'transparent', top: 14 + row * 22, left: 10 + col * 18, borderRadius: 0.5 }} />
          )))}
        </Box>
      </Box>
      {/* Ground line */}
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, bgcolor: alpha(gold, 0.4) }} />
      {/* Logo overlay */}
      <Box sx={{ position: 'absolute', top: 24, left: 24 }}>
        <Box component="img" src="/logo.png" sx={{ width: 56, height: 56, borderRadius: 2, boxShadow: `0 8px 24px ${alpha(gold, 0.3)}` }} />
      </Box>
      {/* Stats overlay */}
      <Box sx={{ position: 'absolute', top: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[['15+ Years', 'Est. 2010'], ['UAE Licensed', 'Al Ain HQ'], ['+500 Assets', 'Managed']].map(([v, l]) => (
          <Box key={v} sx={{ px: 2, py: 0.8, bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 1.5, border: `1px solid ${alpha(gold, 0.3)}`, backdropFilter: 'blur(8px)' }}>
            <Typography variant="caption" sx={{ color: gold, fontWeight: 950, display: 'block', lineHeight: 1.2 }}>{v}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', fontWeight: 700 }}>{l}</Typography>
          </Box>
        ))}
      </Box>
      {/* BIN GROUP label at bottom */}
      <Box sx={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center' }}>
        <Typography sx={{ color: alpha(gold, 0.8), fontWeight: 950, letterSpacing: 6, fontSize: '0.75rem', textTransform: 'uppercase' }}>BIN GROUP · AL AIN · UAE</Typography>
      </Box>
    </Box>
  );
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
  const [videoPlaying, setVideoPlaying] = useState(false);

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
                <PropertyHeroVisual />
              </Grid>
            </Grid>
          </Container>
        </Box>

        {/* About BIN GROUP */}
        <Box sx={{ py: 10, bgcolor: '#111827', borderBottom: `1px solid rgba(212,175,55,.20)` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 7 }}>
              <Chip label={copy.ar ? 'هويتنا' : 'WHO WE ARE'} sx={{ mb: 2, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 2 }}>{copy.aboutTitle}</Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.68)', fontWeight: 700, maxWidth: 760, mx: 'auto', lineHeight: 1.8 }}>{copy.aboutSubtitle}</Typography>
            </Box>

            {/* Stats row */}
            <Grid container spacing={3} sx={{ mb: 7 }}>
              {copy.aboutStats.map(([value, label, sub]) => (
                <Grid item xs={6} md={3} key={value}>
                  <Paper sx={{ p: 3.5, textAlign: 'center', borderRadius: 4, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.22)}`, height: '100%' }}>
                    <Typography variant="h3" fontWeight={950} sx={{ color: gold, mb: 0.5 }}>{value}</Typography>
                    <Typography fontWeight={950} sx={{ color: '#FFF', mb: 0.5 }}>{label}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>{sub}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>

            {/* Company story + mission + licence side by side */}
            <Grid container spacing={4} alignItems="stretch">
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 4, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.18)}` }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                    <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2 }}><Building2 color={gold} size={22} /></Box>
                    <Typography variant="h5" fontWeight={950} sx={{ color: gold, textAlign }}>
                      {copy.ar ? 'قصتنا' : 'Our Story'}
                    </Typography>
                  </Stack>
                  <Typography sx={{ color: 'rgba(255,255,255,.75)', fontWeight: 700, lineHeight: 2, textAlign }}>
                    {copy.ar
                      ? 'تأسست مجموعة BIN GROUP عام 2010 في مدينة العين، إمارة أبوظبي، بهدف واضح: تقديم خدمات صيانة وإدارة عقارات موثوقة ومُوثَّقة لأصحاب العقارات في الإمارات. بدأنا بمشاريع صيانة صغيرة وتطورنا إلى نظام تشغيل متكامل يضم مالكي العقارات، المستأجرين، الفنيين، والوسطاء في منصة رقمية واحدة.'
                      : 'BIN GROUP was founded in 2010 in Al Ain, Abu Dhabi Emirate, with a clear goal: deliver reliable, documented maintenance and property management services to UAE property owners. We started with local maintenance projects and grew into a full operating system connecting owners, tenants, technicians, and brokers in one digital platform.'}
                  </Typography>
                  <Box sx={{ mt: 3, p: 2.5, bgcolor: alpha(gold, 0.07), borderRadius: 3, border: `1px solid ${alpha(gold, 0.18)}` }}>
                    <Typography variant="caption" sx={{ color: gold, fontWeight: 950, display: 'block', mb: 1, letterSpacing: 1 }}>
                      {copy.ar ? 'السجل التجاري' : 'LEGAL IDENTITY'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.7)', fontWeight: 750, lineHeight: 1.8 }}>{copy.aboutLicense}</Typography>
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 4, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.18)}` }}>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                    <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2 }}><Sparkles color={gold} size={22} /></Box>
                    <Typography variant="h5" fontWeight={950} sx={{ color: gold, textAlign }}>{copy.missionTitle}</Typography>
                  </Stack>
                  <Typography sx={{ color: 'rgba(255,255,255,.78)', fontWeight: 700, lineHeight: 2, textAlign }}>{copy.mission}</Typography>
                  <Grid container spacing={2} sx={{ mt: 3 }}>
                    {[
                      { icon: <ShieldCheck size={18} />, label: copy.ar ? 'موثوقية تامة' : 'Full Accountability' },
                      { icon: <Camera size={18} />, label: copy.ar ? 'إثبات فعلي' : 'Verified Proof' },
                      { icon: <FileText size={18} />, label: copy.ar ? 'سجلات رقمية' : 'Digital Records' },
                      { icon: <Award size={18} />, label: copy.ar ? 'تميّز في الخدمة' : 'Service Excellence' },
                    ].map(({ icon, label }) => (
                      <Grid item xs={6} key={label}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, bgcolor: alpha(gold, 0.07), borderRadius: 2, border: `1px solid ${alpha(gold, 0.14)}` }}>
                          <Box sx={{ color: gold }}>{icon}</Box>
                          <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{label}</Typography>
                        </Stack>
                      </Grid>
                    ))}
                  </Grid>
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
        <Box id="demo" sx={{ scrollMarginTop: 96, py: 9, bgcolor: '#111827', borderBottom: `1px solid rgba(212,175,55,.20)` }}>
          <Container maxWidth="lg">
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Chip label={copy.ar ? 'العرض التوضيحي' : 'LIVE DEMO REEL'} sx={{ mb: 2, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}` }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 1.5 }}>{copy.demoVideoTitle}</Typography>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.62)', fontWeight: 700, maxWidth: 680, mx: 'auto' }}>{copy.demoVideoSubtitle}</Typography>
            </Box>

            {/* Video player */}
            <Box sx={{ position: 'relative', borderRadius: 4, overflow: 'hidden', mb: 6, boxShadow: `0 32px 80px rgba(0,0,0,.5)`, border: `1.5px solid ${alpha(gold, 0.35)}` }}>
              {!videoPlaying ? (
                <Box
                  onClick={() => setVideoPlaying(true)}
                  sx={{
                    position: 'relative', cursor: 'pointer', bgcolor: '#0B0B0C',
                    aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #0B0B0C 0%, #1a1a2e 60%, #0B0B0C 100%)',
                    '&:hover .play-overlay': { transform: 'scale(1.08)' },
                  }}
                >
                  {/* Background pattern */}
                  <Box sx={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${alpha(gold, 0.03)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(gold, 0.03)} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />
                  {/* App mockup cards */}
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexWrap: 'wrap', px: 4, opacity: 0.4 }}>
                    {['Owner Dashboard', 'Tenant Requests', 'Tech Dispatch', 'Evidence Vault', 'Contracts & Pay'].map((label, i) => (
                      <Box key={label} sx={{ px: 2.5, py: 1.5, bgcolor: alpha(gold, 0.1), border: `1px solid ${alpha(gold, 0.25)}`, borderRadius: 2 }}>
                        <Typography sx={{ color: gold, fontWeight: 950, fontSize: '0.75rem' }}>{label}</Typography>
                      </Box>
                    ))}
                  </Box>
                  {/* BIN GROUP watermark */}
                  <Box sx={{ position: 'absolute', top: 20, left: 20, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box component="img" src="/logo.png" sx={{ width: 44, height: 44, borderRadius: 1.5, boxShadow: `0 8px 20px ${alpha(gold, 0.3)}` }} />
                    <Box>
                      <Typography sx={{ color: gold, fontWeight: 950, fontSize: '0.85rem', lineHeight: 1 }}>BIN GROUP</Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: '0.65rem', fontWeight: 700 }}>SUPER APP · UAE</Typography>
                    </Box>
                  </Box>
                  {/* Play button */}
                  <Box className="play-overlay" sx={{ position: 'relative', zIndex: 2, width: 88, height: 88, borderRadius: '50%', bgcolor: gold, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 16px 48px ${alpha(gold, 0.5)}`, transition: 'transform .2s', flexShrink: 0 }}>
                    <Play size={36} color="#111827" fill="#111827" style={{ marginLeft: 4 }} />
                  </Box>
                  <Box sx={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center' }}>
                    <Typography sx={{ color: 'rgba(255,255,255,.5)', fontWeight: 800, fontSize: '0.8rem', letterSpacing: 2 }}>
                      {copy.ar ? 'انقر لمشاهدة العرض الكامل' : 'CLICK TO WATCH THE FULL DEMO'}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ aspectRatio: '16/9', bgcolor: '#000' }}>
                  <iframe
                    width="100%"
                    height="100%"
                    src={`${YOUTUBE_DEMO_URL}?autoplay=1&rel=0&modestbranding=1`}
                    title="BIN GROUP Demo"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ display: 'block', width: '100%', aspectRatio: '16/9' }}
                  />
                </Box>
              )}
            </Box>

            {/* CTA below video */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mb: 8 }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayCircle size={20} />}
                onClick={() => window.open(`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(copy.ar ? 'مرحباً، أرغب في حجز عرض تشغيلي مباشر لتطبيق BIN GROUP.' : 'Hello, I would like to book a live demo of BIN GROUP.')}`, '_blank')}
                sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, px: 4, py: 1.6, borderRadius: 3 }}
              >
                {copy.demoVideoBtn}
              </Button>
              <Button
                variant="outlined"
                size="large"
                startIcon={<MessageSquare size={20} />}
                onClick={() => navigate('/onboarding')}
                sx={{ borderColor: alpha(gold, 0.5), color: gold, fontWeight: 950, px: 4, py: 1.6, borderRadius: 3 }}
              >
                {copy.demoVideoCta}
              </Button>
            </Stack>

            {/* Demo scenes */}
            <Typography variant="h5" fontWeight={950} sx={{ color: '#FFF', mb: 3, textAlign: 'center' }}>{copy.demoTitle}</Typography>
            <Grid container spacing={2}>
              {copy.demoScenes.map((scene, idx) => (
                <Grid item xs={12} sm={6} md={4} key={scene[0]}>
                  <Paper sx={{ p: 2.5, height: '100%', borderRadius: 3, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.16)}` }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ color: gold, mt: 0.35, flexShrink: 0, p: 1, bgcolor: alpha(gold, 0.1), borderRadius: 1.5 }}>{DEMO_ICONS[idx]}</Box>
                      <Box>
                        <Typography fontWeight={950} sx={{ color: '#FFF' }}>{scene[0]}</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', fontWeight: 700, lineHeight: 1.65, mt: 0.8 }}>{scene[1]}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
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
