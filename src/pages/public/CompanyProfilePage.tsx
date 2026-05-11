import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Grid,
  IconButton,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import {
  Briefcase,
  Building2,
  CheckCircle2,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PlayCircle,
  Shield,
  Wrench,
  Sparkles,
  ShieldCheck,
  LayoutDashboard,
  Rocket,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

type LocalizedText = { en: string; ar: string };
type CompanyService = { id: string; title: LocalizedText; desc: LocalizedText; icon: React.ReactNode };

const text = {
  companyName: { en: 'BIN GROUP – General Maintenance & Property Management', ar: 'بن جروب – الصيانة العامة وإدارة العقارات' },
  licenseInfo: { en: 'All Kind Building Projects Contracting – L.L.C – S.P.C · UAE', ar: 'شركة جميع أنواع مشاريع البناء للمقاولات – ذ.م.م – شركة الشخص الواحد · الإمارات' },
  headline: { en: 'A UAE PropTech and facility management operating system for owners, tenants, technicians, brokers, contracts, payments, property passports and AI design.', ar: 'منصة إماراتية لإدارة العقارات والصيانة تربط الملاك والمستأجرين والفنيين والوسطاء والعقود والمدفوعات وجوازات العقار والتصميم بالذكاء الاصطناعي.' },
  mission: { en: 'To give owners peace of mind through transparent maintenance, verified technician workflows, digital contracts, property passports and real-time service accountability.', ar: 'منح الملاك راحة البال من خلال صيانة شفافة، وسير عمل موثق للفنيين، وعقود رقمية، وجوازات للعقار، ومتابعة فورية لكل خدمة.' },
  vision: { en: 'To become the UAE benchmark for digital property care, annual maintenance contracts and technology-enabled property management.', ar: 'أن نكون معيار الإمارات في رعاية العقارات الرقمية، وعقود الصيانة السنوية، وإدارة العقارات المدعومة بالتقنية.' },
  promise: { en: 'One property, one passport, one command center. No confusion, no lost complaints, no invisible work.', ar: 'عقار واحد، جواز واحد، مركز قيادة واحد. لا ارتباك، لا شكاوى ضائعة، ولا أعمال غير مرئية.' },
  start: { en: 'Start Onboarding', ar: 'ابدأ تسجيل العقار' },
  login: { en: 'Partner Login', ar: 'دخول الشركاء' },
  coverage: { en: 'UAE Service Coverage', ar: 'تغطية الخدمة في الإمارات' },
  contactTitle: { en: 'Contact Institutional Support', ar: 'تواصل مع دعم بن جروب' },
  quote: { en: 'Get Quote / Request Support', ar: 'احصل على عرض سعر / اطلب الدعم' },
  terms: { en: 'Terms of Service', ar: 'شروط الخدمة' },
  privacy: { en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
};

const services: CompanyService[] = [
  { id: 'fm', title: { en: 'Facility Management', ar: 'إدارة المرافق' }, desc: { en: 'Operations for villas, towers, commercial buildings, hotels, schools, hospitals, malls and government assets.', ar: 'تشغيل الفلل والأبراج والمباني التجارية والفنادق والمدارس والمستشفيات والمولات والعقارات الحكومية.' }, icon: <Building2 size={30} /> },
  { id: 'pm', title: { en: 'Property Management', ar: 'إدارة العقارات' }, desc: { en: 'Owner dashboards, tenant records, rent visibility, documents, approvals and property performance tracking.', ar: 'لوحات تحكم للمالك، سجلات المستأجرين، متابعة الإيجارات، المستندات، الموافقات، وأداء العقار.' }, icon: <Briefcase size={30} /> },
  { id: 'amc', title: { en: 'Annual Maintenance Contracts', ar: 'عقود الصيانة السنوية' }, desc: { en: 'AMC packages for MEP, HVAC, plumbing, electrical, civil works, preventive maintenance and emergency support.', ar: 'عقود صيانة سنوية للكهروميكانيك والتكييف والسباكة والكهرباء والأعمال المدنية والصيانة الوقائية والطوارئ.' }, icon: <Wrench size={30} /> },
  { id: 'contracts', title: { en: 'Digital Contracts & Payments', ar: 'العقود الرقمية والمدفوعات' }, desc: { en: 'Online quote, contract selection, signature, activation payment and admin verification workflow.', ar: 'عرض سعر إلكتروني، اختيار العقد، التوقيع، دفعة التفعيل، وسير اعتماد الإدارة.' }, icon: <FileText size={30} /> },
  { id: 'passport', title: { en: 'Property Passport', ar: 'جواز العقار' }, desc: { en: 'A unified record for every property, unit, tenant, contract, document, system and maintenance history.', ar: 'سجل موحد لكل عقار ووحدة ومستأجر وعقد ومستند ونظام وتاريخ صيانة.' }, icon: <ShieldCheck size={30} /> },
  { id: 'ai', title: { en: 'AI Design Studio', ar: 'استوديو التصميم بالذكاء الاصطناعي' }, desc: { en: 'Photo-based design concepts, renovation ideas, scope notes and owner approval workflow.', ar: 'مفاهيم تصميم مبنية على الصور، أفكار تجديد، ملاحظات نطاق العمل، وسير موافقة المالك.' }, icon: <Sparkles size={30} /> },
];

const workflows: LocalizedText[] = [
  { en: 'Owner onboarding: property type, systems, add-ons, documents, contract, signature and payment.', ar: 'تسجيل المالك: نوع العقار، الأنظمة، الخدمات الإضافية، المستندات، العقد، التوقيع والدفع.' },
  { en: 'Tenant complaints: photo evidence, priority, technician assignment, chat and approval.', ar: 'شكاوى المستأجر: صور، أولوية، تعيين فني، محادثة واعتماد الإنجاز.' },
  { en: 'Technician workflow: duty status, job acceptance, start work, finish work, photos and notes.', ar: 'سير عمل الفني: حالة الدوام، قبول المهمة، بدء العمل، إنهاء العمل، الصور والملاحظات.' },
  { en: 'Broker workflow: referrals, owner leads, commission visibility and approval.', ar: 'سير عمل الوسيط: الإحالات، فرص الملاك، متابعة العمولة والاعتماد.' },
  { en: 'Admin control: approvals, pricing, contracts, tickets, property passports and operations.', ar: 'تحكم الإدارة: الموافقات، التسعير، العقود، التذاكر، جوازات العقار والعمليات.' },
];

const tech: LocalizedText[] = [
  { en: 'Firebase Authentication, Firestore, Storage and role-based security.', ar: 'مصادقة Firebase وقاعدة Firestore والتخزين وصلاحيات حسب الدور.' },
  { en: 'Real-time tickets, notifications, owner dashboards and technician updates.', ar: 'تذاكر فورية، إشعارات، لوحات للمالك وتحديثات للفنيين.' },
  { en: 'Bilingual English/Arabic experience with RTL support.', ar: 'تجربة ثنائية اللغة بالعربية والإنجليزية مع دعم اتجاه اليمين إلى اليسار.' },
  { en: 'Document, evidence and property-passport driven operations.', ar: 'عمليات مبنية على المستندات والأدلة وجواز العقار.' },
];

const serviceAreas = ['Dubai', 'Abu Dhabi', 'Al Ain', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];
const contact = { whatsapp: '+971 55 242 3233', email: 'Ceo@bin-groups.com', phone: '+971 55 242 3233' };

function pick(value: LocalizedText, lang: 'en' | 'ar') { return lang === 'ar' ? value.ar : value.en; }

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { isRTL, lang } = useLanguage();
  const whatsappDigits = useMemo(() => contact.whatsapp.replace(/[^0-9]/g, ''), []);
  const dir = isRTL ? 'rtl' : 'ltr';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: dir }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,0.22), transparent 36%), radial-gradient(circle at bottom left, rgba(59,130,246,0.12), transparent 32%)' }} />
        <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 9, md: 15 } }}>
          <Grid container spacing={6} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Grid item xs={12} md={7}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Chip label={lang === 'ar' ? 'ملف الشركة الرسمي' : 'BIN GROUP COMPANY PROFILE'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }} />
                <Typography variant="h1" fontWeight="950" sx={{ letterSpacing: -2.5, fontSize: { xs: '2.4rem', md: '4.2rem' }, lineHeight: 1, textAlign: isRTL ? 'right' : 'left' }}>{pick(text.companyName, lang)}</Typography>
                <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 800, maxWidth: 760, lineHeight: 1.55, textAlign: isRTL ? 'right' : 'left' }}>{pick(text.headline, lang)}</Typography>
                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ width: { xs: '100%', sm: 'auto' }, pt: 2 }}>
                  <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>{pick(text.start, lang)}</Button>
                  <Button variant="outlined" onClick={() => navigate('/login')} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>{pick(text.login, lang)}</Button>
                </Stack>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6, backdropFilter: 'blur(18px)' }}>
                <Stack spacing={3}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                    <Box sx={{ p: 1.6, bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 3, display: 'flex' }}><Shield size={28} /></Box>
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950, letterSpacing: 2 }}>{lang === 'ar' ? 'الهوية التجارية' : 'COMPANY IDENTITY'}</Typography>
                      <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 950 }}>{pick(text.licenseInfo, lang)}</Typography>
                    </Box>
                  </Stack>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                  <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900, lineHeight: 1.7 }}>{pick(text.promise, lang)}</Typography>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          {[{ icon: <Rocket color={binThemeTokens.gold} size={32} />, title: lang === 'ar' ? 'رسالتنا' : 'Our Mission', body: text.mission }, { icon: <Globe color={binThemeTokens.gold} size={32} />, title: lang === 'ar' ? 'رؤيتنا' : 'Our Vision', body: text.vision }].map((card) => (
            <Grid item xs={12} md={6} key={card.title}>
              <Paper sx={{ p: 5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                <Stack spacing={3} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>{card.icon}<Typography variant="h4" fontWeight="950" color="#FFF">{card.title}</Typography></Box>
                  <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700, lineHeight: 1.9 }}>{pick(card.body, lang)}</Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Box sx={{ mb: 8, textAlign: 'center' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{lang === 'ar' ? 'نطاق العمل' : 'OPERATIONAL COVERAGE'}</Typography>
          <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: -2 }}>{lang === 'ar' ? 'خدماتنا' : 'What We Offer'}</Typography>
        </Box>
        <Grid container spacing={3}>
          {services.map((service) => (
            <Grid item xs={12} md={6} lg={4} key={service.id}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, height: '100%', '&:hover': { borderColor: alpha(binThemeTokens.gold, 0.6), bgcolor: 'rgba(255,255,255,0.04)' } }}>
                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, width: 'fit-content', color: binThemeTokens.gold, mb: 3 }}>{service.icon}</Box>
                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 1.5, textAlign: isRTL ? 'right' : 'left' }}>{pick(service.title, lang)}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', fontWeight: 700, lineHeight: 1.8, textAlign: isRTL ? 'right' : 'left' }}>{pick(service.desc, lang)}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Box sx={{ bgcolor: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', py: 12 }}>
        <Container maxWidth="lg">
          <Grid container spacing={8} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{lang === 'ar' ? 'سير العمل' : 'PRODUCTION WORKFLOWS'}</Typography>
              <Typography variant="h3" fontWeight="950" sx={{ mt: 1, mb: 4, letterSpacing: -1 }}>{lang === 'ar' ? 'ما الذي يعمل داخل التطبيق' : 'What The App Must Do'}</Typography>
              <Stack spacing={3}>{workflows.map((item, index) => <Paper key={index} sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center"><Box sx={{ minWidth: 32, height: 32, borderRadius: '50%', bgcolor: binThemeTokens.gold, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>{index + 1}</Box><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{pick(item, lang)}</Typography></Stack></Paper>)}</Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 5, borderRadius: 6, bgcolor: '#0f172a', border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}>
                <Typography variant="h5" fontWeight="950" sx={{ mb: 4, color: '#FFF', display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}><LayoutDashboard color={binThemeTokens.gold} /> {lang === 'ar' ? 'التقنية والأنظمة' : 'Technology Stack'}</Typography>
                <Stack spacing={2.5}>{tech.map((item, i) => <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row' }}><CheckCircle2 color={binThemeTokens.gold} size={20} /><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', fontWeight: 700, textAlign: isRTL ? 'right' : 'left' }}>{pick(item, lang)}</Typography></Box>)}</Stack>
                <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.1)' }} />
                <Stack spacing={2}>
                  <Button fullWidth variant="contained" onClick={() => navigate('/design-studio')} startIcon={!isRTL ? <Sparkles size={18} /> : undefined} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.8, borderRadius: 3 }}>{lang === 'ar' ? 'افتح استوديو التصميم' : 'Open AI Studio'}</Button>
                  <Button fullWidth variant="outlined" onClick={() => navigate('/request-demo')} startIcon={!isRTL ? <PlayCircle size={18} /> : undefined} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#FFF', fontWeight: 950, py: 1.8, borderRadius: 3 }}>{lang === 'ar' ? 'اطلب عرضاً تجريبياً' : 'Request Full Demo'}</Button>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 12 }}>
        <Grid container spacing={6} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Grid item xs={12} md={5}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>{pick(text.contactTitle, lang)}</Typography>
            <Stack spacing={4}>{[
              { label: lang === 'ar' ? 'واتساب' : 'WhatsApp', value: contact.whatsapp, icon: <MessageSquare />, color: '#25D366' },
              { label: lang === 'ar' ? 'الهاتف المباشر' : 'Direct Phone', value: contact.phone, icon: <Phone />, color: binThemeTokens.gold },
              { label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email', value: contact.email, icon: <Mail />, color: '#3b82f6' },
            ].map((item) => <Stack key={item.label} direction={isRTL ? 'row-reverse' : 'row'} spacing={3} alignItems="center"><Box sx={{ p: 2, bgcolor: alpha(item.color, 0.1), borderRadius: 3, color: item.color, display: 'flex' }}>{item.icon}</Box><Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 1 }}>{item.label}</Typography><Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>{item.value}</Typography></Box></Stack>)}</Stack>
            <Button variant="contained" size="large" onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ mt: 5, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 3 }}>{pick(text.quote, lang)}</Button>
          </Grid>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 5, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h5" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}><MapPin color={binThemeTokens.gold} /> {pick(text.coverage, lang)}</Typography>
              <Grid container spacing={2}>{serviceAreas.map((area) => <Grid item xs={12} sm={6} md={4} key={area}><Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}><Typography variant="subtitle2" sx={{ color: '#FFF', fontWeight: 900 }}>{area}</Typography></Paper></Grid>)}</Grid>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Box sx={{ py: 10, bgcolor: '#000', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
        <Container maxWidth="lg">
          <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: 4, mb: 1 }}>BIN GROUP</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 800, display: 'block', mb: 4 }}>{lang === 'ar' ? '© 2026 بن جروب · منصة عمليات العقارات في الإمارات' : '© 2026 BIN GROUP · UAE PROPERTY OPERATIONS OS'}</Typography>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={3} justifyContent="center" sx={{ mb: 4 }}><MuiLink href="/terms" sx={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontWeight: 850 }}>{pick(text.terms, lang)}</MuiLink><MuiLink href="/privacy" sx={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontWeight: 850 }}>{pick(text.privacy, lang)}</MuiLink></Stack>
          <Stack direction="row" spacing={2} justifyContent="center"><IconButton onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }}><MessageSquare /></IconButton><IconButton onClick={() => window.location.href = `mailto:${contact.email}`} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }}><Mail /></IconButton></Stack>
        </Container>
      </Box>
    </Box>
  );
}
