import React from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, alpha,
} from '@mui/material';
import { Bell, CalendarDays, Car, Check, Megaphone, Package, Plus, RefreshCw, X } from 'lucide-react';
import {
  addDoc, collection, db, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where,
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type RecordRow = Record<string, any> & { id: string };
const chunks = <T,>(items: T[], size = 30) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
const stamp = (value: any) => value?.toDate?.()?.getTime?.() || value?.seconds * 1000 || new Date(value || 0).getTime() || 0;

function usePropertyCollection(collectionName: string, propertyIds: string[]) {
  const [rows, setRows] = React.useState<RecordRow[]>([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!propertyIds.length) { setRows([]); return undefined; }
    const grouped = chunks(propertyIds);
    const snapshots = new Map<number, RecordRow[]>();
    const publish = () => setRows([...snapshots.values()].flat().sort((a, b) => stamp(b.createdAt || b.receivedAt || b.publishedAt) - stamp(a.createdAt || a.receivedAt || a.publishedAt)));
    const unsubs = grouped.map((ids, index) => onSnapshot(
      query(collection(db, collectionName), where('propertyId', 'in', ids)),
      (snapshot) => { snapshots.set(index, snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); publish(); setError(''); },
      (snapshotError) => { console.warn(`[OwnerCommunityOperations] ${collectionName}`, snapshotError); setError(snapshotError.message); },
    ));
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [collectionName, propertyIds.join('|')]);

  return { rows, error };
}

export default function OwnerCommunityOperationsPage() {
  const { user } = useRole();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';
  const copy = (en: string, arText: string) => ar ? arText : en;
  const [tab, setTab] = React.useState(0);
  const [properties, setProperties] = React.useState<RecordRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notice, setNotice] = React.useState('');
  const [announcementOpen, setAnnouncementOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState({ propertyId: '', title: '', body: '', category: 'general', priority: 'normal' });
  const [submitting, setSubmitting] = React.useState(false);

  const loadProperties = React.useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [ownerIdSnap, ownerUidSnap] = await Promise.all([
        getDocs(query(collection(db, 'properties'), where('ownerId', '==', user.uid))),
        getDocs(query(collection(db, 'properties'), where('ownerUid', '==', user.uid))),
      ]);
      const merged = new Map<string, RecordRow>();
      [...ownerIdSnap.docs, ...ownerUidSnap.docs].forEach((item) => merged.set(item.id, { id: item.id, ...item.data() }));
      const list = [...merged.values()];
      setProperties(list);
      setAnnouncement((current) => ({ ...current, propertyId: current.propertyId || list[0]?.id || '' }));
      setNotice('');
    } catch (error: any) {
      setNotice(error?.message || 'Could not load owner properties.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  React.useEffect(() => { void loadProperties(); }, [loadProperties]);
  const propertyIds = React.useMemo(() => properties.map((property) => property.id), [properties]);
  const amenities = usePropertyCollection('amenities', propertyIds);
  const bookings = usePropertyCollection('amenityBookings', propertyIds);
  const announcements = usePropertyCollection('announcements', propertyIds);
  const parcels = usePropertyCollection('parcels', propertyIds);
  const parking = usePropertyCollection('visitorParkingRequests', propertyIds);
  const streamError = amenities.error || bookings.error || announcements.error || parcels.error || parking.error;
  const propertyLabel = (id: string) => properties.find((property) => property.id === id)?.buildingName || properties.find((property) => property.id === id)?.area || id;

  const update = async (collectionName: string, id: string, patch: Record<string, unknown>) => {
    try {
      await updateDoc(doc(db, collectionName, id), { ...patch, updatedAt: serverTimestamp(), reviewedBy: user?.uid });
      setNotice('');
    } catch (error: any) {
      setNotice(error?.message || `Could not update ${collectionName}.`);
    }
  };

  const publishAnnouncement = async () => {
    if (!announcement.propertyId || !announcement.title.trim() || !announcement.body.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        propertyId: announcement.propertyId,
        title: announcement.title.trim(),
        body: announcement.body.trim(),
        category: announcement.category,
        priority: announcement.priority,
        audience: 'all',
        published: true,
        publishedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: user?.uid,
        ownerId: user?.uid,
        readBy: {},
      });
      setAnnouncement((current) => ({ ...current, title: '', body: '', category: 'general', priority: 'normal' }));
      setAnnouncementOpen(false);
    } catch (error: any) {
      setNotice(error?.message || 'Could not publish announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs = [
    { label: copy('Announcements', 'الإعلانات'), icon: <Megaphone size={17} /> },
    { label: copy('Amenities', 'المرافق'), icon: <CalendarDays size={17} /> },
    { label: copy('Parcels', 'الطرود'), icon: <Package size={17} /> },
    { label: copy('Visitor Parking', 'مواقف الزوار'), icon: <Car size={17} /> },
  ];

  if (loading) return <Box sx={{ py: 10, display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.goldHover }} /></Box>;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>{copy('COMMUNITY OPERATIONS', 'عمليات المجتمع')}</Typography>
            <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{copy('Building Services Command', 'مركز خدمات المبنى')}</Typography>
            <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1 }}>{copy('One owner workspace for notices, amenity approvals, parcels and visitor parking.', 'مساحة موحدة للمالك للإعلانات والمرافق والطرود ومواقف الزوار.')}</Typography>
          </Box>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1}>
            <Button onClick={loadProperties} startIcon={<RefreshCw size={16} />} variant="outlined">{copy('Refresh', 'تحديث')}</Button>
            <Button onClick={() => setAnnouncementOpen(true)} disabled={!properties.length} startIcon={<Plus size={16} />} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>{copy('New Notice', 'إعلان جديد')}</Button>
          </Stack>
        </Stack>

        {(notice || streamError) && <Alert severity="warning">{notice || streamError}</Alert>}
        {!properties.length && <Alert severity="info">{copy('No active property is linked to this owner yet.', 'لا يوجد عقار نشط مرتبط بهذا المالك حتى الآن.')}</Alert>}

        <Paper sx={{ borderRadius: 4, overflow: 'hidden', border: `1px solid ${binThemeTokens.border}` }}>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1, borderBottom: `1px solid ${binThemeTokens.border}` }}>
            {tabs.map((item) => <Tab key={item.label} icon={item.icon} iconPosition="start" label={item.label} />)}
          </Tabs>

          <Box sx={{ p: { xs: 2, md: 3 } }}>
            {tab === 0 && <AnnouncementsTable rows={announcements.rows} propertyLabel={propertyLabel} ar={ar} />}
            {tab === 1 && <AmenitiesPanel amenities={amenities.rows} bookings={bookings.rows} propertyLabel={propertyLabel} ar={ar} update={update} />}
            {tab === 2 && <ParcelsTable rows={parcels.rows} propertyLabel={propertyLabel} ar={ar} />}
            {tab === 3 && <ParkingTable rows={parking.rows} propertyLabel={propertyLabel} ar={ar} update={update} />}
          </Box>
        </Paper>
      </Stack>

      <Dialog open={announcementOpen} onClose={() => setAnnouncementOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{copy('Publish Building Notice', 'نشر إعلان للمبنى')}</DialogTitle>
        <DialogContent><Stack spacing={2.5} sx={{ mt: 1 }}>
          <FormControl fullWidth><InputLabel>{copy('Property', 'العقار')}</InputLabel><Select label={copy('Property', 'العقار')} value={announcement.propertyId} onChange={(event) => setAnnouncement((current) => ({ ...current, propertyId: event.target.value }))}>{properties.map((property) => <MenuItem key={property.id} value={property.id}>{propertyLabel(property.id)}</MenuItem>)}</Select></FormControl>
          <TextField label={copy('Title', 'العنوان')} value={announcement.title} onChange={(event) => setAnnouncement((current) => ({ ...current, title: event.target.value }))} />
          <TextField label={copy('Message', 'الرسالة')} multiline rows={4} value={announcement.body} onChange={(event) => setAnnouncement((current) => ({ ...current, body: event.target.value }))} />
          <Grid container spacing={2}><Grid item xs={6}><FormControl fullWidth><InputLabel>{copy('Category', 'الفئة')}</InputLabel><Select label={copy('Category', 'الفئة')} value={announcement.category} onChange={(event) => setAnnouncement((current) => ({ ...current, category: event.target.value }))}>{['general','maintenance','safety','community','policy','emergency'].map((value) => <MenuItem value={value} key={value}>{value.toUpperCase()}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={6}><FormControl fullWidth><InputLabel>{copy('Priority', 'الأولوية')}</InputLabel><Select label={copy('Priority', 'الأولوية')} value={announcement.priority} onChange={(event) => setAnnouncement((current) => ({ ...current, priority: event.target.value }))}>{['low','normal','high','urgent'].map((value) => <MenuItem value={value} key={value}>{value.toUpperCase()}</MenuItem>)}</Select></FormControl></Grid></Grid>
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setAnnouncementOpen(false)}>{copy('Cancel', 'إلغاء')}</Button><Button onClick={publishAnnouncement} disabled={submitting || !announcement.title.trim() || !announcement.body.trim()} variant="contained">{submitting ? <CircularProgress size={18} /> : copy('Publish', 'نشر')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

function Empty({ ar }: { ar: boolean }) { return <Typography sx={{ color: '#667085', py: 4, textAlign: 'center' }}>{ar ? 'لا توجد سجلات.' : 'No records found.'}</Typography>; }
function Head({ children }: { children: React.ReactNode }) { return <TableCell sx={{ fontWeight: 950, color: '#667085' }}>{children}</TableCell>; }

function AnnouncementsTable({ rows, propertyLabel, ar }: { rows: RecordRow[]; propertyLabel: (id: string) => string; ar: boolean }) {
  if (!rows.length) return <Empty ar={ar} />;
  return <TableContainer><Table><TableHead><TableRow><Head>{ar ? 'العقار' : 'Property'}</Head><Head>{ar ? 'الإعلان' : 'Notice'}</Head><Head>{ar ? 'الفئة' : 'Category'}</Head><Head>{ar ? 'الأولوية' : 'Priority'}</Head></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{propertyLabel(row.propertyId)}</TableCell><TableCell><Typography sx={{ fontWeight: 900 }}>{row.title}</Typography><Typography variant="body2" sx={{ color: '#667085' }}>{row.body}</Typography></TableCell><TableCell><Chip size="small" label={String(row.category || 'general').toUpperCase()} /></TableCell><TableCell><Chip size="small" color={['urgent','high'].includes(row.priority) ? 'warning' : 'default'} label={String(row.priority || 'normal').toUpperCase()} /></TableCell></TableRow>)}</TableBody></Table></TableContainer>;
}

function AmenitiesPanel({ amenities, bookings, propertyLabel, ar, update }: { amenities: RecordRow[]; bookings: RecordRow[]; propertyLabel: (id: string) => string; ar: boolean; update: (collectionName: string, id: string, patch: Record<string, unknown>) => Promise<void> }) {
  return <Grid container spacing={3}><Grid item xs={12} lg={4}><Stack spacing={1.5}>{amenities.length ? amenities.map((row) => <Paper key={row.id} sx={{ p: 2, borderRadius: 3, bgcolor: '#F8F9FB', border: '1px solid #E5E7EB' }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography sx={{ fontWeight: 950 }}>{row.name}</Typography><Typography variant="caption" sx={{ color: '#667085' }}>{propertyLabel(row.propertyId)} · {row.type || 'amenity'}</Typography></Box><Button size="small" color={row.active === false ? 'error' : 'success'} onClick={() => update('amenities', row.id, { active: row.active === false })}>{row.active === false ? (ar ? 'محظور' : 'Blocked') : (ar ? 'نشط' : 'Active')}</Button></Stack></Paper>) : <Empty ar={ar} />}</Stack></Grid><Grid item xs={12} lg={8}>{bookings.length ? <TableContainer><Table size="small"><TableHead><TableRow><Head>{ar ? 'المرفق' : 'Amenity'}</Head><Head>{ar ? 'المستأجر/الوحدة' : 'Tenant / Unit'}</Head><Head>{ar ? 'الموعد' : 'Slot'}</Head><Head>{ar ? 'الحالة' : 'Status'}</Head><Head>{ar ? 'إجراء' : 'Action'}</Head></TableRow></TableHead><TableBody>{bookings.map((row) => <TableRow key={row.id}><TableCell>{row.amenityName || row.amenityId}</TableCell><TableCell>{row.tenantName || row.tenantUid || 'Tenant'} · {row.unitNumber || row.unitId || '—'}</TableCell><TableCell>{row.bookingDate || '—'} {row.timeSlot || ''}</TableCell><TableCell><Chip size="small" label={String(row.status || 'pending').toUpperCase()} /></TableCell><TableCell>{String(row.status || '').toLowerCase() === 'pending' && <Stack direction="row" spacing={0.5}><IconButton color="success" onClick={() => update('amenityBookings', row.id, { status: 'approved', approvedAt: serverTimestamp() })}><Check size={16} /></IconButton><IconButton color="error" onClick={() => update('amenityBookings', row.id, { status: 'rejected', rejectedAt: serverTimestamp() })}><X size={16} /></IconButton></Stack>}</TableCell></TableRow>)}</TableBody></Table></TableContainer> : <Empty ar={ar} />}</Grid></Grid>;
}

function ParcelsTable({ rows, propertyLabel, ar }: { rows: RecordRow[]; propertyLabel: (id: string) => string; ar: boolean }) {
  if (!rows.length) return <Empty ar={ar} />;
  return <TableContainer><Table><TableHead><TableRow><Head>{ar ? 'العقار' : 'Property'}</Head><Head>{ar ? 'المستلم/الوحدة' : 'Recipient / Unit'}</Head><Head>{ar ? 'شركة التوصيل' : 'Courier'}</Head><Head>{ar ? 'الحالة' : 'Status'}</Head></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{propertyLabel(row.propertyId)}</TableCell><TableCell>{row.recipientName || row.tenantName || 'Resident'} · {row.unitNumber || row.unitId || '—'}</TableCell><TableCell>{row.courierName || '—'}<Typography variant="caption" display="block" sx={{ color: '#667085' }}>{row.trackingNumberMasked || ''}</Typography></TableCell><TableCell><Chip size="small" label={String(row.status || 'received').toUpperCase()} /></TableCell></TableRow>)}</TableBody></Table></TableContainer>;
}

