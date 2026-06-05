import React, { useMemo } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, Briefcase, CheckCircle2, FileText, Mail, MapPin, MessageSquare, Phone, ShieldCheck, Sparkles, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

const CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'owner@bin-group.com' };

function getCopy(lang: 'en' | 'ar') {
  const ar = lang === 'ar';
  return {
    ar,
    title: ar ? 'BIN GROUP - الصيانة العامة وإدارة العقارات' : 'BIN GROUP - General Maintenance & Property Management',
    subtitle: ar
      ? 'شركة إماراتية بجذور من مدينة العين منذ عام 2010، تعمل اليوم بنموذج شركة مرخصة لخدمات الصيانة وإدارة العقارات والتشغيل الرقمي.'
      : 'A UAE maintenance and property management company rooted in Al Ain since 2010, now operating through a licensed LLC model with digital property-care operations.',
    badge1: ar ? 'جذور من العين منذ 2010' : 'Rooted in Al Ain since 2010',
    badge2: ar ? 'شركة مرخصة في الإمارات' : 'Licensed UAE Company',
    badge3: ar ? 'صيانة + إدارة عقارات' : 'Maintenance + Property Management',
    request: ar ? 'طلب عقد أو عرض سعر' : 'Request Contract or Quote',
    whatsapp: ar ? 'تواصل عبر واتساب' : 'WhatsApp BIN GROUP',
    licenceTitle: ar ? 'الرخصة ونموذج التشغيل' : 'Licence & Operating Model',
    licence: ar
      ? 'All Kind Building Projects Contracting - L.L.C - S.P.C | يتم عرض رقم الرخصة التجارية وجهة الإصدار وتاريخ الانتهاء داخل التطبيق عند التفعيل النهائي.'
      : 'All Kind Building Projects Contracting - L.L.C - S.P.C | Trade licence number, issuing authority, and expiry date should be displayed in the app before final public launch.',
    aboutTitle: ar ? 'من نحن' : 'About the Company',
    about: ar
      ? 'بدأت BIN GROUP كعمل محلي صغير في مدينة العين عام 2010، يقدم خدمات عملية في الصيانة ومتابعة احتياجات العقارات اليومية. واليوم تطورت الشركة إلى مرحلة شركة مرخصة ومنظمة، تجمع بين الخبرة الميدانية والخدمة المهنية والسجلات الرقمية الواضحة. نعمل لخدمة الملاك والمستأجرين والعقارات السكنية والتجارية بطريقة أكثر شفافية وتنظيماً.'
      : 'BIN GROUP began as a small local maintenance operation in Al Ain in 2010, supporting practical property-care needs in the local market. Today, the company has moved into a licensed and structured LLC phase, combining field experience, professional service standards, and clear digital records. We support owners, tenants, and residential or commercial properties with a more transparent and organised service model.',
    servicesTitle: ar ? 'خدماتنا' : 'Our Services',
    services: ar
      ? [
          ['عقود الصيانة', 'عقود صيانة مخصصة للفيلات والشقق والمباني والفنادق والمدارس والعيادات والمكاتب والمحافظ العقارية.'],
          ['إدارة العقارات', 'تنسيق الملاك والمستأجرين، متابعة الشكاوى، سجلات الحالة، الإشراف على المقاولين، وتقارير العقار.'],
          ['تشغيل الفنيين', 'بطاقات مهام، موقع، ملاحظات سلامة، إثبات قبل وبعد، وسجل إنجاز واضح داخل التطبيق.'],
          ['جواز العقار الرقمي', 'سجل رقمي لكل عقار يشمل العقود والطلبات والفواتير والتقارير والصيانة والتحديثات.'],
        ]
      : [
          ['Maintenance Contracts', 'Custom maintenance contracts for villas, apartments, buildings, hotels, schools, clinics, offices, and property portfolios.'],
          ['Property Management', 'Owner and tenant coordination, complaint follow-up, condition records, contractor supervision, and property reporting.'],
          ['Technician Operations', 'Job cards, location context, safety notes, before-and-after proof, and clear completion records inside the app.'],
          ['Digital Property Passport', 'A digital record for each property covering contracts, requests, invoices, reports, maintenance activity, and updates.'],
        ],
    innovationTitle: ar ? 'الابتكار والعمليات بدون أوراق' : 'Innovation & Paperless Operations',
    innovation: ar
      ? 'تعمل BIN GROUP على تطوير نظام خدمة ذاتية للموظفين مصمم لفرق الصيانة وإدارة العقارات في الإمارات. يساعد النظام الموظفين على طلب الإجازات، رفع المستندات، متابعة الحضور، مراجعة المهام، طلب خطابات الموارد البشرية، تتبع مستندات الامتثال، رفع ملاحظات السلامة، وطلب الأدوات ومعدات الوقاية بدون معاملات ورقية.'
      : 'BIN GROUP is developing a staff self-service system designed for UAE maintenance and property management field teams. The system helps employees request leave, upload documents, review attendance context, track assigned jobs, request HR letters, manage compliance documents, report safety issues, and request tools or PPE without manual paperwork.',
    proofTitle: ar ? 'كيف نبني الثقة' : 'How We Build Trust',
    proof: ar
      ? ['عرض بيانات الشركة والرخصة بوضوح', 'نطاق خدمة واضح بدون مبالغات', 'صور قبل وبعد وتقارير قابلة للمراجعة', 'تواصل مباشر عبر الهاتف والواتساب والبريد الإلكتروني', 'دعم ثنائي اللغة مع واجهة عربية RTL']
      : ['Clear company and licence information', 'Defined service scope without exaggeration', 'Before-and-after proof and reviewable reports', 'Direct phone, WhatsApp, and email contact', 'Bilingual English/Arabic support with RTL Arabic layout'],
    missionTitle: ar ? 'المهمة' : 'Mission',
    mission: ar
      ? 'تقديم خدمات صيانة وإدارة عقارات موثوقة تحمي ممتلكات العملاء، تقلل الضغط التشغيلي، وتوفر متابعة واضحة ومهنية من خلال السجلات الرقمية والمساءلة الميدانية.'
      : 'To deliver dependable maintenance and property management services that protect clients’ properties, reduce operational stress, and improve daily property care through clear communication, digital records, and accountable field execution.',
    contactTitle: ar ? 'تواصل معنا' : 'Contact Us',
    location: ar ? 'العين، الإمارات العربية المتحدة' : 'Al Ain, United Arab Emirates',
    footer: ar ? 'عناية موثوقة بالعقارات، بجذور من مدينة العين.' : 'Trusted maintenance and property care, rooted in Al Ain.',
  };
}

