import React from 'react';
import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, CheckCircle2, CreditCard, Gauge, Map, ShieldCheck, TicketCheck, Users, Wrench } from 'lucide-react';
import { useLanguage } from '@bin/shared';

const gold = '#DAA520';
const muted = 'rgba(255,255,255,0.86)';

const slaPolicy = [
  { key: 'EMERGENCY', en: 'Emergency', ar: 'طوارئ', minutes: 30, route: '/sos', enCopy: 'Critical resident or property issue needing immediate dispatch.', arCopy: 'مشكلة حرجة للساكن أو العقار تحتاج إرسالاً فورياً.' },
  { key: 'HIGH', en: 'High', ar: 'عالية', minutes: 120, route: '/tickets', enCopy: 'Urgent comfort, water, electrical, security, or owner-risk issue.', arCopy: 'مشكلة عاجلة في الراحة أو المياه أو الكهرباء أو الأمن أو مخاطر المالك.' },
  { key: 'MEDIUM', en: 'Medium', ar: 'متوسطة', minutes: 240, route: '/tickets', enCopy: 'Normal repair requiring same-day operational attention.', arCopy: 'إصلاح عادي يتطلب متابعة تشغيلية في نفس اليوم.' },
  { key: 'STANDARD', en: 'Standard', ar: 'قياسية', minutes: 480, route: '/tickets', enCopy: 'Routine maintenance with clear technician scheduling.', arCopy: 'صيانة روتينية مع جدولة واضحة للفني.' },
  { key: 'LOW', en: 'Low', ar: 'منخفضة', minutes: 1440, route: '/tickets', enCopy: 'Low urgency service or admin follow-up item.', arCopy: 'خدمة منخفضة الإلحاح أو متابعة إدارية.' },
];

const adminActions = [
  { id: 'sla', en: 'SLA Command', ar: 'قيادة اتفاقيات الخدمة', route: '/tickets', icon: <Gauge size={22} />, enDesc: 'Open tickets, timers, breach risk, and dispatch pressure.', arDesc: 'التذاكر المفتوحة والمؤقتات ومخاطر الإخلال وضغط الإرسال.' },
  { id: 'payments', en: 'Payment Approvals', ar: 'موافقات الدفع', route: '/payments', icon: <CreditCard size={22} />, enDesc: 'Verify deposits and owner activation payment proof.', arDesc: 'التحقق من العربون وإثبات دفع تفعيل المالك.' },
  { id: 'dispatch', en: 'Live Dispatch', ar: 'الإرسال المباشر', route: '/technicians/map', icon: <Map size={22} />, enDesc: 'Technician coverage, location, and assignment visibility.', arDesc: 'تغطية الفنيين والموقع وظهور التعيينات.' },
  { id: 'launch', en: 'Launch Control', ar: 'التحكم بالإطلاق', route: '/ops/public-launch-command', icon: <ShieldCheck size={22} />, enDesc: 'Public launch gates, proof checks, and go or no-go signals.', arDesc: 'بوابات الإطلاق العام وفحوصات الإثبات وإشارات الانطلاق أو التوقف.' },
  { id: 'owners', en: 'Owner Activation', ar: 'تفعيل المالك', route: '/owners', icon: <Users size={22} />, enDesc: 'Owner approvals, property onboarding, documents, and trust gates.', arDesc: 'موافقات المالك وإضافة العقارات والمستندات وبوابات الثقة.' },
  { id: 'tenants', en: 'Tenant Control', ar: 'التحكم بالمستأجرين', route: '/tenants', icon: <Users size={22} />, enDesc: 'Tenant profiles, unit links, service state, and communication.', arDesc: 'ملفات المستأجرين وربط الوحدات وحالة الخدمة والتواصل.' },
  { id: 'technicians', en: 'Technician Corps', ar: 'طاقم الفنيين', route: '/technicians', icon: <Wrench size={22} />, enDesc: 'Technician profile, readiness, duty, and performance control.', arDesc: 'ملف الفني والاستعداد والوردية والتحكم بالأداء.' },
  { id: 'hr', en: 'HR Command', ar: 'قيادة الموارد البشرية', route: '/hr', icon: <Users size={22} />, enDesc: 'Staff registry, HR access, attendance, leave, and payroll handoff.', arDesc: 'سجل الموظفين وصلاحيات الموارد البشرية والحضور والإجازات وتسليم الرواتب.' },
  { id: 'contracts', en: 'Contract Control', ar: 'التحكم بالعقود', route: '/contracts', icon: <TicketCheck size={22} />, enDesc: 'Owner, tenant, broker, and platform contract operations.', arDesc: 'عمليات عقود المالك والمستأجر والوسيط والمنصة.' },
  { id: 'documents', en: 'Document Vault', ar: 'خزينة المستندات', route: '/document-vault', icon: <ShieldCheck size={22} />, enDesc: 'Institutional files, proof documents, and evidence packages.', arDesc: 'الملفات المؤسسية ومستندات الإثبات وحزم الأدلة.' },
  { id: 'broker', en: 'Broker Attribution', ar: 'إسناد الوسطاء', route: '/broker-attributions', icon: <TicketCheck size={22} />, enDesc: 'Broker source proof before contract activation.', arDesc: 'إثبات مصدر الوسيط قبل تفعيل العقد.' },
  { id: 'audit', en: 'Audit Log', ar: 'سجل التدقيق', route: '/audit', icon: <AlertTriangle size={22} />, enDesc: 'Systemic audit trail and admin evidence review.', arDesc: 'مسار التدقيق النظامي ومراجعة أدلة المسؤول.' },
  { id: 'units', en: 'Unit Status', ar: 'حالة الوحدات', route: '/admin/units', icon: <BarChart3 size={22} />, enDesc: 'Occupied, vacant, rentable, blocked, and service-linked units.', arDesc: 'وحدات مشغولة أو شاغرة أو قابلة للتأجير أو محظورة أو مربوطة بخدمة.' },
  { id: 'room-rent', en: 'Find Room Rent Ops', ar: 'عمليات إيجار الغرف', route: '/ops/marketplace-approvals', icon: <Users size={22} />, enDesc: 'BIN-managed vacant room listings and renter contact handling.', arDesc: 'قوائم الغرف الشاغرة بإدارة BIN ومعالجة تواصل المستأجرين.' },
  { id: 'messages', en: 'Operations Messages', ar: 'رسائل العمليات', route: '/ops/messages', icon: <TicketCheck size={22} />, enDesc: 'Tenant, owner, staff, and operational message center.', arDesc: 'مركز رسائل المستأجر والمالك والموظفين والعمليات.' },
  { id: 'control', en: 'Sovereign Control', ar: 'التحكم السيادي', route: '/control-center', icon: <BarChart3 size={22} />, enDesc: 'Full production control center instead of a missing dashboard route.', arDesc: 'مركز التحكم التشغيلي الكامل بدلاً من مسار لوحة مفقود.' },
];