function ParkingTable({ rows, propertyLabel, ar, update }: { rows: RecordRow[]; propertyLabel: (id: string) => string; ar: boolean; update: (collectionName: string, id: string, patch: Record<string, unknown>) => Promise<void> }) {
  if (!rows.length) return <Empty ar={ar} />;
  return <TableContainer><Table><TableHead><TableRow><Head>{ar ? 'العقار' : 'Property'}</Head><Head>{ar ? 'الزائر/المركبة' : 'Visitor / Vehicle'}</Head><Head>{ar ? 'الوحدة' : 'Unit'}</Head><Head>{ar ? 'الحالة' : 'Status'}</Head><Head>{ar ? 'إجراء' : 'Action'}</Head></TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{propertyLabel(row.propertyId)}</TableCell><TableCell>{row.visitorName || 'Visitor'} · {row.vehiclePlate || '—'}</TableCell><TableCell>{row.unitNumber || row.unitId || '—'}</TableCell><TableCell><Chip size="small" label={String(row.status || 'pending').toUpperCase()} /></TableCell><TableCell>{String(row.status || '').toLowerCase() === 'pending' && <Stack direction="row" spacing={0.5}><IconButton color="success" onClick={() => update('visitorParkingRequests', row.id, { status: 'approved', approvedAt: serverTimestamp() })}><Check size={16} /></IconButton><IconButton color="error" onClick={() => update('visitorParkingRequests', row.id, { status: 'rejected', rejectedAt: serverTimestamp() })}><X size={16} /></IconButton></Stack>}</TableCell></TableRow>)}</TableBody></Table></TableContainer>;
}
