import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, BadgeCheck, Building2, Camera, Clock, FileText, Globe, Home, Mail, MapPin, MessageSquare, Phone, Receipt, Search, ShieldCheck, Smartphone, Sparkles, UserRound, Wrench } from 'lucide-react';
import { emitFabEvent } from '../../components/ui/unifiedFab';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'ceo@bin-groups.com' };
const BRAND = 'BIN-GROUPS';
const gold = binThemeTokens.gold;
const goldText = '#7A5C12';
const ink = '#111827';
const line = '#E8E3D7';
// Body text darkened from #667085 for stronger AA contrast on white and the pale gold hero.
const body = '#374151';

const serviceAreasEn = ['Al Ain', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];
const serviceAreasAr = ['العين', 'أبوظبي', 'دبي', 'الشارقة', 'عجمان', 'رأس الخيمة', 'الفجيرة', 'أم القيوين'];

type PageContent = {
  badge: string;
  heading: string;
  subline: string;
  getStarted: string;
  registerProperty: string;
  whatsappUs: string;
  trustLabel: string;
  trust: string[];
  uaePass: string;
  uaePassAria: string;
  whyTitle: string;
  why: [string, string][];
  rolesTitle: string;
  rolesSubtitle: string;
  coverage: string;
  appBadge: string;
  appTitle: string;
  appBody: string;
  appCta: string;
  contactTitle: string;
  contactText: string;
  ctaStart: string;
  ctaWhatsApp: string;
  ctaEmail: string;
  location: string;
  askAi: string;
  askAiAria: string;
};

const content: Record<'en' | 'ar', PageContent> = {
  en: {
    badge: 'BIN-GROUPS · Property Maintenance & Management',
    heading: 'Property maintenance & management across the UAE',
    subline: 'Licensed, verified technicians. Fixed prices, photo proof on every job, and you can track it all in one app.',
    getStarted: 'Get started',
    registerProperty: 'Register your property',
    whatsappUs: 'WhatsApp us',
    trustLabel: 'Why you can trust us',
    trust: ['Licensed in Abu Dhabi', 'CASH and CHEQUE only, receipt every time', 'Response targets from 1 hour', 'Arabic & English'],
    uaePass: 'UAE PASS — coming soon',
    uaePassAria: 'UAE PASS sign-in is coming soon and is not available yet',
    whyTitle: 'Why BIN-GROUPS',
    why: [
      ['No surprises', 'A written contract with a clear scope. Any job above AED 1,000 needs the owner’s approval first.'],
      ['You see everything', 'Before and after photo proof on every job, and live job status in the app.'],
      ['Fast response', 'Emergency response target of 1 hour.'],
      ['Protected payments', 'Every payment is verified and receipted.'],
    ],
    rolesTitle: 'Choose how you use BIN-GROUPS',
    rolesSubtitle: 'Pick one option. We only show what you need.',
    coverage: 'Service Areas',
    appBadge: 'Mobile app',
    appTitle: 'BIN-GROUPS Super App',
    appBody: 'BIN-GROUPS works in your web browser today. For help with the BIN-GROUPS mobile app, contact us.',
    appCta: 'Ask about the mobile app',
    contactTitle: 'Start With BIN-GROUPS',
    contactText: 'Start with one property, one tenant request, one broker lead, or one maintenance contract. BIN-GROUPS keeps the process clear from the first click.',
    ctaStart: 'Partner With Us / Onboard Property',
    ctaWhatsApp: 'WhatsApp BIN-GROUPS',
    ctaEmail: 'Email Us',
    location: 'Al Ain, United Arab Emirates',
    askAi: 'Ask AI',
    askAiAria: 'Open BIN AI assistant',
  },
  ar: {
    badge: 'BIN-GROUPS · صيانة وإدارة العقارات',
    heading: 'صيانة وإدارة العقارات في جميع أنحاء الإمارات',
    subline: 'فنيون مرخصون وموثّقون. أسعار ثابتة، وصور إثبات لكل عمل، وتتابع كل شيء من تطبيق واحد.',
    getStarted: 'ابدأ الآن',
    registerProperty: 'سجّل عقارك',
    whatsappUs: 'راسلنا على واتساب',
    trustLabel: 'لماذا تثق بنا',
    trust: ['مرخصة في أبوظبي', 'نقداً أو بشيك فقط، مع إيصال في كل مرة', 'أهداف استجابة تبدأ من ساعة واحدة', 'العربية والإنجليزية'],
    uaePass: 'الهوية الرقمية UAE PASS — قريباً',
    uaePassAria: 'تسجيل الدخول عبر الهوية الرقمية UAE PASS قريباً وغير متاح حالياً',
    whyTitle: 'لماذا BIN-GROUPS',
    why: [
      ['بدون مفاجآت', 'عقد مكتوب بنطاق واضح. أي عمل تزيد قيمته عن 1,000 درهم يحتاج موافقة المالك أولاً.'],
      ['ترى كل شيء', 'صور إثبات قبل وبعد لكل عمل، وحالة العمل مباشرة في التطبيق.'],
      ['استجابة سريعة', 'هدف الاستجابة للطوارئ خلال ساعة واحدة.'],
      ['مدفوعات محمية', 'كل دفعة يتم التحقق منها ويصدر لها إيصال.'],
    ],
    rolesTitle: 'اختر طريقة استخدامك لـ BIN-GROUPS',
    rolesSubtitle: 'اختر خياراً واحداً، وسنعرض لك ما تحتاجه فقط.',
    coverage: 'مناطق الخدمة',
    appBadge: 'تطبيق الجوال',
    appTitle: 'تطبيق BIN-GROUPS',
    appBody: 'تعمل BIN-GROUPS اليوم من متصفح الويب. للمساعدة بخصوص تطبيق BIN-GROUPS للجوال، تواصل معنا.',
    appCta: 'اسأل عن تطبيق الجوال',
    contactTitle: 'ابدأ مع BIN-GROUPS',
    contactText: 'ابدأ بعقار واحد، طلب مستأجر واحد، فرصة وسيط واحدة، أو عقد صيانة واحد. BIN-GROUPS تجعل العملية واضحة من أول ضغطة.',
    ctaStart: 'ابدأ بتسجيل عقارك',
    ctaWhatsApp: 'واتساب BIN-GROUPS',
    ctaEmail: 'راسلنا',
    location: 'العين، الإمارات العربية المتحدة',
    askAi: 'اسأل المساعد',
    askAiAria: 'افتح مساعد BIN الذكي',
  },
};

