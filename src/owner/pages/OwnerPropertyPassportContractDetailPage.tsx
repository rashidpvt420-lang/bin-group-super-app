import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Tab, Tabs, Typography, alpha } from '@mui/material';
import { Building2, ClipboardCheck, FileText, Layers, MapPin, ShieldCheck, UsersRound, Wrench } from 'lucide-react';
import { collection, db, doc, getDoc, getDocs, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import UaePropertyMap from '../../components/maps/UaePropertyMap';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';

type PassportTab = 'map' | 'documents' | 'handover' | 'maintenance' | 'systems';

type Row = { id: string; [key: string]: any };

const clean = (value: unknown) => String(value || '').trim();
const email = (value: unknown) => clean(value).toLowerCase();
const uniq = (values: unknown[]) => Array.from(new Set(values.map(clean).filter(Boolean)));
const units = (row: any) => Number(row?.totalUnits || row?.units || row?.numberOfUnits || row?.unitsCount || 0);
const fmt = (value: any) => {
  if (!value) return 'Not recorded';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString('en-AE');
  if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString('en-AE');
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not recorded' : parsed.toLocaleDateString('en-AE');
};

function emailVariants(value: unknown) {
  const base = email(value);
  if (!base.includes('@')) return [];
  const [local, domain] = base.split('@');
  const d = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const out = new Set([base, `${local}@${d}`]);
  if (d === 'gmail.com') out.add(`${local.split('+')[0].replace(/\./g, '')}@${d}`);
  return Array.from(out);
}

async function readDocSafe(collectionName: string, id: string) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn(`[OwnerPassportContractDetail] skipped ${collectionName}/${id}`, error);
    return null;
  }
}

async function querySafe(collectionName: string, field: string, value: string) {
  if (!value) return [] as Row[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Row[];
  } catch (error) {
    console.warn(`[OwnerPassportContractDetail] skipped ${collectionName}.${field}`, error);
    return [] as Row[];
  }
}

function toPassport(row: any) {
  return {
    ...row,
    id: row.propertyPassportId || row.passportId || row.propertyId || row.id,
    propertyId: row.propertyId || row.id,
    propertyName: row.propertyName || row.name || row.address || 'Property',
    emirate: row.emirate || row.city || row.location || 'UAE',
    totalUnits: units(row),
    floors: row.floors || row.numberOfFloors || 0,
    provisional: row.provisional !== false,
    status: row.status || 'PROVISIONAL',
  };
}

function fromContract(contract: any) {
  const rows = Array.isArray(contract?.properties) ? contract.properties : [];
  return rows.map((property: any, index: number) => toPassport({
    ...property,
    propertyId: property.propertyId || property.id || `${contract.id || 'contract'}-property-${index + 1}`,
    activeContractId: contract.id,
    ownerId: contract.ownerId,
    ownerUid: contract.ownerUid,
    ownerEmail: contract.ownerEmail || contract.emailDelivery?.recipient,
    packageName: contract.packageName || contract.planType,
  }));
}

function matches(row: any, id: string) {
  return uniq([row.id, row.propertyId, row.passportId, row.propertyPassportId]).includes(id);
}

function Metric({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2.4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ color: binThemeTokens.gold }}>{children}</Box>
        <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>{label}</Typography><Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{value}</Typography></Box>
      </Stack>
    </Paper>
  );
}

function PassportList({ title, icon, rows, empty }: { title: string; icon: React.ReactNode; rows: Array<[React.ReactNode, React.ReactNode, React.ReactNode]>; empty: string }) {
  return (
    <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.48)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
      <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2, color: binThemeTokens.gold }}>{icon}<Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{title}</Typography></Stack>
      <Stack spacing={1.2}>
        {rows.map((row, index) => (
          <Paper key={index} sx={{ p: 1.8, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Typography sx={{ color: '#FFF', fontWeight: 900 }}>{row[0]}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800 }}>{row[1]}</Typography>
              <Box>{row[2]}</Box>
            </Stack>
          </Paper>
        ))}
        {rows.length === 0 && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.42)' }}>{empty}</Typography>}
      </Stack>
    </Paper>
  );
}

