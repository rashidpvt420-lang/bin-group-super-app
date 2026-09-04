import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Camera, CheckCircle2, FileText, Home, Image as ImageIcon, ShieldCheck, Upload, Users } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import {
  collection,
  db,
  doc,
  getDownloadURL,
  onSnapshot,
  query,
  ref,
  serverTimestamp,
  setDoc,
  storage,
  uploadBytesResumable,
  where,
} from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const gold = binThemeTokens.gold;
const HOME_RECORD_TYPES = new Set(['ROOM_RENT_LISTING', 'FIND_ROOM_RENT', 'HOME_RENT_LISTING', 'PROPERTY_RENT_LISTING', 'RENTAL_LISTING']);
const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type MarketplaceRecord = {
  id: string;
  type?: string;
  recordType?: string;
  status?: string;
  stage?: string;
  requestMode?: string;
  listingId?: string;
  listingTitle?: string;
  unitTitle?: string;
  title?: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyType?: string;
  area?: string;
  emirate?: string;
  annualRent?: number;
  tenantName?: string;
  tenantEmail?: string;
  imageUrls?: string[];
  active?: boolean;
  approved?: boolean;
  hasBinContract?: boolean;
  notRented?: boolean;
};

type FormState = {
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
  amenitiesText: string;
  notes: string;
};

const blankForm: FormState = {
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
  amenitiesText: '',
  notes: '',
};