function TrustChip({ label }: { label: string }) {
  return <Chip label={label} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950 }} />;
}

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const copy = useMemo(() => getCopy(lang), [lang]);
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const textAlign = isRTL ? 'right' : 'left';
  const icons = [<Wrench key="wrench" />, <Briefcase key="briefcase" />, <Users key="users" />, <FileText key="file" />];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: '#111827', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid #E8E3D7', background: 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FB 100%)' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 7, md: 12 } }}>
          <Grid container spacing={5} alignItems="center">
            <Grid item xs={12} md={7}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                  <TrustChip label={copy.badge1} />
                  <TrustChip label={copy.badge2} />
                  <TrustChip label={copy.badge3} />
                </Stack>
                <Typography variant="h1" fontWeight={950} sx={{ fontSize: { xs: '2.35rem', md: '4rem' }, lineHeight: 1, textAlign }}>{copy.title}</Typography>
                <Typography variant="h5" sx={{ color: '#667085', fontWeight: 750, lineHeight: 1.6, textAlign, maxWidth: 820 }}>{copy.subtitle}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5 }}>{copy.request}</Button>
                  <Button variant="outlined" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ color: '#111827', borderColor: '#D6C99F', fontWeight: 950, px: 4, py: 1.5 }}>{copy.whatsapp}</Button>
                </Stack>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,.82)', border: '1px solid #E8E3D7', boxShadow: '0 24px 70px rgba(17,24,39,.08)' }}>
                <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <ShieldCheck color={binThemeTokens.gold} size={42} />
                  <Typography variant="caption" sx={{ color: '#667085', fontWeight: 950 }}>{copy.licenceTitle}</Typography>
                  <Typography sx={{ fontWeight: 850, lineHeight: 1.8, textAlign }}>{copy.licence}</Typography>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, border: '1px solid #E8E3D7', boxShadow: '0 18px 48px rgba(17,24,39,.06)' }}>
              <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Building2 color={binThemeTokens.gold} size={36} />
                <Typography variant="h3" fontWeight={950} sx={{ textAlign }}>{copy.aboutTitle}</Typography>
                <Typography sx={{ color: '#475467', fontWeight: 650, lineHeight: 1.95, textAlign }}>{copy.about}</Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: { xs: 3, md: 5 }, height: '100%', borderRadius: 6, border: '1px solid #E8E3D7', boxShadow: '0 18px 48px rgba(17,24,39,.06)' }}>
              <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Sparkles color={binThemeTokens.gold} size={36} />
                <Typography variant="h4" fontWeight={950} sx={{ textAlign }}>{copy.missionTitle}</Typography>
                <Typography sx={{ color: '#475467', fontWeight: 650, lineHeight: 1.9, textAlign }}>{copy.mission}</Typography>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Box sx={{ py: 8, bgcolor: '#F8F9FB', borderTop: '1px solid #E8E3D7', borderBottom: '1px solid #E8E3D7' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" fontWeight={950} sx={{ textAlign: 'center', mb: 5 }}>{copy.servicesTitle}</Typography>
          <Grid container spacing={3}>
            {copy.services.map((service, index) => (
              <Grid item xs={12} md={3} key={service[0]}>
                <Card sx={{ height: '100%', borderRadius: 5, border: '1px solid #E8E3D7', boxShadow: '0 16px 40px rgba(17,24,39,.05)' }}>
                  <CardContent sx={{ p: 3, textAlign }}>
                    <Box sx={{ color: binThemeTokens.gold, mb: 2 }}>{icons[index]}</Box>
                    <Typography variant="h6" fontWeight={950}>{service[0]}</Typography>
                    <Typography variant="body2" sx={{ color: '#667085', lineHeight: 1.75, mt: 1 }}>{service[1]}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, border: '1px solid #E8E3D7', boxShadow: '0 18px 48px rgba(17,24,39,.06)' }}>
              <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Typography variant="h3" fontWeight={950} sx={{ textAlign }}>{copy.innovationTitle}</Typography>
                <Typography sx={{ color: '#475467', fontWeight: 650, lineHeight: 1.95, textAlign }}>{copy.innovation}</Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: { xs: 3, md: 5 }, height: '100%', borderRadius: 6, border: '1px solid #E8E3D7', boxShadow: '0 18px 48px rgba(17,24,39,.06)' }}>
              <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Typography variant="h4" fontWeight={950} sx={{ textAlign }}>{copy.proofTitle}</Typography>
                {copy.proof.map((item) => (
                  <Stack key={item} direction={isRTL ? 'row-reverse' : 'row'} spacing={1.3} alignItems="center" sx={{ width: '100%' }}>
                    <CheckCircle2 size={18} color={binThemeTokens.gold} />
                    <Typography sx={{ color: '#475467', fontWeight: 800, textAlign }}>{item}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Container maxWidth="lg" sx={{ pb: 9 }}>
        <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, bgcolor: '#111827', color: '#fff' }}>
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h3" fontWeight={950} sx={{ color: binThemeTokens.gold, textAlign }}>{copy.contactTitle}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.7)', fontWeight: 800, mt: 1, textAlign }}>{copy.footer}</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Phone size={18} color={binThemeTokens.gold} /><Typography>{CONTACT.phone}</Typography></Stack>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><MessageSquare size={18} color={binThemeTokens.gold} /><Typography>{CONTACT.whatsapp}</Typography></Stack>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Mail size={18} color={binThemeTokens.gold} /><Typography>{CONTACT.email}</Typography></Stack>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><MapPin size={18} color={binThemeTokens.gold} /><Typography>{copy.location}</Typography></Stack>
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
}
