import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, Building2, CheckCircle2, Globe, Home, LogIn, Mail, MapPin, MessageSquare, Phone, ShieldCheck, Sparkles, UserRound, Users, Wrench, Zap, Award, Briefcase, Camera, Workflow, WalletCards, Bot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'ceo@bin-groups.com' };
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const ink = '#111827';
const line = '#E8E3D7';
const muted = '#667085';

const serviceAreas = ['Al Ain', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

type CompanyContent = {
  stats: [string, string][];
  whyUsTitle: string;
  whyUsSubtitle: string;
  whyUs: [string, string][];
  proofTitle: string;
  proofItems: string[];
  flowTitle: string;
  flow: string[];
  sections: { trust: string; coverage: string; contact: string; services: string };
  services: [string, string][];
  contactText: string;
  ctaStart: string;
  ctaWhatsApp: string;
  ctaEmail: string;
  location: string;
};

const companyContent: Record<'en' | 'ar', CompanyContent> = {
  en: {
    stats: [['1 min', 'To understand'], ['5', 'Connected profiles'], ['8', 'UAE emirates'], ['Proof', 'Photos · GPS · Time']],
    whyUsTitle: 'Why owners and tenants choose BIN GROUP',
    whyUsSubtitle: 'Not a call centre. Not a stack of WhatsApp threads. One licensed company that gives you direct access to your own property.',
    whyUs: [
      ['Full access, no middleman', 'Owners get a live login to their own property — costs, contracts, tickets, and history — instead of waiting on a manager to report back.'],
      ['Dispatch, not dispatch-and-pray', 'Maintenance jobs go to a technician with GPS-tracked job status, so owners and tenants both see exactly where the job stands.'],
      ['Proof before payment', 'Technicians upload before/after photos on every job. Owners and tenants see the same evidence before any cost is approved.'],
      ['Built bilingual from day one', 'Every owner, tenant, technician, and broker screen works in English and Arabic — not translated after the fact.'],
    ],
    proofTitle: 'Why people trust it fast',
    proofItems: ['Licensed UAE company', 'Clear service flow', 'Operations verification', 'Photos for proof', 'GPS/location context', 'Time-stamped records', 'Tenant approval or dispute', 'Owner cost visibility', 'Broker attribution', 'English and Arabic support'],
    flowTitle: 'The simple operating flow',
    flow: ['Onboard', 'Verify', 'Report', 'Resolve', 'Approve'],
    sections: { trust: 'Trust Proof', coverage: 'Service Areas', contact: 'Start With BIN GROUP', services: 'What We Do' },
    services: [
      ['Maintenance', 'Service requests become tracked tickets instead of lost phone calls — every job assigned, dispatched, and closed with photo proof.'],
      ['Property Management', 'Owners see property status, costs, reports, tenant records, and service history clearly, from one login, on demand.'],
      ['Technician Work', 'Field work is connected to job status, GPS location context, and before/after proof on every visit.'],
      ['Broker Growth', 'Property leads, attribution, contracts, and commission progress stay visible and organized, from first lead to verified deal.'],
      ['Operations Control', 'Approvals, payment verification, SLA breach control, documents, and audit logs stay controlled behind the scenes.'],
      ['AI Concierge & Design Studio', 'Residents describe the issue and the app helps classify the request; an AI design studio turns a room photo into renovation concepts.'],
      ['Property Passport', 'Each property keeps its contracts, tickets, evidence, invoices, inspections, and history together — built for the day you sell, renew, or hand it over.'],
    ],
    contactText: 'Start with one property, one tenant request, one broker lead, or one maintenance contract. BIN GROUP keeps the process clear from the first click.',
    ctaStart: 'Partner With Us / Onboard Property',
    ctaWhatsApp: 'WhatsApp BIN GROUP',
    ctaEmail: 'Email Us',
    location: 'Al Ain, United Arab Emirates',
  },
  ar: {
    stats: [['دقيقة', 'للفهم'], ['5', 'ملفات مترابطة'], ['8', 'إمارات'], ['إثبات', 'صور · موقع · وقت']],
    whyUsTitle: 'لماذا يختار الملاك والمستأجرون BIN GROUP',
    whyUsSubtitle: 'لسنا مركز اتصال، ولسنا سلسلة محادثات واتساب متفرقة. شركة مرخصة واحدة تعطيك دخولاً مباشراً لعقارك.',
    whyUs: [
      ['دخول كامل، بدون وسيط', 'يحصل المالك على بوابة دخول مباشرة لعقاره — التكاليف والعقود والتذاكر والتاريخ — بدلاً من انتظار مدير يرفع له تقريراً.'],
      ['إرسال فني موثّق، لا إرسال بلا تتبع', 'تذهب طلبات الصيانة لفني مع تتبع حالة العمل عبر GPS، فيرى المالك والمستأجر بدقة أين أصبح العمل.'],
      ['إثبات قبل الدفع', 'يرفع الفنيون صور قبل/بعد في كل عمل. يرى المالك والمستأجر نفس الإثبات قبل الموافقة على أي تكلفة.'],
      ['ثنائي اللغة من اليوم الأول', 'كل شاشة للمالك والمستأجر والفني والوسيط تعمل بالعربية والإنجليزية — وليست مترجمة لاحقاً.'],
    ],
    proofTitle: 'لماذا يثق الناس به بسرعة',
    proofItems: ['شركة مرخصة في الإمارات', 'مسار خدمة واضح', 'تحقق العمليات', 'صور إثبات', 'سياق موقع GPS', 'سجلات بالوقت', 'موافقة أو اعتراض المستأجر', 'وضوح تكلفة المالك', 'تتبع مصدر الوسيط', 'دعم عربي وإنجليزي'],
    flowTitle: 'مسار التشغيل ببساطة',
    flow: ['تسجيل', 'تحقق', 'بلاغ', 'تنفيذ', 'موافقة'],
    sections: { trust: 'إثبات الثقة', coverage: 'مناطق الخدمة', contact: 'ابدأ مع BIN GROUP', services: 'ماذا نقدم' },
    services: [
      ['الصيانة', 'طلبات الخدمة تصبح تذاكر متتبعة بدل مكالمات ضائعة — كل عمل يُسند ويُرسل ويُغلق بصورة إثبات.'],
      ['إدارة العقار', 'المالك يرى حالة العقار والتكلفة والتقارير وسجل المستأجرين والخدمة بوضوح، من دخول واحد، في أي وقت.'],
      ['عمل الفني', 'العمل الميداني مرتبط بالحالة وسياق موقع GPS وصور قبل/بعد في كل زيارة.'],
      ['نمو الوسيط', 'الفرص ومصدر الإحالة والعقود والعمولات تبقى واضحة ومنظمة، من أول فرصة حتى تأكيد الصفقة.'],
      ['تحكم العمليات', 'الموافقات والتحقق من المدفوعات ومخالفات SLA والوثائق وسجلات التدقيق تتم خلف الكواليس.'],
      ['المساعد الذكي واستوديو التصميم', 'يشرح المستأجر المشكلة فيساعد التطبيق في تصنيف الطلب؛ واستوديو تصميم بالذكاء الاصطناعي يحوّل صورة الغرفة إلى أفكار تجديد.'],
      ['جواز العقار', 'كل عقار يحتفظ بالعقود والتذاكر والإثبات والفواتير والفحوصات والتاريخ في مكان واحد — جاهز ليوم البيع أو التجديد أو التسليم.'],
    ],
    contactText: 'ابدأ بعقار واحد، طلب مستأجر واحد، فرصة وسيط واحدة، أو عقد صيانة واحد. BIN GROUP تجعل العملية واضحة من أول ضغطة.',
    ctaStart: 'ابدأ بتسجيل عقارك',
    ctaWhatsApp: 'واتساب BIN GROUP',
    ctaEmail: 'راسلنا',
    location: 'العين، الإمارات العربية المتحدة',
  },
};

type StartCard = {
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  pointsEn: string[];
  pointsAr: string[];
  path: string;
  icon: React.ElementType;
  ctaEn: string;
  ctaAr: string;
  secondaryCtaEn?: string;
  secondaryCtaAr?: string;
  secondaryPath?: string;
};

const cards: StartCard[] = [
  {
    titleEn: 'I am a Tenant',
    titleAr: 'أنا مستأجر',
    subtitleEn: 'Report an issue, check payments, documents, emergency help, and move-in/move-out evidence.',
    subtitleAr: 'أبلغ عن مشكلة، راجع المدفوعات والمستندات والطوارئ وتسليم الوحدة.',
    pointsEn: ['Report maintenance', 'Emergency help', 'Payments & documents', 'Move-in / move-out'],
    pointsAr: ['بلاغ صيانة', 'مساعدة طارئة', 'مدفوعات ومستندات', 'تسليم الوحدة'],
    path: '/login?intendedRole=tenant',
    icon: UserRound,
    ctaEn: 'Open Tenant Portal',
    ctaAr: 'فتح بوابة المستأجر',
  },
  {
    titleEn: 'I am a Landlord / Owner',
    titleAr: 'أنا مالك',
    subtitleEn: 'See properties, contracts, rent, payments, maintenance proof, handover, and approvals.',
    subtitleAr: 'راجع العقارات والعقود والإيجار والمدفوعات وإثبات الصيانة والتسليم والموافقات.',
    pointsEn: ['Property passport', 'Payments & contracts', 'Maintenance proof', 'Approvals & handover'],
    pointsAr: ['جواز العقار', 'مدفوعات وعقود', 'إثبات الصيانة', 'موافقات وتسليم'],
    path: '/login?intendedRole=owner',
    icon: Home,
    ctaEn: 'Open Owner Portal',
    ctaAr: 'فتح بوابة المالك',
    secondaryCtaEn: 'Add New Property & Start Contract',
    secondaryCtaAr: 'إضافة عقار جديد وبدء العقد',
    secondaryPath: '/onboarding'
  },
  {
    titleEn: 'I am a Real Estate Broker',
    titleAr: 'أنا وسيط عقاري',
    subtitleEn: 'Bring owner leads, tenant contracts, referral proof, documents, and commission tracking.',
    subtitleAr: 'أضف ملاكاً أو مستأجرين مع إثبات الإحالة والمستندات وتتبع العمولة.',
    pointsEn: ['New referrals', 'Lead attribution', 'Documents', 'Commissions'],
    pointsAr: ['إحالات جديدة', 'إثبات مصدر الصفقة', 'مستندات', 'عمولات'],
    path: '/login?intendedRole=broker',
    icon: Building2,
    ctaEn: 'Open Broker Portal',
    ctaAr: 'فتح بوابة الوسيط',
  },
  {
    titleEn: 'I am a Technician',
    titleAr: 'أنا فني',
    subtitleEn: 'See jobs, map, proof readiness, offline queue, support, and job history.',
    subtitleAr: 'راجع المهام والخريطة وجاهزية الإثبات وقائمة دون اتصال والدعم وسجل العمل.',
    pointsEn: ['Jobs', 'Live map', 'Proof photos', 'Offline queue'],
    pointsAr: ['المهام', 'الخريطة', 'صور الإثبات', 'قائمة دون اتصال'],
    path: '/login?intendedRole=technician',
    icon: Wrench,
    ctaEn: 'Open Technician Portal',
    ctaAr: 'فتح بوابة الفني',
  },
];

function FeatureCard({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <Paper sx={{ p: 3, height: '100%', borderRadius: 3, border: `1px solid ${line}`, boxShadow: '0 14px 36px rgba(17,24,39,.05)' }}>
      <Stack spacing={1.3}>
        <Box sx={{ p: 1.1, borderRadius: 2, bgcolor: alpha(gold, .12), color: gold, width: 44, height: 44, display: 'grid', placeItems: 'center' }}>
          {icon}
        </Box>
        <Typography fontWeight={950} color={ink}>{title}</Typography>
        <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75, fontWeight: 650 }}>{body}</Typography>
      </Stack>
    </Paper>
  );
}

