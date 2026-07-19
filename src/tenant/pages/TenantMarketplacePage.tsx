import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Container, Divider,
  Grid, Paper, Stack, Typography, alpha,
} from '@mui/material';
import { BedDouble, CheckCircle2, FileText, Home, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { addDoc, collection, db, onSnapshot, query, serverTimestamp, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

type RoomListing = {
  id: string;
  recordType?: string;
  listingType?: string;
  active?: boolean;
  status?: string;
  notRented?: boolean;
  hasBinContract?: boolean;
  title?: string;
  unitTitle?: string;
  propertyName?: string;
  propertyAddress?: string;
  emirate?: string;
  annualRent?: number;
  monthlyRent?: number;
  bedrooms?: string | number;
  bathrooms?: string | number;
  ownerId?: string;
  ownerEmail?: string;
  propertyId?: string;
  repairHistory?: Array<{ date?: string; title?: string; issue?: string; status?: string; cost?: number }>;
  repairHistorySummary?: string;
  contractScope?: string;
};

const gold = binThemeTokens.gold;
const cardSx = {
  bgcolor: 'rgba(15,23,42,0.78)',
  border: `1px solid ${alpha(gold, 0.16)}`,
  borderRadius: 4,
  height: '100%',
};

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString()} AED` : 'Price on request';
}

function isRoomRentListing(row: RoomListing) {
  const recordType = String(row.recordType || row.listingType || '').toUpperCase();
  const status = String(row.status || 'AVAILABLE').toUpperCase();
  return (recordType === 'ROOM_RENT_LISTING' || recordType === 'FIND_ROOM_RENT') && row.active !== false && row.hasBinContract !== false && row.notRented !== false && !['RENTED', 'CLOSED', 'INACTIVE'].includes(status);
}

function repairRows(listing: RoomListing) {
  if (Array.isArray(listing.repairHistory)) return listing.repairHistory.slice(0, 3);
  return [];
}

export default function TenantMarketplacePage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState<RoomListing[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const copy = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));

  useEffect(() => {
    const listingsQuery = query(collection(db, 'contractorProfiles'), where('active', '==', true));
    const unsub = onSnapshot(listingsQuery, (snap) => {
      setListings(snap.docs.map((item) => ({ id: item.id, ...item.data() } as RoomListing)).filter(isRoomRentListing));
      setLoading(false);
    }, (err) => {
      console.warn('[FindRoomRent] listing listener failed:', err);
      setListings([]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const availableCount = listings.length;
  const emirates = useMemo(() => [...new Set(listings.map((item) => item.emirate || 'UAE'))], [listings]);

  async function applyForRoom(room: RoomListing) {
    if (!user?.uid || !user?.email) {
      setNotice(copy('tenant.room.loginRequired', 'Please sign in with a verified tenant email before applying.', 'يرجى تسجيل الدخول ببريد مستأجر موثّق قبل التقديم.'));
      return;
    }
    setApplyingId(room.id);
    setNotice('');
    try {
      await addDoc(collection(db, 'jobPostings'), {
        type: 'ROOM_RENT_APPLICATION',
        source: 'tenant_find_room_rent',
        listingId: room.id,
        listingTitle: room.unitTitle || room.title || room.propertyName || 'Room rent listing',
        propertyId: room.propertyId || null,
        ownerId: room.ownerId || null,
        ownerEmail: String(room.ownerEmail || '').toLowerCase(),
        tenantId: user.uid,
        tenantEmail: String(user.email || '').toLowerCase(),
        tenantName: user.displayName || user.email,
        status: 'OPEN',
        stage: 'BIN_GROUP_CONTRACT_CONTACT',
        requestedContractHandling: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotice(copy('tenant.room.applicationSent', 'Application sent. BIN GROUP will handle the renter contact and contract with the owner.', 'تم إرسال الطلب. ستتولى BIN GROUP التواصل والعقد مع المالك.'));
    } catch (err) {
      console.error('[FindRoomRent] application failed:', err);
      setNotice(copy('tenant.room.applicationFailed', 'Application could not be sent. Please try again or contact BIN GROUP support from the app.', 'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى أو التواصل مع دعم BIN GROUP من داخل التطبيق.'));
    } finally {
      setApplyingId(null);
    }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(255,255,255,0.96)', border: `1px solid ${alpha(gold, 0.22)}`, borderRadius: 6, boxShadow: '0 20px 60px rgba(15,23,42,0.10)' }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>
                {copy('tenant.room.overline', 'FIND A ROOM RENT', 'ابحث عن غرفة للإيجار')}
              </Typography>
              <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 0.5 }}>
                {copy('tenant.room.title', 'Move into a BIN-managed room with repair history visible.', 'انتقل إلى غرفة تديرها BIN مع سجل صيانة واضح.')}
              </Typography>
              <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1.5, maxWidth: 850 }}>
                {copy('tenant.room.desc', 'Only rooms linked to owners under BIN GROUP contract are shown. You can review the repair history, property status, and contract handling before you move in happily.', 'تظهر فقط الغرف المرتبطة بملاك لديهم عقد مع BIN GROUP. يمكنك مراجعة سجل الصيانة وحالة العقار وإدارة العقد قبل الانتقال بثقة.')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.2} flexWrap="wrap" justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
              <Chip icon={<SafeIcon icon={ShieldCheck} size={14} />} label={copy('tenant.room.binManaged', 'BIN contract only', 'عقود BIN فقط')} sx={{ bgcolor: alpha('#22C55E', 0.10), color: '#15803D', fontWeight: 950 }} />
              <Chip icon={<SafeIcon icon={Wrench} size={14} />} label={copy('tenant.room.repairHistory', 'Repair history visible', 'سجل الصيانة ظاهر')} sx={{ bgcolor: alpha(gold, 0.12), color: binThemeTokens.goldHover, fontWeight: 950 }} />
            </Stack>
          </Stack>
        </Paper>

        {notice && (
          <Paper sx={{ p: 2.2, bgcolor: alpha(gold, 0.08), border: `1px solid ${alpha(gold, 0.22)}`, borderRadius: 3 }}>
            <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{notice}</Typography>
          </Paper>
        )}

        <Grid container spacing={2.5}>
          {[
            { label: copy('tenant.room.available', 'Available rooms', 'الغرف المتاحة'), value: availableCount, icon: BedDouble },
            { label: copy('tenant.room.locations', 'Locations', 'المناطق'), value: emirates.length || 0, icon: MapPin },
            { label: copy('tenant.room.contractFlow', 'Contract handled', 'إدارة العقد'), value: 'BIN', icon: FileText },
          ].map((item) => (
            <Grid item xs={12} md={4} key={item.label}>
              <Paper sx={{ p: 2.5, bgcolor: '#fff', border: `1px solid ${binThemeTokens.border}`, borderRadius: 4 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
                  <Box sx={{ color: binThemeTokens.goldHover }}><SafeIcon icon={item.icon} size={24} /></Box>
                  <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, fontSize: '1.4rem', lineHeight: 1 }}>{item.value}</Typography>
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 850 }}>{item.label}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          {listings.map((room) => {
            const repairs = repairRows(room);
            return (
              <Grid item xs={12} md={6} key={room.id}>
                <Card sx={cardSx}>
                  <CardContent sx={{ p: 3.5 }}>
                    <Stack spacing={2.2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2} alignItems="flex-start">
                        <Box>
                          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{room.unitTitle || room.title || room.propertyName || copy('tenant.room.defaultTitle', 'Available BIN room', 'غرفة BIN متاحة')}</Typography>
                          <Typography variant="body2" sx={{ color: alpha('#fff', 0.62), mt: 0.7 }}>{room.propertyAddress || room.propertyName || copy('tenant.room.addressPending', 'Address shared after BIN review', 'يتم مشاركة العنوان بعد مراجعة BIN')}</Typography>
                        </Box>
                        <Chip label={copy('tenant.room.notRented', 'NOT RENTED', 'غير مؤجرة')} sx={{ bgcolor: alpha('#22C55E', 0.14), color: '#22C55E', fontWeight: 950 }} />
                      </Stack>

                      <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
                        <Chip label={`${copy('tenant.room.rent', 'Rent', 'الإيجار')}: ${money(room.annualRent || room.monthlyRent)}`} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950 }} />
                        <Chip label={`${copy('tenant.room.beds', 'Beds', 'الغرف')}: ${room.bedrooms || '-'}`} sx={{ bgcolor: alpha('#fff', 0.06), color: alpha('#fff', 0.72), fontWeight: 850 }} />
                        <Chip label={room.contractScope || copy('tenant.room.scope', 'BIN renter contract handling', 'BIN تدير عقد المستأجر')} sx={{ bgcolor: alpha('#38BDF8', 0.10), color: '#38BDF8', fontWeight: 850 }} />
                      </Stack>

                      <Divider sx={{ borderColor: alpha(gold, 0.13) }} />

                      <Box>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ mb: 1 }}>
                          <SafeIcon icon={Wrench} size={16} style={{ color: gold }} />
                          <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 2 }}>{copy('tenant.room.history', 'REPAIR HISTORY', 'سجل الصيانة')}</Typography>
                        </Stack>
                        {repairs.length > 0 ? repairs.map((repair, index) => (
                          <Paper key={`${room.id}-repair-${index}`} sx={{ p: 1.5, mb: 1, bgcolor: alpha('#fff', 0.04), border: `1px solid ${alpha('#fff', 0.06)}`, borderRadius: 2 }}>
                            <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '0.85rem' }}>{repair.title || repair.issue || copy('tenant.room.repairItem', 'Maintenance completed', 'تمت الصيانة')}</Typography>
                            <Typography variant="caption" sx={{ color: alpha('#fff', 0.55) }}>{repair.date || ''} {repair.status ? `· ${repair.status}` : ''}</Typography>
                          </Paper>
                        )) : (
                          <Typography variant="body2" sx={{ color: alpha('#fff', 0.58) }}>{room.repairHistorySummary || copy('tenant.room.noHistory', 'No unresolved repair history is published for this room.', 'لا يوجد سجل صيانة غير محلول منشور لهذه الغرفة.')}</Typography>
                        )}
                      </Box>

                      <Button
                        fullWidth
                        variant="contained"
                        disabled={applyingId === room.id}
                        onClick={() => applyForRoom(room)}
                        startIcon={<SafeIcon icon={CheckCircle2} size={17} />}
                        sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, borderRadius: 3, py: 1.3, '&:hover': { bgcolor: binThemeTokens.goldHover } }}
                      >
                        {applyingId === room.id ? <CircularProgress size={20} sx={{ color: '#111827' }} /> : copy('tenant.room.apply', 'Ask BIN GROUP to handle my renter contract', 'اطلب من BIN GROUP إدارة عقد الإيجار')}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {listings.length === 0 && (
          <Paper sx={{ p: 6, textAlign: 'center', bgcolor: '#fff', border: `1px dashed ${alpha(gold, 0.35)}`, borderRadius: 5 }}>
            <SafeIcon icon={Home} size={48} style={{ color: alpha(gold, 0.45), margin: '0 auto' }} />
            <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 2 }}>
              {copy('tenant.room.none', 'No BIN-managed rooms are available right now.', 'لا توجد غرف تديرها BIN متاحة حالياً.')}
            </Typography>
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 1 }}>
              {copy('tenant.room.noneDesc', 'When an owner under contract has a vacant room, it will appear here with its repair history.', 'عندما يكون لدى مالك متعاقد غرفة شاغرة، ستظهر هنا مع سجل الصيانة.')}
            </Typography>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
