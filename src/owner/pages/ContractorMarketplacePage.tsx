import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Grid, Paper,
  Stack, TextField, Typography, alpha,
} from '@mui/material';
import { BedDouble, CheckCircle2, ClipboardSignature, FileText, Home, KeyRound, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { addDoc, collection, db, onSnapshot, query, serverTimestamp, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const gold = binThemeTokens.gold;
const darkCard = 'rgba(15,23,42,0.72)';
const border = `1px solid ${alpha(gold, 0.18)}`;

type OwnerRoomRecord = {
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
  ownerEmail?: string;
  tenantEmail?: string;
  tenantName?: string;
  annualRent?: number;
  monthlyRent?: number;
  active?: boolean;
  notRented?: boolean;
  hasBinContract?: boolean;
  repairHistory?: any[];
  repairHistorySummary?: string;
};

function isRoomListing(row: OwnerRoomRecord) {
  const recordType = String(row.recordType || '').toUpperCase();
  return (recordType === 'ROOM_RENT_LISTING' || recordType === 'FIND_ROOM_RENT') && row.active !== false;
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString()} AED` : 'Pending quote';
}

export default function ContractorMarketplacePage() {
  const navigate = useNavigate();
  const { user } = useRole();
  const { isRTL, lang, tx } = useLanguage();
  const copy = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const ownerEmail = String(user?.email || '').toLowerCase();

  const [loading, setLoading] = useState(true);
  const [ownerRequests, setOwnerRequests] = useState<OwnerRoomRecord[]>([]);
  const [catalog, setCatalog] = useState<OwnerRoomRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ unitTitle: '', propertyAddress: '', annualRent: '', bedrooms: '', notes: '' });

  const setField = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!ownerEmail) {
      setLoading(false);
      return undefined;
    }

    const unsubRequests = onSnapshot(
      query(collection(db, 'jobPostings'), where('ownerEmail', '==', ownerEmail)),
      (snap) => {
        setOwnerRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() } as OwnerRoomRecord)));
        setLoading(false);
      },
      (err) => {
        console.warn('[OwnerRoomRent] request listener failed:', err);
        setOwnerRequests([]);
        setLoading(false);
      },
    );

    const unsubCatalog = onSnapshot(
      query(collection(db, 'contractorProfiles'), where('active', '==', true)),
      (snap) => setCatalog(snap.docs.map((item) => ({ id: item.id, ...item.data() } as OwnerRoomRecord)).filter((item) => {
        if (!isRoomListing(item)) return false;
        return String(item.ownerEmail || '').toLowerCase() === ownerEmail || item.id === user?.uid;
      })),
      (err) => {
        console.warn('[OwnerRoomRent] published listing listener failed:', err);
        setCatalog([]);
      },
    );

    return () => {
      unsubRequests();
      unsubCatalog();
    };
  }, [ownerEmail, user?.uid]);

  const roomRequests = useMemo(() => ownerRequests.filter((item) => String(item.type || '').toUpperCase() === 'ROOM_RENT_REQUEST'), [ownerRequests]);
  const tenantApplications = useMemo(() => ownerRequests.filter((item) => String(item.type || '').toUpperCase() === 'ROOM_RENT_APPLICATION'), [ownerRequests]);
  const openRooms = catalog.filter((item) => item.notRented !== false && String(item.status || 'AVAILABLE').toUpperCase() !== 'RENTED');

  async function submitRoomRequest() {
    if (!ownerEmail || !form.unitTitle.trim() || !form.propertyAddress.trim()) return;
    setSaving(true);
    setNotice('');
    try {
      await addDoc(collection(db, 'jobPostings'), {
        type: 'ROOM_RENT_REQUEST',
        source: 'owner_find_room_rent',
        title: form.unitTitle.trim(),
        unitTitle: form.unitTitle.trim(),
        propertyAddress: form.propertyAddress.trim(),
        annualRent: Number(form.annualRent || 0),
        bedrooms: form.bedrooms.trim(),
        description: form.notes.trim(),
        ownerId: user?.uid || null,
        ownerEmail,
        status: 'OPEN',
        stage: 'BIN_GROUP_RENTER_CONTRACTS',
        requestedContractHandling: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({ unitTitle: '', propertyAddress: '', annualRent: '', bedrooms: '', notes: '' });
      setNotice(copy('owner.room.sent', 'Room-rent request sent. BIN GROUP will prepare the renter contact and contract handling flow.', 'تم إرسال طلب تأجير الغرفة. ستقوم BIN GROUP بتجهيز التواصل مع المستأجر وإدارة العقد.'));
    } catch (err) {
      console.error('[OwnerRoomRent] request failed:', err);
      setNotice(copy('owner.room.failed', 'Could not submit the room-rent request. Please check your owner login and try again.', 'تعذر إرسال طلب تأجير الغرفة. يرجى التحقق من تسجيل دخول المالك والمحاولة مرة أخرى.'));
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
                <Box sx={{ p: 1, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, display: 'inline-flex' }}><SafeIcon icon={BedDouble} size={22} /></Box>
                <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 4 }}>{copy('owner.room.overline', 'FIND A ROOM RENT', 'البحث عن مستأجر للغرفة')}</Typography>
              </Stack>
              <Typography variant="h4" fontWeight={950} sx={{ color: '#fff' }}>
                {copy('owner.room.title', 'BIN handles renter contacts and contract offers for your vacant rooms.', 'تتولى BIN التواصل مع المستأجرين وعروض العقود لغرفك الشاغرة.')}
              </Typography>
              <Typography variant="body2" sx={{ color: alpha('#fff', 0.62), fontWeight: 700, mt: 1, maxWidth: 860 }}>
                {copy('owner.room.desc', 'The owner journey starts with the service contract offer. Once accepted, we publish only rooms under BIN contract, expose the repair history, and route renter applications back to you for contract handling.', 'تبدأ رحلة المالك بعرض العقد. بعد القبول ننشر فقط الغرف ضمن عقد BIN، ونُظهر سجل الصيانة، ونحوّل طلبات المستأجرين إليك لإدارة العقد.')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
              <Chip icon={<SafeIcon icon={ClipboardSignature} size={14} />} label={copy('owner.room.contractFirst', 'Contract first', 'العقد أولاً')} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950 }} />
              <Chip icon={<SafeIcon icon={Wrench} size={14} />} label={copy('owner.room.history', 'Repair history visible', 'سجل الصيانة ظاهر')} sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 950 }} />
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
            { label: copy('owner.room.contractOffers', 'Contract offers', 'عروض العقود'), value: roomRequests.length, icon: FileText },
            { label: copy('owner.room.publishedRooms', 'Published rooms', 'الغرف المنشورة'), value: openRooms.length, icon: Home },
            { label: copy('owner.room.applications', 'Renter applications', 'طلبات المستأجرين'), value: tenantApplications.length, icon: Users },
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
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 3.5, bgcolor: darkCard, border, borderRadius: 5 }}>
              <Stack spacing={2.2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{copy('owner.room.submitTitle', 'Tell BIN GROUP which room is vacant', 'أخبر BIN GROUP بالغرفة الشاغرة')}</Typography>
                <Typography variant="body2" sx={{ color: alpha('#fff', 0.55) }}>{copy('owner.room.submitDesc', 'We will review the property contract, prepare the room listing, and handle renter contact through the app.', 'سنراجع عقد العقار ونجهز إعلان الغرفة ونتولى التواصل مع المستأجر عبر التطبيق.')}</Typography>
                <TextField fullWidth label={copy('owner.room.unitTitle', 'Room / Unit title', 'اسم الغرفة / الوحدة')} value={form.unitTitle} onChange={(e) => setField('unitTitle', e.target.value)} sx={{ input: { color: '#fff' }, '& label': { color: alpha('#fff', 0.55) }, '& fieldset': { borderColor: alpha(gold, 0.24) } }} />
                <TextField fullWidth label={copy('owner.room.address', 'Property address', 'عنوان العقار')} value={form.propertyAddress} onChange={(e) => setField('propertyAddress', e.target.value)} sx={{ input: { color: '#fff' }, '& label': { color: alpha('#fff', 0.55) }, '& fieldset': { borderColor: alpha(gold, 0.24) } }} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField fullWidth label={copy('owner.room.annualRent', 'Expected annual rent', 'الإيجار السنوي المتوقع')} type="number" value={form.annualRent} onChange={(e) => setField('annualRent', e.target.value)} sx={{ input: { color: '#fff' }, '& label': { color: alpha('#fff', 0.55) }, '& fieldset': { borderColor: alpha(gold, 0.24) } }} />
                  <TextField fullWidth label={copy('owner.room.bedrooms', 'Bedrooms', 'الغرف')} value={form.bedrooms} onChange={(e) => setField('bedrooms', e.target.value)} sx={{ input: { color: '#fff' }, '& label': { color: alpha('#fff', 0.55) }, '& fieldset': { borderColor: alpha(gold, 0.24) } }} />
                </Stack>
                <TextField fullWidth multiline minRows={3} label={copy('owner.room.notes', 'Notes / repair history highlights', 'ملاحظات / أهم أعمال الصيانة')} value={form.notes} onChange={(e) => setField('notes', e.target.value)} sx={{ textarea: { color: '#fff' }, '& label': { color: alpha('#fff', 0.55) }, '& fieldset': { borderColor: alpha(gold, 0.24) } }} />
                <Button fullWidth variant="contained" disabled={saving || !form.unitTitle.trim() || !form.propertyAddress.trim()} onClick={submitRoomRequest} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, py: 1.3, borderRadius: 3 }}>
                  {saving ? <CircularProgress size={20} sx={{ color: '#111827' }} /> : copy('owner.room.submit', 'Request BIN renter contract handling', 'طلب إدارة عقد المستأجر من BIN')}
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Stack spacing={3}>
              <Paper sx={{ p: 3.5, bgcolor: darkCard, border, borderRadius: 5 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{copy('owner.room.nextContracts', 'Owner contract offers first', 'عروض عقود المالك أولاً')}</Typography>
                    <Typography variant="body2" sx={{ color: alpha('#fff', 0.55) }}>{copy('owner.room.nextContractsDesc', 'Review your BIN contract before publishing rooms or accepting renter applications.', 'راجع عقد BIN قبل نشر الغرف أو قبول طلبات المستأجرين.')}</Typography>
                  </Box>
                  <Button onClick={() => navigate('/owner/contracts')} sx={{ color: gold, border: `1px solid ${alpha(gold, 0.35)}`, borderRadius: 3, fontWeight: 950 }}>{copy('owner.room.openContracts', 'Open contracts', 'فتح العقود')}</Button>
                </Stack>
                <Divider sx={{ borderColor: alpha(gold, 0.12), mb: 2 }} />
                <Stack spacing={1.5}>
                  {roomRequests.length === 0 ? (
                    <Typography sx={{ color: alpha('#fff', 0.48), fontWeight: 800 }}>{copy('owner.room.noRequests', 'No room-rent contract requests yet. Submit a vacant room request to start.', 'لا توجد طلبات لعقد تأجير غرفة بعد. أرسل طلب غرفة شاغرة للبدء.')}</Typography>
                  ) : roomRequests.slice(0, 5).map((request) => (
                    <Paper key={request.id} sx={{ p: 2, bgcolor: alpha(gold, 0.05), border: `1px solid ${alpha(gold, 0.12)}`, borderRadius: 3 }}>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2}>
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography sx={{ color: '#fff', fontWeight: 950 }}>{request.unitTitle || request.title}</Typography>
                          <Typography variant="caption" sx={{ color: alpha('#fff', 0.52) }}>{request.propertyAddress}</Typography>
                        </Box>
                        <Chip label={request.stage || request.status || 'OPEN'} sx={{ bgcolor: alpha(gold, 0.10), color: gold, fontWeight: 950 }} />
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Paper>

              <Paper sx={{ p: 3.5, bgcolor: darkCard, border, borderRadius: 5 }}>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>{copy('owner.room.renterApplications', 'Renter applications handled by BIN', 'طلبات المستأجرين التي تديرها BIN')}</Typography>
                <Stack spacing={1.5}>
                  {tenantApplications.length === 0 ? (
                    <Typography sx={{ color: alpha('#fff', 0.48), fontWeight: 800 }}>{copy('owner.room.noApps', 'No renter applications yet.', 'لا توجد طلبات مستأجرين حتى الآن.')}</Typography>
                  ) : tenantApplications.map((application) => (
                    <Card key={application.id} sx={{ bgcolor: alpha('#fff', 0.04), border: `1px solid ${alpha('#fff', 0.08)}`, borderRadius: 3 }}>
                      <CardContent>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2}>
                          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography sx={{ color: '#fff', fontWeight: 950 }}>{application.tenantName || application.tenantEmail || copy('owner.room.tenant', 'Tenant applicant', 'مستأجر متقدم')}</Typography>
                            <Typography variant="caption" sx={{ color: alpha('#fff', 0.52) }}>{application.listingTitle}</Typography>
                          </Box>
                          <Chip icon={<SafeIcon icon={KeyRound} size={13} />} label={application.stage || 'BIN_CONTRACT_CONTACT'} sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 900 }} />
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
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>{copy('owner.room.published', 'Published BIN-managed rooms', 'الغرف المنشورة بإدارة BIN')}</Typography>
          <Grid container spacing={2.5}>
            {openRooms.length === 0 ? (
              <Grid item xs={12}><Typography sx={{ color: alpha('#fff', 0.48), fontWeight: 800 }}>{copy('owner.room.noPublished', 'No rooms published yet. Admin will publish after contract review.', 'لم يتم نشر أي غرف بعد. سيقوم المسؤول بالنشر بعد مراجعة العقد.')}</Typography></Grid>
            ) : openRooms.map((room) => (
              <Grid item xs={12} md={6} key={room.id}>
                <Paper sx={{ p: 2.5, bgcolor: alpha('#fff', 0.04), border: `1px solid ${alpha('#fff', 0.08)}`, borderRadius: 3 }}>
                  <Stack spacing={1.1} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography sx={{ color: '#fff', fontWeight: 950 }}>{room.unitTitle || room.title || room.propertyName}</Typography>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.55) }}>{room.propertyAddress}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
                      <Chip label={money(room.annualRent || room.monthlyRent)} size="small" sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
                      <Chip label={room.notRented === false ? 'RENTED' : 'NOT RENTED'} size="small" sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 900 }} />
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
