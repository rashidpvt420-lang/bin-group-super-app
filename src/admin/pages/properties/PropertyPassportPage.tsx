import React, { useEffect, useMemo, useState } from 'react';
import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputBase,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Search as SearchIcon,
  RefreshCcw as RefreshIcon,
  TrendingUp,
  Users,
  Home,
  AlertCircle,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  MapPin,
  Shield,
  X
} from 'lucide-react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { useNavigate } from 'react-router-dom';
import LaunchStatusBanner from '../../components/LaunchStatusBanner';
import { filterLaunchRecords, isOperationalRecord } from '../../utils/launchDataHygiene';

const binThemeTokens = {
  gold: '#DAA520',
  textSecondary: 'rgba(255,255,255,0.7)',
  textTertiary: 'rgba(255,255,255,0.4)',
};

type PassportRow = {
  id: string;
  propertyName: string;
  emirate: string;
  propertyType: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  contractId: string;
  contractType: string;
  status: string;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  rentCollectedTotal: number;
  rentOutstandingTotal: number;
  tenantCount: number;
  maintenanceTicketsOpen: number;
  maintenanceTicketsClosed: number;
  activeLeases: number;
  expiredLeases: number;
  gpsLabel: string;
  intakeId: string;
  updatedAt: any;
  raw: any;
};

