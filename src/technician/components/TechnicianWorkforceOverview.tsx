import React from 'react';
import { Alert, Box, Button, CircularProgress, Divider, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { AlertTriangle, CalendarDays, FileCheck2, ShieldCheck, UserRound, WalletCards } from 'lucide-react';
import { db, doc, getDoc, serverTimestamp, updateDoc } from '../../lib/firebase';
import { logAuditAction } from '../../utils/auditLogger';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Notice = { severity: 'success' | 'error' | 'warning' | 'info'; text: string };

const dateValue = (profile: any, ...keys: string[]) => keys.map((key) => profile?.[key]).find(Boolean) || '';
const daysUntil = (value: unknown): number | null => {
  if (!value) return null;
  const date = typeof (value as any)?.toDate === 'function' ? (value as any).toDate() : new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
};

export default function TechnicianWorkforceOverview() {
  const { user } = useRole();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const copy = (en: string, arText: string) => ar ? arText : en;
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<any>({});
  const [agreement, setAgreement] = React.useState<any>(null);
  const [accepting, setAccepting] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const load = React.useCallback(async () => {
    if (!user?.uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const [userSnap, technicianSnap, hrSnap, agreementSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'technicians', user.uid)),
        getDoc(doc(db, 'hrProfiles', user.uid)),
        getDoc(doc(db, 'staffAgreements', user.uid)),
      ]);
      setProfile({
        ...(userSnap.exists() ? userSnap.data() : {}),
        ...(technicianSnap.exists() ? technicianSnap.data() : {}),
        ...(hrSnap.exists() ? hrSnap.data() : {}),
      });
      setAgreement(agreementSnap.exists() ? { id: agreementSnap.id, ...agreementSnap.data() } : null);
    } catch (error: any) {
      setNotice({ severity: 'warning', text: error?.message || copy('Some workforce records could not be loaded.', 'تعذر تحميل بعض سجلات الموظف.') });
    } finally {
      setLoading(false);
    }
  }, [ar, user?.uid]);

  React.useEffect(() => { void load(); }, [load]);

  const acceptAgreement = async () => {
    if (!user?.uid || !agreement?.id) return;
    setAccepting(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, 'staffAgreements', agreement.id), {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        acceptedBy: user.uid,
      });
      await logAuditAction({
        action: 'STAFF_AGREEMENT_ACCEPTED',
        targetType: 'staffAgreements',
        targetId: agreement.id,
        metadata: {
          actorName: user.displayName || profile.displayName || profile.fullName || 'Staff Member',
          acceptanceMethod: 'paperless_staff_portal',
        },
      });
      setAgreement((current: any) => ({ ...current, status: 'accepted' }));
      setNotice({ severity: 'success', text: copy('Staff agreement accepted and recorded.', 'تم قبول اتفاقية الموظف وتسجيلها.') });
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || copy('Agreement acceptance failed.', 'فشل قبول الاتفاقية.') });
    } finally {
      setAccepting(false);
    }
  };

  const documentChecks = [
    { label: copy('Visa', 'الإقامة'), value: dateValue(profile, 'visaExpiry', 'visaExpiryDate') },
    { label: copy('Emirates ID', 'الهوية الإماراتية'), value: dateValue(profile, 'emiratesIdExpiry', 'eidExpiry') },
    { label: copy('Passport', 'جواز السفر'), value: dateValue(profile, 'passportExpiry', 'passportExpiryDate') },
    { label: copy('Medical Card', 'البطاقة الطبية'), value: dateValue(profile, 'medicalExpiry', 'healthCardExpiry') },
    { label: copy('Driving Licence', 'رخصة القيادة'), value: dateValue(profile, 'drivingLicenseExpiry') },
    { label: copy('Trade Certificate', 'شهادة المهنة'), value: dateValue(profile, 'tradeCertificateExpiry', 'certificationExpiry') },
  ].map((item) => ({ ...item, days: daysUntil(item.value) }));
  const complianceAlerts = documentChecks.filter((item) => item.days === null || item.days <= 30);
  const grossSalary = Number(profile.salary || profile.salaryPackage?.grossSalary || 0);
  const dispatchReady = complianceAlerts.every((item) => item.days !== null && item.days >= 0);

  if (loading) return <Paper sx={{ p: 3, mb: 3, borderRadius: 5, textAlign: 'center' }}><CircularProgress size={24} /><Typography sx={{ mt: 1 }}>{copy('Loading workforce records...', 'جاري تحميل سجلات الموظف...')}</Typography></Paper>;

  const rows: Array<[string, React.ReactNode]> = [
    [copy('Name', 'الاسم'), user?.displayName || profile.displayName || profile.fullName || '—'],
    [copy('Trade', 'المهنة'), profile.trade || profile.specialization || copy('General Maintenance', 'صيانة عامة')],
    [copy('Supervisor', 'المشرف'), profile.supervisorName || profile.managerName || '—'],
    [copy('Base Zone', 'منطقة العمل'), profile.baseZone || profile.emirate || '—'],
  ];
  const shiftRows: Array<[string, React.ReactNode]> = [
    [copy('Duty Status', 'حالة الدوام'), profile.dutyStatus || 'OFF'],
    [copy('Shift', 'الوردية'), profile.shiftName || profile.shift || profile.workingHours || '—'],
    [copy('Weekly Off', 'الإجازة الأسبوعية'), profile.offDay || '—'],
    [copy('Last Check-In', 'آخر تسجيل حضور'), profile.lastCheckIn || '—'],
  ];
  const payrollRows: Array<[string, React.ReactNode]> = [
    [copy('Basic Salary', 'الراتب الأساسي'), profile.basicSalary ? `AED ${Number(profile.basicSalary).toLocaleString()}` : '—'],
    [copy('Allowances', 'البدلات'), profile.allowances ? `AED ${Number(profile.allowances).toLocaleString()}` : '—'],
    [copy('Gross Salary', 'إجمالي الراتب'), grossSalary ? `AED ${grossSalary.toLocaleString()}` : '—'],
    [copy('WPS Status', 'حالة نظام حماية الأجور'), profile.wpsStatus || '—'],
  ];

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', mb: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{copy('WORKFORCE CONTROL', 'إدارة شؤون الموظف')}</Typography>
          <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950 }}>{copy('Employment, Shift, Payroll & Compliance', 'العمل والوردية والرواتب والامتثال')}</Typography>
        </Box>
        {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>}

        <Grid container spacing={2}>
          {[
            { label: copy('Dispatch Readiness', 'جاهزية التوزيع'), value: dispatchReady ? copy('READY', 'جاهز') : copy('HR REVIEW', 'مراجعة الموارد البشرية'), color: dispatchReady ? '#10b981' : '#f59e0b', icon: <ShieldCheck size={21} /> },
            { label: copy('Leave Balance', 'رصيد الإجازة'), value: `${Number(profile.leaveBalance ?? 30)} ${copy('days', 'يوماً')}`, color: '#3b82f6', icon: <CalendarDays size={21} /> },
            { label: copy('Payroll Status', 'حالة الرواتب'), value: profile.payrollStatus || 'ACTIVE', color: '#10b981', icon: <WalletCards size={21} /> },
            { label: copy('Document Alerts', 'تنبيهات المستندات'), value: complianceAlerts.length, color: complianceAlerts.length ? '#ef4444' : '#10b981', icon: <AlertTriangle size={21} /> },
          ].map((card) => <Grid item xs={12} sm={6} md={3} key={card.label}><Paper sx={{ p: 2.5, height: '100%', borderRadius: 4, bgcolor: alpha(card.color, 0.07), border: `1px solid ${alpha(card.color, 0.22)}` }}><Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{card.value}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>{card.label.toUpperCase()}</Typography></Paper></Grid>)}
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} md={4}><InfoPanel title={copy('Staff Profile', 'ملف الموظف')} icon={<UserRound size={21} />} rows={rows} isRTL={isRTL} /></Grid>
          <Grid item xs={12} md={4}><InfoPanel title={copy('Shift & Attendance', 'الوردية والحضور')} icon={<CalendarDays size={21} />} rows={shiftRows} isRTL={isRTL} /></Grid>
          <Grid item xs={12} md={4}><InfoPanel title={copy('Payroll', 'الرواتب')} icon={<WalletCards size={21} />} rows={payrollRows} isRTL={isRTL} /></Grid>
        </Grid>

        {complianceAlerts.length > 0 && <Paper sx={{ p: 3, borderRadius: 5, bgcolor: alpha('#ef4444', 0.07), border: `1px solid ${alpha('#ef4444', 0.22)}` }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ mb: 2 }}><AlertTriangle color="#ef4444" /><Typography sx={{ color: '#fff', fontWeight: 950 }}>{copy('Document Compliance Alerts', 'تنبيهات امتثال المستندات')}</Typography></Stack><Grid container spacing={1.5}>{complianceAlerts.map((item) => <Grid item xs={12} sm={6} md={4} key={item.label}><Alert severity={item.days !== null && item.days < 0 ? 'error' : item.days !== null ? 'warning' : 'info'}>{item.label}: {item.days === null ? copy('record missing', 'السجل مفقود') : item.days < 0 ? copy('expired', 'منتهي') : `${item.days} ${copy('days remaining', 'يوماً متبقياً')}`}</Alert></Grid>)}</Grid></Paper>}

        {agreement && String(agreement.status || '').toLowerCase() !== 'accepted' && <Paper sx={{ p: 3, borderRadius: 5, bgcolor: alpha(binThemeTokens.gold, 0.08), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><FileCheck2 color={binThemeTokens.gold} /><Box sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}><Typography sx={{ color: '#fff', fontWeight: 950 }}>{copy('Pending Staff Agreement', 'اتفاقية موظف بانتظار القبول')}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 1, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto' }}>{agreement.agreementText || copy('Review and accept the staff acknowledgement.', 'راجع واقبل إقرار الموظف.')}</Typography></Box><Button variant="contained" disabled={accepting} onClick={acceptAgreement} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{accepting ? <CircularProgress size={18} /> : copy('Accept Digitally', 'قبول إلكتروني')}</Button></Stack></Paper>}
      </Stack>
    </Box>
  );
}

function InfoPanel({ title, icon, rows, isRTL }: { title: string; icon: React.ReactNode; rows: Array<[string, React.ReactNode]>; isRTL: boolean }) {
  return <Paper sx={{ p: 3, height: '100%', borderRadius: 5, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)' }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center" sx={{ mb: 2, color: binThemeTokens.gold }}><>{icon}</><Typography sx={{ color: '#fff', fontWeight: 950 }}>{title}</Typography></Stack><Stack spacing={1.2}>{rows.map(([label, value]) => <React.Fragment key={label}><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" gap={2}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>{label}</Typography><Typography variant="body2" sx={{ color: '#fff', fontWeight: 800, textAlign: isRTL ? 'left' : 'right' }}>{value}</Typography></Stack><Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} /></React.Fragment>)}</Stack></Paper>;
}