function cleanAmenities(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))].slice(0, 30);
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? `AED ${Math.round(amount).toLocaleString()}` : 'Pending';
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function HomeDiscoveryInventoryPage() {
  const { user } = useRole();
  const { lang, isRTL, tx } = useLanguage();
  const copy = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);
  const ownerEmail = String(user?.email || '').trim().toLowerCase();
  const [form, setForm] = useState<FormState>(blankForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);
  const [requests, setRequests] = useState<MarketplaceRecord[]>([]);
  const [listings, setListings] = useState<MarketplaceRecord[]>([]);

  const fieldSx = { '& .MuiOutlinedInput-root': { bgcolor: '#fff' } } as const;
  const setField = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!ownerEmail) return undefined;
    const unsubRequests = onSnapshot(
      query(collection(db, 'jobPostings'), where('ownerEmail', '==', ownerEmail)),
      (snapshot) => setRequests(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as MarketplaceRecord))),
      (error) => console.warn('[OwnerHomeDiscoveryWave2] request listener failed', error),
    );
    const unsubListings = onSnapshot(
      query(collection(db, 'contractorProfiles'), where('ownerEmail', '==', ownerEmail)),
      (snapshot) => setListings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as MarketplaceRecord)).filter((item) => HOME_RECORD_TYPES.has(String(item.recordType || '').toUpperCase()))),
      (error) => console.warn('[OwnerHomeDiscoveryWave2] listing listener failed', error),
    );
    return () => { unsubRequests(); unsubListings(); };
  }, [ownerEmail]);

  const listingRequests = useMemo(() => requests.filter((item) => String(item.type || '').toUpperCase() === 'ROOM_RENT_REQUEST'), [requests]);
  const applications = useMemo(() => requests.filter((item) => String(item.type || '').toUpperCase() === 'ROOM_RENT_APPLICATION'), [requests]);
  const liveListings = useMemo(() => listings.filter((item) => item.active === true && item.approved === true && item.hasBinContract === true && item.notRented !== false && !['RENTED', 'CLOSED', 'INACTIVE'].includes(String(item.status || '').toUpperCase())), [listings]);

  const onPhotoSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;
    const invalid = selected.find((file) => !file.type.startsWith('image/') || file.size > MAX_PHOTO_BYTES);
    if (invalid) {
      setNotice({ severity: 'error', text: copy('owner.home.photoInvalid', 'Use image files only, up to 10 MB each.', 'استخدم ملفات صور فقط وبحجم لا يتجاوز 10 ميجابايت لكل صورة.') });
      return;
    }
    setPhotos((current) => [...current, ...selected].slice(0, MAX_PHOTOS));
    setNotice(null);
  };

  async function uploadListingPhotos(requestId: string) {
    if (!user?.uid) throw new Error('OWNER_AUTH_REQUIRED');
    const uploaded: string[] = [];
    for (let index = 0; index < photos.length; index += 1) {
      const file = photos[index];
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || `property_${index + 1}.jpg`;
      const storageRef = ref(storage, `home-listing-media/${user.uid}/${requestId}/${Date.now()}_${index}_${safeName}`);
      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          ownerUid: user.uid,
          listingRequestId: requestId,
          evidenceType: 'home_listing_photo',
        },
      });
      const url = await new Promise<string>((resolve, reject) => {
        task.on('state_changed', (snapshot) => {
          const fileProgress = snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
          setUploadProgress(Math.round(((index + fileProgress) / Math.max(photos.length, 1)) * 100));
        }, reject, async () => {
          try { resolve(await getDownloadURL(task.snapshot.ref)); } catch (error) { reject(error); }
        });
      });
      uploaded.push(url);
    }
    setUploadProgress(100);
    return uploaded;
  }

  async function submitVacancy() {
    if (!user?.uid || !ownerEmail) return;
    if (!form.unitTitle.trim() || !form.propertyAddress.trim() || !form.annualRent) {
      setNotice({ severity: 'warning', text: copy('owner.home.required', 'Add the listing title, full address and annual rent before submitting.', 'أضف اسم الإعلان والعنوان الكامل والإيجار السنوي قبل الإرسال.') });
      return;
    }
    if (photos.length < 3) {
      setNotice({ severity: 'warning', text: copy('owner.home.photosRequired', 'Add at least 3 real property photos. BIN will review them before publication.', 'أضف 3 صور حقيقية للعقار على الأقل. ستراجعها BIN قبل النشر.') });
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    setNotice(null);
    const requestRef = doc(collection(db, 'jobPostings'));
    try {
      const imageUrls = await uploadListingPhotos(requestRef.id);
      await setDoc(requestRef, {
        type: 'ROOM_RENT_REQUEST',
        requestKind: 'HOME_RENT_LISTING_REQUEST',
        listingSchema: 'HOME_DISCOVERY_V2',
        source: 'owner_home_discovery_wave2',
        title: form.unitTitle.trim(),
        unitTitle: form.unitTitle.trim(),
        propertyType: form.propertyType,
        propertyAddress: form.propertyAddress.trim(),
        area: form.area.trim(),
        emirate: form.emirate,
        annualRent: Number(form.annualRent || 0),
        bedrooms: Number(form.bedrooms || 0),
        bathrooms: Number(form.bathrooms || 0),
        areaSqFt: Number(form.areaSqFt || 0),
        furnishing: form.furnishing,
        furnished: form.furnishing === 'FURNISHED',
        availableFrom: form.availableFrom || null,
        numberOfCheques: Number(form.numberOfCheques || 0),
        securityDeposit: Number(form.securityDeposit || 0),
        amenities: cleanAmenities(form.amenitiesText),
        description: form.notes.trim(),
        imageUrls,
        photoCount: imageUrls.length,
        mediaSource: 'FIREBASE_OWNER_CONTROLLED_UPLOAD',
        ownerId: user.uid,
        ownerEmail,
        status: 'OPEN',
        stage: 'BIN_LISTING_REVIEW_REQUIRED',
        requestedContractHandling: true,
        verifiedByAdmin: false,
        approved: false,
        active: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm(blankForm);
      setPhotos([]);
      setUploadProgress(0);
      setNotice({ severity: 'success', text: copy('owner.home.submitted', 'Vacancy and property photos are secured. BIN Admin must verify the listing before it can go live.', 'تم حفظ العقار والصور بشكل آمن. يجب أن يتحقق مسؤول BIN من الإعلان قبل نشره.') });
    } catch (error) {
      console.error('[OwnerHomeDiscoveryWave2] submit failed', error);
      setNotice({ severity: 'error', text: copy('owner.home.submitFailed', 'The vacancy could not be submitted. Your listing has not been published.', 'تعذر إرسال العقار. لم يتم نشر الإعلان.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 6 }}>
      <Stack spacing={3}>
        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 5, bgcolor: '#fff', border: `1px solid ${alpha(gold, 0.28)}`, boxShadow: '0 20px 55px rgba(17,24,39,0.08)' }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={3} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 950, color: binThemeTokens.textPrimary }}>{copy('owner.home.v2Title', 'Home Discovery Inventory', 'مخزون اكتشاف المنازل')}</Typography>
              <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 820, fontWeight: 700 }}>{copy('owner.home.v2Desc', 'Upload real property photos directly, submit the verified facts, and let BIN Admin control what becomes public.', 'ارفع صور العقار الحقيقية مباشرة وأرسل البيانات الموثقة، ويتحكم مسؤول BIN فيما يتم نشره للعامة.')}</Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip icon={<SafeIcon icon={Camera} size={15} />} label={copy('owner.home.securePhotos', 'Controlled photo upload', 'رفع صور آمن')} sx={{ fontWeight: 900 }} />
              <Chip icon={<SafeIcon icon={ShieldCheck} size={15} />} label={copy('owner.home.adminReview', 'Admin review required', 'مراجعة المسؤول مطلوبة')} sx={{ fontWeight: 900 }} />
            </Stack>
          </Stack>
        </Paper>

        {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}

        <Grid container spacing={2}>
          {[
            { label: copy('owner.home.requests', 'Listing requests', 'طلبات النشر'), value: listingRequests.length, icon: FileText },
            { label: copy('owner.home.live', 'Live verified homes', 'العقارات الموثقة المنشورة'), value: liveListings.length, icon: Home },
            { label: copy('owner.home.interest', 'Viewings / applications', 'المعاينات / الطلبات'), value: applications.length, icon: Users },
          ].map((item) => (
            <Grid item xs={12} md={4} key={item.label}>
              <Paper sx={{ p: 2.5, borderRadius: 4, border: `1px solid ${binThemeTokens.border}`, bgcolor: '#fff' }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
                  <Box sx={{ color: gold }}><SafeIcon icon={item.icon} size={25} /></Box>
                  <Box><Typography variant="h5" sx={{ fontWeight: 950 }}>{item.value}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{item.label}</Typography></Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 5, border: `1px solid ${binThemeTokens.border}`, bgcolor: '#fff' }}>
          <Stack spacing={2.3}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 950 }}>{copy('owner.home.submitHeading', 'Submit a verified vacancy', 'إرسال عقار شاغر موثق')}</Typography>
              <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>{copy('owner.home.submitBody', 'Nothing becomes public from this form. BIN Admin verifies the contract, advertising details, availability and media first.', 'لا يتم نشر أي شيء من هذا النموذج مباشرة. يتحقق مسؤول BIN أولاً من العقد وبيانات الإعلان والتوفر والصور.')}</Typography>
            </Box>

            <Grid container spacing={1.7}>
              <Grid item xs={12} md={8}><TextField fullWidth label={copy('owner.home.titleField', 'Listing / unit title', 'اسم الإعلان / الوحدة')} value={form.unitTitle} onChange={(e) => setField('unitTitle', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth><InputLabel>{copy('owner.home.type', 'Property type', 'نوع العقار')}</InputLabel><Select value={form.propertyType} label={copy('owner.home.type', 'Property type', 'نوع العقار')} onChange={(e) => setField('propertyType', String(e.target.value))}>{['ROOM', 'STUDIO', 'APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE'].map((value) => <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>)}</Select></FormControl>
              </Grid>
              <Grid item xs={12}><TextField fullWidth label={copy('owner.home.address', 'Full property address', 'عنوان العقار الكامل')} value={form.propertyAddress} onChange={(e) => setField('propertyAddress', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label={copy('owner.home.area', 'Area / community', 'المنطقة / المجتمع')} value={form.area} onChange={(e) => setField('area', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>{copy('owner.home.emirate', 'Emirate', 'الإمارة')}</InputLabel><Select value={form.emirate} label={copy('owner.home.emirate', 'Emirate', 'الإمارة')} onChange={(e) => setField('emirate', String(e.target.value))}>{['ABU_DHABI', 'DUBAI', 'SHARJAH', 'AJMAN', 'UMM_AL_QUWAIN', 'RAS_AL_KHAIMAH', 'FUJAIRAH'].map((value) => <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={12} md={4}><TextField fullWidth type="number" label={copy('owner.home.rent', 'Annual rent (AED)', 'الإيجار السنوي (درهم)')} value={form.annualRent} onChange={(e) => setField('annualRent', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={4} md={2}><TextField fullWidth type="number" label={copy('owner.home.beds', 'Beds', 'غرف')} value={form.bedrooms} onChange={(e) => setField('bedrooms', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={4} md={2}><TextField fullWidth type="number" label={copy('owner.home.baths', 'Baths', 'حمام')} value={form.bathrooms} onChange={(e) => setField('bathrooms', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={4} md={2}><TextField fullWidth type="number" label="ft²" value={form.areaSqFt} onChange={(e) => setField('areaSqFt', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12} md={2}><TextField fullWidth type="number" label={copy('owner.home.cheques', 'Cheques', 'الشيكات')} value={form.numberOfCheques} onChange={(e) => setField('numberOfCheques', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>{copy('owner.home.furnishing', 'Furnishing', 'التأثيث')}</InputLabel><Select value={form.furnishing} label={copy('owner.home.furnishing', 'Furnishing', 'التأثيث')} onChange={(e) => setField('furnishing', String(e.target.value))}>{['FURNISHED', 'UNFURNISHED', 'PARTLY_FURNISHED'].map((value) => <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>)}</Select></FormControl></Grid>
              <Grid item xs={12} md={4}><TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label={copy('owner.home.available', 'Available from', 'متاح من')} value={form.availableFrom} onChange={(e) => setField('availableFrom', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12} md={4}><TextField fullWidth type="number" label={copy('owner.home.deposit', 'Security deposit (AED)', 'التأمين (درهم)')} value={form.securityDeposit} onChange={(e) => setField('securityDeposit', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12}><TextField fullWidth multiline minRows={2} label={copy('owner.home.amenities', 'Amenities — comma separated', 'المميزات — افصل بينها بفاصلة')} value={form.amenitiesText} onChange={(e) => setField('amenitiesText', e.target.value)} sx={fieldSx} /></Grid>
              <Grid item xs={12}><TextField fullWidth multiline minRows={3} label={copy('owner.home.notes', 'Description / maintenance highlights', 'الوصف / أهم أعمال الصيانة')} value={form.notes} onChange={(e) => setField('notes', e.target.value)} sx={fieldSx} /></Grid>
            </Grid>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 4, borderStyle: 'dashed', borderColor: alpha(gold, 0.55), bgcolor: alpha(gold, 0.035) }}>
              <Stack spacing={1.5}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center"><SafeIcon icon={ImageIcon} size={22} color={gold} /><Box><Typography sx={{ fontWeight: 950 }}>{copy('owner.home.photoHeading', 'Real property photos', 'صور العقار الحقيقية')}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{copy('owner.home.photoRule', '3–12 images · JPG/PNG/HEIC/WebP · up to 10 MB each', 'من 3 إلى 12 صورة · حتى 10 ميجابايت لكل صورة')}</Typography></Box></Stack>
                <Button component="label" variant="outlined" startIcon={<SafeIcon icon={Upload} size={18} />} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', borderColor: gold, color: binThemeTokens.goldHover, fontWeight: 900 }}>
                  {copy('owner.home.choosePhotos', 'Choose property photos', 'اختر صور العقار')}
                  <input hidden multiple accept="image/*" type="file" onChange={onPhotoSelection} />
                </Button>
                {photos.length > 0 && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{photos.map((file, index) => <Chip key={`${file.name}-${index}`} label={`${index + 1}. ${file.name}`} onDelete={() => !saving && setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}</Stack>}
                {saving && photos.length > 0 && <Box><LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 8, borderRadius: 6 }} /><Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: binThemeTokens.textSecondary }}>{copy('owner.home.uploading', `Securing photos… ${uploadProgress}%`, `جارٍ حفظ الصور… ${uploadProgress}%`)}</Typography></Box>}
              </Stack>
            </Paper>

            <Button variant="contained" size="large" disabled={saving} onClick={submitVacancy} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SafeIcon icon={CheckCircle2} size={19} />} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, py: 1.5, borderRadius: 3 }}>
              {saving ? copy('owner.home.submitting', 'Securing & submitting…', 'جارٍ الحفظ والإرسال…') : copy('owner.home.submit', 'Submit to BIN Admin Review', 'إرسال لمراجعة مسؤول BIN')}
            </Button>
          </Stack>
        </Paper>

        {(listingRequests.length > 0 || liveListings.length > 0) && <Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#fff', border: `1px solid ${binThemeTokens.border}` }}>
          <Typography variant="h6" sx={{ fontWeight: 950, mb: 2 }}>{copy('owner.home.status', 'Your Home Discovery status', 'حالة إعلاناتك')}</Typography>
          <Stack spacing={1.2}>
            {listingRequests.slice(0, 6).map((request) => <Paper key={request.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2}><Box><Typography sx={{ fontWeight: 900 }}>{request.unitTitle || request.title}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{request.propertyAddress} · {money(request.annualRent)}</Typography></Box><Chip label={request.stage || request.status || 'REVIEW'} /></Stack></Paper>)}
            {liveListings.slice(0, 6).map((listing) => <Paper key={listing.id} variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: alpha('#16A34A', 0.3) }}><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2}><Box><Typography sx={{ fontWeight: 900 }}>{listing.unitTitle || listing.title || listing.propertyName}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{listing.area || listing.emirate} · {money(listing.annualRent)} · {listing.imageUrls?.length || 0} photos</Typography></Box><Chip color="success" label={copy('owner.home.liveBadge', 'LIVE VERIFIED', 'منشور وموثق')} /></Stack></Paper>)}
          </Stack>
        </Paper>}

        {applications.length > 0 && <Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#fff', border: `1px solid ${binThemeTokens.border}` }}>
          <Typography variant="h6" sx={{ fontWeight: 950, mb: 0.5 }}>{copy('owner.home.applicationDetails', 'Viewing & rental request details', 'تفاصيل طلبات المعاينة والإيجار')}</Typography>
          <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 2 }}>{copy('owner.home.applicationDetailsBody', 'See who requested a viewing or applied, which listing they selected, and the current workflow stage.', 'اطلع على طالب المعاينة أو الإيجار والعقار الذي اختاره ومرحلة الطلب الحالية.')}</Typography>
          <Stack spacing={1.2}>
            {applications.slice(0, 20).map((application) => (
              <Paper key={application.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={1.5}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 950 }}>{application.listingTitle || application.unitTitle || application.title || application.propertyName || application.listingId || copy('owner.home.unknownListing', 'Home listing', 'إعلان عقار')}</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.4 }}>{application.tenantName || application.tenantEmail || copy('owner.home.unknownApplicant', 'Tenant applicant', 'طالب الإيجار')}</Typography>
                    {application.tenantEmail && application.tenantEmail !== application.tenantName && <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block' }}>{application.tenantEmail}</Typography>}
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, display: 'block', mt: 0.5 }}>{application.area || application.emirate || application.propertyAddress || ''}{application.annualRent ? ` · ${money(application.annualRent)}` : ''}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="flex-start">
                    <Chip label={application.requestMode === 'VIEWING' ? copy('owner.home.viewingRequest', 'VIEWING', 'معاينة') : copy('owner.home.rentalApplication', 'APPLICATION', 'طلب إيجار')} />
                    <Chip variant="outlined" label={application.stage || application.status || 'OPEN'} />
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Paper>}
      </Stack>
    </Box>
  );
}