import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
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
import { Bath, BedDouble, Home, MapPin, Search, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

type PublicListing = {
  id: string;
  title: string;
  propertyName?: string;
  propertyType: string;
  area: string;
  emirate: string;
  annualRent: number;
  bedrooms: number;
  bathrooms: number;
  areaSqFt: number;
  furnishing: string;
  availableFrom?: string;
  numberOfCheques?: number;
  imageUrls?: string[];
  amenities?: string[];
  permitVerified?: boolean;
  permitNumber?: string;
  permitVerificationUrl?: string;
};

const gold = binThemeTokens.gold;

export default function PublicHomeDiscoveryPage() {
  const navigate = useNavigate();
  const { lang, isRTL, tx } = useLanguage();
  const copy = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [error, setError] = useState('');
  const [queryText, setQueryText] = useState('');
  const [propertyType, setPropertyType] = useState('ALL');
  const [emirate, setEmirate] = useState('ALL');
  const [maxRent, setMaxRent] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const call = httpsCallable(functions, 'getPublicHomeDiscoveryListings');
        const result: any = await call({});
        setListings(Array.isArray(result?.data?.listings) ? result.data.listings : []);
      } catch (err) {
        console.error('[PublicHomeDiscovery] load failed', err);
        setError(copy('public.home.failed', 'Verified homes could not be loaded right now. Please try again later.', 'تعذر تحميل المنازل الموثقة حالياً. يرجى المحاولة لاحقاً.'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => listings.filter((item) => {
    const query = queryText.trim().toLowerCase();
    const haystack = [item.title, item.propertyName, item.area, item.emirate, item.propertyType, ...(item.amenities || [])].join(' ').toLowerCase();
    if (query && !query.split(/\s+/).every((term) => haystack.includes(term))) return false;
    if (propertyType !== 'ALL' && item.propertyType !== propertyType) return false;
    if (emirate !== 'ALL' && item.emirate !== emirate) return false;
    const max = Number(maxRent || 0);
    if (max > 0 && item.annualRent > max) return false;
    return true;
  }), [listings, queryText, propertyType, emirate, maxRent]);

  const startTenantJourney = () => navigate(`/login?intendedRole=tenant&returnTo=${encodeURIComponent('/tenant/homes')}`);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: binThemeTokens.textPrimary, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 7 } }}>
        <Stack spacing={4}>
          <Stack spacing={2} sx={{ maxWidth: 900 }}>
            <Typography variant="h2" sx={{ fontWeight: 950, letterSpacing: -2.2, lineHeight: 1.02 }}>{copy('public.home.title', 'Find a verified BIN home before you sign in.', 'ابحث عن منزل موثق من BIN قبل تسجيل الدخول.')}</Typography>
            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700, lineHeight: 1.6 }}>{copy('public.home.sub', 'Browse sanitized, Admin-verified rental inventory. Public browsing never exposes owner identity, exact private property coordinates or internal operational records.', 'تصفح عقارات إيجار موثقة من المسؤول وببيانات عامة آمنة. التصفح العام لا يكشف هوية المالك أو الإحداثيات الخاصة الدقيقة أو السجلات التشغيلية الداخلية.')}</Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"><Chip icon={<SafeIcon icon={ShieldCheck} size={15} />} label={copy('public.home.verifiedOnly', 'Verified listings only', 'إعلانات موثقة فقط')} sx={{ fontWeight: 900 }} /><Chip icon={<SafeIcon icon={MapPin} size={15} />} label={copy('public.home.privateLocation', 'Privacy-safe location', 'موقع آمن للخصوصية')} sx={{ fontWeight: 900 }} /></Stack>
          </Stack>

          <Paper sx={{ p: 2.5, borderRadius: 4, border: `1px solid ${binThemeTokens.border}`, bgcolor: binThemeTokens.softCanvas }}>
            <Grid container spacing={1.5} alignItems="center">
              <Grid item xs={12} md={5}><TextField fullWidth value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder={copy('public.home.search', 'Search area, community, type or amenity', 'ابحث عن منطقة أو نوع عقار أو ميزة')} InputProps={{ startAdornment: <SafeIcon icon={Search} size={18} color={gold} /> }} /></Grid>
              <Grid item xs={6} md={2}><FormControl fullWidth><InputLabel>{copy('public.home.type', 'Type', 'النوع')}</InputLabel><Select value={propertyType} label={copy('public.home.type', 'Type', 'النوع')} onChange={(e) => setPropertyType(String(e.target.value))}>{['ALL','ROOM','STUDIO','APARTMENT','VILLA','TOWNHOUSE','PENTHOUSE'].map((value) => <MenuItem key={value} value={value}>{value.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={6} md={2}><FormControl fullWidth><InputLabel>{copy('public.home.emirate', 'Emirate', 'الإمارة')}</InputLabel><Select value={emirate} label={copy('public.home.emirate', 'Emirate', 'الإمارة')} onChange={(e) => setEmirate(String(e.target.value))}>{['ALL','ABU_DHABI','DUBAI','SHARJAH','AJMAN','UMM_AL_QUWAIN','RAS_AL_KHAIMAH','FUJAIRAH'].map((value) => <MenuItem key={value} value={value}>{value.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={12} md={3}><TextField fullWidth type="number" label={copy('public.home.maxRent', 'Max annual rent (AED)', 'أقصى إيجار سنوي (درهم)')} value={maxRent} onChange={(e) => setMaxRent(e.target.value)} /></Grid>
            </Grid>
          </Paper>

          {error && <Alert severity="warning">{error}</Alert>}
          {loading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}><CircularProgress sx={{ color: gold }} /></Box> : (
            <Grid container spacing={2.5}>
              {filtered.map((item) => (
                <Grid item xs={12} md={6} lg={4} key={item.id}>
                  <Paper sx={{ height: '100%', overflow: 'hidden', borderRadius: 5, border: `1px solid ${binThemeTokens.border}`, boxShadow: '0 14px 34px rgba(17,24,39,0.06)' }}>
                    {item.imageUrls?.[0] ? <Box component="img" src={item.imageUrls[0]} alt={item.title} sx={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} /> : <Box sx={{ height: 220, display: 'grid', placeItems: 'center', bgcolor: binThemeTokens.softCanvas, color: gold }}><SafeIcon icon={Home} size={52} /></Box>}
                    <Stack spacing={1.2} sx={{ p: 2.4 }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}><Typography sx={{ fontWeight: 950 }}>{item.title}</Typography><Chip size="small" color="success" label={copy('public.home.binVerified', 'BIN VERIFIED', 'موثق BIN')} /></Stack>
                      <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{[item.area, item.emirate?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</Typography>
                      <Typography variant="h5" sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>{item.annualRent > 0 ? `AED ${Math.round(item.annualRent).toLocaleString()}/year` : copy('public.home.por', 'Price on request', 'السعر عند الطلب')}</Typography>
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"><Chip size="small" icon={<SafeIcon icon={BedDouble} size={14} />} label={item.bedrooms === 0 ? copy('public.home.studio', 'Studio', 'استوديو') : `${item.bedrooms} ${copy('public.home.bed', 'bed', 'غرفة')}`} /><Chip size="small" icon={<SafeIcon icon={Bath} size={14} />} label={`${item.bathrooms || 0} ${copy('public.home.bath', 'bath', 'حمام')}`} />{item.areaSqFt > 0 && <Chip size="small" label={`${Math.round(item.areaSqFt).toLocaleString()} ft²`} />}</Stack>
                      <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{copy('public.home.privacyNote', 'Exact address and private owner details are shown only after secure tenant sign-in when operationally required.', 'يظهر العنوان الدقيق وبيانات المالك الخاصة فقط بعد تسجيل دخول المستأجر بشكل آمن وعند الحاجة التشغيلية.')}</Typography>
                      <Button variant="contained" onClick={startTenantJourney} sx={{ mt: 0.8, bgcolor: gold, color: '#111827', fontWeight: 950 }}>{copy('public.home.continue', 'Sign in to view & apply', 'سجل الدخول للعرض والتقديم')}</Button>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
              {!filtered.length && <Grid item xs={12}><Paper sx={{ p: 5, textAlign: 'center', borderRadius: 4, bgcolor: binThemeTokens.softCanvas }}><Typography variant="h6" sx={{ fontWeight: 900 }}>{copy('public.home.none', 'No verified public listings match those filters yet.', 'لا توجد إعلانات عامة موثقة تطابق عوامل التصفية حالياً.')}</Typography></Paper></Grid>}
            </Grid>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
