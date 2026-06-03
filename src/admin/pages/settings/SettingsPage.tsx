// admin-panel/src/pages/settings/SettingsPage.tsx
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Grid,
  Paper,
  Switch,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { ArrowRight, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { db, doc, onSnapshot, serverTimestamp, setDoc } from '@/lib/firebase';

interface SystemSettings {
  maintenanceMode: boolean;
  autoDispatchEnabled: boolean;
  maxTicketsPerTechnician: number;
  sosResponseTimeMinutes: number;
  turnoverQuoteAutoGeneration: boolean;
  paymentReminderDays: number;
  suspensionThreshold: number;
  binGroupFeePercent: number;
  partsMarkupPercent: number;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: SystemSettings = {
  maintenanceMode: false,
  autoDispatchEnabled: true,
  maxTicketsPerTechnician: 8,
  sosResponseTimeMinutes: 30,
  turnoverQuoteAutoGeneration: true,
  paymentReminderDays: 3,
  suspensionThreshold: 2,
  binGroupFeePercent: 5,
  partsMarkupPercent: 20,
  emailNotificationsEnabled: true,
  smsNotificationsEnabled: true,
};

const SETTINGS_DOC = ['settings', 'system'] as const;
const GOLD = '#DAA520';

const safeNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeSettings = (value?: Partial<SystemSettings> | null): SystemSettings => ({ ...DEFAULT_SETTINGS, ...(value || {}) });

export default function SettingsPage() {
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...SETTINGS_DOC), (snap) => {
      setSettings(normalizeSettings(snap.exists() ? (snap.data() as Partial<SystemSettings>) : null));
      setDirty(false);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Failed to load settings:', err);
      setSettings(DEFAULT_SETTINGS);
      setDirty(false);
      setLoading(false);
      setError(label('Settings could not be loaded from Firestore. Default settings are shown locally.', 'تعذر تحميل الإعدادات من فايرستور. يتم عرض الإعدادات الافتراضية محليًا.'));
    });
    return () => unsub();
  }, [lang]);

  const handleChange = (key: keyof SystemSettings, value: any) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await setDoc(doc(db, ...SETTINGS_DOC), {
        ...settings,
        updatedAt: serverTimestamp(),
        source: 'admin_settings_page',
      }, { merge: true });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(label('Failed to save settings to Firestore. Check admin permissions and rules.', 'فشل حفظ الإعدادات في فايرستور. تحقق من صلاحيات المدير وقواعد الأمان.'));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setSaved(false);
    setDirty(true);
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, color: '#fff', display: 'flex', gap: 2, alignItems: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
        <CircularProgress />
        <Typography>{label('Loading admin settings...', 'جارٍ تحميل إعدادات المدير...')}</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="h4" sx={{ mb: 4, color: '#FFF', fontWeight: 950, textAlign: isRTL ? 'right' : 'left' }}>
        {label('System Settings', 'إعدادات النظام')}
      </Typography>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>{label('Settings saved successfully to Firestore.', 'تم حفظ الإعدادات بنجاح في فايرستور.')}</Alert>}
      {dirty && <Alert severity="warning" sx={{ mb: 2 }}>{label('You have unpublished settings changes. Press Save Settings to publish them.', 'لديك تغييرات غير منشورة. اضغط حفظ الإعدادات لنشرها.')}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 4, background: 'linear-gradient(135deg, rgba(218, 165, 32, 0.1) 0%, rgba(218, 165, 32, 0.05) 100%)', border: '1px solid rgba(218, 165, 32, 0.3)', borderRadius: 4 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 3, gap: 2, flexWrap: 'wrap', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Box sx={{ p: 2, bgcolor: 'rgba(218, 165, 32, 0.1)', borderRadius: 3, color: GOLD }}><Building2 size={32} /></Box>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{label('Sovereign Institutional Profile', 'الملف المؤسسي السيادي')}</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{label('Manage company services, licenses, UAE coverage, and public profile data.', 'إدارة خدمات الشركة، الرخص، التغطية داخل الإمارات، وبيانات الملف العام.')}</Typography>
            </Box>
          </Box>
          <Button variant="contained" endIcon={<ArrowRight size={18} />} onClick={() => navigate('/admin/company-profile')} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950, px: 3, '&:hover': { bgcolor: alpha(GOLD, 0.8) }, '& .MuiButton-endIcon': { ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, transform: isRTL ? 'rotate(180deg)' : 'none' } }}>
            {label('Manage Identity', 'إدارة الهوية')}
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}><CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>{label('System Status', 'حالة النظام')}</Typography>
        <FormControlLabel control={<Switch checked={settings.maintenanceMode} onChange={(e) => handleChange('maintenanceMode', e.target.checked)} />} label={<Box><Typography variant="body1">{label('Maintenance Mode', 'وضع الصيانة')}</Typography><Typography variant="caption" color="textSecondary">{settings.maintenanceMode ? label('Users cannot access the system', 'لا يمكن للمستخدمين دخول النظام') : label('System is operating normally', 'النظام يعمل بشكل طبيعي')}</Typography></Box>} />
      </CardContent></Card>

      <Card sx={{ mb: 3 }}><CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>{label('Operational Settings', 'إعدادات التشغيل')}</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={settings.autoDispatchEnabled} onChange={(e) => handleChange('autoDispatchEnabled', e.target.checked)} />} label={label('Auto-Dispatch Tickets', 'الإرسال التلقائي للتذاكر')} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth type="number" label={label('Max Tickets per Technician', 'الحد الأقصى للتذاكر لكل فني')} value={settings.maxTicketsPerTechnician} onChange={(e) => handleChange('maxTicketsPerTechnician', safeNumber(e.target.value, DEFAULT_SETTINGS.maxTicketsPerTechnician))} /></Grid>
        </Grid>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}><TextField fullWidth type="number" label={label('SOS Response Time (minutes)', 'زمن استجابة الطوارئ بالدقائق')} value={settings.sosResponseTimeMinutes} onChange={(e) => handleChange('sosResponseTimeMinutes', safeNumber(e.target.value, DEFAULT_SETTINGS.sosResponseTimeMinutes))} /></Grid>
          <Grid item xs={12} sm={6}><FormControlLabel control={<Switch checked={settings.turnoverQuoteAutoGeneration} onChange={(e) => handleChange('turnoverQuoteAutoGeneration', e.target.checked)} />} label={label('Auto-Generate Turnover Quotes', 'إنشاء عروض الانتقال تلقائيًا')} /></Grid>
        </Grid>
      </CardContent></Card>

      <Card sx={{ mb: 3 }}><CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>{label('Financial Settings', 'الإعدادات المالية')}</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}><TextField fullWidth type="number" label={label('BIN GROUP Fee (%)', 'رسوم BIN GROUP (%)')} value={settings.binGroupFeePercent} onChange={(e) => handleChange('binGroupFeePercent', safeNumber(e.target.value, DEFAULT_SETTINGS.binGroupFeePercent))} inputProps={{ step: 0.1 }} /><Typography variant="caption" color="textSecondary">{label('Deducted from rent collections', 'تُخصم من تحصيلات الإيجار')}</Typography></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth type="number" label={label('Parts Markup (%)', 'هامش قطع الغيار (%)')} value={settings.partsMarkupPercent} onChange={(e) => handleChange('partsMarkupPercent', safeNumber(e.target.value, DEFAULT_SETTINGS.partsMarkupPercent))} inputProps={{ step: 0.1 }} /><Typography variant="caption" color="textSecondary">{label('Added to technician costs', 'تُضاف إلى تكاليف الفني')}</Typography></Grid>
        </Grid>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}><TextField fullWidth type="number" label={label('Payment Reminder (days)', 'تذكير الدفع بالأيام')} value={settings.paymentReminderDays} onChange={(e) => handleChange('paymentReminderDays', safeNumber(e.target.value, DEFAULT_SETTINGS.paymentReminderDays))} /><Typography variant="caption" color="textSecondary">{label('Send reminder after X days', 'إرسال التذكير بعد عدد الأيام المحدد')}</Typography></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth type="number" label={label('Suspension Threshold', 'حد الإيقاف')} value={settings.suspensionThreshold} onChange={(e) => handleChange('suspensionThreshold', safeNumber(e.target.value, DEFAULT_SETTINGS.suspensionThreshold))} /><Typography variant="caption" color="textSecondary">{label('Unpaid invoices before suspension', 'عدد الفواتير غير المدفوعة قبل الإيقاف')}</Typography></Grid>
        </Grid>
      </CardContent></Card>

      <Card sx={{ mb: 3 }}><CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>{label('Notification Settings', 'إعدادات الإشعارات')}</Typography>
        <FormControlLabel control={<Switch checked={settings.emailNotificationsEnabled} onChange={(e) => handleChange('emailNotificationsEnabled', e.target.checked)} />} label={label('Email Notifications', 'إشعارات البريد الإلكتروني')} />
        <FormControlLabel control={<Switch checked={settings.smsNotificationsEnabled} onChange={(e) => handleChange('smsNotificationsEnabled', e.target.checked)} />} label={label('SMS Notifications', 'إشعارات الرسائل النصية')} />
      </CardContent></Card>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? label('Saving...', 'جارٍ الحفظ...') : label('Save Settings', 'حفظ الإعدادات')}</Button>
        <Button variant="outlined" onClick={resetToDefaults} disabled={saving}>{label('Reset Draft to Defaults', 'إعادة المسودة إلى الإعدادات الافتراضية')}</Button>
      </Box>

      <Paper sx={{ p: 3, mt: 4, backgroundColor: '#f5f5f5', textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{label('System Information', 'معلومات النظام')}</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2"><strong>{label('Version:', 'الإصدار:')}</strong> 1.0.0</Typography>
            <Typography variant="body2"><strong>{label('Database:', 'قاعدة البيانات:')}</strong> Firebase Firestore</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body2"><strong>{label('API Server:', 'خادم الواجهة البرمجية:')}</strong> Firebase Functions / Firestore</Typography>
            <Typography variant="body2"><strong>{label('Last Updated:', 'آخر تحديث:')}</strong> {new Date().toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE')}</Typography>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}
