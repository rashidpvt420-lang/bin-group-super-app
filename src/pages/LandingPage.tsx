import React from 'react';
import { Box, Typography, Button, Container, Stack, Grid, alpha, Divider, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import {
  ArrowRight,
  Shield,
  Globe,
  Building,
  TrendingUp,
  Crown,
  Mail,
  Phone,
  MapPin,
  Info,
  MessageSquare,
  Zap,
  Wrench,
  FileText,
  Bell,
  MapPinned,
  ReceiptText,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { CeoContactButtons } from '../components/CeoContactButtons';

type LandingCard = {
  title: string;
  desc: string;
  icon: React.ReactNode;
  bullets?: string[];
};

type WorkflowStep = {
  step: string;
  title: string;
  desc: string;
  status: string;
};

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const copy = (en: string, ar: string) => (isRTL ? ar : en);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const roleCards: LandingCard[] = [
    {
      title: copy('Owners', 'الملاك'),
      desc: copy(
        'Owners get one live control room for contracts, property passports, rent collection, payment proof, maintenance tickets, approvals, technician ETA, evidence packs, and monthly statements.',
        'يحصل المالك على مركز تحكم مباشر للعقود وجوازات العقار وتحصيل الإيجار وإثبات الدفع وبلاغات الصيانة والموافقات ووصول الفني وحزم الإثبات والتقارير الشهرية.'
      ),
      icon: <Crown size={42} />,
      bullets: [
        copy('See money: due, collected, balance, pending verification.', 'رؤية الأموال: المستحق، المحصل، الرصيد، والتحقق المعلق.'),
        copy('See proof: before/after photos, SLA, technician and audit logs.', 'رؤية الإثبات: صور قبل/بعد، اتفاقية الخدمة، الفني وسجل التدقيق.'),
        copy('Approve, dispute, request revisit, or escalate instead of calling.', 'الموافقة أو الاعتراض أو طلب إعادة الزيارة أو التصعيد بدون اتصال.'),
      ],
    },
    {
      title: copy('Tenants', 'المستأجرون'),
      desc: copy(
        'Tenants report issues without phone calls, upload photos, track status, receive notifications, view documents/payments when allowed, and approve or dispute completed work.',
        'يرفع المستأجر البلاغات بدون مكالمات، يرفع الصور، يتابع الحالة، يستلم الإشعارات، يرى المستندات والمدفوعات عند السماح، ويوافق أو يعترض على العمل المنجز.'
      ),
      icon: <Building size={42} />,
      bullets: [
        copy('Report issue → technician assigned → proof uploaded → approve/dispute.', 'بلاغ → تعيين فني → رفع إثبات → موافقة أو اعتراض.'),
        copy('Emergency path for urgent property problems.', 'مسار طوارئ للمشاكل العقارية العاجلة.'),
        copy('Move-in/move-out evidence and documents are being connected end-to-end.', 'يتم ربط إثبات الدخول والخروج والمستندات بالكامل.'),
      ],
    },
    {
      title: copy('Technicians', 'الفنيون'),
      desc: copy(
        'Technicians receive assigned missions, accept jobs, update field status, upload before/after evidence, close work with notes, and build performance from real SLA/MTTR data.',
        'يستلم الفني المهام، يقبل العمل، يحدث الحالة الميدانية، يرفع إثبات قبل/بعد، يغلق بالملاحظات، وتحتسب كفاءته من بيانات SLA وMTTR الحقيقية.'
      ),
      icon: <Zap size={42} />,
      bullets: [
        copy('Accept, on-site, in-progress, resolved status flow.', 'قبول، وصول، قيد التنفيذ، حل المشكلة.'),
        copy('Mandatory proof is required before trusted closure.', 'الإثبات الإلزامي مطلوب قبل الإغلاق الموثوق.'),
        copy('Offline queue and map workflow are being hardened.', 'يتم تقوية قائمة العمل دون اتصال ومسار الخريطة.'),
      ],
    },
    {
      title: copy('Brokers', 'الوسطاء'),
      desc: copy(
        'Brokers bring owner leads, tenant leads, contracts, and property opportunities with attribution proof so the system knows who brought each deal and commission approval.',
        'يجلب الوسيط فرص الملاك والمستأجرين والعقود والعقارات مع إثبات النسبة حتى يعرف النظام من جلب كل صفقة وعمولة الموافقة.'
      ),
      icon: <TrendingUp size={42} />,
      bullets: [
        copy('Lead attribution chain: broker → lead → property/tenant → contract → commission.', 'سلسلة النسبة: وسيط → فرصة → عقار/مستأجر → عقد → عمولة.'),
        copy('Pending, approved and paid commission states are required.', 'حالات العمولة المعلقة والموافق عليها والمدفوعة مطلوبة.'),
        copy('Admin approval must lock the final commission proof.', 'موافقة الأدمن يجب أن تثبت دليل العمولة النهائي.'),
      ],
    },
  ];

  const workflowSteps: WorkflowStep[] = [
    {
      step: '01',
      title: copy('Company profile', 'ملف الشركة'),
      desc: copy('Owner understands what BIN GROUP does, which service plan fits the asset, and what evidence is required before activation.', 'يفهم المالك خدمات BIN GROUP وخطة الخدمة المناسبة للعقار والإثبات المطلوب قبل التفعيل.'),
      status: copy('Public explanation', 'شرح عام'),
    },
    {
      step: '02',
      title: copy('Property intake', 'إدخال بيانات العقار'),
      desc: copy('Property details, title/asset information, units, location, service needs and owner contact data are captured.', 'تسجيل بيانات العقار والملكية والوحدات والموقع واحتياجات الخدمة وبيانات المالك.'),
      status: copy('Owner input', 'إدخال المالك'),
    },
    {
      step: '03',
      title: copy('Smart quote', 'التسعير الذكي'),
      desc: copy('System calculates Maintenance Only, Property Management Only, or Full Maintenance & Property Management scope.', 'يحسب النظام الصيانة فقط أو إدارة العقار فقط أو الصيانة والإدارة معاً.'),
      status: copy('Pricing engine', 'محرك التسعير'),
    },
    {
      step: '04',
      title: copy('Contract and payment plan', 'العقد وخطة الدفع'),
      desc: copy('Owner selects contract type, 15% mobilization/payment proof is captured, and 85% plan logic is prepared.', 'يختار المالك نوع العقد ويتم تسجيل إثبات 15% وخطة 85%.'),
      status: copy('Contract graph', 'مسار العقد'),
    },
    {
      step: '05',
      title: copy('Admin verification', 'تحقق الأدمن'),
      desc: copy('Admin reviews owner, property, contract, documents and payment proof before dashboard unlock.', 'يراجع الأدمن المالك والعقار والعقد والمستندات وإثبات الدفع قبل فتح اللوحة.'),
      status: copy('Approval queue', 'قائمة الموافقات'),
    },
    {
      step: '06',
      title: copy('Dashboard activation', 'تفعيل لوحة التحكم'),
      desc: copy('Correct role dashboard opens with only the permissions that owner, tenant, technician, broker or admin should see.', 'تفتح لوحة الدور الصحيحة بالصلاحيات المناسبة للمالك أو المستأجر أو الفني أو الوسيط أو الأدمن.'),
      status: copy('RBAC / access', 'صلاحيات الوصول'),
    },
    {
      step: '07',
      title: copy('Live operations', 'العمليات المباشرة'),
      desc: copy('Requests, dispatch, map/ETA, proof photos, notifications, PDF evidence and audit logs connect each workflow.', 'تتصل الطلبات والإرسال والخريطة والإثباتات والإشعارات وملفات PDF وسجلات التدقيق بكل مسار.'),
      status: copy('Live proof', 'إثبات مباشر'),
    },
  ];

  const operations = [
    { icon: <Wrench />, title: copy('Maintenance workflow', 'مسار الصيانة'), desc: copy('Tenant or owner request → triage → technician assignment → on-site proof → approval/dispute.', 'طلب المستأجر أو المالك → فرز → تعيين فني → إثبات ميداني → موافقة أو اعتراض.') },
    { icon: <ReceiptText />, title: copy('Money workflow', 'مسار الأموال'), desc: copy('Rent/payment proof → admin verification → owner visibility → statement/export.', 'إثبات الإيجار/الدفع → تحقق الأدمن → رؤية المالك → كشف أو تصدير.') },
    { icon: <FileText />, title: copy('Contract workflow', 'مسار العقد'), desc: copy('Service scope, contract value, mobilization, payment plan, signature and activation are tracked.', 'تتبع نطاق الخدمة وقيمة العقد والدفعة وخطة الدفع والتوقيع والتفعيل.') },
    { icon: <MapPinned />, title: copy('Map workflow', 'مسار الخريطة'), desc: copy('Property GPS, technician field status, ETA and audit-safe timestamps must be visible where permitted.', 'إحداثيات العقار وحالة الفني ووقت الوصول وختم الوقت تظهر حسب الصلاحيات.') },
    { icon: <Bell />, title: copy('Notification workflow', 'مسار الإشعارات'), desc: copy('Every important state change should notify the right role and remain auditable.', 'كل تغيير مهم يجب أن يصل للدور الصحيح ويظل قابلاً للتدقيق.') },
    { icon: <Shield />, title: copy('Proof workflow', 'مسار الإثبات'), desc: copy('Photos, PDFs, property passport, certificates, public verification and audit logs protect trust.', 'الصور وملفات PDF وجواز العقار والشهادات والتحقق العام وسجلات التدقيق تحمي الثقة.') },
  ];

  const launchProof = [
    copy('Admin Dashboard: live KPIs, approval queues, payment proof, SLA risk, audit logs and launch health.', 'لوحة الأدمن: مؤشرات مباشرة، موافقات، إثبات الدفع، مخاطر SLA، سجلات التدقيق وصحة الإطلاق.'),
    copy('Owner Dashboard: contract value, properties, money snapshot, tenants, tickets, approvals and evidence.', 'لوحة المالك: قيمة العقد، العقارات، ملخص الأموال، المستأجرون، البلاغات، الموافقات والإثبات.'),
    copy('Tenant Dashboard: report issue, track technician, see payments/documents, emergency and service access.', 'لوحة المستأجر: رفع بلاغ، تتبع الفني، المدفوعات/المستندات، الطوارئ والخدمات.'),
    copy('Technician Dashboard: assigned jobs, status, route context, proof upload, SLA and offline queue.', 'لوحة الفني: مهام، حالة، مسار، رفع إثبات، SLA وقائمة دون اتصال.'),
    copy('Broker Dashboard: leads, attribution, contract chain, commission status and payout proof.', 'لوحة الوسيط: فرص، نسبة، سلسلة العقد، حالة العمولة وإثبات الدفع.'),
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: 0, backgroundImage: (theme) => theme.palette.mode === 'dark' ? `linear-gradient(${binThemeTokens.black} 0%, transparent 40%), linear-gradient(90deg, rgba(198,167,94,0.03) 1px, transparent 1px), linear-gradient(rgba(198,167,94,0.03) 1px, transparent 1px)` : `linear-gradient(#F8FAFC 0%, transparent 40%), linear-gradient(90deg, rgba(198,167,94,0.05) 1px, transparent 1px), linear-gradient(rgba(198,167,94,0.05) 1px, transparent 1px)`, backgroundSize: '100% 100%, 60px 60px, 60px 60px', zIndex: 0 }} />
      <Box sx={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: 800, height: 800, background: `radial-gradient(circle, ${binThemeTokens.gold}11 0%, transparent 70%)`, filter: 'blur(80px)', zIndex: 0 }} />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, pt: { xs: 10, md: 18 }, pb: 10 }}>
        <Stack spacing={4} alignItems="center" textAlign="center">
          <Chip label={copy('UAE No-Call Maintenance & Property Management Access Layer', 'طبقة الوصول للصيانة وإدارة العقارات بدون اتصال في الإمارات')} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950, px: 2 }} />
          <Typography variant="h1" sx={{ fontSize: { xs: '2.9rem', md: '5.4rem' }, fontWeight: 950, color: 'text.primary', lineHeight: 1, letterSpacing: -2, background: (theme) => theme.palette.mode === 'dark' ? 'linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)' : 'linear-gradient(180deg, #0F172A 0%, #475569 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {copy('One live system for owners, tenants, technicians, brokers and admin.', 'نظام مباشر واحد للملاك والمستأجرين والفنيين والوسطاء والأدمن.')}
            <br />
            <Box component="span" sx={{ color: binThemeTokens.gold, WebkitTextFillColor: binThemeTokens.gold }}>{copy('Everything tracked. Nothing hidden.', 'كل شيء موثق. لا شيء مخفي.')}</Box>
          </Typography>
          <Typography variant="h6" sx={{ color: 'text.secondary', maxWidth: 980, fontWeight: 650, lineHeight: 1.75, fontSize: '1.18rem' }}>
            {copy('BIN GROUP provides smart maintenance and property management for UAE assets. We connect onboarding, contracts, payments, tenant requests, technician dispatch, map/ETA, before/after evidence, notifications, property passports, PDFs and public verification into one role-based platform.', 'تقدم BIN GROUP صيانة ذكية وإدارة عقارات للأصول في الإمارات. نربط التسجيل والعقود والمدفوعات وطلبات المستأجرين وإرسال الفنيين والخريطة ووقت الوصول وصور قبل/بعد والإشعارات وجواز العقار وملفات PDF والتحقق العام في منصة واحدة حسب الصلاحيات.')}
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 2 }}>
            <Button variant="contained" size="large" onClick={() => navigate('/onboarding')} endIcon={<ArrowRight style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }} />} sx={{ background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', color: '#000', px: 5, py: 2.25, fontWeight: 950, borderRadius: 100, fontSize: '1rem', boxShadow: `0 20px 40px ${alpha(binThemeTokens.gold, 0.3)}` }}>{copy('Start Owner Onboarding', 'ابدأ تسجيل المالك')}</Button>
            <Button variant="outlined" size="large" onClick={() => navigate('/gateway')} sx={{ borderColor: (theme) => alpha(theme.palette.text.primary, 0.2), color: 'text.primary', px: 5, py: 2.25, fontWeight: 950, borderRadius: 100, '&:hover': { borderColor: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.05) } }}>{copy('Login / Access Portal', 'تسجيل الدخول / بوابة الوصول')}</Button>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap" justifyContent="center" useFlexGap>
            <Button startIcon={<Building size={18} />} onClick={() => scrollToSection('services')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('Who gets access', 'من يحصل على الوصول')}</Button>
            <Button startIcon={<Info size={18} />} onClick={() => scrollToSection('workflow')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('How onboarding works', 'كيف يعمل التسجيل')}</Button>
            <Button startIcon={<CheckCircle2 size={18} />} onClick={() => scrollToSection('operations')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('Operational workflows', 'مسارات التشغيل')}</Button>
            <Button startIcon={<Shield size={18} />} onClick={() => scrollToSection('proof')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('Proof system', 'نظام الإثبات')}</Button>
            <Button startIcon={<MessageSquare size={18} />} onClick={() => scrollToSection('contact')} sx={{ color: 'text.secondary', fontWeight: 800 }}>{copy('Contact', 'تواصل')}</Button>
          </Stack>
        </Stack>
      </Container>

      <Box id="services" sx={{ py: 12, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.62)', backdropFilter: 'blur(20px)', position: 'relative', zIndex: 1 }}>
        <Container maxWidth="lg">
          <SectionHeader overline={copy('Access for every profile', 'وصول لكل ملف')} title={copy('What each profile gets from BIN GROUP', 'ماذا يحصل كل ملف من BIN GROUP')} desc={copy('People should understand the value before login: who can use the system, what each profile sees, and what happens after a request, contract, payment, or approval.', 'يجب أن يفهم المستخدم القيمة قبل تسجيل الدخول: من يستخدم النظام، ماذا يرى كل ملف، وماذا يحدث بعد الطلب أو العقد أو الدفع أو الموافقة.')} />
          <Grid container spacing={4}>
            {roleCards.map((card) => (
              <Grid item xs={12} md={6} key={card.title}>
                <Box sx={{ p: 4, borderRadius: 6, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(198,167,94,0.03)' : 'rgba(198,167,94,0.05)', border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, textAlign: isRTL ? 'right' : 'left', height: '100%' }}>
                  <Box sx={{ color: binThemeTokens.gold, mb: 2 }}>{card.icon}</Box>
                  <Typography variant="h5" fontWeight="950" sx={{ color: 'text.primary', mb: 1 }}>{card.title}</Typography>
                  <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.7, mb: 2 }}>{card.desc}</Typography>
                  <Stack spacing={1.2}>{card.bullets?.map((item) => <Stack direction="row" spacing={1.2} alignItems="flex-start" key={item}><CheckCircle2 size={17} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>{item}</Typography></Stack>)}</Stack>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Container id="workflow" maxWidth="lg" sx={{ py: 12, position: 'relative', zIndex: 1 }}>
        <Grid container spacing={8} alignItems="flex-start">
          <Grid item xs={12} md={4}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{copy('How onboarding works', 'كيف يعمل التسجيل')}</Typography>
            <Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', mt: 1, mb: 3, letterSpacing: -1 }}>{copy('From company profile to active live dashboard', 'من ملف الشركة إلى لوحة تحكم مباشرة')}</Typography>
            <Typography sx={{ color: 'text.secondary', lineHeight: 1.8 }}>{copy('The workflow must be understandable before login and auditable after submission. Every step has a status, owner/admin responsibility, and next action.', 'يجب أن يكون المسار مفهوماً قبل تسجيل الدخول وقابلاً للتدقيق بعد الإرسال. كل خطوة لها حالة ومسؤولية وإجراء تالٍ.')}</Typography>
          </Grid>
          <Grid item xs={12} md={8}><Stack spacing={3}>{workflowSteps.map((item) => <Box key={item.step} sx={{ p: 3, borderRadius: 5, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, bgcolor: alpha(binThemeTokens.gold, 0.03), textAlign: isRTL ? 'right' : 'left' }}><Stack direction="row" spacing={3} alignItems="flex-start"><Typography variant="h2" fontWeight="950" sx={{ color: alpha(binThemeTokens.gold, 0.32), lineHeight: 1 }}>{item.step}</Typography><Box><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Typography variant="h5" fontWeight="950" sx={{ color: 'text.primary' }}>{item.title}</Typography><Chip size="small" label={item.status} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} /></Stack><Typography sx={{ color: 'text.secondary', lineHeight: 1.7, mt: 1 }}>{item.desc}</Typography></Box></Stack></Box>)}</Stack></Grid>
        </Grid>
      </Container>

      <Box id="operations" sx={{ py: 12, bgcolor: (theme) => alpha(binThemeTokens.gold, theme.palette.mode === 'dark' ? 0.025 : 0.045), position: 'relative', zIndex: 1 }}>
        <Container maxWidth="lg">
          <SectionHeader overline={copy('Operational workflows', 'مسارات التشغيل')} title={copy('How tenant, technician, owner, broker and admin connect', 'كيف يرتبط المستأجر والفني والمالك والوسيط والأدمن')} desc={copy('The system is designed around live handoffs, not calls. Every profile receives only the records and actions that belong to their role.', 'النظام مبني على انتقالات مباشرة وليس مكالمات. كل ملف يستلم فقط السجلات والإجراءات التابعة لصلاحياته.')} />
          <Grid container spacing={3}>{operations.map((item) => <Grid item xs={12} md={4} key={item.title}><Box sx={{ p: 3, borderRadius: 5, height: '100%', bgcolor: (theme) => theme.palette.mode === 'dark' ? '#0f172a' : '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}` }}><Box sx={{ color: binThemeTokens.gold, mb: 2 }}>{item.icon}</Box><Typography variant="h6" fontWeight={950} sx={{ mb: 1 }}>{item.title}</Typography><Typography sx={{ color: 'text.secondary', lineHeight: 1.65 }}>{item.desc}</Typography></Box></Grid>)}</Grid>
        </Container>
      </Box>

      <Box id="proof" sx={{ py: 12, position: 'relative', zIndex: 1 }}>
        <Container maxWidth="lg">
          <Grid container spacing={8} alignItems="center">
            <Grid item xs={12} md={5}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{copy('Hard-live proof system', 'نظام إثبات الإطلاق')}</Typography>
              <Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', mt: 1, mb: 3 }}>{copy('Evidence, not promises.', 'إثبات وليس وعوداً.')}</Typography>
              <Typography sx={{ color: 'text.secondary', lineHeight: 1.8 }}>{copy('Public launch requires every workflow to prove who did what, when it happened, which property/unit it belongs to, which contract/payment it affects, and who must act next.', 'يتطلب الإطلاق العام أن يثبت كل مسار من قام بالفعل ومتى حدث ولأي عقار/وحدة يتبع وما العقد/الدفع المتأثر ومن يجب أن يتصرف بعد ذلك.')}</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}><Button variant="contained" onClick={() => navigate('/verify')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{copy('Verify invoice', 'تحقق من فاتورة')}</Button><Button variant="outlined" onClick={() => navigate('/verify-cert')} sx={{ borderColor: binThemeTokens.gold, color: 'text.primary', fontWeight: 950 }}>{copy('Verify certificate', 'تحقق من شهادة')}</Button></Stack>
            </Grid>
            <Grid item xs={12} md={7}><Box sx={{ p: 4, borderRadius: 8, bgcolor: (theme) => theme.palette.mode === 'dark' ? '#0f172a' : '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}` }}><Stack spacing={2.5}>{launchProof.map((item) => <Stack direction="row" spacing={2} alignItems="flex-start" key={item}><Shield size={20} color={binThemeTokens.gold} /><Typography sx={{ color: 'text.secondary', lineHeight: 1.7, textAlign: isRTL ? 'right' : 'left' }}>{item}</Typography></Stack>)}</Stack><Box sx={{ mt: 3, p: 2.5, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}` }}><Stack direction="row" spacing={1.5} alignItems="flex-start"><AlertTriangle size={18} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.65 }}>{copy('Controlled pilot is close; full public launch still requires billing/secrets/IAM, App Check, branded email, deploy smoke test and five-profile live proof.', 'المرحلة التجريبية قريبة؛ الإطلاق العام الكامل يحتاج تفعيل الفوترة/الأسرار/IAM و App Check والبريد الرسمي واختبار النشر وإثبات الملفات الخمسة.')}</Typography></Stack></Box></Box></Grid>
          </Grid>
        </Container>
      </Box>

      <Container id="about" maxWidth="lg" sx={{ py: 12, position: 'relative', zIndex: 1 }}>
        <Grid container spacing={8} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{t('landing.mission_overline')}</Typography>
            <Typography variant="h2" fontWeight="950" sx={{ color: 'text.primary', mb: 4, letterSpacing: -1 }}>{t('landing.mission_title')}</Typography>
            <Typography variant="h6" sx={{ color: 'text.secondary', lineHeight: 1.8, fontWeight: 500, mb: 5 }}>{t('landing.mission_desc')}</Typography>
            <Divider sx={{ mb: 5, borderColor: alpha(binThemeTokens.gold, 0.1) }} />
            <Typography variant="h4" fontWeight="950" sx={{ color: 'text.primary', mb: 2 }}>{t('landing.why_choose_us')}</Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.8, fontSize: '1.05rem' }}>{t('landing.why_choose_us_desc')}</Typography>
          </Grid>
          <Grid item xs={12} md={6}><Box sx={{ p: 6, borderRadius: 10, background: `linear-gradient(135deg, ${alpha(binThemeTokens.gold, 0.05)}, transparent)`, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, position: 'relative', overflow: 'hidden' }}><Box sx={{ position: 'absolute', top: 0, right: 0, p: 4, color: binThemeTokens.gold, opacity: 0.1 }}><Globe size={200} /></Box><Stack spacing={4}><Stat number="5" label={copy('Connected access profiles', 'ملفات وصول مترابطة')} /><Stat number="UAE" label={copy('Built for local property operations', 'مصمم لعمليات العقارات المحلية')} /><Stat number="100%" label={copy('Audit-first workflow design', 'تصميم مسارات مبني على التدقيق')} /></Stack></Box></Grid>
        </Grid>
      </Container>

      <Box id="contact" sx={{ py: 16, bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(198,167,94,0.02)' : 'rgba(198,167,94,0.04)', position: 'relative', zIndex: 1 }}>
        <Container maxWidth="lg"><Grid container spacing={8} justifyContent="center" textAlign="center"><Grid item xs={12} md={8}><Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', mb: 3 }}>{t('landing.contact_title')}</Typography><Typography variant="h6" sx={{ color: 'text.secondary', mb: 8 }}>{t('support.subtitle')}</Typography><Grid container spacing={4}><Contact icon={<Mail />} text={t('landing.email')} /><Contact icon={<Phone />} text={t('landing.phone')} /><Contact icon={<MapPin />} text={t('landing.location')} /></Grid><Box sx={{ mt: 6, display: 'flex', justifyContent: 'center' }}><CeoContactButtons /></Box></Grid></Grid></Container>
      </Box>
    </Box>
  );
};

function SectionHeader({ overline, title, desc }: { overline: string; title: string; desc: string }) {
  return <Stack spacing={2} alignItems="center" textAlign="center" sx={{ mb: 7 }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{overline}</Typography><Typography variant="h3" fontWeight="950" sx={{ color: 'text.primary', letterSpacing: -1 }}>{title}</Typography><Typography sx={{ color: 'text.secondary', maxWidth: 850, fontSize: '1.08rem', lineHeight: 1.7 }}>{desc}</Typography></Stack>;
}

function Stat({ number, label }: { number: string; label: string }) {
  return <Box><Typography variant="h3" fontWeight="950" color={binThemeTokens.gold}>{number}</Typography><Typography variant="subtitle1" fontWeight="800">{label}</Typography></Box>;
}

function Contact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <Grid item xs={12} md={4}><Stack alignItems="center" spacing={2}><Box sx={{ p: 2, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>{icon}</Box><Typography variant="body1" fontWeight="800">{text}</Typography></Stack></Grid>;
}

export default LandingPage;
