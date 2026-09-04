import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
import { Building2, CheckCircle2, ClipboardSignature, Home, Image, MapPin, ShieldCheck, Users, Wrench } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type HomeOpsRecord = {
  id: string;
  type?: string;
  recordType?: string;
  requestKind?: string;
  requestMode?: string;
  active?: boolean;
  approved?: boolean;
  notRented?: boolean;
  hasBinContract?: boolean;
  status?: string;
  stage?: string;
  title?: string;
  unitTitle?: string;
  listingTitle?: string;
  propertyName?: string;
  propertyAddress?: string;
  propertyType?: string;
  area?: string;
  community?: string;
  emirate?: string;
  ownerId?: string;
  ownerEmail?: string;
  tenantEmail?: string;
  tenantName?: string;
  annualRent?: number;
  monthlyRent?: number;
  bedrooms?: string | number;
  bathrooms?: string | number;
  areaSqFt?: number;
  furnishing?: string;
  furnished?: boolean;
  availableFrom?: string;
  numberOfCheques?: number;
  securityDeposit?: number;
  imageUrls?: string[];
  amenities?: string[];
  latitude?: number;
  longitude?: number;
  permitNumber?: string;
  permitVerified?: boolean;
  permitVerificationUrl?: string;
  repairHistory?: any[];
  repairHistorySummary?: string;
  description?: string;
  createdAt?: any;
};

type PublishForm = {
  ownerEmail: string;
  ownerId: string;
  unitTitle: string;
  propertyName: string;
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
  latitude: string;
  longitude: string;
  permitNumber: string;
  permitVerified: boolean;
  permitVerificationUrl: string;
  repairHistoryText: string;
};

const gold = binThemeTokens.gold;
const panelSx = { bgcolor: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 };
const HOME_RECORD_TYPES = new Set(['ROOM_RENT_LISTING', 'FIND_ROOM_RENT', 'HOME_RENT_LISTING', 'PROPERTY_RENT_LISTING', 'RENTAL_LISTING']);

const blankForm: PublishForm = {
  ownerEmail: '',
  ownerId: '',
  unitTitle: '',
  propertyName: '',
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
  latitude: '',
  longitude: '',
  permitNumber: '',
  permitVerified: false,
  permitVerificationUrl: '',
  repairHistoryText: '',
};

function isHomeListing(row: HomeOpsRecord) {
  return HOME_RECORD_TYPES.has(String(row.recordType || row.type || '').toUpperCase());
}

function isHomeRequest(row: HomeOpsRecord) {
  return String(row.type || '').toUpperCase() === 'ROOM_RENT_REQUEST';
}

function isHomeApplication(row: HomeOpsRecord) {
  return String(row.type || '').toUpperCase() === 'ROOM_RENT_APPLICATION';
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? `AED ${Math.round(amount).toLocaleString()}` : 'Pending';
}

function titleCase(value: unknown, fallback = '') {
  const text = String(value || fallback).replace(/[_-]+/g, ' ').trim();
  return text ? text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function safeLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12).map((line) => ({ title: line, status: 'COMPLETED' }));
}

function safeUrls(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line)))].slice(0, 12);
}

function safeAmenities(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((line) => line.trim()).filter(Boolean))].slice(0, 30);
}

function finiteNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function MarketplaceApprovalsPage() {
  const { isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [jobRows, setJobRows] = useState<HomeOpsRecord[]>([]);
  const [listings, setListings] = useState<HomeOpsRecord[]>([]);
  const [openPublish, setOpenPublish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<HomeOpsRecord | null>(null);
  const [form, setForm] = useState<PublishForm>(blankForm);

  const setField = (key: keyof PublishForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const unsubJobs = onSnapshot(collection(db, 'jobPostings'), (snap) => {
      setJobRows(snap.docs.map((item) => ({ id: item.id, ...item.data() } as HomeOpsRecord)).filter((row) => isHomeRequest(row) || isHomeApplication(row)));
      setLoading(false);
    }, (err) => {
      console.warn('[HomeDiscoveryOps] job listener failed:', err);
      setJobRows([]);
      setLoading(false);
    });

    const unsubListings = onSnapshot(collection(db, 'contractorProfiles'), (snap) => {
      setListings(snap.docs.map((item) => ({ id: item.id, ...item.data() } as HomeOpsRecord)).filter(isHomeListing));
    }, (err) => {
      console.warn('[HomeDiscoveryOps] listing listener failed:', err);
      setListings([]);
    });

    return () => {
      unsubJobs();
      unsubListings();
    };
  }, []);

  const requests = useMemo(() => jobRows.filter(isHomeRequest), [jobRows]);
  const applications = useMemo(() => jobRows.filter(isHomeApplication), [jobRows]);
  const availableListings = listings.filter((item) => item.active !== false && item.notRented !== false && !['RENTED', 'CLOSED', 'INACTIVE', 'WITHDRAWN'].includes(String(item.status || 'AVAILABLE').toUpperCase()));

  function openPublishDialog(request?: HomeOpsRecord) {
    setSelectedRequest(request || null);
    setForm({
      ownerEmail: String(request?.ownerEmail || '').toLowerCase(),
      ownerId: request?.ownerId || '',
      unitTitle: request?.unitTitle || request?.title || '',
      propertyName: request?.propertyName || '',
      propertyType: String(request?.propertyType || 'APARTMENT').toUpperCase(),
      propertyAddress: request?.propertyAddress || '',
      area: request?.area || request?.community || '',
      emirate: String(request?.emirate || 'DUBAI').toUpperCase(),
      annualRent: request?.annualRent ? String(request.annualRent) : '',
      bedrooms: request?.bedrooms !== undefined ? String(request.bedrooms) : '',
      bathrooms: request?.bathrooms !== undefined ? String(request.bathrooms) : '',
      areaSqFt: request?.areaSqFt ? String(request.areaSqFt) : '',
      furnishing: String(request?.furnishing || (request?.furnished ? 'FURNISHED' : 'UNFURNISHED')).toUpperCase(),
      availableFrom: request?.availableFrom || '',
      numberOfCheques: request?.numberOfCheques ? String(request.numberOfCheques) : '',
      securityDeposit: request?.securityDeposit ? String(request.securityDeposit) : '',
      imageUrlsText: (request?.imageUrls || []).join('\n'),
      amenitiesText: (request?.amenities || []).join(', '),
      latitude: request?.latitude !== undefined ? String(request.latitude) : '',
      longitude: request?.longitude !== undefined ? String(request.longitude) : '',
      permitNumber: request?.permitNumber || '',
      permitVerified: request?.permitVerified === true,
      permitVerificationUrl: request?.permitVerificationUrl || '',
      repairHistoryText: request?.repairHistorySummary || request?.description || '',
    });
    setOpenPublish(true);
  }

  async function publishListing(event: React.FormEvent) {
    event.preventDefault();
    if (!form.ownerEmail || !form.unitTitle || !form.propertyAddress || !form.propertyType || !form.emirate) return;
    setSubmitting(true);
    try {
      const latitude = finiteNumber(form.latitude);
      const longitude = finiteNumber(form.longitude);
      const hasCoordinates = form.latitude.trim() !== '' && form.longitude.trim() !== '' && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
      const repairHistory = safeLines(form.repairHistoryText);
      const imageUrls = safeUrls(form.imageUrlsText);
      const amenities = safeAmenities(form.amenitiesText);

      await addDoc(collection(db, 'contractorProfiles'), {
        recordType: 'ROOM_RENT_LISTING',
        listingType: 'HOME_RENT_LISTING',
        listingVersion: 'HOME_DISCOVERY_V1',
        active: true,
        approved: true,
        notRented: true,
        hasBinContract: true,
        status: 'AVAILABLE',
        title: form.unitTitle.trim(),
        unitTitle: form.unitTitle.trim(),
        businessName: form.unitTitle.trim(),
        name: form.unitTitle.trim(),
        propertyName: form.propertyName.trim(),
        propertyType: form.propertyType,
        propertyAddress: form.propertyAddress.trim(),
        area: form.area.trim(),
        community: form.area.trim(),
        emirate: form.emirate,
        ownerEmail: form.ownerEmail.toLowerCase(),
        ownerId: form.ownerId || selectedRequest?.ownerId || null,
        annualRent: finiteNumber(form.annualRent),
        bedrooms: form.bedrooms.trim(),
        bathrooms: form.bathrooms.trim(),
        areaSqFt: finiteNumber(form.areaSqFt),
        furnishing: form.furnishing,
        furnished: form.furnishing === 'FURNISHED',
        availableFrom: form.availableFrom || null,
        numberOfCheques: finiteNumber(form.numberOfCheques),
        securityDeposit: finiteNumber(form.securityDeposit),
        imageUrls,
        coverImageUrl: imageUrls[0] || null,
        amenities,
        latitude: hasCoordinates ? latitude : null,
        longitude: hasCoordinates ? longitude : null,
        permitNumber: form.permitNumber.trim() || null,
        permitVerified: Boolean(form.permitVerified && form.permitNumber.trim()),
        permitVerificationUrl: form.permitVerificationUrl.trim() || null,
        trade: 'Home Rental',
        category: 'home_rent',
        contractScope: 'BIN GROUP renter contact, viewing and contract handling',
        repairHistory,
        repairHistorySummary: form.repairHistoryText.trim(),
        verifiedByAdmin: true,
        verifiedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (selectedRequest) {
        await updateDoc(doc(db, 'jobPostings', selectedRequest.id), {
          status: 'PUBLISHED',
          stage: 'HOME_LISTING_PUBLISHED',
          updatedAt: serverTimestamp(),
        });
      }
      setOpenPublish(false);
      setSelectedRequest(null);
      setForm(blankForm);
    } catch (err) {
      console.error('[HomeDiscoveryOps] publish failed:', err);
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

  async function markApplicationContacted(id: string, requestMode?: string) {
    await updateDoc(doc(db, 'jobPostings', id), {
      status: 'CONTACTED',
      stage: requestMode === 'VIEWING' ? 'VIEWING_COORDINATION_STARTED' : 'BIN_GROUP_CONTACTED_RENTER_AND_OWNER',
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
            <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>BIN Home Discovery Operations</Typography>
            <Typography variant="body2" color="text.secondary">Review owner vacancy requests, validate listing facts and compliance, publish controlled inventory, and coordinate home seeker activity.</Typography>
          </Box>
          <Button variant="contained" onClick={() => openPublishDialog()} sx={{ bgcolor: gold, color: '#000', fontWeight: 'bold', borderRadius: 3 }}>
            PUBLISH VERIFIED HOME
          </Button>
        </Box>

        <Grid container spacing={2.5}>
          {[
            { label: 'Owner vacancy requests', value: requests.length, icon: ClipboardSignature, color: gold },
            { label: 'Published available homes', value: availableListings.length, icon: Home, color: '#22C55E' },
            { label: 'Viewing / rental requests', value: applications.length, icon: Users, color: '#38BDF8' },
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
              <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 2 }}>Owner Listing Review Queue</Typography>
              <Stack spacing={2}>
                {requests.length === 0 ? (
                  <Typography color="text.secondary">No owner vacancy requests waiting.</Typography>
                ) : requests.map((request) => (
                  <Card key={request.id} sx={{ bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                    <CardContent>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2} alignItems="flex-start">
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography color="#FFF" fontWeight="bold">{request.unitTitle || request.title || 'Vacant home request'}</Typography>
                          <Typography variant="caption" color="text.secondary">{[titleCase(request.propertyType), request.area, titleCase(request.emirate)].filter(Boolean).join(' · ') || request.propertyAddress} · {request.ownerEmail}</Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                            <Chip size="small" label={request.stage || request.status || 'OPEN'} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
                            <Chip size="small" label={money(request.annualRent)} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)', fontWeight: 800 }} />
                            {(request.imageUrls || []).length > 0 && <Chip size="small" icon={<Image size={13} />} label={`${request.imageUrls?.length} photo links`} sx={{ bgcolor: alpha('#38BDF8', 0.1), color: '#38BDF8', fontWeight: 800 }} />}
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
              <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 2 }}>Home Seeker Requests</Typography>
              <Stack spacing={2}>
                {applications.length === 0 ? (
                  <Typography color="text.secondary">No viewing or rental requests yet.</Typography>
                ) : applications.map((application) => (
                  <Card key={application.id} sx={{ bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                    <CardContent>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" spacing={2} alignItems="flex-start">
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography color="#FFF" fontWeight="bold">{application.tenantName || application.tenantEmail || 'Home seeker'}</Typography>
                          <Typography variant="caption" color="text.secondary">{application.listingTitle || 'Home listing'} · Owner: {application.ownerEmail || 'missing'}</Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                            <Chip size="small" icon={application.requestMode === 'VIEWING' ? <MapPin size={13} /> : <CheckCircle2 size={13} />} label={application.requestMode === 'VIEWING' ? 'VIEWING' : 'RENTAL APPLICATION'} sx={{ bgcolor: alpha(application.requestMode === 'VIEWING' ? '#38BDF8' : '#22C55E', 0.12), color: application.requestMode === 'VIEWING' ? '#38BDF8' : '#22C55E', fontWeight: 900 }} />
                            <Chip size="small" label={application.stage || application.status || 'OPEN'} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
                          </Stack>
                        </Box>
                        <Button onClick={() => markApplicationContacted(application.id, application.requestMode)} sx={{ color: '#38BDF8', border: `1px solid ${alpha('#38BDF8', 0.35)}`, borderRadius: 3, fontWeight: 950 }}>Start coordination</Button>
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
              <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold' }}>Published Home Discovery Inventory</Typography>
              <Typography variant="caption" color="text.secondary">Only active, approved, BIN-contracted and genuinely available homes should remain published.</Typography>
            </Box>
          </Stack>
          <Grid container spacing={2}>
            {availableListings.length === 0 ? (
              <Grid item xs={12}><Typography color="text.secondary">No active home listings published yet.</Typography></Grid>
            ) : availableListings.map((listing) => (
              <Grid item xs={12} md={6} lg={4} key={listing.id}>
                <Card sx={{ bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, height: '100%' }}>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Building2 size={18} color={gold} />
                        <Typography color="#FFF" fontWeight="bold">{listing.unitTitle || listing.title || 'Home listing'}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{[titleCase(listing.propertyType), listing.area, titleCase(listing.emirate)].filter(Boolean).join(' · ') || listing.propertyAddress}</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip size="small" label={money(listing.annualRent || listing.monthlyRent)} sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 900 }} />
                        {(listing.imageUrls || []).length > 0 && <Chip size="small" icon={<Image size={13} />} label={`${listing.imageUrls?.length} photos`} sx={{ bgcolor: alpha('#38BDF8', 0.1), color: '#38BDF8', fontWeight: 800 }} />}
                        {listing.permitVerified && <Chip size="small" icon={<ShieldCheck size={13} />} label="Permit verified" sx={{ bgcolor: alpha('#22C55E', 0.1), color: '#22C55E', fontWeight: 800 }} />}
                        <Chip size="small" icon={<Wrench size={13} />} label={`${listing.repairHistory?.length || 0} maintenance rows`} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.72)', fontWeight: 800 }} />
                      </Stack>
                      <Button onClick={() => toggleListing(listing.id, false)} color="error" sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', border: `1px solid ${alpha('#EF4444', 0.35)}`, borderRadius: 3, fontWeight: 950 }}>
                        Mark inactive
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Stack>

      <Dialog open={openPublish} onClose={() => setOpenPublish(false)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
        <form onSubmit={publishListing}>
          <DialogTitle sx={{ fontWeight: 'bold' }}>Review & Publish BIN-Verified Rental Home</DialogTitle>
          <DialogContent>
            <Stack spacing={2.2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">Publishing makes this inventory visible inside Tenant Home Discovery. Verify the contract, real availability, price, photos, location and permit information before continuing.</Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Owner Email" required value={form.ownerEmail} onChange={(e) => setField('ownerEmail', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Owner ID / UID" value={form.ownerId} onChange={(e) => setField('ownerId', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={8}><TextField fullWidth label="Listing / Unit Title" required value={form.unitTitle} onChange={(e) => setField('unitTitle', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth variant="filled">
                    <InputLabel>Property Type</InputLabel>
                    <Select value={form.propertyType} onChange={(e) => setField('propertyType', String(e.target.value))}>
                      {['ROOM', 'STUDIO', 'APARTMENT', 'VILLA', 'TOWNHOUSE', 'PENTHOUSE'].map((type) => <MenuItem key={type} value={type}>{titleCase(type)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={5}><TextField fullWidth label="Property Name" value={form.propertyName} onChange={(e) => setField('propertyName', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={7}><TextField fullWidth label="Full Property Address" required value={form.propertyAddress} onChange={(e) => setField('propertyAddress', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Area / Community" value={form.area} onChange={(e) => setField('area', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth variant="filled">
                    <InputLabel>Emirate</InputLabel>
                    <Select value={form.emirate} onChange={(e) => setField('emirate', String(e.target.value))}>
                      {['ABU_DHABI', 'DUBAI', 'SHARJAH', 'AJMAN', 'UMM_AL_QUWAIN', 'RAS_AL_KHAIMAH', 'FUJAIRAH'].map((value) => <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}><TextField fullWidth label="Annual Rent AED" type="number" value={form.annualRent} onChange={(e) => setField('annualRent', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={4} sm={2}><TextField fullWidth label="Beds" type="number" value={form.bedrooms} onChange={(e) => setField('bedrooms', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={4} sm={2}><TextField fullWidth label="Baths" type="number" value={form.bathrooms} onChange={(e) => setField('bathrooms', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={4} sm={4}><TextField fullWidth label="Area ft²" type="number" value={form.areaSqFt} onChange={(e) => setField('areaSqFt', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth variant="filled">
                    <InputLabel>Furnishing</InputLabel>
                    <Select value={form.furnishing} onChange={(e) => setField('furnishing', String(e.target.value))}>
                      {['FURNISHED', 'UNFURNISHED', 'PARTLY_FURNISHED'].map((value) => <MenuItem key={value} value={value}>{titleCase(value)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={4}><TextField fullWidth type="date" InputLabelProps={{ shrink: true }} label="Available From" value={form.availableFrom} onChange={(e) => setField('availableFrom', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={6} sm={2}><TextField fullWidth label="Cheques" type="number" value={form.numberOfCheques} onChange={(e) => setField('numberOfCheques', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={6} sm={2}><TextField fullWidth label="Deposit AED" type="number" value={form.securityDeposit} onChange={(e) => setField('securityDeposit', e.target.value)} variant="filled" /></Grid>
              </Grid>

              <TextField label="Property Photo URLs — one per line" multiline rows={4} value={form.imageUrlsText} onChange={(e) => setField('imageUrlsText', e.target.value)} variant="filled" helperText="Only publish photos you verified belong to this exact unit/property." />
              <TextField label="Amenities — comma or line separated" multiline rows={2} value={form.amenitiesText} onChange={(e) => setField('amenitiesText', e.target.value)} variant="filled" />

              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Latitude" type="number" value={form.latitude} onChange={(e) => setField('latitude', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Longitude" type="number" value={form.longitude} onChange={(e) => setField('longitude', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Advertising Permit Number" value={form.permitNumber} onChange={(e) => setField('permitNumber', e.target.value)} variant="filled" /></Grid>
                <Grid item xs={12} sm={6}><TextField fullWidth label="Permit Verification URL" value={form.permitVerificationUrl} onChange={(e) => setField('permitVerificationUrl', e.target.value)} variant="filled" /></Grid>
              </Grid>
              <FormControlLabel control={<Checkbox checked={form.permitVerified} onChange={(e) => setField('permitVerified', e.target.checked)} />} label="I verified the advertising permit details before publishing" />
              <TextField label="Maintenance / Repair History Visible to Home Seeker" multiline rows={4} value={form.repairHistoryText} onChange={(e) => setField('repairHistoryText', e.target.value)} variant="filled" helperText="One completed maintenance item per line. Never include private tenant information." />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setOpenPublish(false)} sx={{ color: 'rgba(255,255,255,0.6)' }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting || !form.ownerEmail || !form.unitTitle || !form.propertyAddress || !form.propertyType || !form.emirate} sx={{ bgcolor: gold, color: '#000', fontWeight: 'bold' }}>
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'Publish verified home'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Container>
  );
}
