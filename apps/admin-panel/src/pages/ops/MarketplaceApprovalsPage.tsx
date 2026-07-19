import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, CircularProgress, Container, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Grid, Paper, Stack, TextField, Typography, alpha,
} from '@mui/material';
import { BedDouble, CheckCircle2, ClipboardSignature, Home, Users, Wrench } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type RoomOpsRecord = {
  id: string;
  type?: string;
  recordType?: string;
  active?: boolean;
  notRented?: boolean;
  hasBinContract?: boolean;
  status?: string;
  stage?: string;
  title?: string;
  unitTitle?: string;
  listingTitle?: string;
  propertyName?: string;
  propertyAddress?: string;
  ownerId?: string;
  ownerEmail?: string;
  tenantEmail?: string;
  tenantName?: string;
  annualRent?: number;
  monthlyRent?: number;
  bedrooms?: string;
  repairHistory?: any[];
  createdAt?: any;
};

const gold = binThemeTokens.gold;
const panelSx = { bgcolor: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 };

function isRoomListing(row: RoomOpsRecord) {
  const recordType = String(row.recordType || '').toUpperCase();
  return (recordType === 'ROOM_RENT_LISTING' || recordType === 'FIND_ROOM_RENT');
}

function isRoomRequest(row: RoomOpsRecord) {
  return String(row.type || '').toUpperCase() === 'ROOM_RENT_REQUEST';
}

