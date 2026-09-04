import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import {
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Heart,
  Home,
  MapPin,
  Maximize2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { addDoc, collection, db, onSnapshot, query, serverTimestamp, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

type RepairRow = {
  date?: string;
  title?: string;
  issue?: string;
  status?: string;
  cost?: number;
};

type HomeListing = {
  id: string;
  recordType?: string;
  listingType?: string;
  active?: boolean;
  approved?: boolean;
  status?: string;
  notRented?: boolean;
  hasBinContract?: boolean;
  title?: string;
  unitTitle?: string;
  propertyName?: string;
  propertyAddress?: string;
  area?: string;
  community?: string;
  city?: string;
  emirate?: string;
  annualRent?: number;
  monthlyRent?: number;
  bedrooms?: string | number;
  bathrooms?: string | number;
  areaSqFt?: number;
  propertyType?: string;
  furnishing?: string;
  furnished?: boolean;
  availableFrom?: string;
  numberOfCheques?: number;
  securityDeposit?: number;
  ownerId?: string;
  ownerEmail?: string;
  propertyId?: string;
  imageUrls?: string[];
  photos?: string[];
  coverImageUrl?: string;
  imageUrl?: string;
  amenities?: string[];
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  permitNumber?: string;
  permitVerified?: boolean;
  permitVerificationUrl?: string;
  repairHistory?: RepairRow[];
  repairHistorySummary?: string;
  contractScope?: string;
};

type FilterState = {
  query: string;
  propertyType: string;
  emirate: string;
  minRent: string;
  maxRent: string;
  bedrooms: string;
  furnishing: string;
};

const gold = binThemeTokens.gold;
const FAVORITES_KEY = 'bin_tenant_home_favorites_v1';
const SAVED_SEARCH_KEY = 'bin_tenant_home_search_v1';
const HOME_RECORD_TYPES = new Set([
  'ROOM_RENT_LISTING',
  'FIND_ROOM_RENT',
  'HOME_RENT_LISTING',
  'PROPERTY_RENT_LISTING',
  'RENTAL_LISTING',
]);

const emptyFilters: FilterState = {
  query: '',
  propertyType: 'ALL',
  emirate: 'ALL',
  minRent: '',
  maxRent: '',
  bedrooms: 'ALL',
  furnishing: 'ALL',
};

function numberValue(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function annualRentValue(listing: HomeListing) {
  const annual = numberValue(listing.annualRent);
  if (annual > 0) return annual;
  const monthly = numberValue(listing.monthlyRent);
  return monthly > 0 ? monthly * 12 : 0;
}

function money(value: unknown) {
  const amount = numberValue(value);
  return amount > 0 ? `AED ${Math.round(amount).toLocaleString()}` : 'Price on request';
}

function titleCase(value: unknown, fallback = '') {
  const text = String(value || fallback).trim();
  if (!text) return fallback;
  return text
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isHomeRentListing(row: HomeListing) {
  const recordType = String(row.recordType || row.listingType || '').toUpperCase();
  const status = String(row.status || 'AVAILABLE').toUpperCase();
  return HOME_RECORD_TYPES.has(recordType)
    && row.active !== false
    && row.approved !== false
    && row.hasBinContract !== false
    && row.notRented !== false
    && !['RENTED', 'CLOSED', 'INACTIVE', 'WITHDRAWN'].includes(status);
}

function listingImages(listing: HomeListing) {
  const values = [
    ...(Array.isArray(listing.imageUrls) ? listing.imageUrls : []),
    ...(Array.isArray(listing.photos) ? listing.photos : []),
    listing.coverImageUrl,
    listing.imageUrl,
  ];
  return [...new Set(values.map((item) => String(item || '').trim()).filter((item) => /^https?:\/\//i.test(item)))].slice(0, 12);
}

function locationLabel(listing: HomeListing) {
  return [listing.area || listing.community || listing.city, listing.emirate]
    .filter(Boolean)
    .join(', ') || listing.propertyAddress || 'UAE';
}

function listingTypeLabel(listing: HomeListing) {
  return titleCase(listing.propertyType, Number(listing.bedrooms) === 0 ? 'Studio' : 'Home');
}

function normalizedBedroom(value: string | number | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function matchesQuery(listing: HomeListing, filters: FilterState) {
  const queryValue = filters.query.trim().toLowerCase();
  const haystack = [
    listing.title,
    listing.unitTitle,
    listing.propertyName,
    listing.propertyAddress,
    listing.area,
    listing.community,
    listing.city,
    listing.emirate,
    listing.propertyType,
    ...(listing.amenities || []),
  ].join(' ').toLowerCase();

  if (queryValue && !queryValue.split(/\s+/).every((term) => haystack.includes(term))) return false;

  if (filters.propertyType !== 'ALL') {
    const type = String(listing.propertyType || '').toUpperCase();
    if (type !== filters.propertyType) return false;
  }

  if (filters.emirate !== 'ALL' && String(listing.emirate || '').toUpperCase() !== filters.emirate) return false;

  const annualRent = annualRentValue(listing);
  const minRent = numberValue(filters.minRent);
  const maxRent = numberValue(filters.maxRent);
  if (minRent > 0 && annualRent > 0 && annualRent < minRent) return false;
  if (maxRent > 0 && annualRent > maxRent) return false;

  if (filters.bedrooms !== 'ALL') {
    const bedrooms = normalizedBedroom(listing.bedrooms);
    if (filters.bedrooms === '4_PLUS') {
      if (bedrooms === null || bedrooms < 4) return false;
    } else if (bedrooms !== Number(filters.bedrooms)) {
      return false;
    }
  }

  if (filters.furnishing !== 'ALL') {
    const furnishing = String(listing.furnishing || (listing.furnished === true ? 'FURNISHED' : '')).toUpperCase();
    if (!furnishing.includes(filters.furnishing)) return false;
  }

  return true;
}

export default function TenantMarketplacePage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<HomeListing[]>([]);
  const [filters, setFilters] = useState<FilterState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_SEARCH_KEY) || 'null');
      return saved && typeof saved === 'object' ? { ...emptyFilters, ...saved } : emptyFilters;
    } catch {
      return emptyFilters;
    }
  });
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return Array.isArray(saved) ? saved.map(String) : [];
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState<HomeListing | null>(null);
  const [submittingKey, setSubmittingKey] = useState('');
  const [notice, setNotice] = useState('');
  const copy = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));

  useEffect(() => {
    const listingsQuery = query(collection(db, 'contractorProfiles'), where('active', '==', true));
    const unsub = onSnapshot(listingsQuery, (snap) => {
      setListings(snap.docs.map((item) => ({ id: item.id, ...item.data() } as HomeListing)).filter(isHomeRentListing));
      setLoading(false);
    }, (err) => {
      console.warn('[TenantHomeDiscovery] listing listener failed:', err);
      setListings([]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const propertyTypes = useMemo(() => [...new Set(listings.map((item) => String(item.propertyType || '').toUpperCase()).filter(Boolean))].sort(), [listings]);
  const emirates = useMemo(() => [...new Set(listings.map((item) => String(item.emirate || '').toUpperCase()).filter(Boolean))].sort(), [listings]);
  const filteredListings = useMemo(() => listings.filter((item) => matchesQuery(item, filters)), [listings, filters]);

  const setFilter = (key: keyof FilterState, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  const toggleFavorite = (listingId: string) => {
    setFavorites((current) => {
      const next = current.includes(listingId) ? current.filter((id) => id !== listingId) : [...current, listingId];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const saveSearch = () => {
    localStorage.setItem(SAVED_SEARCH_KEY, JSON.stringify(filters));
    setNotice(copy('tenant.home.searchSaved', 'Search saved on this device. Your filters will be ready next time.', 'تم حفظ البحث على هذا الجهاز. ستبقى عوامل التصفية جاهزة في المرة القادمة.'));
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    localStorage.removeItem(SAVED_SEARCH_KEY);
  };

  async function submitInterest(listing: HomeListing, requestMode: 'VIEWING' | 'APPLY') {
    if (!user?.uid || !user?.email) {
      setNotice(copy('tenant.home.loginRequired', 'Please sign in with your tenant account before requesting a viewing or applying.', 'يرجى تسجيل الدخول بحساب المستأجر قبل طلب المعاينة أو التقديم.'));
      return;
    }

    const key = `${listing.id}:${requestMode}`;
    setSubmittingKey(key);
    setNotice('');
    try {
      await addDoc(collection(db, 'jobPostings'), {
        type: 'ROOM_RENT_APPLICATION',
        applicationKind: 'HOME_RENT_APPLICATION',
        requestMode,
        source: 'tenant_home_discovery_v1',
        listingId: listing.id,
        listingTitle: listing.unitTitle || listing.title || listing.propertyName || 'BIN home listing',
        propertyId: listing.propertyId || null,
        propertyType: listing.propertyType || null,
        propertyAddress: listing.propertyAddress || null,
        area: listing.area || listing.community || null,
        emirate: listing.emirate || null,
        annualRent: annualRentValue(listing) || null,
        ownerId: listing.ownerId || null,
        ownerEmail: String(listing.ownerEmail || '').toLowerCase(),
        tenantId: user.uid,
        tenantEmail: String(user.email || '').toLowerCase(),
        tenantName: user.displayName || user.email,
        tenantLifecycleStage: 'APPLICANT',
        status: 'OPEN',
        stage: requestMode === 'VIEWING' ? 'VIEWING_REQUESTED' : 'APPLICATION_SUBMITTED',
        requestedContractHandling: requestMode === 'APPLY',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotice(requestMode === 'VIEWING'
        ? copy('tenant.home.viewingSent', 'Viewing request sent. BIN GROUP will coordinate the next available time.', 'تم إرسال طلب المعاينة. ستقوم BIN GROUP بتنسيق أقرب موعد متاح.')
        : copy('tenant.home.applicationSent', 'Application sent. BIN GROUP will coordinate the owner review and contract journey.', 'تم إرسال الطلب. ستنسق BIN GROUP مراجعة المالك ومسار العقد.'));
    } catch (err) {
      console.error('[TenantHomeDiscovery] interest submission failed:', err);
      setNotice(copy('tenant.home.requestFailed', 'The request could not be sent. Please try again or contact BIN GROUP support.', 'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى أو التواصل مع دعم BIN GROUP.'));
    } finally {
      setSubmittingKey('');
    }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: gold }} /></Box>;
  }

  return (
    <Box sx={{ py: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3.5}>
        <Paper sx={{ p: { xs: 3, md: 4.5 }, bgcolor: '#fff', border: `1px solid ${alpha(gold, 0.24)}`, borderRadius: 6, boxShadow: '0 22px 60px rgba(15,23,42,0.09)', overflow: 'hidden', position: 'relative' }}>
          <Box sx={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', bgcolor: alpha(gold, 0.08), top: -110, right: isRTL ? 'auto' : -80, left: isRTL ? -80 : 'auto' }} />
          <Stack spacing={2.3} sx={{ position: 'relative' }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
              <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: alpha(gold, 0.14), color: binThemeTokens.goldHover }}><SafeIcon icon={Search} size={22} /></Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2.4 }}>
                {copy('tenant.home.overline', 'BIN HOME DISCOVERY', 'اكتشف منزلك مع BIN')}
              </Typography>
            </Stack>
            <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, maxWidth: 850, lineHeight: 1.08 }}>
              {copy('tenant.home.title', 'Find a room, apartment, villa or home — then manage the tenancy in the same app.', 'ابحث عن غرفة أو شقة أو فيلا أو منزل — ثم أدر الإيجار بالكامل من نفس التطبيق.')}
            </Typography>
            <Typography sx={{ color: binThemeTokens.textSecondary, maxWidth: 900, fontWeight: 650, lineHeight: 1.7 }}>
              {copy('tenant.home.desc', 'Browse BIN-managed and BIN-verified inventory by location, price, property type and bedrooms. Save homes, request a viewing, apply, and continue into contracts, payments, move-in and maintenance without creating another profile.', 'تصفح العقارات التي تديرها أو تتحقق منها BIN حسب الموقع والسعر ونوع العقار وعدد الغرف. احفظ العقارات واطلب معاينة وقدّم طلبك ثم انتقل إلى العقود والمدفوعات والاستلام والصيانة دون إنشاء ملف جديد.')}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip icon={<SafeIcon icon={ShieldCheck} size={14} />} label={copy('tenant.home.verified', 'BIN verified', 'موثق من BIN')} sx={{ bgcolor: alpha('#16A34A', 0.1), color: '#15803D', fontWeight: 900 }} />
              <Chip icon={<SafeIcon icon={CalendarDays} size={14} />} label={copy('tenant.home.viewings', 'Viewing requests', 'طلبات المعاينة')} sx={{ bgcolor: alpha(gold, 0.12), color: binThemeTokens.goldHover, fontWeight: 900 }} />
              <Chip icon={<SafeIcon icon={WalletCards} size={14} />} label={copy('tenant.home.fullJourney', 'Contract → move-in → maintenance', 'العقد ← الاستلام ← الصيانة')} sx={{ bgcolor: '#F7F8FA', color: '#475467', fontWeight: 900 }} />
            </Stack>
          </Stack>
        </Paper>

        {notice && (
          <Paper sx={{ p: 2.2, bgcolor: alpha(gold, 0.08), border: `1px solid ${alpha(gold, 0.24)}`, borderRadius: 3 }}>
            <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 850 }}>{notice}</Typography>
          </Paper>
        )}

        <Paper sx={{ p: { xs: 2.2, md: 3 }, bgcolor: '#fff', border: `1px solid ${binThemeTokens.border}`, borderRadius: 5, boxShadow: '0 12px 36px rgba(15,23,42,0.05)' }}>
          <Stack spacing={2.2}>
            <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
              <TextField
                fullWidth
                value={filters.query}
                onChange={(event) => setFilter('query', event.target.value)}
                placeholder={copy('tenant.home.searchPlaceholder', 'Area, community, building, villa, studio…', 'المنطقة، المجتمع، المبنى، فيلا، استوديو…')}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SafeIcon icon={Search} size={18} /></InputAdornment>,
                }}
              />
              <Button variant="contained" startIcon={<SafeIcon icon={Sparkles} size={17} />} onClick={saveSearch} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, px: 3, minHeight: 54, whiteSpace: 'nowrap' }}>
                {copy('tenant.home.saveSearch', 'Save search', 'حفظ البحث')}
              </Button>
            </Stack>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6} md={2.4}>
                <FormControl fullWidth>
                  <InputLabel>{copy('tenant.home.type', 'Property type', 'نوع العقار')}</InputLabel>
                  <Select value={filters.propertyType} label={copy('tenant.home.type', 'Property type', 'نوع العقار')} onChange={(event) => setFilter('propertyType', String(event.target.value))}>
                    <MenuItem value="ALL">{copy('tenant.home.allTypes', 'All types', 'كل الأنواع')}</MenuItem>
                    {propertyTypes.map((type) => <MenuItem key={type} value={type}>{titleCase(type)}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <FormControl fullWidth>
                  <InputLabel>{copy('tenant.home.emirate', 'Emirate', 'الإمارة')}</InputLabel>
                  <Select value={filters.emirate} label={copy('tenant.home.emirate', 'Emirate', 'الإمارة')} onChange={(event) => setFilter('emirate', String(event.target.value))}>
                    <MenuItem value="ALL">{copy('tenant.home.allUae', 'All UAE', 'كل الإمارات')}</MenuItem>
                    {emirates.map((emirate) => <MenuItem key={emirate} value={emirate}>{titleCase(emirate)}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={3} md={1.8}><TextField fullWidth type="number" label={copy('tenant.home.minRent', 'Min AED/year', 'الحد الأدنى سنوياً')} value={filters.minRent} onChange={(event) => setFilter('minRent', event.target.value)} /></Grid>
              <Grid item xs={6} sm={3} md={1.8}><TextField fullWidth type="number" label={copy('tenant.home.maxRent', 'Max AED/year', 'الحد الأعلى سنوياً')} value={filters.maxRent} onChange={(event) => setFilter('maxRent', event.target.value)} /></Grid>
              <Grid item xs={6} sm={3} md={1.8}>
                <FormControl fullWidth>
                  <InputLabel>{copy('tenant.home.beds', 'Beds', 'الغرف')}</InputLabel>
                  <Select value={filters.bedrooms} label={copy('tenant.home.beds', 'Beds', 'الغرف')} onChange={(event) => setFilter('bedrooms', String(event.target.value))}>
                    <MenuItem value="ALL">{copy('tenant.home.any', 'Any', 'الكل')}</MenuItem>
                    <MenuItem value="0">{copy('tenant.home.studio', 'Studio', 'استوديو')}</MenuItem>
                    <MenuItem value="1">1</MenuItem><MenuItem value="2">2</MenuItem><MenuItem value="3">3</MenuItem><MenuItem value="4_PLUS">4+</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={3} md={1.8}>
                <FormControl fullWidth>
                  <InputLabel>{copy('tenant.home.furnishing', 'Furnishing', 'التأثيث')}</InputLabel>
                  <Select value={filters.furnishing} label={copy('tenant.home.furnishing', 'Furnishing', 'التأثيث')} onChange={(event) => setFilter('furnishing', String(event.target.value))}>
                    <MenuItem value="ALL">{copy('tenant.home.any', 'Any', 'الكل')}</MenuItem>
                    <MenuItem value="FURNISHED">{copy('tenant.home.furnished', 'Furnished', 'مفروش')}</MenuItem>
                    <MenuItem value="UNFURNISHED">{copy('tenant.home.unfurnished', 'Unfurnished', 'غير مفروش')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                <SafeIcon icon={SlidersHorizontal} size={17} style={{ color: binThemeTokens.goldHover }} />
                <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>
                  {copy('tenant.home.matches', `${filteredListings.length} homes match`, `${filteredListings.length} عقار مطابق`)}
                </Typography>
              </Stack>
              <Button onClick={resetFilters} sx={{ color: binThemeTokens.goldHover, fontWeight: 900, textTransform: 'none' }}>{copy('tenant.home.reset', 'Reset filters', 'إعادة التصفية')}</Button>
            </Stack>
          </Stack>
        </Paper>

        <Grid container spacing={2.5}>
          {filteredListings.map((listing) => {
            const images = listingImages(listing);
            const favorite = favorites.includes(listing.id);
            const annualRent = annualRentValue(listing);
            return (
              <Grid item xs={12} md={6} lg={4} key={listing.id}>
                <Card sx={{ height: '100%', borderRadius: 5, border: `1px solid ${binThemeTokens.border}`, bgcolor: '#fff', overflow: 'hidden', boxShadow: '0 14px 40px rgba(15,23,42,0.07)', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ position: 'relative', height: 220, bgcolor: '#F3F4F6', overflow: 'hidden' }}>
                    {images[0] ? (
                      <Box component="img" src={images[0]} alt={listing.unitTitle || listing.title || listing.propertyName || 'Property'} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', color: alpha(binThemeTokens.goldHover, 0.55), background: `linear-gradient(145deg, ${alpha(gold, 0.08)}, #F8F9FB)` }}>
                        <SafeIcon icon={Home} size={48} />
                        <Typography variant="caption" sx={{ mt: 1, fontWeight: 850, color: binThemeTokens.textSecondary }}>{copy('tenant.home.photoPending', 'Property photos pending BIN review', 'صور العقار قيد مراجعة BIN')}</Typography>
                      </Stack>
                    )}
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} sx={{ position: 'absolute', top: 12, left: isRTL ? 'auto' : 12, right: isRTL ? 12 : 'auto' }}>
                      <Chip size="small" icon={<SafeIcon icon={ShieldCheck} size={13} />} label="BIN VERIFIED" sx={{ bgcolor: alpha('#fff', 0.92), color: '#166534', fontWeight: 950 }} />
                    </Stack>
                    <IconButton aria-label={favorite ? 'Remove saved home' : 'Save home'} onClick={() => toggleFavorite(listing.id)} sx={{ position: 'absolute', top: 10, right: isRTL ? 'auto' : 10, left: isRTL ? 10 : 'auto', bgcolor: alpha('#fff', 0.94), color: favorite ? '#DC2626' : '#475467', '&:hover': { bgcolor: '#fff' } }}>
                      <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
                    </IconButton>
                  </Box>

                  <CardContent sx={{ p: 2.8, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Stack spacing={1.8} sx={{ flexGrow: 1, textAlign: isRTL ? 'right' : 'left' }}>
                      <Box>
                        <Typography variant="h5" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, lineHeight: 1.2 }}>
                          {listing.unitTitle || listing.title || listing.propertyName || copy('tenant.home.defaultTitle', 'Available BIN home', 'عقار BIN متاح')}
                        </Typography>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={0.7} alignItems="center" sx={{ mt: 0.8 }}>
                          <MapPin size={15} color={binThemeTokens.goldHover} />
                          <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 750 }}>{locationLabel(listing)}</Typography>
                        </Stack>
                      </Box>

                      <Box>
                        <Typography variant="h5" sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>{annualRent > 0 ? money(annualRent) : money(listing.monthlyRent)}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textTertiary, fontWeight: 800 }}>{annualRent > 0 ? copy('tenant.home.perYear', 'per year', 'سنوياً') : copy('tenant.home.priceRequest', 'price on request', 'السعر عند الطلب')}</Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
                        <Chip size="small" icon={<SafeIcon icon={Building2} size={13} />} label={listingTypeLabel(listing)} />
                        <Chip size="small" icon={<SafeIcon icon={BedDouble} size={13} />} label={`${listing.bedrooms ?? '-'} ${copy('tenant.home.bedShort', 'beds', 'غرف')}`} />
                        {listing.bathrooms !== undefined && <Chip size="small" icon={<SafeIcon icon={Bath} size={13} />} label={`${listing.bathrooms} ${copy('tenant.home.bathShort', 'baths', 'حمام')}`} />}
                        {numberValue(listing.areaSqFt) > 0 && <Chip size="small" icon={<SafeIcon icon={Maximize2} size={13} />} label={`${numberValue(listing.areaSqFt).toLocaleString()} ft²`} />}
                      </Stack>

                      <Divider />

                      <Stack spacing={0.7}>
                        {listing.furnishing || listing.furnished !== undefined ? <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 750 }}>• {copy('tenant.home.furnishingLabel', 'Furnishing', 'التأثيث')}: {titleCase(listing.furnishing, listing.furnished ? 'Furnished' : 'Unfurnished')}</Typography> : null}
                        {listing.availableFrom && <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 750 }}>• {copy('tenant.home.availableFrom', 'Available', 'متاح')}: {listing.availableFrom}</Typography>}
                        {numberValue(listing.numberOfCheques) > 0 && <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 750 }}>• {copy('tenant.home.cheques', 'Cheques', 'الشيكات')}: {numberValue(listing.numberOfCheques)}</Typography>}
                      </Stack>
                    </Stack>

                    <Stack direction="row" spacing={1.2} sx={{ mt: 2.5 }}>
                      <Button fullWidth variant="outlined" onClick={() => setSelected(listing)} sx={{ borderColor: alpha(gold, 0.48), color: binThemeTokens.goldHover, fontWeight: 950, borderRadius: 3 }}>
                        {copy('tenant.home.details', 'View details', 'عرض التفاصيل')}
                      </Button>
                      <Button fullWidth variant="contained" disabled={submittingKey === `${listing.id}:VIEWING`} onClick={() => submitInterest(listing, 'VIEWING')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, borderRadius: 3 }}>
                        {submittingKey === `${listing.id}:VIEWING` ? <CircularProgress size={18} sx={{ color: '#111827' }} /> : copy('tenant.home.bookViewing', 'Book viewing', 'حجز معاينة')}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {filteredListings.length === 0 && (
          <Paper sx={{ p: { xs: 4, md: 6 }, textAlign: 'center', bgcolor: '#fff', border: `1px dashed ${alpha(gold, 0.4)}`, borderRadius: 5 }}>
            <SafeIcon icon={Home} size={48} style={{ color: alpha(gold, 0.5), margin: '0 auto' }} />
            <Typography variant="h6" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 2 }}>
              {listings.length === 0 ? copy('tenant.home.none', 'No BIN-verified homes are available right now.', 'لا توجد عقارات موثقة من BIN متاحة حالياً.') : copy('tenant.home.noMatch', 'No homes match these filters yet.', 'لا توجد عقارات مطابقة لعوامل التصفية حالياً.')}
            </Typography>
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 620, mx: 'auto' }}>
              {copy('tenant.home.noneDesc', 'Adjust your filters or save your search. New approved owner inventory will appear here when it becomes available.', 'عدّل عوامل التصفية أو احفظ بحثك. ستظهر هنا عقارات الملاك المعتمدة الجديدة عند توفرها.')}
            </Typography>
            {listings.length > 0 && <Button onClick={resetFilters} sx={{ mt: 2, color: binThemeTokens.goldHover, fontWeight: 950 }}>{copy('tenant.home.reset', 'Reset filters', 'إعادة التصفية')}</Button>}
          </Paper>
        )}
      </Stack>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 5 } }}>
        {selected && (() => {
          const images = listingImages(selected);
          const annualRent = annualRentValue(selected);
          const repairs = Array.isArray(selected.repairHistory) ? selected.repairHistory.slice(0, 4) : [];
          const lat = numberValue(selected.latitude || selected.lat);
          const lng = numberValue(selected.longitude || selected.lng);
          const mapHref = lat && lng ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}` : selected.propertyAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.propertyAddress)}` : '';
          return (
            <>
              <DialogTitle sx={{ fontWeight: 950, pb: 1 }}>{selected.unitTitle || selected.title || selected.propertyName || copy('tenant.home.defaultTitle', 'Available BIN home', 'عقار BIN متاح')}</DialogTitle>
              <DialogContent dividers>
                <Stack spacing={3}>
                  {images.length > 0 && (
                    <Grid container spacing={1}>
                      {images.slice(0, 4).map((src, index) => (
                        <Grid item xs={index === 0 ? 12 : 4} key={src}>
                          <Box component="img" src={src} alt={`Property ${index + 1}`} sx={{ width: '100%', height: index === 0 ? 330 : 120, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                        </Grid>
                      ))}
                    </Grid>
                  )}

                  <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2}>
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Typography variant="h4" sx={{ color: binThemeTokens.goldHover, fontWeight: 950 }}>{annualRent > 0 ? money(annualRent) : money(selected.monthlyRent)}</Typography>
                      <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 750 }}>{selected.propertyAddress || locationLabel(selected)}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignContent="flex-start">
                      <Chip icon={<SafeIcon icon={ShieldCheck} size={14} />} label={copy('tenant.home.binManaged', 'BIN managed / verified', 'تديرها / موثقة من BIN')} sx={{ bgcolor: alpha('#16A34A', 0.1), color: '#15803D', fontWeight: 900 }} />
                      {selected.permitVerified && <Chip icon={<SafeIcon icon={CheckCircle2} size={14} />} label={copy('tenant.home.permitVerified', 'Permit verified', 'التصريح موثق')} sx={{ bgcolor: alpha('#0284C7', 0.1), color: '#0369A1', fontWeight: 900 }} />}
                    </Stack>
                  </Stack>

                  <Grid container spacing={1.5}>
                    {[
                      [BedDouble, copy('tenant.home.beds', 'Beds', 'الغرف'), String(selected.bedrooms ?? '-')],
                      [Bath, copy('tenant.home.baths', 'Bathrooms', 'الحمامات'), String(selected.bathrooms ?? '-')],
                      [Maximize2, copy('tenant.home.areaSize', 'Area', 'المساحة'), numberValue(selected.areaSqFt) > 0 ? `${numberValue(selected.areaSqFt).toLocaleString()} ft²` : '-'],
                      [Building2, copy('tenant.home.type', 'Property type', 'نوع العقار'), listingTypeLabel(selected)],
                    ].map(([Icon, label, value]: any) => (
                      <Grid item xs={6} sm={3} key={label}>
                        <Paper sx={{ p: 2, border: `1px solid ${binThemeTokens.border}`, borderRadius: 3, bgcolor: '#FAFAFB' }}>
                          <SafeIcon icon={Icon} size={18} style={{ color: binThemeTokens.goldHover }} />
                          <Typography variant="caption" sx={{ display: 'block', mt: 0.8, color: binThemeTokens.textTertiary, fontWeight: 800 }}>{label}</Typography>
                          <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{value}</Typography>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>

                  {(selected.amenities || []).length > 0 && (
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 950, mb: 1.2 }}>{copy('tenant.home.amenities', 'Amenities', 'المميزات')}</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {(selected.amenities || []).map((amenity) => <Chip key={amenity} label={amenity} />)}
                      </Stack>
                    </Box>
                  )}

                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 950, mb: 1.2 }}>{copy('tenant.home.costSnapshot', 'Rental cost snapshot', 'ملخص تكلفة الإيجار')}</Typography>
                    <Grid container spacing={1.2}>
                      {[
                        [copy('tenant.home.annualRent', 'Annual rent', 'الإيجار السنوي'), annualRent > 0 ? money(annualRent) : '—'],
                        [copy('tenant.home.deposit', 'Security deposit', 'التأمين'), numberValue(selected.securityDeposit) > 0 ? money(selected.securityDeposit) : copy('tenant.home.confirmedLater', 'Confirm with BIN', 'يؤكد مع BIN')],
                        [copy('tenant.home.cheques', 'Cheques', 'الشيكات'), numberValue(selected.numberOfCheques) > 0 ? String(numberValue(selected.numberOfCheques)) : copy('tenant.home.confirmedLater', 'Confirm with BIN', 'يؤكد مع BIN')],
                      ].map(([label, value]) => (
                        <Grid item xs={12} sm={4} key={label}>
                          <Paper sx={{ p: 2, border: `1px solid ${binThemeTokens.border}`, borderRadius: 3 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{label}</Typography>
                            <Typography sx={{ fontWeight: 950, mt: 0.4 }}>{value}</Typography>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>

                  <Box>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <SafeIcon icon={Wrench} size={17} style={{ color: binThemeTokens.goldHover }} />
                      <Typography variant="h6" sx={{ fontWeight: 950 }}>{copy('tenant.home.repairHistory', 'Maintenance history', 'سجل الصيانة')}</Typography>
                    </Stack>
                    {repairs.length > 0 ? (
                      <Stack spacing={1}>
                        {repairs.map((repair, index) => (
                          <Paper key={`${selected.id}-repair-${index}`} sx={{ p: 1.7, bgcolor: '#FAFAFB', border: `1px solid ${binThemeTokens.border}`, borderRadius: 2.5 }}>
                            <Typography sx={{ fontWeight: 900 }}>{repair.title || repair.issue || copy('tenant.home.repairCompleted', 'Maintenance completed', 'تمت الصيانة')}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{[repair.date, repair.status].filter(Boolean).join(' · ')}</Typography>
                          </Paper>
                        ))}
                      </Stack>
                    ) : <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{selected.repairHistorySummary || copy('tenant.home.noRepairHistory', 'No unresolved repair history is published for this home.', 'لا يوجد سجل صيانة غير محلول منشور لهذا العقار.')}</Typography>}
                  </Box>

                  {(mapHref || selected.permitNumber || selected.permitVerificationUrl) && (
                    <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
                      {mapHref && <Button component="a" href={mapHref} target="_blank" rel="noreferrer" startIcon={<SafeIcon icon={MapPin} size={16} />} endIcon={<SafeIcon icon={ExternalLink} size={14} />} sx={{ color: binThemeTokens.goldHover, fontWeight: 900 }}>{copy('tenant.home.openMap', 'Open location', 'فتح الموقع')}</Button>}
                      {selected.permitVerificationUrl && <Button component="a" href={selected.permitVerificationUrl} target="_blank" rel="noreferrer" startIcon={<SafeIcon icon={ShieldCheck} size={16} />} endIcon={<SafeIcon icon={ExternalLink} size={14} />} sx={{ color: '#0369A1', fontWeight: 900 }}>{copy('tenant.home.verifyPermit', 'Verify listing permit', 'تحقق من تصريح الإعلان')}</Button>}
                      {selected.permitNumber && <Chip label={`${copy('tenant.home.permit', 'Permit', 'التصريح')}: ${selected.permitNumber}`} />}
                    </Stack>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions sx={{ p: 2.5, gap: 1, flexWrap: 'wrap' }}>
                <Button onClick={() => setSelected(null)} sx={{ color: binThemeTokens.textSecondary, fontWeight: 850 }}>{copy('common.close', 'Close', 'إغلاق')}</Button>
                <Button variant="outlined" disabled={submittingKey === `${selected.id}:VIEWING`} onClick={() => submitInterest(selected, 'VIEWING')} sx={{ borderColor: alpha(gold, 0.5), color: binThemeTokens.goldHover, fontWeight: 950 }}>{copy('tenant.home.bookViewing', 'Book viewing', 'حجز معاينة')}</Button>
                <Button variant="contained" disabled={submittingKey === `${selected.id}:APPLY`} onClick={() => submitInterest(selected, 'APPLY')} startIcon={<SafeIcon icon={CheckCircle2} size={17} />} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>{submittingKey === `${selected.id}:APPLY` ? <CircularProgress size={18} sx={{ color: '#111827' }} /> : copy('tenant.home.apply', 'Apply for this home', 'التقديم لهذا العقار')}</Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>
    </Box>
  );
}