type RoleCard = {
  titleEn: string;
  titleAr: string;
  sentenceEn: string;
  sentenceAr: string;
  path: string;
  icon: React.ElementType;
  ctaEn: string;
  ctaAr: string;
  publicCtaEn?: string;
  publicCtaAr?: string;
  publicPath?: string;
};

// One plain sentence and one button per role.
const cards: RoleCard[] = [
  {
    titleEn: 'Looking for a home',
    titleAr: 'تبحث عن منزل',
    sentenceEn: 'Browse verified rooms, apartments and villas to rent.',
    sentenceAr: 'تصفح الغرف والشقق والفلل الموثقة للإيجار.',
    path: '/homes',
    icon: Search,
    ctaEn: 'Find a home',
    ctaAr: 'ابحث عن منزل',
  },
  {
    titleEn: 'Tenant',
    titleAr: 'المستأجر',
    sentenceEn: 'Already renting with us? Report issues, pay rent and track every job.',
    sentenceAr: 'تستأجر معنا حالياً؟ أبلغ عن الأعطال وادفع الإيجار وتابع كل عمل.',
    path: '/login?intendedRole=tenant',
    icon: UserRound,
    ctaEn: 'Open Tenant Portal',
    ctaAr: 'فتح بوابة المستأجر',
  },
  {
    titleEn: 'Landlord / Owner',
    titleAr: 'المالك',
    sentenceEn: 'Register your property in public, then see contracts, payments and maintenance proof in one place.',
    sentenceAr: 'سجّل عقارك من الصفحة العامة، ثم اطّلع على عقودك ومدفوعاتك وإثبات الصيانة في مكان واحد.',
    path: '/login?intendedRole=owner',
    icon: Home,
    ctaEn: 'Open Owner Portal',
    ctaAr: 'فتح بوابة المالك',
    publicCtaEn: 'Register your property',
    publicCtaAr: 'سجّل عقارك',
    publicPath: '/onboarding',
  },
  {
    titleEn: 'Real Estate Broker',
    titleAr: 'الوسيط العقاري',
    sentenceEn: 'Refer owners and tenants and track your commission from lead to deal.',
    sentenceAr: 'أحِل الملاك والمستأجرين وتابع عمولتك من أول فرصة حتى الصفقة.',
    path: '/login?intendedRole=broker',
    icon: Building2,
    ctaEn: 'Open Broker Portal',
    ctaAr: 'فتح بوابة الوسيط',
  },
  {
    titleEn: 'Technician',
    titleAr: 'الفني',
    sentenceEn: 'See your jobs, upload photo proof and close work from your phone.',
    sentenceAr: 'راجع مهامك وارفع صور الإثبات وأغلق العمل من هاتفك.',
    path: '/login?intendedRole=technician',
    icon: Wrench,
    ctaEn: 'Open Technician Portal',
    ctaAr: 'فتح بوابة الفني',
  },
];

