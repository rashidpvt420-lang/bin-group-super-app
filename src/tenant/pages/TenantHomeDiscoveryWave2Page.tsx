import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { BellRing, Brain, Home, Search, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';
import TenantMarketplacePage from './TenantMarketplacePage';

type SavedSearch = {
  searchId: string;
  label: string;
  alertsEnabled: boolean;
  filters: {
    query: string;
    propertyType: string;
    emirate: string;
    minRent: number;
    maxRent: number;
    bedrooms: string;
    furnishing: string;
  };
};

type Recommendation = {
  id: string;
  title: string;
  propertyType: string;
  area: string;
  emirate: string;
  annualRent: number;
  bedrooms: number;
  bathrooms: number;
  furnishing: string;
  imageUrls?: string[];
  permitVerified?: boolean;
  reason: string;
};

const gold = binThemeTokens.gold;

export default function TenantHomeDiscoveryWave2Page() {
  const { lang, isRTL, tx } = useLanguage();
  const copy = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);
  const [aiQuery, setAiQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingAlert, setSavingAlert] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);
  const [alertForm, setAlertForm] = useState({
    label: '', query: '', propertyType: 'ALL', emirate: 'ALL', maxRent: '', bedrooms: 'ALL', furnishing: 'ALL',
  });

  const loadSavedSearches = async () => {
    setLoadingAlerts(true);
    try {
      const call = httpsCallable(functions, 'listHomeDiscoverySavedSearches');
      const result: any = await call({});
      setSavedSearches(Array.isArray(result?.data?.searches) ? result.data.searches : []);
    } catch (error) {
      console.warn('[TenantHomeDiscoveryWave2] saved-search load failed', error);
    } finally {
      setLoadingAlerts(false);
    }
  };

  useEffect(() => { void loadSavedSearches(); }, []);

  const runAiMatch = async () => {
    if (aiQuery.trim().length < 3) return;
    setAiLoading(true);
    setNotice(null);
    try {
      const call = httpsCallable(functions, 'recommendHomeDiscoveryListings');
      const result: any = await call({ query: aiQuery.trim() });
      const data = result?.data || {};
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
      setAiProvider(String(data.provider || 'grounded-rules'));
      setNotice({ severity: 'info', text: String(data.message || copy('tenant.home.aiGrounded', 'Recommendations are grounded only in current verified BIN inventory.', 'التوصيات مبنية فقط على عقارات BIN الموثقة الحالية.')) });
    } catch (error: any) {
      console.error('[TenantHomeDiscoveryWave2] AI match failed', error);
      setNotice({ severity: 'error', text: copy('tenant.home.aiFailed', 'AI matching is temporarily unavailable. You can still use the verified filters below.', 'مطابقة الذكاء الاصطناعي غير متاحة مؤقتاً. لا يزال بإمكانك استخدام عوامل التصفية الموثقة أدناه.') });
    } finally {
      setAiLoading(false);
    }
  };

  const saveAlert = async () => {
    setSavingAlert(true);
    setNotice(null);
    try {
      const call = httpsCallable(functions, 'saveHomeDiscoverySearch');
      await call({
        label: alertForm.label.trim() || 'Saved home search',
        alertsEnabled: true,
        filters: {
          query: alertForm.query.trim(),
          propertyType: alertForm.propertyType,
          emirate: alertForm.emirate,
          minRent: 0,
          maxRent: Number(alertForm.maxRent || 0),
          bedrooms: alertForm.bedrooms,
          furnishing: alertForm.furnishing,
        },
      });
      setNotice({ severity: 'success', text: copy('tenant.home.alertSaved', 'Alert saved. BIN will notify you about new matching verified homes and price drops.', 'تم حفظ التنبيه. ستخطرك BIN بالعقارات الموثقة الجديدة المطابقة وانخفاضات الأسعار.') });
      setAlertForm({ label: '', query: '', propertyType: 'ALL', emirate: 'ALL', maxRent: '', bedrooms: 'ALL', furnishing: 'ALL' });
      await loadSavedSearches();
    } catch (error) {
      console.error('[TenantHomeDiscoveryWave2] save alert failed', error);
      setNotice({ severity: 'error', text: copy('tenant.home.alertFailed', 'Could not save this alert. Please try again.', 'تعذر حفظ هذا التنبيه. يرجى المحاولة مرة أخرى.') });
    } finally {
      setSavingAlert(false);
    }
  };

  const deleteAlert = async (searchId: string) => {
    try {
      const call = httpsCallable(functions, 'deleteHomeDiscoverySavedSearch');
      await call({ searchId });
      await loadSavedSearches();
    } catch (error) {
      console.error('[TenantHomeDiscoveryWave2] delete alert failed', error);
    }
  };

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3.5}>
        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: '#fff', border: `1px solid ${alpha(gold, 0.28)}`, boxShadow: '0 20px 55px rgba(17,24,39,0.08)' }}>
          <Stack spacing={2.2}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center">
              <Box sx={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: alpha(gold, 0.12), color: binThemeTokens.goldHover }}><SafeIcon icon={Brain} size={22} /></Box>
              <Box><Typography variant="h5" sx={{ fontWeight: 950 }}>{copy('tenant.home.aiTitle', 'AI Home Match', 'مطابقة المنزل بالذكاء الاصطناعي')}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{copy('tenant.home.aiSub', 'Grounded in live BIN-verified inventory only', 'مبنية فقط على مخزون BIN الموثق المباشر')}</Typography></Box>
            </Stack>
            <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{copy('tenant.home.aiHelp', 'Describe what you need naturally — for example: “furnished 2BR in Dubai under AED 90k, preferably near a gym and parking.” AI may rank listings, but it cannot invent price, availability or property facts.', 'صف احتياجك بشكل طبيعي — مثلاً: «شقة مفروشة غرفتين في دبي بأقل من 90 ألف درهم ويفضل وجود نادي وموقف». يمكن للذكاء الاصطناعي ترتيب النتائج لكنه لا يستطيع اختراع السعر أو التوفر أو بيانات العقار.')}</Typography>
            <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
              <TextField fullWidth value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder={copy('tenant.home.aiPlaceholder', 'Tell BIN what kind of home you want…', 'أخبر BIN بنوع المنزل الذي تبحث عنه…')} onKeyDown={(e) => { if (e.key === 'Enter') void runAiMatch(); }} />
              <Button variant="contained" disabled={aiLoading || aiQuery.trim().length < 3} onClick={runAiMatch} startIcon={aiLoading ? <CircularProgress size={18} color="inherit" /> : <SafeIcon icon={Sparkles} size={18} />} sx={{ minWidth: 180, bgcolor: gold, color: '#111827', fontWeight: 950 }}>{copy('tenant.home.aiButton', 'Find My Best Matches', 'ابحث عن أفضل تطابق')}</Button>
            </Stack>
            {aiProvider && <Chip size="small" icon={<SafeIcon icon={ShieldCheck} size={14} />} label={aiProvider === 'openai-grounded-ranking' ? copy('tenant.home.aiLive', 'AI-ranked · database-grounded', 'ترتيب ذكي · مبني على قاعدة البيانات') : copy('tenant.home.aiRules', 'Grounded matching', 'مطابقة موثقة')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', fontWeight: 900 }} />}
          </Stack>
        </Paper>

        {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}

        {recommendations.length > 0 && <Grid container spacing={2}>
          {recommendations.map((item) => (
            <Grid item xs={12} md={6} lg={4} key={item.id}>
              <Paper sx={{ height: '100%', overflow: 'hidden', borderRadius: 4, bgcolor: '#fff', border: `1px solid ${binThemeTokens.border}` }}>
                {item.imageUrls?.[0] ? <Box component="img" src={item.imageUrls[0]} alt={item.title} sx={{ width: '100%', height: 170, objectFit: 'cover', display: 'block' }} /> : <Box sx={{ height: 170, bgcolor: binThemeTokens.softCanvas, display: 'grid', placeItems: 'center', color: gold }}><SafeIcon icon={Home} size={46} /></Box>}
                <Stack spacing={1.1} sx={{ p: 2.2 }}>
                  <Typography sx={{ fontWeight: 950 }}>{item.title}</Typography>
                  <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{[item.area, item.emirate?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</Typography>
                  <Typography variant="h6" sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>{item.annualRent > 0 ? `AED ${Math.round(item.annualRent).toLocaleString()}/year` : copy('tenant.home.por', 'Price on request', 'السعر عند الطلب')}</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"><Chip size="small" label={`${item.bedrooms || 0} ${copy('tenant.home.bed', 'bed', 'غرفة')}`} /><Chip size="small" label={`${item.bathrooms || 0} ${copy('tenant.home.bath', 'bath', 'حمام')}`} />{item.permitVerified && <Chip size="small" color="success" label={copy('tenant.home.verified', 'Verified', 'موثق')} />}</Stack>
                  <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.6 }}>{item.reason}</Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>}

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 5, bgcolor: '#fff', border: `1px solid ${binThemeTokens.border}` }}>
          <Stack spacing={2.2}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center"><SafeIcon icon={BellRing} size={22} color={gold} /><Box><Typography variant="h6" sx={{ fontWeight: 950 }}>{copy('tenant.home.alertTitle', 'Saved Search Alerts', 'تنبيهات البحث المحفوظ')}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{copy('tenant.home.alertSub', 'Server-side alerts for new verified matches and real price drops', 'تنبيهات من الخادم للعقارات الجديدة المطابقة وانخفاضات الأسعار الحقيقية')}</Typography></Box></Stack>
            <Grid container spacing={1.5}>
              <Grid item xs={12} md={3}><TextField fullWidth label={copy('tenant.home.alertLabel', 'Alert name', 'اسم التنبيه')} value={alertForm.label} onChange={(e) => setAlertForm((current) => ({ ...current, label: e.target.value }))} /></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth label={copy('tenant.home.keywords', 'Area / keywords', 'المنطقة / كلمات البحث')} value={alertForm.query} onChange={(e) => setAlertForm((current) => ({ ...current, query: e.target.value }))} /></Grid>
              <Grid item xs={6} md={2}><FormControl fullWidth><InputLabel>{copy('tenant.home.type', 'Type', 'النوع')}</InputLabel><Select value={alertForm.propertyType} label={copy('tenant.home.type', 'Type', 'النوع')} onChange={(e) => setAlertForm((current) => ({ ...current, propertyType: String(e.target.value) }))}>{['ALL','ROOM','STUDIO','APARTMENT','VILLA','TOWNHOUSE','PENTHOUSE'].map((value) => <MenuItem key={value} value={value}>{value.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={6} md={2}><FormControl fullWidth><InputLabel>{copy('tenant.home.emirate', 'Emirate', 'الإمارة')}</InputLabel><Select value={alertForm.emirate} label={copy('tenant.home.emirate', 'Emirate', 'الإمارة')} onChange={(e) => setAlertForm((current) => ({ ...current, emirate: String(e.target.value) }))}>{['ALL','ABU_DHABI','DUBAI','SHARJAH','AJMAN','UMM_AL_QUWAIN','RAS_AL_KHAIMAH','FUJAIRAH'].map((value) => <MenuItem key={value} value={value}>{value.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={12} md={2}><TextField fullWidth type="number" label={copy('tenant.home.maxRent', 'Max annual rent', 'أقصى إيجار سنوي')} value={alertForm.maxRent} onChange={(e) => setAlertForm((current) => ({ ...current, maxRent: e.target.value }))} /></Grid>
              <Grid item xs={6} md={2}><FormControl fullWidth><InputLabel>{copy('tenant.home.beds', 'Beds', 'الغرف')}</InputLabel><Select value={alertForm.bedrooms} label={copy('tenant.home.beds', 'Beds', 'الغرف')} onChange={(e) => setAlertForm((current) => ({ ...current, bedrooms: String(e.target.value) }))}>{['ALL','0','1','2','3','4_PLUS'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={6} md={3}><FormControl fullWidth><InputLabel>{copy('tenant.home.furnishing', 'Furnishing', 'التأثيث')}</InputLabel><Select value={alertForm.furnishing} label={copy('tenant.home.furnishing', 'Furnishing', 'التأثيث')} onChange={(e) => setAlertForm((current) => ({ ...current, furnishing: String(e.target.value) }))}>{['ALL','FURNISHED','UNFURNISHED','PARTLY_FURNISHED'].map((value) => <MenuItem key={value} value={value}>{value.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={12} md={3}><Button fullWidth variant="outlined" disabled={savingAlert} onClick={saveAlert} startIcon={savingAlert ? <CircularProgress size={18} /> : <SafeIcon icon={BellRing} size={18} />} sx={{ height: '100%', minHeight: 56, borderColor: gold, color: binThemeTokens.goldHover, fontWeight: 950 }}>{copy('tenant.home.saveAlert', 'Save Alert', 'حفظ التنبيه')}</Button></Grid>
            </Grid>
            {loadingAlerts ? <CircularProgress size={22} sx={{ color: gold }} /> : savedSearches.length > 0 && <Stack spacing={1}>{savedSearches.map((search) => <Paper key={search.searchId} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={2}><Box><Typography sx={{ fontWeight: 900 }}>{search.label}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{[search.filters.query, search.filters.propertyType !== 'ALL' ? search.filters.propertyType : '', search.filters.emirate !== 'ALL' ? search.filters.emirate.replace(/_/g, ' ') : '', search.filters.maxRent > 0 ? `≤ AED ${Math.round(search.filters.maxRent).toLocaleString()}` : ''].filter(Boolean).join(' · ')}</Typography></Box><Button size="small" color="error" onClick={() => void deleteAlert(search.searchId)} startIcon={<SafeIcon icon={Trash2} size={15} />}>{copy('tenant.home.delete', 'Delete', 'حذف')}</Button></Stack></Paper>)}</Stack>}
          </Stack>
        </Paper>

        <Box id="verified-home-catalog"><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1.5 }}><SafeIcon icon={Search} size={20} color={gold} /><Typography variant="h5" sx={{ fontWeight: 950 }}>{copy('tenant.home.catalog', 'Verified Home Catalog', 'دليل المنازل الموثقة')}</Typography></Stack><TenantMarketplacePage /></Box>
      </Stack>
    </Box>
  );
}