const pilotMetrics = [
  { en: 'Calls avoided', ar: 'المكالمات المتجنبة', enTarget: '60% fewer follow-up calls', arTarget: 'انخفاض مكالمات المتابعة بنسبة 60%' },
  { en: 'Ticket speed', ar: 'سرعة التذاكر', enTarget: '80% submitted under 90 seconds', arTarget: '80% تُقدَّم في أقل من 90 ثانية' },
  { en: 'Proof completeness', ar: 'اكتمال الإثبات', enTarget: '95% jobs with full evidence', arTarget: '95% من المهام بإثبات كامل' },
  { en: 'Owner approval speed', ar: 'سرعة موافقة المالك', enTarget: 'Under 12 hours', arTarget: 'أقل من 12 ساعة' },
  { en: 'Tenant satisfaction', ar: 'رضا المستأجر', enTarget: '4.5/5 or higher', arTarget: '4.5/5 أو أعلى' },
  { en: 'Broker tracing', ar: 'تتبع الوسطاء', enTarget: '100% attributed deals', arTarget: '100% من الصفقات مسندة' },
];

export default function AdminSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const phrase = (en: string, arText: string) => (ar ? arText : en);

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff', direction: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' }}>
      <Stack spacing={4}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 3 }}>{phrase('ADMIN COMMAND CENTER', 'مركز قيادة المسؤول')}</Typography>
            <Typography variant="h3" sx={{ fontWeight: 950, mt: 1 }}>{phrase('Everything that needs control today', 'كل ما يحتاج إلى ضبط اليوم')}</Typography>
            <Typography sx={{ color: muted, mt: 1, maxWidth: 900 }}>
              {phrase('Start here: today\'s approvals, tickets and payments, then owners, tenants, technicians, HR, contracts, documents, unit status, room rent, messages and audit.', 'ابدأ من هنا: موافقات اليوم والتذاكر والمدفوعات، ثم الملاك والمستأجرون والفنيون والموارد البشرية والعقود والمستندات وحالة الوحدات وإيجار الغرف والرسائل والتدقيق.')}
            </Typography>
          </Box>
          <Chip icon={<ShieldCheck size={16} />} label={phrase('Admin access', 'صلاحية المسؤول')} sx={{ bgcolor: alpha(gold, 0.14), color: gold, fontWeight: 950 }} />
        </Stack>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(gold, 0.055), border: `1px solid ${alpha(gold, 0.18)}`, borderRadius: 5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 2 }}>{phrase('MAIN ADMIN ACTIONS', 'إجراءات المسؤول الرئيسية')}</Typography>
              <Typography variant="body2" sx={{ color: muted, mt: 0.5 }}>{phrase('Open the area you need. Each card goes straight to its page.', 'افتح القسم الذي تحتاجه. كل بطاقة تنتقل مباشرة إلى صفحتها.')}</Typography>
            </Box>
            <Grid container spacing={2}>
              {adminActions.map((action) => (
                <Grid item xs={12} sm={6} md={3} key={action.id}>
                  <Button fullWidth onClick={() => navigate(action.route)} sx={{ minHeight: 142, p: 2, alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, '&:hover': { bgcolor: alpha(gold, 0.12), borderColor: alpha(gold, 0.4) } }}>
                    <Stack spacing={1} alignItems="flex-start">
                      <Box sx={{ color: gold }}>{action.icon}</Box>
                      <Typography sx={{ fontWeight: 950 }}>{ar ? action.ar : action.en}</Typography>
                      <Typography variant="caption" sx={{ color: muted, lineHeight: 1.45 }}>{ar ? action.arDesc : action.enDesc}</Typography>
                    </Stack>
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 2 }}>{phrase('CANONICAL SLA SUMMARY', 'ملخص اتفاقيات الخدمة المعتمدة')}</Typography>
              <Typography variant="body2" sx={{ color: muted, mt: 0.5 }}>{phrase('Admin must use the same SLA ladder as tenant requests and Cloud Functions.', 'يجب أن يستخدم المسؤول نفس سلم اتفاقيات الخدمة المستخدم في طلبات المستأجر والدوال السحابية.')}</Typography>
            </Box>
            <Grid container spacing={2}>
              {slaPolicy.map((item) => (
                <Grid item xs={12} md={2.4} key={item.key}>
                  <Paper onClick={() => navigate(item.route)} sx={{ p: 2, cursor: 'pointer', height: '100%', bgcolor: alpha(gold, 0.055), border: `1px solid ${alpha(gold, 0.14)}`, borderRadius: 4 }}>
                    <Typography variant="caption" sx={{ color: gold, fontWeight: 950 }}>{item.key}</Typography>
                    <Typography sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{ar ? item.ar : item.en}</Typography>
                    <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{item.minutes}m</Typography>
                    <Typography variant="caption" sx={{ color: muted }}>{ar ? item.arCopy : item.enCopy}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 2 }}>{phrase('90-DAY PILOT PROOF', 'إثبات التجربة لمدة 90 يوماً')}</Typography>
              <Typography variant="body2" sx={{ color: muted, mt: 0.5 }}>{phrase('Targets required before major public commercial launch. No live measurement is wired for these yet, so no value or progress is shown.', 'أهداف مطلوبة قبل الإطلاق التجاري العام الرئيسي. لا يوجد قياس حي لهذه المؤشرات بعد، لذلك لا تُعرض قيمة أو تقدم.')}</Typography>
            </Box>
            <Grid container spacing={2}>
              {pilotMetrics.map((metric) => (
                <Grid item xs={12} md={6} key={metric.en}>
                  <Box sx={{ p: 2, bgcolor: 'rgba(2,6,23,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                      <Stack direction="row" spacing={1.2} alignItems="center">
                        <CheckCircle2 size={18} color={gold} />
                        <Typography sx={{ fontWeight: 950 }}>{ar ? metric.ar : metric.en}</Typography>
                      </Stack>
                      <Chip size="small" label={phrase('No data source yet', 'لا يوجد مصدر بيانات بعد')} sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: muted, fontWeight: 900 }} />
                    </Stack>
                    <Typography variant="caption" sx={{ color: muted }}>{phrase('Target', 'الهدف')}: {ar ? metric.arTarget : metric.enTarget}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, bgcolor: alpha('#f59e0b', 0.08), border: `1px solid ${alpha('#f59e0b', 0.24)}`, borderRadius: 5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Wrench size={20} color="#fbbf24" />
            <Box>
              <Typography sx={{ fontWeight: 950 }}>{phrase('Hard launch remains evidence-gated', 'الإطلاق الكامل ما زال مشروطاً بالأدلة')}</Typography>
              <Typography variant="body2" sx={{ color: muted }}>
                {phrase('The Admin surface is being repaired, but hard-launch status must still come from live production evidence, external service proof, and the five-profile smoke workflow.', 'يجري إصلاح واجهة المسؤول، لكن حالة الإطلاق الكامل يجب أن تبقى مستندة إلى أدلة الإنتاج الحي وإثبات الخدمات الخارجية ومسار التجربة للملفات الخمسة.')}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