function Section({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Box component="section" id={id} aria-labelledby={id ? `${id}-title` : undefined} sx={{ py: { xs: 6, md: 8 }, bgcolor: '#fff', borderBottom: `1px solid ${line}`, scrollMarginTop: 16 }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography id={id ? `${id}-title` : undefined} component="h2" variant="h3" fontWeight={950} sx={{ color: ink, fontSize: { xs: '1.8rem', md: '2.4rem' } }}>{title}</Typography>
          {subtitle && <Typography sx={{ mt: 1.2, color: body, maxWidth: 720, mx: 'auto', lineHeight: 1.7, fontWeight: 650 }}>{subtitle}</Typography>}
        </Box>
        {children}
      </Container>
    </Box>
  );
}

export default function SimpleStartPage() {
  const navigate = useNavigate();
  const { isRTL, lang, setLang } = useLanguage();
  const ar = lang === 'ar';
  const c = content[ar ? 'ar' : 'en'];
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const phoneTel = CONTACT.phone.replace(/\s+/g, '');
  const whyIcons = [<FileText size={22} />, <Camera size={22} />, <Clock size={22} />, <Receipt size={22} />];
  const trustIcons = [<BadgeCheck size={16} />, <Receipt size={16} />, <Clock size={16} />, <Globe size={16} />];
  const scrollToRoles = () => document.getElementById('roles')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} lang={ar ? 'ar' : 'en'} sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: ink, direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Small top bar: brand on one side, Ask AI + language on the other. */}
      <Box component="header" sx={{ borderBottom: `1px solid ${line}`, bgcolor: '#fff' }}>
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.2 }}>
            <Typography dir="ltr" sx={{ color: goldText, fontWeight: 950, letterSpacing: 1.5 }}>{BRAND}</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" type="button" data-testid="public-ai-open" aria-label={c.askAiAria} startIcon={<Sparkles size={14} />} onClick={() => emitFabEvent('bin:open-ai')} sx={{ borderRadius: 2, border: `1px solid ${alpha(gold, 0.35)}`, color: goldText, bgcolor: '#fff', fontWeight: 900, textTransform: 'none', minHeight: 36 }}>
                {c.askAi}
              </Button>
              <Button
                size="small"
                type="button"
                data-testid="language-toggle"
                aria-label={ar ? 'Switch language to English' : 'Switch language to Arabic'}
                startIcon={<Globe size={14} />}
                onClick={() => setLang(ar ? 'en' : 'ar')}
                sx={{
                  borderRadius: 2,
                  border: `1px solid ${alpha(gold, 0.35)}`,
                  color: goldText,
                  bgcolor: '#fff',
                  fontWeight: 900,
                  textTransform: 'none',
                  minHeight: 36,
                }}
              >
                {ar ? 'EN' : 'AR'}
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Box sx={{ py: { xs: 3, md: 6 }, borderBottom: `1px solid ${line}` }}>
        <Container maxWidth="lg">
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, background: `linear-gradient(135deg, ${alpha(binThemeTokens.gold, 0.11)}, #FFFFFF)`, boxShadow: '0 22px 56px rgba(17,24,39,0.08)' }}>
            <Stack spacing={2.2} alignItems="flex-start">
              <Chip icon={<ShieldCheck size={16} />} label={c.badge} sx={{ height: 'auto', py: 0.5, maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }, bgcolor: alpha(binThemeTokens.gold, 0.15), color: goldText, fontWeight: 950 }} />
              <Typography component="h1" variant="h2" sx={{ color: ink, fontWeight: 950, letterSpacing: ar ? 0 : -1.2, lineHeight: 1.12, maxWidth: 860, fontSize: { xs: '2.1rem', md: '3.4rem' } }}>
                {c.heading}
              </Typography>
              <Typography sx={{ color: body, fontWeight: 650, lineHeight: 1.75, maxWidth: 760, fontSize: { xs: '1.02rem', md: '1.15rem' } }}>
                {c.subline}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                <Button data-testid="landing-register-property" variant="contained" endIcon={<ArrowRight size={16} style={{ transform: isRTL ? 'scaleX(-1)' : undefined }} />} onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: ink, fontWeight: 950, borderRadius: 3, py: 1.3, px: 3, '&:hover': { bgcolor: binThemeTokens.goldHover || gold } }}>
                  {c.registerProperty}
                </Button>
                <Button data-testid="landing-get-started" variant="contained" endIcon={<ArrowRight size={16} style={{ transform: isRTL ? 'scaleX(-1)' : undefined }} />} onClick={scrollToRoles} sx={{ bgcolor: ink, color: gold, fontWeight: 950, borderRadius: 3, py: 1.3, px: 3, '&:hover': { bgcolor: '#000' } }}>
                  {c.getStarted}
                </Button>
                <Button data-testid="landing-whatsapp" variant="outlined" component="a" href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" startIcon={<MessageSquare size={16} />} sx={{ borderColor: alpha(gold, 0.5), color: goldText, fontWeight: 950, borderRadius: 3, py: 1.3, px: 3, bgcolor: '#fff' }}>
                  {c.whatsappUs}
                </Button>
              </Stack>
              <Box component="ul" aria-label={c.trustLabel} data-testid="landing-trust-strip" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {c.trust.map((item, i) => (
                  <Box component="li" key={item} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 1.3, py: 0.7, borderRadius: 2, bgcolor: '#fff', border: `1px solid ${line}`, color: ink, fontWeight: 800, fontSize: '.88rem' }}>
                    <Box component="span" sx={{ color: goldText, display: 'inline-flex' }}>{trustIcons[i]}</Box>
                    {item}
                  </Box>
                ))}
                {/* Text only (no official UAE PASS artwork); not a link or button until the integration exists. */}
                <Box component="li" data-testid="uae-pass-coming-soon" aria-label={c.uaePassAria} aria-disabled="true" sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 1.3, py: 0.7, borderRadius: 2, bgcolor: '#F3F4F6', border: '1px dashed #9CA3AF', color: '#374151', fontWeight: 800, fontSize: '.88rem', cursor: 'default' }}>
                  <Smartphone size={16} />
                  {c.uaePass}
                </Box>
              </Box>
            </Stack>
          </Paper>
        </Container>
      </Box>

      <Section id="why" title={c.whyTitle}>
        <Grid container spacing={2.5}>
          {c.why.map(([title, text], i) => (
            <Grid item xs={12} sm={6} md={3} key={title}>
              <Paper sx={{ p: 3, height: '100%', borderRadius: 3, border: `1px solid ${line}`, boxShadow: '0 14px 36px rgba(17,24,39,.05)' }}>
                <Stack spacing={1.3}>
                  <Box sx={{ borderRadius: 2, bgcolor: alpha(gold, .12), color: goldText, width: 44, height: 44, display: 'grid', placeItems: 'center' }}>{whyIcons[i]}</Box>
                  <Typography component="h3" fontWeight={950} color={ink} fontSize="1.1rem">{title}</Typography>
                  <Typography variant="body2" sx={{ color: body, lineHeight: 1.7, fontWeight: 600 }}>{text}</Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Section>

      <Section id="roles" title={c.rolesTitle} subtitle={c.rolesSubtitle}>
        <Grid container spacing={2.5}>
          {cards.map((card) => (
            <Grid item xs={12} sm={6} md={4} key={card.titleEn}>
              <Paper sx={{ p: 3, height: '100%', borderRadius: 4, border: '1px solid #E5E7EB', boxShadow: '0 16px 42px rgba(17,24,39,0.05)', display: 'flex', flexDirection: 'column' }}>
                <Stack spacing={1.5} sx={{ flexGrow: 1 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: goldText, flexShrink: 0 }}>
                      <SafeIcon icon={card.icon} size={22} />
                    </Box>
                    <Typography component="h3" variant="h6" sx={{ color: ink, fontWeight: 950 }}>{ar ? card.titleAr : card.titleEn}</Typography>
                  </Stack>
                  <Typography sx={{ color: body, fontWeight: 600, lineHeight: 1.65 }}>{ar ? card.sentenceAr : card.sentenceEn}</Typography>
                </Stack>
                <Stack spacing={1} sx={{ mt: 2.5 }}>
                  {card.publicPath && (
                    <Button fullWidth variant="contained" data-testid="landing-owner-register-property" endIcon={<ArrowRight size={16} style={{ transform: isRTL ? 'scaleX(-1)' : undefined }} />} onClick={() => navigate(card.publicPath!)} sx={{ bgcolor: gold, color: ink, fontWeight: 950, borderRadius: 3, py: 1.2, '&:hover': { bgcolor: binThemeTokens.goldHover || gold } }}>
                      {ar ? card.publicCtaAr : card.publicCtaEn}
                    </Button>
                  )}
                  <Button fullWidth variant="outlined" endIcon={<ArrowRight size={16} style={{ transform: isRTL ? 'scaleX(-1)' : undefined }} />} onClick={() => navigate(card.path)} sx={{ borderColor: alpha(gold, 0.5), color: goldText, fontWeight: 950, borderRadius: 3, py: 1.2, '&:hover': { bgcolor: alpha(gold, 0.05) } }}>
                    {ar ? card.ctaAr : card.ctaEn}
                  </Button>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Section>

      <Section title={c.coverage}>
        <Stack direction="row" flexWrap="wrap" justifyContent="center" sx={{ gap: 1.5 }}>
          {(ar ? serviceAreasAr : serviceAreasEn).map(area => (
            <Box key={area} sx={{ px: 3, py: 1.2, bgcolor: '#fff', border: `1.5px solid ${alpha(gold, .28)}`, borderRadius: 2.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <MapPin size={14} color={goldText} />
                <Typography sx={{ color: ink, fontWeight: 850 }}>{area}</Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Section>

      <Section title={c.appTitle} subtitle={c.appBody}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center">
          <Chip icon={<Smartphone size={16} />} label={c.appBadge} sx={{ bgcolor: alpha(gold, 0.1), color: '#6F5522', fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}` }} />
          <Button
            variant="contained"
            startIcon={<MessageSquare size={18} />}
            onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')}
            sx={{ bgcolor: gold, color: ink, fontWeight: 950, textTransform: 'none' }}
          >
            {c.appCta}
          </Button>
        </Stack>
      </Section>

      <Box sx={{ py: 10, background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)' }}>
        <Container maxWidth="md">
          <Stack spacing={4} alignItems="center" textAlign="center">
            <Chip label={c.contactTitle} sx={{ bgcolor: alpha(gold, .12), color: gold, fontWeight: 950 }} />
            <Typography variant="h2" fontWeight={950} sx={{ color: gold }}>{c.contactTitle}</Typography>
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.7)', maxWidth: 650 }}>{c.contactText}</Typography>
            <Grid container spacing={2}>
              {[
                [<Phone size={22} />, ar ? 'هاتف (اتصال)' : 'Phone (call)', CONTACT.phone, `tel:${phoneTel}`],
                [<MessageSquare size={22} />, ar ? 'واتساب (رسائل)' : 'WhatsApp (chat)', CONTACT.whatsapp, `https://wa.me/${whatsappDigits}`],
                [<Mail size={22} />, ar ? 'البريد' : 'Email', CONTACT.email, `mailto:${CONTACT.email}`],
                [<MapPin size={22} />, ar ? 'الموقع' : 'Location', c.location, ''],
              ].map(([icon, label, value, href]: any) => (
                <Grid item xs={12} sm={6} key={label}>
                  <Paper component={href ? 'a' : 'div'} href={href || undefined} target={href?.startsWith('http') ? '_blank' : undefined} sx={{ p: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .22)}`, borderRadius: 3, display: 'block', textDecoration: 'none' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ color: gold }}>{icon}</Box>
                      <Box textAlign="start">
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

            <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent="center" sx={{ mt: 6 }}>
              <Button component={RouterLink} to="/support" sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'الدعم' : 'Support'}</Button>
              <Button component={RouterLink} to="/privacy" sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'الخصوصية' : 'Privacy'}</Button>
              <Button component={RouterLink} to="/terms" sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'الشروط' : 'Terms'}</Button>
              <Button component={RouterLink} to="/admin" sx={{ color: alpha(gold, 0.7), fontWeight: 800, textTransform: 'none' }}>{ar ? 'دخول الإدارة' : 'Admin Login'}</Button>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