const asNumber = (value: any, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const asText = (value: any, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: any) => `AED ${asNumber(value).toLocaleString()}`;

const normalizeGeo = (source: any) => {
  const geo = source?.geo || source?.location || source?.coordinates || {};
  const lat = geo.lat ?? geo.latitude ?? source?.lat ?? source?.latitude;
  const lng = geo.lng ?? geo.longitude ?? source?.lng ?? source?.longitude;
  return lat && lng ? `${lat}, ${lng}` : 'GPS not recorded';
};

const normalizePassport = (id: string, passportData: any = {}, propertyData: any = {}): PassportRow => {
  const data = { ...propertyData, ...passportData };
  const totalUnits = asNumber(data.totalUnits ?? data.units ?? data.numberOfUnits ?? data.unitCount);
  const occupiedUnits = asNumber(data.occupiedUnits ?? data.tenantCount ?? data.activeTenants, 0);
  const vacantUnits = data.vacantUnits !== undefined ? asNumber(data.vacantUnits) : Math.max(totalUnits - occupiedUnits, 0);
  const collected = asNumber(data.rentCollectedTotal ?? data.totalRentCollected ?? data.collectedRent ?? data.financials?.rentCollectedTotal);
  const outstanding = asNumber(data.rentOutstandingTotal ?? data.totalOutstanding ?? data.outstandingRent ?? data.financials?.rentOutstandingTotal);
  const contractId = asText(data.contractId ?? data.activeContractId ?? data.latestContractId, 'NO_CONTRACT');
  const ownerId = asText(data.ownerId ?? data.ownerUid ?? data.activeOwnerId, 'NO_OWNER');

  return {
    id,
    propertyName: asText(data.propertyName ?? data.name ?? data.addressLine ?? data.address ?? data.latestPropertyName, 'Unnamed Property'),
    emirate: asText(data.emirate ?? data.city ?? data.location?.emirate ?? data.region, 'UAE'),
    propertyType: asText(data.propertyType ?? data.type ?? data.assetType ?? data.category, 'Property'),
    ownerId,
    ownerName: asText(data.ownerName ?? data.ownerDisplayName ?? data.owner?.name, ownerId === 'NO_OWNER' ? 'Unassigned Owner' : ownerId),
    ownerEmail: asText(data.ownerEmail ?? data.owner?.email, ''),
    contractId,
    contractType: asText(data.contractType ?? data.planType ?? data.selectedPlan?.name, contractId === 'NO_CONTRACT' ? 'NO CONTRACT' : 'CONTRACT LINKED'),
    status: asText(data.status ?? data.activationStatus, 'ACTIVE').toUpperCase(),
    totalUnits,
    occupiedUnits,
    vacantUnits,
    rentCollectedTotal: collected,
    rentOutstandingTotal: outstanding,
    tenantCount: asNumber(data.tenantCount ?? data.activeTenants ?? occupiedUnits),
    maintenanceTicketsOpen: asNumber(data.maintenanceTicketsOpen ?? data.openTickets ?? data.ticketsOpen),
    maintenanceTicketsClosed: asNumber(data.maintenanceTicketsClosed ?? data.closedTickets ?? data.ticketsClosed),
    activeLeases: asNumber(data.activeLeases ?? data.tenantCount ?? occupiedUnits),
    expiredLeases: asNumber(data.expiredLeases),
    gpsLabel: normalizeGeo(data),
    intakeId: asText(data.intakeId ?? data.latestIntakeId, ''),
    updatedAt: data.updatedAt ?? data.createdAt ?? propertyData.updatedAt ?? passportData.updatedAt,
    raw: data,
  };
};

export default function PropertyPassportPage() {
  const { isRTL } = useLanguage();
  const navigate = useNavigate();
  const [passports, setPassports] = useState<Record<string, any>>({});
  const [properties, setProperties] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<PassportRow | null>(null);

  useEffect(() => {
    let passportReady = false;
    let propertyReady = false;

    const markReady = () => {
      if (passportReady && propertyReady) setLoading(false);
    };

    const unsubscribePassports = onSnapshot(query(collection(db, 'propertyPassports')), (snap) => {
      const next: Record<string, any> = {};
      snap.docs.forEach((docSnap) => {
        next[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setPassports(next);
      passportReady = true;
      markReady();
    }, (err) => {
      console.error('Passport fetch error:', err);
      setError(err?.message || 'Unable to load property passports.');
      passportReady = true;
      markReady();
    });

    const unsubscribeProperties = onSnapshot(query(collection(db, 'properties')), (snap) => {
      const next: Record<string, any> = {};
      snap.docs.forEach((docSnap) => {
        next[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setProperties(next);
      propertyReady = true;
      markReady();
    }, (err) => {
      console.error('Properties fetch error:', err);
      setError(err?.message || 'Unable to load properties.');
      propertyReady = true;
      markReady();
    });

    return () => {
      unsubscribePassports();
      unsubscribeProperties();
    };
  }, []);

  const rows = useMemo(() => {
    const ids = new Set([...Object.keys(properties), ...Object.keys(passports)]);
    return Array.from(ids)
      .map((id) => normalizePassport(id, passports[id], properties[id]))
      .filter((row) => isOperationalRecord(row))
      .sort((a, b) => getMillis(b.updatedAt) - getMillis(a.updatedAt));
  }, [passports, properties]);

  const filteredPassports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((p) => [p.propertyName, p.emirate, p.propertyType, p.ownerName, p.ownerEmail, p.contractId, p.intakeId]
      .join(' ')
      .toLowerCase()
      .includes(term));
  }, [rows, searchTerm]);

  const stats = useMemo(() => ({
    totalRent: rows.reduce((sum, p) => sum + p.rentCollectedTotal, 0),
    outstanding: rows.reduce((sum, p) => sum + p.rentOutstandingTotal, 0),
    totalUnits: rows.reduce((sum, p) => sum + p.totalUnits, 0),
    activeTenants: rows.reduce((sum, p) => sum + p.tenantCount, 0),
  }), [rows]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 950, color: '#fff', mb: 1, letterSpacing: -1 }}>
            PROPERTY PASSPORT <Box component="span" sx={{ color: binThemeTokens.gold }}>REGISTRY</Box>
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            Live owner-to-property registry with contracts, units, tenants, GPS and financial health.
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: { xs: '100%', sm: 'auto' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, px: 2, border: '1px solid rgba(255,255,255,0.1)', width: { xs: '100%', sm: 320 } }}>
            <SearchIcon size={18} color="rgba(255,255,255,0.3)" />
            <InputBase
              placeholder="Search property, owner, contract..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ ml: 1, flex: 1, color: '#fff', fontSize: '0.875rem' }}
            />
          </Box>
          <Button startIcon={<RefreshIcon size={18} />} onClick={() => window.location.reload()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, borderRadius: 2, px: 3 }}>
            REFRESH ALL
          </Button>
        </Stack>
      </Box>

      <LaunchStatusBanner
        title="Property Passport is launch-filtered"
        message="Only production records are shown. Test, demo and archived records are hidden after cleanup."
      />

      {error && <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 6 }}>
        {[
          { label: 'Total Rent Collected', value: money(stats.totalRent), icon: <TrendingUp color="#10b981" />, trend: 'Live' },
          { label: 'Total Outstanding', value: money(stats.outstanding), icon: <AlertCircle color="#ef4444" />, trend: 'Live' },
          { label: 'Units Under Mgmt', value: stats.totalUnits.toLocaleString(), icon: <Home color={binThemeTokens.gold} />, trend: `${rows.length} Assets` },
          { label: 'Active Tenants', value: stats.activeTenants.toLocaleString(), icon: <Users color="#6366f1" />, trend: 'Live' },
        ].map((stat, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1) }}>{stat.icon}</Box>
                  <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{stat.trend}</Typography>
                </Box>
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mb: 0.5 }}>{stat.value}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{stat.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none', overflowX: 'auto' }}>
        <Table sx={{ borderCollapse: 'separate', borderSpacing: '0 12px', minWidth: 980 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCell}>Property / Owner</TableCell>
              <TableCell sx={headerCell}>Contract / Status</TableCell>
              <TableCell sx={headerCell}>Units</TableCell>
              <TableCell sx={headerCell}>Financial Health</TableCell>
              <TableCell sx={headerCell}>Maintenance</TableCell>
              <TableCell sx={headerCell}>Lease Health</TableCell>
              <TableCell sx={{ border: 'none' }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredPassports.map((p) => {
              const occupancyRate = p.totalUnits > 0 ? Math.min((p.occupiedUnits / p.totalUnits) * 100, 100) : 0;
              return (
                <TableRow key={p.id} sx={{ bgcolor: 'rgba(255,255,255,0.02)', transition: 'all 0.2s', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', transform: 'translateY(-2px)' } }}>
                  <TableCell sx={{ border: 'none', py: 3, borderRadius: '16px 0 0 16px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Home size={20} color={binThemeTokens.gold} />
                      </Box>
                      <Box>
                        <Typography sx={{ color: '#fff', fontWeight: 900, lineHeight: 1.2 }}>{p.propertyName}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'block' }}>{p.emirate} • {p.propertyType}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.65rem', display: 'block' }}>Owner: {p.ownerName}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>ID: {p.id}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ border: 'none' }}>
                    <Stack spacing={1} alignItems="flex-start">
                      <Chip label={p.contractType} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900, borderRadius: 1, fontSize: '0.65rem' }} />
                      <Chip label={p.status} size="small" variant="outlined" sx={{ borderColor: p.status === 'ACTIVE' ? '#10b981' : binThemeTokens.gold, color: p.status === 'ACTIVE' ? '#10b981' : binThemeTokens.gold, fontWeight: 900, borderRadius: 1, fontSize: '0.65rem' }} />
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.28)' }}>{p.contractId}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ border: 'none' }}>
                    <Typography sx={{ color: '#fff', fontWeight: 900 }}>{p.occupiedUnits} occupied / {p.vacantUnits} vacant</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{p.totalUnits} total units</Typography>
                    <Box sx={{ width: 120, height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, mt: 1 }}>
                      <Box sx={{ width: `${occupancyRate}%`, height: '100%', bgcolor: occupancyRate > 80 ? '#10b981' : (occupancyRate > 50 ? binThemeTokens.gold : '#ef4444'), borderRadius: 2 }} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ border: 'none' }}>
                    <Typography sx={{ color: '#10b981', fontWeight: 900 }}>{money(p.rentCollectedTotal)} Collected</Typography>
                    <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 800 }}>{money(p.rentOutstandingTotal)} Outstanding</Typography>
                  </TableCell>
                  <TableCell sx={{ border: 'none' }}>
                    <Stack direction="row" spacing={1}>
                      <Chip label={`${p.maintenanceTicketsOpen} OPEN`} size="small" sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 900, borderRadius: 1 }} />
                      <Chip label={`${p.maintenanceTicketsClosed} DONE`} size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 900, borderRadius: 1 }} />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ border: 'none' }}>
                    <Typography sx={{ color: '#fff', fontWeight: 900 }}>{p.activeLeases} ACTIVE</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>{p.expiredLeases} EXPIRED</Typography>
                  </TableCell>
                  <TableCell sx={{ border: 'none', textAlign: 'right', borderRadius: '0 16px 16px 0' }}>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <IconButton onClick={() => setSelected(p)} sx={{ color: binThemeTokens.gold, '&:hover': { bgcolor: 'rgba(218, 165, 32, 0.1)' } }} title="Open passport details">
                        <ChevronRight size={20} />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filteredPassports.length && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 900, border: 'none' }}>
                  No production property passports yet. Approve an owner onboarding record to create a real property passport.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(218,165,32,0.28)', borderRadius: 4 } }}>
        {selected && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 950 }}>
              PROPERTY PASSPORT DETAILS
              <IconButton onClick={() => setSelected(null)} sx={{ color: '#fff' }}><X size={18} /></IconButton>
            </DialogTitle>
            <DialogContent>
              <Stack spacing={3}>
                <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
                  <Typography variant="h5" sx={{ fontWeight: 950 }}>{selected.propertyName}</Typography>
                  <Typography sx={{ color: binThemeTokens.textSecondary }}>{selected.emirate} • {selected.propertyType}</Typography>
                  <Typography sx={{ color: binThemeTokens.gold, mt: 1 }}><MapPin size={14} /> {selected.gpsLabel}</Typography>
                </Paper>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <InfoBlock title="Owner" lines={[selected.ownerName, selected.ownerEmail || selected.ownerId, `Owner ID: ${selected.ownerId}`]} icon={<Shield size={18} />} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <InfoBlock title="Contract" lines={[selected.contractType, `Contract ID: ${selected.contractId}`, `Intake ID: ${selected.intakeId || 'Not linked'}`]} icon={<FileText size={18} />} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <InfoBlock title="Units / Tenants" lines={[`${selected.totalUnits} total units`, `${selected.occupiedUnits} occupied`, `${selected.vacantUnits} vacant`, `${selected.tenantCount} active tenants`]} icon={<Users size={18} />} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <InfoBlock title="Financials" lines={[`${money(selected.rentCollectedTotal)} collected`, `${money(selected.rentOutstandingTotal)} outstanding`]} icon={<TrendingUp size={18} />} />
                  </Grid>
                </Grid>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Button variant="contained" onClick={() => navigate('/admin/owners')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Open Owner Registry</Button>
                  <Button variant="outlined" onClick={() => navigate('/admin/contracts')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Open Contracts</Button>
                  <Button variant="outlined" onClick={() => navigator.clipboard?.writeText(selected.id)} startIcon={<Copy size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 950 }}>Copy Property ID</Button>
                  {selected.gpsLabel !== 'GPS not recorded' && (
                    <Button variant="outlined" startIcon={<ExternalLink size={16} />} onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.gpsLabel)}`, '_blank')} sx={{ borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 950 }}>Open Map</Button>
                  )}
                </Stack>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
}

function InfoBlock({ title, lines, icon }: { title: string; lines: string[]; icon: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, height: '100%' }}>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}>{icon}{title}</Typography>
      <Stack spacing={0.6} sx={{ mt: 1 }}>
        {lines.filter(Boolean).map((line) => (
          <Typography key={line} variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700 }}>{line}</Typography>
        ))}
      </Stack>
    </Paper>
  );
}

const headerCell = {
  color: 'rgba(255,255,255,0.3)',
  border: 'none',
  fontWeight: 900,
  textTransform: 'uppercase',
  fontSize: '0.7rem',
  letterSpacing: 1,
};
