import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
import { BedDouble, Building2, CheckCircle2, ClipboardSignature, FileText, Home, Image, KeyRound, MapPin, ShieldCheck, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { addDoc, collection, db, onSnapshot, query, serverTimestamp, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const gold = binThemeTokens.gold;
const darkCard = 'rgba(15,23,42,0.72)';
const border = `1px solid ${alpha(gold, 0.18)}`;
const HOME_RECORD_TYPES = new Set(['ROOM_RENT_LISTING', 'FIND_ROOM_RENT', 'HOME_RENT_LISTING', 'PROPERTY_RENT_LISTING', 'RENTAL_LISTING']);

type OwnerHomeRecord = {
  id: string;
  type?: string;
  recordType?: string;
  status?: string;
  stage?: string;
  title?: string;
  listingTitle?: string;
  unitTitle?: string;
  propertyAddress?: string;
  propertyName?: string;
  propertyType?: string;
  area?: string;
  emirate?: string;
  ownerEmail?: string;
  tenantEmail?: string;
  tenantName?: string;
  annualRent?: number;
  monthlyRent?: number;
  bedrooms?: string | number;
  bathrooms?: string | number;
  areaSqFt?: number;
  furnishing?: string;
  availableFrom?: string;
  imageUrls?: string[];
  active?: boolean;
  notRented?: boolean;
  hasBinContract?: boolean;
  repairHistory?: any[];
  repairHistorySummary?: string;
  requestMode?: string;
};

type VacancyForm = {
  unitTitle: string;
  propertyType: string;
  propertyAddress: string;
  area: string;
  emirate: string;
  annualRent: string;
  bedrooms: string;
  bathrooms: string;
  areaSqFt: string;
  furnishing: string;
  availableFrom: string;
  numberOfCheques: string;
  securityDeposit: string;
  imageUrlsText: string;
  amenitiesText: string;
  notes: string;
};

const blankForm: VacancyForm = {
  unitTitle: '',
  propertyType: 'APARTMENT',
  propertyAddress: '',
  area: '',
  emirate: 'DUBAI',
  annualRent: '',
  bedrooms: '',
  bathrooms: '',
  areaSqFt: '',
  furnishing: 'UNFURNISHED',
  availableFrom: '',
  numberOfCheques: '',
  securityDeposit: '',
  imageUrlsText: '',
  amenitiesText: '',
  notes: '',
};

function isHomeListing(row: OwnerHomeRecord) {
  const recordType = String(row.recordType || '').toUpperCase();
  return HOME_RECORD_TYPES.has(recordType) && row.active !== false;
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? `AED ${Math.round(amount).toLocaleString()}` : 'Pending quote';
}

function titleCase(value: unknown, fallback = '') {
  const text = String(value || fallback).replace(/[_-]+/g, ' ').trim();
  return text ? text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function cleanUrls(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter((item) => /^https?:\/\//i.test(item)))].slice(0, 12);
}

function cleanAmenities(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 30);
}

export default function ContractorMarketplacePage() {
  const navigate = useNavigate();
  const { user } = useRole();
  const { isRTL, lang, tx } = useLanguage();
  const copy = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const ownerEmail = String(user?.email || '').toLowerCase();

  const [loading, setLoading] = useState(true);
  const [ownerRequests, setOwnerRequests] = useState<OwnerHomeRecord[]>([]);
  const [catalog, setCatalog] = useState<OwnerHomeRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<VacancyForm>(blankForm);

  const setField = (key: keyof VacancyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fieldSx = { input: { color: '#fff' }, textarea: { color: '#fff' }, '& label': { color: alpha('#fff', 0.58) }, '& fieldset': { borderColor: alpha(gold, 0.24) } } as const;
  const selectSx = { color: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(gold, 0.24) }, '& .MuiSvgIcon-root': { color: alpha('#fff', 0.7) } } as const;

  useEffect(() => {
    if (!ownerEmail) {
      setLoading(false);
      return undefined;
    }

    const unsubRequests = onSnapshot(
      query(collection(db, 'jobPostings'), where('ownerEmail', '==', ownerEmail)),
      (snap) => {
        setOwnerRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() } as OwnerHomeRecord)));
        setLoading(false);
      },
      (err) => {
        console.warn('[OwnerHomeDiscovery] request listener failed:', err);
        setOwnerRequests([]);
        setLoading(false);
      },
    );

    const unsubCatalog = onSnapshot(
      query(collection(db, 'contractorProfiles'), where('active', '==', true)),
      (snap) => setCatalog(snap.docs.map((item) => ({ id: item.id, ...item.data() } as OwnerHomeRecord)).filter((item) => {
        if (!isHomeListing(item)) return false;
        return String(item.ownerEmail || '').toLowerCase() === ownerEmail || item.id === user?.uid;
      })),
      (err) => {
        console.warn('[OwnerHomeDiscovery] published listing listener failed:', err);
        setCatalog([]);
      },
    );

    return () => {
      unsubRequests();
      unsubCatalog();
    };
  }, [ownerEmail, user?.uid]);

  const homeRequests = useMemo(() => ownerRequests.filter((item) => String(item.type || '').toUpperCase() === 'ROOM_RENT_REQUEST'), [ownerRequests]);
  const tenantApplications = useMemo(() => ownerRequests.filter((item) => String(item.type || '').toUpperCase() === 'ROOM_RENT_APPLICATION'), [ownerRequests]);
  const openHomes = catalog.filter((item) => item.notRented !== false && !['RENTED', 'INACTIVE', 'CLOSED'].includes(String(item.status || 'AVAILABLE').toUpperCase()));

  async function submitHomeRequest() {
    if (!ownerEmail || !form.unitTitle.trim() || !form.propertyAddress.trim() || !form.propertyType) return;
    setSaving(true);
    setNotice('');
    try {
      await addDoc(collection(db, 'jobPostings'), {
        type: 'ROOM_RENT_REQUEST',
        requestKind: 'HOME_RENT_LISTING_REQUEST',
        source: 'owner_home_discovery_v1',
        title: form.unitTitle.trim(),
        unitTitle: form.unitTitle.trim(),
        propertyType: form.propertyType,
        propertyAddress: form.propertyAddress.trim(),
        area: form.area.trim(),
        emirate: form.emirate,
        annualRent: Number(form.annualRent || 0),
        bedrooms: form.bedrooms.trim(),
        bathrooms: form.bathrooms.trim(),
        areaSqFt: Number(form.areaSqFt || 0),
        furnishing: form.furnishing,
        furnished: form.furnishing === 'FURNISHED',
        availableFrom: form.availableFrom || null,
        numberOfCheques: Number(form.numberOfCheques || 0),
        securityDeposit: Number(form.securityDeposit || 0),
        imageUrls: cleanUrls(form.imageUrlsText),
        amenities: cleanAmenities(form.amenitiesText),
        description: form.notes.trim(),
        ownerId: user?.uid || null,
        ownerEmail,
        status: 'OPEN',
        stage: 'BIN_LISTING_REVIEW_REQUIRED',
        requestedContractHandling: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm(blankForm);
      setNotice(copy('owner.home.sent', 'Vacancy submitted. BIN GROUP will verify the contract, listing details and advertising compliance before it goes live.', 'تم إرسال العقار الشاغر. ستتحقق BIN GROUP من العقد وتفاصيل الإعلان والامتثال قبل نشره.'));
    } catch (err) {
      console.error('[OwnerHomeDiscovery] request failed:', err);
      setNotice(copy('owner.home.failed', 'Could not submit the vacancy. Please check your owner login and try again.', 'تعذر إرسال العقار الشاغر. يرجى التحقق من تسجيل الدخول والمحاولة مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Box sx={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: gold }} /></Box>;
  }

  return (
    <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: darkCard, border, borderRadius: 5 }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center" sx={{ mb: 1 }}>
                <Box sx={{ p: 1, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, display: 'inline-flex' }}><SafeIcon icon={Home} size={22} /></Box>
                <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 4 }}>{copy('owner.home.overline', 'HOME DISCOVERY INVENTORY', 'عقارات البحث عن منزل')}</Typography>
              </Stack>
              <Typography variant="h4" fontWeight={950} sx={{ color: '#fff' }}>
                {copy('owner.home.title', 'Turn a verified vacancy into a BIN-managed rental journey.', 'حوّل العقار الشاغر الموثق إلى رحلة إيجار تديرها BIN.')}
              </Typography>
              <Typography variant="body2" sx={{ color: alpha('#fff', 0.62), fontWeight: 700, mt: 1, maxWidth: 860 }}>
                {copy('owner.home.desc', 'Submit rooms, studios, apartments, villas or townhouses with the real price, location, photos and availability. BIN reviews the contract and compliance before the listing reaches home seekers.', 'أرسل غرفة أو استوديو أو شقة أو فيلا أو تاون هاوس مع السعر والموقع والصور والتوفر. تراجع BIN العقد والامتثال قبل وصول الإعلان للباحثين عن منزل.')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
              <Chip icon={<SafeIcon icon={ClipboardSignature} size={14} />} label={copy('owner.home.contractFirst', 'Contract first', 'العقد أولاً')} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950 }} />
              <Chip icon={<SafeIcon icon={ShieldCheck} size={14} />} label={copy('owner.home.reviewed', 'BIN review before publish', 'مراجعة BIN قبل النشر')} sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 950 }} />
              <Chip icon={<SafeIcon icon={Image} size={14} />} label={copy('owner.home.photos', 'Photo-ready listings', 'إعلانات بالصور')} sx={{ bgcolor: alpha('#38BDF8', 0.12), color: '#38BDF8', fontWeight: 950 }} />
            </Stack>
          </Stack>
        </Paper>

        {notice && (
          <Paper sx={{ p: 2.2, bgcolor: alpha(gold, 0.08), border: `1px solid ${alpha(gold, 0.22)}`, borderRadius: 3 }}>
            <Typography sx={{ color: '#fff', fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{notice}</Typography>
          </Paper>
        )}

        <Grid container spacing={2.5}>
          {[
            { label: copy('owner.home.requests', 'Listing requests', 'طلبات النشر'), value: homeRequests.length, icon: FileText },
            { label: copy('owner.home.published', 'Published homes', 'العقارات المنشورة'), value: openHomes.length, icon: Home },
            { label: copy('owner.home.applications', 'Viewing / renter requests', 'طلبات المعاينة / المستأجرين'), value: tenantApplications.length, icon: Users },
          ].map((item) => (
            <Grid item xs={12} md={4} key={item.label}>
              <Paper sx={{ p: 2.5, bgcolor: darkCard, border, borderRadius: 4 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
                  <Box sx={{ color: gold }}><SafeIcon icon={item.icon} size={25} /></Box>
                  <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography sx={{ color: gold, fontWeight: 950, fontSize: '1.7rem', lineHeight: 1 }}>{item.value}</Typography>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.55), fontWeight: 850 }}>{item.label}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
            <Paper sx={{ p: 3.5, bgcolor: darkCard, border, borderRadius: 5 }}>
              <Stack spacing={2.2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                <Box>
                  <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{copy('owner.home.submitTitle', 'Submit a vacant home for BIN review', 'أرسل عقاراً شاغراً لمراجعة BIN')}</Typography>
                  <Typography variant="body2" sx={{ color: alpha('#fff', 0.55), mt: 0.6 }}>{copy('owner.home.submitDesc', 'Enter the facts home seekers need. BIN verifies before publishing; submitting this form does not make a listing live immediately.', 'أدخل المعلومات التي يحتاجها الباحث عن منزل. تتحقق BIN قبل النشر؛ إرسال النموذج لا ينشر الإعلان مباشرة.')}</Typography>
                </Box>

                <TextField fullWidth label={copy('owner.home.unitTitle', 'Listing / unit title', 'اسم الإعلان / الوحدة')} value={form.unitTitle} onChange={(e) => setField('unitTitle', e.target.value)} sx={fieldSx} />
                <FormControl fullWidth>
                  <InputLabel sx={{ color: alpha('#fff', 0.58) }}>{copy('owner.home.type', 'Property type', 'نوع العقار')}</InputLabel>
                  <Select value={form.propertyType} label={copy('owner.home.type', 'Property type', 'نوع العقار')} onChange={(e) => setField('propertyType', String(e.target.value))} sx={selectSx}>
                    <MenuItem value="ROOM">{copy('owner.home.room', 'Room', 'غرفة')}</MenuItem>
                    <MenuItem value="STUDIO">{copy('owner.home.studio', 'Studio', 'استوديو')}</MenuItem>
                    <MenuItem value="APARTMENT">{copy('owner.home.apartment', 'Apartment', 'شقة')}</MenuItem>
                    <MenuItem value="VILLA">{copy('owner.home.villa', 'Villa', 'فيلا')}</MenuItem>
                    <MenuItem value="TOWNHOUSE">{copy('owner.home.townhouse', 'Townhouse', 'تاون هاوس')}</MenuItem>
                    <MenuItem value="PENTHOUSE">{copy('owner.home.penthouse', 'Penthouse', 'بنتهاوس')}</MenuItem>
                  </Select>
                </FormControl>
                <TextField fullWidth label={copy('owner.home.address', 'Full property address', 'عنوان العقار الكامل')} value={form.propertyAddress} onChange={(e) => setField('propertyAddress', e.target.value)} sx={fieldSx} />

                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={6}><TextField fullWidth label={copy('owner.home.area', 'Area / community', 'المنطقة / المجتمع')} value={form.area} onChange={(e) => setField('area', e.target.value)} sx={fieldSx} /></Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel sx={{ color: alpha('#fff', 0.58) }}>{copy('owner.home.emirate', 'Emirate', 'الإمارة')}</InputLabel>
                      <Select value={form.emirate} label={copy('owner.home.emirate', 'Emirate', 'الإمارة')} onChange={(e) => setField('emirate', String(e.target.value))} sx={selectSx}>
                        {['ABU_DHABI', 'DUBAI', 'SHARJAH', 'AJMAN', 'UMM_AL_QUWAIN', 'RAS_AL_KHAIMAH', 'FUJAIRAH'].map((value) => <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={6}><TextField fullWidth label={copy('owner.home.annualRent', 'Expected annual rent (AED)', 'الإيجار السنوي المتوقع (درهم)')} type="number" value={form.annualRent} onChange={(e) => setField('annualRent', e.target.value)} sx={fieldSx} /></Grid>
                  <Grid item xs={4} sm={2}><TextField fullWidth label={copy('owner.home.beds', 'Beds', 'غرف')} type="number" value={form.bedrooms} onChange={(e) => setField('bedrooms', e.target.value)} sx={fieldSx} /></Grid>
                  <Grid item xs={4} sm={2}><TextField fullWidth label={copy('owner.home.baths', 'Baths', 'حمام')} type="number" value={form.bathrooms} onChange={(e) => setField('bathrooms', e.target.value)} sx={fieldSx} /></Grid>
                  <Grid item xs={4} sm={2}><TextField fullWidth label="ft²" type="number" value={form.areaSqFt} onChange={(e) => setField('areaSqFt', e.target.value)} sx={fieldSx} /></Grid>
                </Grid>

                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                      <InputLabel sx={{ color: alpha('#fff', 0.58) }}>{copy('owner.home.furnishing', 'Furnishing', 'التأثيث')}</InputLabel>
                      <Select value={form.furnishing} label={copy('owner.home.furnishing', 'Furnishing', 'التأثيث')} onChange={(e) => setField('furnishing', String(e.target.value))} sx={selectSx}>
                        <MenuItem value="FURNISHED">{copy('owner.home.furnished', 'Furnished', 'مفروش')}</MenuItem>
                        <MenuItem value="UNFURNISHED">{copy('owner.home.unfurnished', 'Unfurnished', 'غير مفروش')}</MenuItem>
                        <MenuItem value="PARTLY_FURNISHED">{copy('owner.home.partly', 'Partly furnished', 'مفروش جزئياً')}</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label={copy('owner.home.availableFrom', 'Available from', 'متاح من')} value={form.availableFrom} onChange={(e) => setField('availableFrom', e.target.value)} sx={fieldSx} /></Grid>
                  <Grid item xs={12} sm={4}><TextField fullWidth type="number" label={copy('owner.home.cheques', 'No. of cheques', 'عدد الشيكات')} value={form.numberOfCheques} onChange={(e) => setField('numberOfCheques', e.target.value)} sx={fieldSx} /></Grid>
                </Grid>

                <TextField fullWidth type="number" label={copy('owner.home.deposit', 'Security deposit (AED)', 'التأمين (درهم)')} value={form.securityDeposit} onChange={(e) => setField('securityDeposit', e.target.value)} sx={fieldSx} />
                <TextField fullWidth multiline minRows={3} label={copy('owner.home.images', 'Property photo links — one per line', 'روابط صور العقار — رابط في كل سطر')} helperText={copy('owner.home.imagesHelp', 'Use real property photos only. BIN will review them before publishing.', 'استخدم صور العقار الحقيقية فقط. ستراجعها BIN قبل النشر.')} value={form.imageUrlsText} onChange={(e) => setField('imageUrlsText', e.target.value)} sx={fieldSx} />
                <TextField fullWidth multiline minRows={2} label={copy('owner.home.amenities', 'Amenities — comma separated', 'المميزات — افصل بينها بفاصلة')} placeholder={copy('owner.home.amenitiesExample', 'Pool, gym, balcony, parking, pets allowed', 'مسبح، نادي رياضي، شرفة، موقف، مسموح بالحيوانات')} value={form.amenitiesText} onChange={(e) => setField('amenitiesText', e.target.value)} sx={fieldSx} />
                <TextField fullWidth multiline minRows={3} label={copy('owner.home.notes', 'Description / maintenance highlights', 'الوصف / أهم أعمال الصيانة')} value={form.notes} onChange={(e) => setField('notes', e.target.value)} sx={fieldSx} />

                <Button fullWidth variant="contained" disabled={saving || !form.unitTitle.trim() || !form.propertyAddress.trim()} onClick={submitHomeRequest} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, py: 1.3, borderRadius: 3 }}>
                  {saving ? <CircularProgress size={20} sx={{ color: '#111827' }} /> : copy('owner.home.submit', 'Submit vacancy for BIN review', 'إرسال العقار لمراجعة BIN')}
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={6}>
            <Stack spacing={3}>
              <Paper sx={{ p: 3.5, bgcolor: darkCard, border, borderRadius: 5 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{copy('owner.home.reviewQueue', 'BIN listing review queue', 'قائمة مراجعة الإعلانات')}</Typography>
                    <Typography variant="body2" sx={{ color: alpha('#fff', 0.55) }}>{copy('owner.home.reviewQueueDesc', 'A request stays here until BIN validates the owner contract and listing facts.', 'يبقى الطلب هنا حتى تتحقق BIN من عقد المالك وبيانات الإعلان.')}</Typography>
                  </Box>
                  <Button onClick={() => navigate('/owner/contracts')} sx={{ color: gold, border: `1px solid ${alpha(gold, 0.35)}`, borderRadius: 3, fontWeight: 950 }}>{copy('owner.home.openContracts', 'Open contracts', 'فتح العقود')}</Button>
                </Stack>
                <Divider sx={{ borderColor: alpha(gold, 0.12), mb: 2 }} />
                <Stack spacing={1.5}>
                  {homeRequests.length === 0 ? (
                    <Typography sx={{ color: alpha('#fff', 0.48), fontWeight: 800 }}>{copy('owner.home.noRequests', 'No vacancy requests yet.', 'لا توجد طلبات عقارات شاغرة بعد.')}</Typography>
                  ) : homeRequests.slice(0, 6).map((request) => (
                    <Paper key={request.id} sx={{ p: 2, bgcolor: alpha(gold, 0.05), border: `1px solid ${alpha(gold, 0.12)}`, borderRadius: 3 }}>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2}>
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography sx={{ color: '#fff', fontWeight: 950 }}>{request.unitTitle || request.title}</Typography>
                          <Typography variant="caption" sx={{ color: alpha('#fff', 0.52) }}>{[titleCase(request.propertyType), request.area, request.emirate].filter(Boolean).join(' · ') || request.propertyAddress}</Typography>
                        </Box>
                        <Chip label={request.stage || request.status || 'OPEN'} sx={{ bgcolor: alpha(gold, 0.10), color: gold, fontWeight: 950 }} />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Paper>

              <Paper sx={{ p: 3.5, bgcolor: darkCard, border, borderRadius: 5 }}>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>{copy('owner.home.renterApplications', 'Home seeker activity handled by BIN', 'نشاط الباحثين عن منزل الذي تديره BIN')}</Typography>
                <Stack spacing={1.5}>
                  {tenantApplications.length === 0 ? (
                    <Typography sx={{ color: alpha('#fff', 0.48), fontWeight: 800 }}>{copy('owner.home.noApps', 'No viewing or rental requests yet.', 'لا توجد طلبات معاينة أو إيجار حتى الآن.')}</Typography>
                  ) : tenantApplications.map((application) => (
                    <Card key={application.id} sx={{ bgcolor: alpha('#fff', 0.04), border: `1px solid ${alpha('#fff', 0.08)}`, borderRadius: 3 }}>
                      <CardContent>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2}>
                          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography sx={{ color: '#fff', fontWeight: 950 }}>{application.tenantName || application.tenantEmail || copy('owner.home.tenant', 'Home seeker', 'باحث عن منزل')}</Typography>
                            <Typography variant="caption" sx={{ color: alpha('#fff', 0.52) }}>{application.listingTitle}</Typography>
                          </Box>
                          <Chip icon={<SafeIcon icon={application.requestMode === 'VIEWING' ? MapPin : KeyRound} size={13} />} label={application.stage || 'BIN_CONTACT'} sx={{ bgcolor: alpha(application.requestMode === 'VIEWING' ? '#38BDF8' : '#22C55E', 0.12), color: application.requestMode === 'VIEWING' ? '#38BDF8' : '#22C55E', fontWeight: 900 }} />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Paper>
            </Stack>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3.5, bgcolor: darkCard, border, borderRadius: 5 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>{copy('owner.home.publishedTitle', 'Published BIN-managed rental homes', 'عقارات الإيجار المنشورة بإدارة BIN')}</Typography>
          <Grid container spacing={2.5}>
            {openHomes.length === 0 ? (
              <Grid item xs={12}><Typography sx={{ color: alpha('#fff', 0.48), fontWeight: 800 }}>{copy('owner.home.noPublished', 'No homes published yet. BIN operations will publish only after verification.', 'لم يتم نشر عقارات بعد. ستنشر BIN فقط بعد التحقق.')}</Typography></Grid>
            ) : openHomes.map((home) => (
              <Grid item xs={12} md={6} key={home.id}>
                <Paper sx={{ p: 2.5, bgcolor: alpha('#fff', 0.04), border: `1px solid ${alpha('#fff', 0.08)}`, borderRadius: 3 }}>
                  <Stack spacing={1.1} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                      <SafeIcon icon={Building2} size={17} style={{ color: gold }} />
                      <Typography sx={{ color: '#fff', fontWeight: 950 }}>{home.unitTitle || home.title || home.propertyName}</Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.55) }}>{[home.area, home.emirate].filter(Boolean).join(', ') || home.propertyAddress}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
                      <Chip label={money(home.annualRent || home.monthlyRent)} size="small" sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
                      {home.propertyType && <Chip label={titleCase(home.propertyType)} size="small" sx={{ bgcolor: alpha('#38BDF8', 0.1), color: '#38BDF8', fontWeight: 900 }} />}
                      <Chip icon={<SafeIcon icon={CheckCircle2} size={12} />} label={home.notRented === false ? 'RENTED' : 'AVAILABLE'} size="small" sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 900 }} />
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Stack>
    </Box>
  );
}