export default function OwnerPropertyPassportContractDetailPage() {
  const { passportId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useRole();
  const { isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [passport, setPassport] = useState<any | null>(null);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [inspections, setInspections] = useState<Row[]>([]);
  const [missions, setMissions] = useState<Row[]>([]);
  const [activeTab, setActiveTab] = useState<PassportTab>('map');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');

      const directPassport = await readDocSafe('propertyPassports', passportId);
      if (directPassport) {
        if (alive) { setPassport(toPassport({ ...directPassport, provisional: false })); setLoading(false); }
        return;
      }

      const directProperty = await readDocSafe('properties', passportId);
      if (directProperty) {
        if (alive) { setPassport(toPassport(directProperty)); setLoading(false); }
        return;
      }

      const rows: Row[] = [];
      const contracts = new Map<string, Row>();
      const ownerIds = uniq([user?.uid, (user as any)?.ownerId, (user as any)?.ownerUid, ...((Array.isArray((user as any)?.linkedOwnerIds) ? (user as any).linkedOwnerIds : []) as unknown[])]);
      for (const ownerId of ownerIds) {
        rows.push(...(await querySafe('propertyPassports', 'ownerId', ownerId)).map((x) => toPassport({ ...x, provisional: false })));
        rows.push(...(await querySafe('properties', 'ownerId', ownerId)).map(toPassport));
        for (const c of await querySafe('contracts', 'ownerId', ownerId)) contracts.set(c.id, c);
        for (const c of await querySafe('contracts', 'ownerUid', ownerId)) contracts.set(c.id, c);
      }
      for (const e of emailVariants(user?.email)) {
        rows.push(...(await querySafe('propertyPassports', 'ownerEmail', e)).map((x) => toPassport({ ...x, provisional: false })));
        rows.push(...(await querySafe('properties', 'ownerEmail', e)).map(toPassport));
        for (const c of await querySafe('contracts', 'ownerEmail', e)) contracts.set(c.id, c);
        for (const c of await querySafe('contracts', 'emailDelivery.recipient', e)) contracts.set(c.id, c);
      }
      for (const c of contracts.values()) rows.push(...fromContract(c));

      const found = rows.find((row) => matches(row, passportId)) || rows.find((row) => String(row.id || '').startsWith(passportId));
      if (!alive) return;
      if (found) setPassport(found);
      else setError('Property passport not found for this owner identity.');
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [passportId, user?.email, user?.uid]);

  useEffect(() => {
    let alive = true;
    async function loadPassportTabs() {
      if (!passport?.propertyId && !passport?.id) return;
      const keys = uniq([passport.propertyId, passport.id, passport.passportId, passport.propertyPassportId]);
      const [docsRows, inspectionRows, missionRows] = await Promise.all([
        Promise.all(keys.map((key) => querySafe('documents', 'propertyId', key))),
        Promise.all(keys.map((key) => querySafe('propertyInspections', 'propertyId', key))),
        Promise.all(keys.map((key) => querySafe('maintenanceTickets', 'propertyId', key))),
      ]);
      if (!alive) return;
      const merge = (groups: Row[][]) => Array.from(new Map(groups.flat().map((row) => [row.id, row])).values());
      setDocuments(merge(docsRows));
      setInspections(merge(inspectionRows));
      setMissions(merge(missionRows));
    }
    loadPassportTabs();
    return () => { alive = false; };
  }, [passport?.propertyId, passport?.id, passport?.passportId, passport?.propertyPassportId]);

  const propertyLocation = useMemo(() => passport ? resolvePropertyLocation(passport) : null, [passport]);

  if (loading) return <Box sx={{ height: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!passport || !propertyLocation) return null;

  const canOpenMap = propertyLocation.locationQuality !== 'MISSING';
  const gpsTone = propertyLocation.hasExactCoordinates ? '#10b981' : canOpenMap ? '#f59e0b' : '#ef4444';
  const gpsLabel = propertyLocation.hasExactCoordinates ? 'EXACT GPS PIN' : canOpenMap ? 'APPROXIMATE GPS — REVIEW REQUIRED' : 'GPS NOT CONFIGURED';

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 6 }}>
      <Stack spacing={4}>
        {passport.provisional && <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.06), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>This provisional property passport is generated from the linked active asset or active contract. Official passport issuance is pending.</Alert>}
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.66)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={3}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2.5} alignItems="center">
              <Box sx={{ width: 64, height: 64, borderRadius: 4, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}><Building2 size={32} /></Box>
              <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PROPERTY PASSPORT</Typography><Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{passport.propertyName}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>{passport.address || passport.zone || passport.emirate}</Typography></Box>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Chip icon={<ShieldCheck size={14} />} label={passport.status || 'PROVISIONAL'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} /><Chip icon={<MapPin size={14} />} label={gpsLabel} sx={{ bgcolor: alpha(gpsTone, 0.12), color: gpsTone, fontWeight: 950 }} /><Chip label={`ID ${String(passport.id || '').slice(0, 8).toUpperCase()}`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} /></Stack>
          </Stack>
        </Paper>

        <Paper sx={{ bgcolor: 'rgba(15,23,42,0.50)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
          <Tabs value={activeTab} onChange={(_, next) => setActiveTab(next)} variant="scrollable" scrollButtons="auto" sx={{ px: 2, '& .MuiTab-root': { color: 'rgba(255,255,255,0.55)', fontWeight: 950 }, '& .Mui-selected': { color: `${binThemeTokens.gold} !important` }, '& .MuiTabs-indicator': { bgcolor: binThemeTokens.gold } }}>
            <Tab value="map" label="Map / GPS" />
            <Tab value="documents" label={`Documents (${documents.length})`} />
            <Tab value="handover" label={`Handover (${inspections.length})`} />
            <Tab value="maintenance" label={`Maintenance (${missions.length})`} />
            <Tab value="systems" label="Systems" />
          </Tabs>
        </Paper>

        {activeTab === 'map' && (
          <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Grid item xs={12} md={8}>
              <UaePropertyMap title={passport.propertyName} address={propertyLocation.address || passport.address || passport.zone} emirate={propertyLocation.emirate || passport.emirate} lat={propertyLocation.latitude} lng={propertyLocation.longitude} googleMapsUrl={propertyLocation.googleMapsUrl} locationQuality={propertyLocation.locationQuality} requireExactPin />
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack spacing={2}>
                <Alert severity={propertyLocation.hasExactCoordinates ? 'success' : canOpenMap ? 'warning' : 'error'} sx={{ bgcolor: alpha(gpsTone, 0.12), color: gpsTone, border: `1px solid ${alpha(gpsTone, 0.22)}`, py: 0.5 }}><Typography variant="caption" fontWeight="950">{gpsLabel}</Typography></Alert>
                <Metric label="Coordinates" value={propertyLocation.hasExactCoordinates ? `${propertyLocation.latitude?.toFixed?.(6)}, ${propertyLocation.longitude?.toFixed?.(6)}` : 'Missing exact GPS'}><MapPin size={20} /></Metric>
                <Metric label="Units" value={passport.totalUnits || 0}><UsersRound size={20} /></Metric>
                <Metric label="Floors" value={passport.floors || 0}><Layers size={20} /></Metric>
                <Metric label="Contract" value={passport.activeContractId || passport.contractId ? 'Linked' : 'Pending'}><FileText size={20} /></Metric>
                <Button disabled={!canOpenMap} variant="contained" onClick={() => propertyLocation.googleMapsUrl && window.open(propertyLocation.googleMapsUrl, '_blank', 'noopener,noreferrer')} sx={{ bgcolor: canOpenMap ? binThemeTokens.gold : 'rgba(255,255,255,0.08)', color: canOpenMap ? '#111827' : 'rgba(255,255,255,0.35)', fontWeight: 950 }}>Open Google Maps</Button>
              </Stack>
            </Grid>
          </Grid>
        )}

        {activeTab === 'documents' && <PassportList title="Document Vault" icon={<FileText size={20} />} rows={documents.map((row) => [row.title || row.documentName || row.type || row.id, row.status || row.verificationStatus || 'Pending', fmt(row.expiryDate || row.expiresAt)])} empty="No documents are linked to this property passport yet." />}
        {activeTab === 'handover' && (
          <Stack spacing={2}>
            <PassportList title="Handover / Inspection Evidence" icon={<ClipboardCheck size={20} />} rows={inspections.map((row) => [row.inspectionType || row.type || 'Inspection', row.unitNumber || row.unitId || 'Property', row.status || fmt(row.createdAt || row.submittedAt)])} empty="No move-in, move-out, or inspection evidence is linked yet." />
            <Button variant="contained" onClick={() => navigate('/owner/inspections')} sx={{ alignSelf: 'flex-start', bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>
              Open Owner Handover Center
            </Button>
          </Stack>
        )}
        {activeTab === 'maintenance' && <PassportList title="Maintenance Timeline" icon={<Wrench size={20} />} rows={missions.map((row) => [row.category || row.issueType || row.trade || 'Maintenance', row.status || 'Open', fmt(row.createdAt || row.updatedAt)])} empty="No maintenance tickets are linked to this property passport yet." />}
        {activeTab === 'systems' && <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.48)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}><Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>Building Systems</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.42)' }}>Systems will appear here when the official passport is issued.</Typography></Paper>}
      </Stack>
    </Box>
  );
}