function Checklist({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <Grid container spacing={1.4}>
      {items.map((item) => (
        <Grid item xs={12} sm={6} md={2.4} key={item}>
          <Stack direction="row" spacing={1.1} alignItems="center" sx={{ p: 2, height: '100%', borderRadius: 2.5, bgcolor: dark ? 'rgba(255,255,255,.045)' : '#fff', border: `1px solid ${dark ? alpha(gold, .16) : line}` }}>
            <CheckCircle2 size={18} color={gold} />
            <Typography sx={{ color: dark ? 'rgba(255,255,255,.78)' : '#374151', fontWeight: 850, lineHeight: 1.45 }}>{item}</Typography>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}

function Section({ chip, title, children, dark = false, subtitle }: { chip: string; title: string; children: React.ReactNode; dark?: boolean; subtitle?: string }) {
  return (
    <Box sx={{ py: 8, bgcolor: dark ? '#111827' : '#fff', borderBottom: `1px solid ${dark ? alpha(gold, .18) : line}` }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Chip label={chip} sx={{ mb: 2, bgcolor: alpha(gold, dark ? .13 : .1), color: dark ? gold : '#6F5522', fontWeight: 950, border: `1px solid ${alpha(gold, .25)}` }} />
          <Typography variant="h2" fontWeight={950} sx={{ color: dark ? '#fff' : ink }}>{title}</Typography>
          {subtitle && <Typography variant="h6" sx={{ mt: 1.5, color: dark ? 'rgba(255,255,255,.62)' : muted, maxWidth: 830, mx: 'auto', lineHeight: 1.8, fontWeight: 700 }}>{subtitle}</Typography>}
        </Box>
        {children}
      </Container>
    </Box>
  );
}

export default function SimpleStartPage() {
  const navigate = useNavigate();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const c = companyContent[ar ? 'ar' : 'en'];
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');

  const serviceIcons = [<Wrench size={22} />, <Building2 size={22} />, <Zap size={22} />, <Briefcase size={22} />, <CheckCircle2 size={22} />, <Sparkles size={22} />, <Award size={22} />];
  const whyUsIcons = [<ShieldCheck size={22} />, <MapPin size={22} />, <CheckCircle2 size={22} />, <Globe size={22} />];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: '#111827', direction: isRTL ? 'rtl' : 'ltr' }}>
      
      {/* 1. Header & Role Selection */}
      <Box sx={{ py: { xs: 4, md: 7 }, borderBottom: `1px solid ${line}` }}>
        <Container maxWidth="lg">
          <Stack spacing={4}>
            {/* Top Banner */}
            <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, background: `linear-gradient(135deg, ${alpha(binThemeTokens.gold, 0.11)}, #FFFFFF)`, boxShadow: '0 22px 56px rgba(17,24,39,0.08)' }}>
              <Stack spacing={2} alignItems="flex-start">
                <Chip icon={<ShieldCheck size={16} />} label={ar ? 'BIN GROUP · إدارة العقارات والصيانة' : 'BIN GROUP · Property Management & Maintenance'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.15), color: binThemeTokens.goldHover, fontWeight: 950 }} />
                <Typography variant="h2" sx={{ color: '#111827', fontWeight: 950, letterSpacing: -1.2, lineHeight: 1.08, maxWidth: 860 }}>
                  {ar ? 'كيف تريد أن نساعدك اليوم؟' : 'How can we help you today?'}
                </Typography>
                <Typography sx={{ color: '#667085', fontWeight: 750, lineHeight: 1.8, maxWidth: 820 }}>
                  {ar
                    ? 'اختر دورك أولاً. سنعرض لك الخيارات المناسبة فقط حتى لا تضيع داخل التطبيق.'
                    : 'Choose your role first. We will show only the options you need, so anyone can use the app without getting lost.'}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={ar ? 'بدون اتصالات متكررة' : 'No-call workflow'} />
                  <Chip label={ar ? 'إثبات بالصور' : 'Photo proof'} />
                  <Chip label={ar ? 'تتبع مباشر' : 'Live tracking'} />
                  <Chip label={ar ? 'عقود ومدفوعات' : 'Contracts & payments'} />
                </Stack>
              </Stack>
            </Paper>

            {/* Role Cards */}
            <Grid container spacing={2.5}>
              {cards.map((card) => (
                <Grid item xs={12} md={6} key={card.titleEn}>
                  <Paper sx={{ p: 3, height: '100%', borderRadius: 5, border: '1px solid #E5E7EB', boxShadow: '0 16px 42px rgba(17,24,39,0.05)', display: 'flex', flexDirection: 'column' }}>
                    <Stack spacing={2} sx={{ flexGrow: 1 }}>
                      <Box sx={{ width: 52, height: 52, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.goldHover }}>
                        <SafeIcon icon={card.icon} size={25} />
                      </Box>
                      <Typography variant="h5" sx={{ color: '#111827', fontWeight: 950 }}>{ar ? card.titleAr : card.titleEn}</Typography>
                      <Typography sx={{ color: '#667085', fontWeight: 700, lineHeight: 1.7 }}>{ar ? card.subtitleAr : card.subtitleEn}</Typography>
                      <Grid container spacing={1}>
                        {(ar ? card.pointsAr : card.pointsEn).map((point) => (
                          <Grid item xs={6} key={point}>
                            <Typography variant="caption" sx={{ display: 'block', p: 1, borderRadius: 2, bgcolor: '#F8F9FB', color: '#475467', fontWeight: 850 }}>• {point}</Typography>
                          </Grid>
                        ))}
                      </Grid>
                    </Stack>
                    <Stack spacing={1.5} sx={{ mt: 3 }}>
                      {card.secondaryCtaEn && card.secondaryPath && (
                        <Button fullWidth variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(card.secondaryPath!)} sx={{ bgcolor: '#111827', color: gold, fontWeight: 950, borderRadius: 3, py: 1.25 }}>
                          {ar ? card.secondaryCtaAr : card.secondaryCtaEn}
                        </Button>
                      )}
                      <Button fullWidth variant={card.secondaryCtaEn ? "outlined" : "contained"} endIcon={<ArrowRight size={16} />} onClick={() => navigate(card.path)} sx={
                        card.secondaryCtaEn 
                        ? { borderColor: alpha(gold, 0.5), color: gold, fontWeight: 950, borderRadius: 3, py: 1.25, '&:hover': { bgcolor: alpha(gold, 0.05) } }
                        : { bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, borderRadius: 3, py: 1.25 }
                      }>
                        {ar ? card.ctaAr : card.ctaEn}
                      </Button>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Container>
      </Box>

      {/* 2. Company Profile Sections */}

      <Box sx={{ background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)', py: { xs: 6, md: 8 }, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <Container maxWidth="lg">
          <Stack spacing={4} alignItems="center">
            <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, maxWidth: 920, lineHeight: 1.45 }}>
              {ar ? 'طبقة الوصول لإدارة وتشغيل العقارات في الإمارات للملاك والمستأجرين والفنيين والوسطاء والإدارة.' : 'The UAE property operations access layer for owners, tenants, technicians, brokers, and admin.'}
            </Typography>
            <Grid container spacing={2} justifyContent="center" sx={{ maxWidth: 820 }}>
              {c.stats.map(([v, l]) => (
                <Grid item xs={6} sm={3} key={`${v}-${l}`}>
                  <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .18)}`, borderRadius: 3 }}>
                    <Typography sx={{ color: gold, fontWeight: 950, fontSize: '1.7rem' }}>{v}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,.62)', fontWeight: 850 }}>{l}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Container>
      </Box>

      <Section chip={c.sections.services} title={c.sections.services}>
        <Grid container spacing={3}>
          {c.services.map(([title, body], i) => (
            <Grid item xs={12} sm={6} md={4} key={title}>
              <FeatureCard title={title} body={body} icon={serviceIcons[i]} />
            </Grid>
          ))}
        </Grid>
      </Section>

      <Section dark chip={ar ? 'لماذا نحن' : 'WHY US'} title={c.whyUsTitle} subtitle={c.whyUsSubtitle}>
        <Grid container spacing={3}>
          {c.whyUs.map(([title, body], i) => (
            <Grid item xs={12} sm={6} md={3} key={title}>
              <FeatureCard title={title} body={body} icon={whyUsIcons[i]} />
            </Grid>
          ))}
        </Grid>
      </Section>

      <Section chip={c.sections.trust} title={c.proofTitle}>
        <Checklist items={c.proofItems} />
      </Section>

      <Section dark chip={c.flowTitle} title={c.flowTitle}>
        <Grid container spacing={2}>
          {c.flow.map((step, i) => (
            <Grid item xs={6} md={2.4} key={step}>
              <Paper sx={{ p: 3, textAlign: 'center', borderRadius: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .2)}` }}>
                <Typography sx={{ color: alpha(gold, .8), fontWeight: 950, fontSize: '.85rem' }}>0{i + 1}</Typography>
                <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', mt: 1 }}>{step}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Section>

      <Section chip={c.sections.coverage} title={c.sections.coverage}>
        <Stack direction="row" flexWrap="wrap" justifyContent="center" sx={{ gap: 1.5 }}>
          {serviceAreas.map(area => (
            <Box key={area} sx={{ px: 3, py: 1.2, bgcolor: '#fff', border: `1.5px solid ${alpha(gold, .28)}`, borderRadius: 2.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <MapPin size={14} color={gold} />
                <Typography sx={{ color: ink, fontWeight: 850 }}>{area}</Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Section>

      <Box sx={{ py: 10, background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)' }}>
        <Container maxWidth="md">
          <Stack spacing={4} alignItems="center" textAlign="center">
            <Chip label={c.sections.contact} sx={{ bgcolor: alpha(gold, .12), color: gold, fontWeight: 950 }} />
            <Typography variant="h2" fontWeight={950} sx={{ color: gold }}>{c.sections.contact}</Typography>
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.7)', maxWidth: 650 }}>{c.contactText}</Typography>
            <Grid container spacing={2}>
              {[
                [<Phone size={22} />, 'Phone', CONTACT.phone, `tel:${CONTACT.phone}`],
                [<MessageSquare size={22} />, 'WhatsApp', CONTACT.whatsapp, `https://wa.me/${whatsappDigits}`],
                [<Mail size={22} />, 'Email', CONTACT.email, `mailto:${CONTACT.email}`],
                [<MapPin size={22} />, 'Location', c.location, '']
              ].map(([icon, label, value, href]: any) => (
                <Grid item xs={12} sm={6} key={label}>
                  <Paper component={href ? 'a' : 'div'} href={href || undefined} target={href?.startsWith('http') ? '_blank' : undefined} sx={{ p: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .22)}`, borderRadius: 3, display: 'block', textDecoration: 'none' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ color: gold }}>{icon}</Box>
                      <Box textAlign="left">
                        <Typography variant="caption" sx={{ color: alpha(gold, .7), fontWeight: 900 }}>{label}</Typography>
                        <Typography sx={{ color: '#fff', fontWeight: 850 }}>{value}</Typography>
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
              <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>{c.ctaStart}</Button>
              <Button variant="outlined" onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ borderColor: alpha(gold, .45), color: gold, fontWeight: 950 }}>{c.ctaWhatsApp}</Button>
              <Button variant="outlined" onClick={() => window.open(`mailto:${CONTACT.email}`, '_blank')} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.22)', fontWeight: 950 }}>{c.ctaEmail}</Button>
            </Stack>
            
            {/* Minimal Footer Links */}
            <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent="center" sx={{ mt: 6 }}>
              <Button onClick={() => navigate('/support')} sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'الدعم' : 'Support'}</Button>
              <Button onClick={() => navigate('/privacy')} sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'الخصوصية' : 'Privacy'}</Button>
              <Button onClick={() => navigate('/terms')} sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'الشروط' : 'Terms'}</Button>
              <Button onClick={() => navigate('/login?intendedRole=admin')} sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'دخول الإدارة' : 'Admin Login'}</Button>
            </Stack>

          </Stack>
        </Container>
      </Box>

    </Box>
  );
}