function isRoomApplication(row: RoomOpsRecord) {
  return String(row.type || '').toUpperCase() === 'ROOM_RENT_APPLICATION';
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString()} AED` : 'Pending';
}

function safeLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 8).map((line) => ({ title: line, status: 'COMPLETED' }));
}

export default function MarketplaceApprovalsPage() {
  const { isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [jobRows, setJobRows] = useState<RoomOpsRecord[]>([]);
  const [listings, setListings] = useState<RoomOpsRecord[]>([]);
  const [openPublish, setOpenPublish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RoomOpsRecord | null>(null);
  const [form, setForm] = useState({
    ownerEmail: '', ownerId: '', unitTitle: '', propertyName: '', propertyAddress: '', annualRent: '', bedrooms: '', repairHistoryText: '',
  });

  const setField = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const unsubJobs = onSnapshot(collection(db, 'jobPostings'), (snap) => {
      setJobRows(snap.docs.map((item) => ({ id: item.id, ...item.data() } as RoomOpsRecord)).filter((row) => isRoomRequest(row) || isRoomApplication(row)));
      setLoading(false);
    }, (err) => {
      console.warn('[RoomRentOps] job listener failed:', err);
      setJobRows([]);
      setLoading(false);
    });

    const unsubListings = onSnapshot(collection(db, 'contractorProfiles'), (snap) => {
      setListings(snap.docs.map((item) => ({ id: item.id, ...item.data() } as RoomOpsRecord)).filter(isRoomListing));
    }, (err) => {
      console.warn('[RoomRentOps] listing listener failed:', err);
      setListings([]);
    });

    return () => {
      unsubJobs();
      unsubListings();
    };
  }, []);

  const requests = useMemo(() => jobRows.filter(isRoomRequest), [jobRows]);
  const applications = useMemo(() => jobRows.filter(isRoomApplication), [jobRows]);
  const availableListings = listings.filter((item) => item.active !== false && item.notRented !== false && String(item.status || 'AVAILABLE').toUpperCase() !== 'RENTED');

  function openPublishDialog(request?: RoomOpsRecord) {
    setSelectedRequest(request || null);
    setForm({
      ownerEmail: String(request?.ownerEmail || '').toLowerCase(),
      ownerId: request?.ownerId || '',
      unitTitle: request?.unitTitle || request?.title || '',
      propertyName: request?.propertyName || '',
      propertyAddress: request?.propertyAddress || '',
      annualRent: request?.annualRent ? String(request.annualRent) : '',
      bedrooms: request?.bedrooms || '',
      repairHistoryText: request?.repairHistorySummary || request?.stage || '',
    });
    setOpenPublish(true);
  }

  async function publishListing(event: React.FormEvent) {
    event.preventDefault();
    if (!form.ownerEmail || !form.unitTitle || !form.propertyAddress) return;
    setSubmitting(true);
    try {
      const repairHistory = safeLines(form.repairHistoryText);
      await addDoc(collection(db, 'contractorProfiles'), {
        recordType: 'ROOM_RENT_LISTING',
        listingType: 'FIND_ROOM_RENT',
        active: true,
        approved: true,
        notRented: true,
        hasBinContract: true,
        status: 'AVAILABLE',
        title: form.unitTitle,
        unitTitle: form.unitTitle,
        businessName: form.unitTitle,
        name: form.unitTitle,
        propertyName: form.propertyName,
        propertyAddress: form.propertyAddress,
        ownerEmail: form.ownerEmail.toLowerCase(),
        ownerId: form.ownerId || selectedRequest?.ownerId || null,
        annualRent: Number(form.annualRent || 0),
        bedrooms: form.bedrooms,
        trade: 'Room Rent',
        category: 'room_rent',
        contractScope: 'BIN GROUP renter contact and contract handling',
        repairHistory,
        repairHistorySummary: form.repairHistoryText,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (selectedRequest) {
        await updateDoc(doc(db, 'jobPostings', selectedRequest.id), {
          status: 'PUBLISHED',
          stage: 'ROOM_LISTING_PUBLISHED',
          updatedAt: serverTimestamp(),
        });
      }
      setOpenPublish(false);
      setSelectedRequest(null);
    } catch (err) {
      console.error('[RoomRentOps] publish failed:', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleListing(id: string, active: boolean) {
    await updateDoc(doc(db, 'contractorProfiles', id), {
      active,
      status: active ? 'AVAILABLE' : 'INACTIVE',
      updatedAt: serverTimestamp(),
    });
  }

  async function markApplicationContacted(id: string) {
    await updateDoc(doc(db, 'jobPostings', id), {
      status: 'CONTACTED',
      stage: 'BIN_GROUP_CONTACTED_RENTER_AND_OWNER',
      updatedAt: serverTimestamp(),
    });
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: gold }} /></Box>;
  }

  return (
    <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Find a Room Rent Operations</Typography>
            <Typography variant="body2" color="text.secondary">Replace marketplace services with BIN-managed room rent listings, renter contact handling, repair-history visibility, and owner contract flow.</Typography>
          </Box>
          <Button variant="contained" onClick={() => openPublishDialog()} sx={{ bgcolor: gold, color: '#000', fontWeight: 'bold', borderRadius: 3 }}>
            PUBLISH ROOM LISTING
          </Button>
        </Box>

        <Grid container spacing={2.5}>
          {[
            { label: 'Owner room requests', value: requests.length, icon: ClipboardSignature, color: gold },
            { label: 'Published vacant rooms', value: availableListings.length, icon: BedDouble, color: '#22C55E' },
            { label: 'Renter applications', value: applications.length, icon: Users, color: '#38BDF8' },
          ].map((item) => (
            <Grid item xs={12} md={4} key={item.label}>
              <Paper sx={{ p: 3, ...panelSx }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center">
                  <Box sx={{ color: item.color }}><item.icon size={28} /></Box>
                  <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography sx={{ color: item.color, fontWeight: 950, fontSize: '2rem', lineHeight: 1 }}>{item.value}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.56)', fontWeight: 850 }}>{item.label}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
            <Paper sx={{ p: 3, ...panelSx }}>
              <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 2 }}>Owner Contract / Publish Queue</Typography>
              <Stack spacing={2}>
                {requests.length === 0 ? (
                  <Typography color="text.secondary">No owner room-rent requests waiting.</Typography>
                ) : requests.map((request) => (
                  <Card key={request.id} sx={{ bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                    <CardContent>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2} alignItems="flex-start">
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography color="#FFF" fontWeight="bold">{request.unitTitle || request.title || 'Vacant room request'}</Typography>
                          <Typography variant="caption" color="text.secondary">{request.propertyAddress || 'Address missing'} · {request.ownerEmail}</Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                            <Chip size="small" label={request.stage || request.status || 'OPEN'} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
                            <Chip size="small" label={money(request.annualRent)} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)', fontWeight: 800 }} />
                          </Stack>
                        </Box>
                        <Button onClick={() => openPublishDialog(request)} sx={{ color: gold, border: `1px solid ${alpha(gold, 0.35)}`, borderRadius: 3, fontWeight: 950 }}>Review / Publish</Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={6}>
            <Paper sx={{ p: 3, ...panelSx }}>
              <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 2 }}>Renter Applications</Typography>
              <Stack spacing={2}>
                {applications.length === 0 ? (
                  <Typography color="text.secondary">No renter applications yet.</Typography>
                ) : applications.map((application) => (
                  <Card key={application.id} sx={{ bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                    <CardContent>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2} alignItems="flex-start">
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography color="#FFF" fontWeight="bold">{application.tenantName || application.tenantEmail || 'Tenant applicant'}</Typography>
                          <Typography variant="caption" color="text.secondary">{application.listingTitle || 'Room listing'} · Owner: {application.ownerEmail || 'missing'}</Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                            <Chip size="small" label={application.stage || application.status || 'OPEN'} sx={{ bgcolor: alpha('#38BDF8', 0.12), color: '#38BDF8', fontWeight: 900 }} />
                            <Chip size="small" icon={<CheckCircle2 size={13} />} label="BIN contract handling" sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 800 }} />
                          </Stack>
                        </Box>
                        <Button onClick={() => markApplicationContacted(application.id)} sx={{ color: '#38BDF8', border: `1px solid ${alpha('#38BDF8', 0.35)}`, borderRadius: 3, fontWeight: 950 }}>Mark contacted</Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3, ...panelSx }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold' }}>Published Room Listings</Typography>
              <Typography variant="body2" color="text.secondary">These records appear in the tenant Find a Room Rent screen with repair history.</Typography>
            </Box>
            <Chip icon={<Wrench size={14} />} label="Repair history required" sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
          </Stack>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />
          <Grid container spacing={2.5}>
            {listings.length === 0 ? (
              <Grid item xs={12}><Typography color="text.secondary">No room listings published yet.</Typography></Grid>
            ) : listings.map((listing) => (
              <Grid item xs={12} md={6} xl={4} key={listing.id}>
                <Card sx={{ bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, height: '100%' }}>
                  <CardContent>
                    <Stack spacing={1.3} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={1}>
                        <Box>
                          <Typography color="#FFF" fontWeight="bold">{listing.unitTitle || listing.title || listing.propertyName}</Typography>
                          <Typography variant="caption" color="text.secondary">{listing.propertyAddress}</Typography>
                        </Box>
                        <Chip size="small" icon={<Home size={13} />} label={listing.active === false ? 'INACTIVE' : listing.notRented === false ? 'RENTED' : 'AVAILABLE'} color={listing.active === false ? 'default' : 'success'} />
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
                        <Chip size="small" label={money(listing.annualRent || listing.monthlyRent)} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
                        <Chip size="small" label={`Owner: ${listing.ownerEmail || 'missing'}`} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.70)', fontWeight: 800 }} />
                      </Stack>
                      <Button size="small" onClick={() => toggleListing(listing.id, listing.active === false)} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: listing.active === false ? '#22C55E' : '#ef4444', fontWeight: 950 }}>
                        {listing.active === false ? 'Reactivate' : 'Deactivate'}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Stack>

      <Dialog open={openPublish} onClose={() => setOpenPublish(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
        <form onSubmit={publishListing}>
          <DialogTitle sx={{ fontWeight: 'bold' }}>Publish BIN-Managed Room Listing</DialogTitle>
          <DialogContent>
            <Stack spacing={2.3} sx={{ mt: 1 }}>
              <TextField fullWidth required label="Owner email" value={form.ownerEmail} onChange={(event) => setField('ownerEmail', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
              <TextField fullWidth label="Owner UID" value={form.ownerId} onChange={(event) => setField('ownerId', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
              <TextField fullWidth required label="Room / unit title" value={form.unitTitle} onChange={(event) => setField('unitTitle', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
              <TextField fullWidth label="Property name" value={form.propertyName} onChange={(event) => setField('propertyName', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
              <TextField fullWidth required label="Property address" value={form.propertyAddress} onChange={(event) => setField('propertyAddress', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
              <Grid container spacing={2}>
                <Grid item xs={6}><TextField fullWidth label="Annual rent AED" type="number" value={form.annualRent} onChange={(event) => setField('annualRent', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} /></Grid>
                <Grid item xs={6}><TextField fullWidth label="Bedrooms" value={form.bedrooms} onChange={(event) => setField('bedrooms', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} /></Grid>
              </Grid>
              <TextField fullWidth multiline minRows={4} label="Repair history — one completed item per line" value={form.repairHistoryText} onChange={(event) => setField('repairHistoryText', event.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenPublish(false)} sx={{ color: 'rgba(255,255,255,0.55)' }}>CANCEL</Button>
            <Button type="submit" variant="contained" disabled={submitting || !form.ownerEmail || !form.unitTitle || !form.propertyAddress} sx={{ bgcolor: gold, color: '#000', fontWeight: 'bold' }}>
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'PUBLISH LISTING'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Container>
  );
}
