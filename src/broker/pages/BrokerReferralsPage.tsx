import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import { AlertCircle, Building, Building2, CheckCircle2, Clock, DollarSign, FileText, Info, Plus } from 'lucide-react';
import { collection, db, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from '../../lib/firebase';
import { logAuditAction } from '../../utils/auditLogger';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const clean = (value: unknown) => String(value || '').trim();
const amountOf = (value: unknown) => {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const uniqueRows = (rows: any[]) => Array.from(new Map(rows.map((row) => [String(row.id), row])).values());
const rowTime = (row: any) => row?.createdAt?.toDate ? row.createdAt.toDate().getTime() : row?.createdAt?.seconds ? row.createdAt.seconds * 1000 : 0;

export default function BrokerReferralsPage({ openFormByDefault = false }: { openFormByDefault?: boolean }) {
  const { user } = useRole();
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const copy = (en: string, arText: string) => ar ? arText : en;
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');

  const [openAdd, setOpenAdd] = useState(openFormByDefault);
  const [submitting, setSubmitting] = useState(false);
  const [referralType, setReferralType] = useState('property');
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [location, setLocation] = useState('');
  const [units, setUnits] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [notes, setNotes] = useState('');
  const [propertyReferenceId, setPropertyReferenceId] = useState('');
  const [contractType, setContractType] = useState('annual_lease');
  const [signedDate, setSignedDate] = useState(new Date().toISOString().split('T')[0]);
  const [brokerCommissionRate, setBrokerCommissionRate] = useState(0.10);

  useEffect(() => {
    if (openFormByDefault) setOpenAdd(true);
  }, [openFormByDefault]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'companyProfile'), (snap) => {
      if (snap.exists() && typeof snap.data().brokerCommissionRate === 'number') {
        setBrokerCommissionRate(snap.data().brokerCommissionRate);
      }
    }, (err) => console.warn('[BrokerReferrals] company settings listener failed:', err));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const buckets: Record<string, any[]> = {};
    const unsubs: Array<() => void> = [];
    const identitySources = [
      { field: 'brokerId', value: user.uid },
      { field: 'brokerUid', value: user.uid },
      { field: 'createdByUid', value: user.uid },
      { field: 'brokerEmail', value: normalizeEmail(user.email) },
    ].filter((source) => source.value);

    const refresh = () => {
      setReferrals(uniqueRows(Object.values(buckets).flat()).sort((a, b) => rowTime(b) - rowTime(a)));
      setLoading(false);
    };

    identitySources.forEach((source) => {
      const key = `${source.field}:${source.value}`;
      const q = query(collection(db, 'referrals'), where(source.field, '==', source.value), orderBy('createdAt', 'desc'));
      unsubs.push(onSnapshot(q, (snap) => {
        buckets[key] = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        refresh();
      }, (err) => {
        console.warn(`[BrokerReferrals] ${source.field} listener failed:`, err);
        setWarning(copy('Some referral records could not load. Check access if this persists.', 'تعذر تحميل بعض سجلات الإحالات. تحقق من الصلاحيات إذا استمرت المشكلة.'));
        setLoading(false);
      }));
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [ar, user?.uid, user?.email]);

  const resetForm = () => {
    setClientName('');
    setPhone('');
    setEmail('');
    setPropertyName('');
    setPropertyType('');
    setLocation('');
    setUnits('');
    setEstimatedValue('');
    setNotes('');
    setPropertyReferenceId('');
    setContractType('annual_lease');
    setSignedDate(new Date().toISOString().split('T')[0]);
  };

  const handleAddReferral = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.uid || !clientName.trim() || !propertyName.trim()) return;
    setSubmitting(true);
    setWarning('');

    try {
      const brokerId = String(user.uid);
      const brokerEmail = normalizeEmail(user.email);
      const brokerName = clean(user.displayName || user.email || 'Broker Partner');
      const estimatedAmount = amountOf(estimatedValue);
      const refRef = doc(collection(db, 'referrals'));
      const attributionId = `broker_referral_${brokerId}_${refRef.id}`;
      const finalPropertyName = clean(propertyName);
      const finalLocation = clean(location);
      const referenceId = clean(propertyReferenceId);

      const referralData: Record<string, unknown> = {
        attributionSource: 'BROKER_PORTAL_REFERRAL',
        sourceChannel: 'broker_portal',
        brokerId,
        brokerUid: brokerId,
        brokerEmail,
        brokerName,
        brokerDisplayName: brokerName,
        createdByUid: brokerId,
        broughtByRole: 'broker',
        broughtByUid: brokerId,
        broughtByEmail: brokerEmail,
        attributionId,
        sourceReferralId: refRef.id,
        referralType,
        clientName: clean(clientName),
        phone: clean(phone),
        email: normalizeEmail(email),
        propertyName: finalPropertyName,
        propertyType: clean(propertyType),
        location: finalLocation,
        units: clean(units),
        estimatedValue: estimatedAmount,
        notes: clean(notes),
        status: 'submitted',
        lifecycleStatus: 'REFERRAL_SUBMITTED',
        propertyReferenceId: referenceId || null,
        propertyReferenceVerification: referenceId ? 'PENDING_ADMIN_MATCH' : 'NOT_PROVIDED',
        attributionProof: {
          clientName: clean(clientName),
          phone: clean(phone),
          email: normalizeEmail(email),
          propertyName: finalPropertyName,
          location: finalLocation,
          estimatedValue: estimatedAmount,
          referralType,
          propertyReferenceId: referenceId || null,
          capturedFrom: 'broker_referrals_page',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (referralType === 'contract') {
        Object.assign(referralData, {
          contractType,
          signedDate,
          commissionStatus: 'PENDING',
          commissionRate: brokerCommissionRate,
          commissionAmount: Math.round(estimatedAmount * brokerCommissionRate),
          commissionCreationStatus: 'PENDING_ADMIN_CONTRACT_MATCH',
        });
      }

      await setDoc(refRef, referralData);
      await logAuditAction({
        action: 'BROKER_REFERRAL_SUBMITTED',
        targetType: 'BROKER_REFERRAL',
        targetId: refRef.id,
        metadata: {
          brokerId,
          brokerEmail,
          attributionId,
          referralType,
          clientName: clean(clientName),
          propertyReferenceId: referenceId || null,
          propertyName: finalPropertyName,
          estimatedAmount,
          contractType: referralType === 'contract' ? contractType : null,
        },
      });

      setOpenAdd(false);
      resetForm();
    } catch (err) {
      console.error('Failed to add referral', err);
      setWarning(copy('Referral could not be submitted. Check access or try again.', 'تعذر إرسال الإحالة. تحقق من الصلاحيات أو حاول مرة أخرى.'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (String(status || '').toLowerCase()) {
      case 'approved': return { color: '#10b981', icon: <CheckCircle2 size={14} />, label: copy('APPROVED', 'مقبول') };
      case 'rejected': return { color: '#ef4444', icon: <AlertCircle size={14} />, label: copy('REJECTED', 'مرفوض') };
      case 'under_review': return { color: binThemeTokens.gold, icon: <Clock size={14} />, label: copy('UNDER REVIEW', 'قيد المراجعة') };
      default: return { color: '#3b82f6', icon: <Clock size={14} />, label: copy('SUBMITTED', 'تم الإرسال') };
    }
  };

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <BrokerPageFrame
        title={copy('Referral Network', 'شبكة الإحالات')}
        subtitle={copy('Submit owner, property, and contract opportunities without exposing private owner portfolios.', 'أرسل فرص الملاك والعقارات والعقود دون كشف محافظ الملاك الخاصة.')}
        loading={loading}
        actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3 }}>{copy('SUBMIT REFERRAL', 'إرسال إحالة')}</Button>}
      >
        {warning && <Alert severity="warning" sx={{ mb: 3 }}>{warning}</Alert>}
        {referrals.length === 0 ? (
          <Paper sx={{ p: 10, textAlign: 'center', bgcolor: binThemeTokens.softCanvas, borderRadius: 6, border: '1px dashed #E5E7EB' }}>
            <Building2 size={48} color="#9CA3AF" />
            <Typography variant="h6" sx={{ color: '#9CA3AF', fontWeight: 900, mt: 2 }}>{copy('NO REFERRALS RECORDED', 'لا توجد إحالات')}</Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>{copy('Start by submitting a verified opportunity.', 'ابدأ بإرسال فرصة موثقة.')}</Typography>
          </Paper>
        ) : (
          <Stack spacing={3}>
            {referrals.map((ref) => {
              const status = getStatusConfig(ref.status);
              return (
                <Paper key={ref.id} sx={{ p: 0, bgcolor: binThemeTokens.softCanvas, borderRadius: 6, border: '1px solid #E5E7EB', overflow: 'hidden', '&:hover': { borderColor: alpha(status.color, 0.3), bgcolor: '#FFFFFF' } }}>
                  <Grid container>
                    <Grid item xs={1} md={0.5} sx={{ bgcolor: alpha(status.color, 0.1), borderRight: isRTL ? 'none' : '1px solid #E5E7EB', borderLeft: isRTL ? '1px solid #E5E7EB' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap', color: status.color, fontWeight: 950, fontSize: '0.6rem', letterSpacing: 2 }}>{status.label}</Box>
                    </Grid>
                    <Grid item xs={11} md={11.5} sx={{ p: 4 }}>
                      <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={3}>
                        <Box sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                            <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary}>{ref.clientName}</Typography>
                            <Chip label={String(ref.referralType || 'referral').toUpperCase()} size="small" />
                            <Chip label={ref.attributionId ? copy('ATTRIBUTED', 'تم الإسناد') : copy('ATTRIBUTION PENDING', 'الإسناد قيد الانتظار')} size="small" color={ref.attributionId ? 'success' : 'warning'} />
                          </Stack>
                          <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}><Building size={14} /> {ref.propertyName || copy('Unnamed Asset', 'عقار بدون اسم')} • {ref.location || copy('Unknown Location', 'موقع غير معروف')}</Typography>
                          <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mt: 1, wordBreak: 'break-all' }}>ATTRIBUTION: {ref.attributionId || `broker_referral_${user?.uid}_${ref.id}`}</Typography>
                          {ref.propertyReferenceId && <Typography variant="caption" sx={{ color: '#667085', display: 'block', mt: 0.5 }}>{copy('Property reference', 'مرجع العقار')}: {ref.propertyReferenceId} · {ref.propertyReferenceVerification}</Typography>}
                        </Box>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={4} sx={{ minWidth: { md: 400 } }}>
                          <Box><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950 }}>{copy('EST. VALUE', 'القيمة التقديرية')}</Typography><Typography variant="body1" fontWeight="950">{ref.estimatedValue ? `AED ${Number(ref.estimatedValue).toLocaleString()}` : 'N/A'}</Typography></Box>
                          <Box><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950 }}>{copy('COMMISSION', 'العمولة')}</Typography><Typography variant="body1" fontWeight="950">{ref.commissionAmount ? `AED ${Number(ref.commissionAmount).toLocaleString()}` : ref.commissionStatus || 'N/A'}</Typography></Box>
                          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}><Tooltip title={copy('Referral audit', 'سجل الإحالة')}><IconButton><FileText size={20} /></IconButton></Tooltip></Box>
                        </Stack>
                      </Stack>
                      {ref.notes && <Box sx={{ mt: 3, p: 2, bgcolor: '#F3F4F6', borderRadius: 3 }}><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{copy('NOTES', 'ملاحظات')}</Typography><Typography variant="body2" sx={{ mt: 0.5 }}>{ref.notes}</Typography></Box>}
                      <Divider sx={{ my: 3 }} />
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center"><Info size={16} color={binThemeTokens.gold} /><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{ref.commissionStatus ? `${copy('Commission', 'العمولة')}: ${ref.commissionStatus}` : copy('Awaiting Admin Review', 'بانتظار مراجعة الإدارة')}</Typography></Stack>
                    </Grid>
                  </Grid>
                </Paper>
              );
            })}
          </Stack>
        )}

        <Dialog open={openAdd} onClose={() => setOpenAdd(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 4, direction: isRTL ? 'rtl' : 'ltr' } }}>
          <DialogTitle sx={{ fontWeight: 950 }}>{copy('Submit New Referral', 'إرسال إحالة جديدة')}</DialogTitle>
          <form onSubmit={handleAddReferral}>
            <DialogContent>
              <Stack spacing={3} sx={{ mt: 1 }}>
                <Alert severity="info">{copy('Enter the opportunity details or an owner-provided property reference. BIN GROUP Admin will match it securely; brokers cannot browse private owner properties.', 'أدخل تفاصيل الفرصة أو مرجع العقار الذي قدمه المالك. ستقوم الإدارة بالمطابقة الآمنة؛ لا يمكن للوسيط تصفح عقارات الملاك الخاصة.')}</Alert>
                <TextField select label={copy('Referral Type', 'نوع الإحالة')} value={referralType} onChange={(event) => setReferralType(event.target.value)} fullWidth><MenuItem value="property">{copy('Property Owner / Asset', 'مالك / عقار')}</MenuItem><MenuItem value="contract">{copy('Contract / Lease Opportunity', 'فرصة عقد / إيجار')}</MenuItem></TextField>
                <Grid container spacing={2}><Grid item xs={12} md={6}><TextField required label={copy('Client / Owner Name', 'اسم العميل / المالك')} value={clientName} onChange={(event) => setClientName(event.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label={copy('Phone', 'الهاتف')} value={phone} onChange={(event) => setPhone(event.target.value)} fullWidth /></Grid><Grid item xs={12}><TextField label={copy('Email', 'البريد الإلكتروني')} value={email} onChange={(event) => setEmail(event.target.value)} fullWidth /></Grid></Grid>
                <Grid container spacing={2}><Grid item xs={12} md={6}><TextField required label={copy('Property Name', 'اسم العقار')} value={propertyName} onChange={(event) => setPropertyName(event.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label={copy('Property Reference ID (optional)', 'رقم مرجع العقار (اختياري)')} value={propertyReferenceId} onChange={(event) => setPropertyReferenceId(event.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label={copy('Property Type', 'نوع العقار')} value={propertyType} onChange={(event) => setPropertyType(event.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label={copy('Location', 'الموقع')} value={location} onChange={(event) => setLocation(event.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label={copy('Number of Units', 'عدد الوحدات')} value={units} onChange={(event) => setUnits(event.target.value)} fullWidth /></Grid></Grid>
                {referralType === 'contract' && <Grid container spacing={2}><Grid item xs={12} md={6}><TextField select label={copy('Contract Type', 'نوع العقد')} value={contractType} onChange={(event) => setContractType(event.target.value)} fullWidth><MenuItem value="annual_lease">{copy('Annual Lease', 'إيجار سنوي')}</MenuItem><MenuItem value="maintenance_contract">{copy('Maintenance Contract', 'عقد صيانة')}</MenuItem><MenuItem value="property_management">{copy('Property Management', 'إدارة عقارات')}</MenuItem></TextField></Grid><Grid item xs={12} md={6}><TextField type="date" label={copy('Signed / Expected Date', 'تاريخ التوقيع / المتوقع')} value={signedDate} onChange={(event) => setSignedDate(event.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid></Grid>}
                <TextField label={copy('Estimated Contract / Asset Value (AED)', 'القيمة التقديرية للعقد / العقار (درهم)')} value={estimatedValue} onChange={(event) => setEstimatedValue(event.target.value)} fullWidth InputProps={{ startAdornment: <DollarSign size={18} /> as any }} />
                <TextField label={copy('Notes', 'ملاحظات')} value={notes} onChange={(event) => setNotes(event.target.value)} multiline rows={3} fullWidth />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}><Button onClick={() => setOpenAdd(false)}>{copy('Cancel', 'إلغاء')}</Button><Button type="submit" variant="contained" disabled={submitting || !propertyName.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{submitting ? <CircularProgress size={20} /> : copy('Submit Referral', 'إرسال الإحالة')}</Button></DialogActions>
          </form>
        </Dialog>
      </BrokerPageFrame>
    </Box>
  );
}
