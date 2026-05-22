import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Grid, Paper, CircularProgress, Stack, Chip, alpha, Button, Divider, Alert } from '@mui/material';
import { FileText, Building2, MapPin, Layers, ShieldCheck, Calendar, ArrowRight, Download } from 'lucide-react';
import { db, collection, query, where, getDocs } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const compact = (values: unknown[]) => Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

const emailLookupCandidates = (value: unknown) => {
  const email = normalizeEmail(value);
  if (!email || !email.includes('@')) return [];
  const [local, domain] = email.split('@');
  if (!local || !domain) return [email];
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const variants = new Set<string>([email, `${local}@${normalizedDomain}`]);
  if (normalizedDomain === 'gmail.com') variants.add(`${local.split('+')[0].replace(/\./g, '')}@${normalizedDomain}`);
  return Array.from(variants);
};

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function unitCount(record: any) {
  return Number(record?.totalUnits || record?.units || record?.numberOfUnits || record?.unitsCount || 0);
}

function isPlaceholderAsset(record: any) {
  const name = firstText(record?.propertyName, record?.name, record?.address).toLowerCase();
  return (!name || name === 'new asset' || name === 'property') && unitCount(record) === 0;
}

async function safeQuery(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn(`[OwnerPropertyPassportResolved] optional lookup denied/skipped: ${collectionName}.${field}`, error);
    return [] as any[];
  }
}

function passportFromProperty(property: any) {
  const name = firstText(property.propertyName, property.name, property.address, 'Property');
  return {
    ...property,
    id: property.propertyPassportId || property.passportId || property.id,
    propertyId: property.id,
    propertyName: name,
    emirate: property.emirate || property.city || property.location || 'UAE',
    totalUnits: unitCount(property),
    floors: property.floors || property.numberOfFloors || 0,
    status: property.status || 'PROVISIONAL',
    provisional: true,
    placeholder: isPlaceholderAsset(property),
  };
}

function sortPassportRows(a: any, b: any) {
  const aPlaceholder = isPlaceholderAsset(a) || a.placeholder === true;
  const bPlaceholder = isPlaceholderAsset(b) || b.placeholder === true;
  if (aPlaceholder && !bPlaceholder) return 1;
  if (!aPlaceholder && bPlaceholder) return -1;

  const aUnits = unitCount(a);
  const bUnits = unitCount(b);
  if (aUnits !== bUnits) return bUnits - aUnits;

  const aTime = Number(a?.updatedAt?.seconds || a?.createdAt?.seconds || 0);
  const bTime = Number(b?.updatedAt?.seconds || b?.createdAt?.seconds || 0);
  return bTime - aTime;
}

export default function OwnerPropertyPassportResolvedPage() {
  const { user } = useRole();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [passports, setPassports] = useState<any[]>([]);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadPassports() {
      if (!user?.email && !user?.uid) {
        setPassports([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const passportMap = new Map<string, any>();
      const propertyMap = new Map<string, any>();

      const ownerIds = compact([user?.uid, (user as any)?.ownerId, (user as any)?.ownerUid, ...((Array.isArray((user as any)?.linkedOwnerIds) ? (user as any).linkedOwnerIds : []) as unknown[])]);
      for (const ownerId of ownerIds) {
        for (const p of await safeQuery('propertyPassports', 'ownerId', ownerId)) passportMap.set(p.id, p);
        for (const p of await safeQuery('propertyPassports', 'ownerUid', ownerId)) passportMap.set(p.id, p);
        for (const p of await safeQuery('properties', 'ownerId', ownerId)) propertyMap.set(p.id, p);
        for (const p of await safeQuery('properties', 'ownerUid', ownerId)) propertyMap.set(p.id, p);
      }

      const emails = compact([
        ...emailLookupCandidates(user?.email),
        ...emailLookupCandidates((user as any)?.ownerEmail),
      ]);
      for (const email of emails) {
        for (const p of await safeQuery('propertyPassports', 'ownerEmail', email)) passportMap.set(p.id, p);
        for (const p of await safeQuery('properties', 'ownerEmail', email)) propertyMap.set(p.id, p);
      }

      let rows = Array.from(passportMap.values()).map((row) => ({ ...row, placeholder: isPlaceholderAsset(row) }));
      let fallback = false;
      if (rows.length === 0 && propertyMap.size > 0) {
        fallback = true;
        rows = Array.from(propertyMap.values()).map(passportFromProperty);
      }

      rows.sort(sortPassportRows);
      if (!alive) return;
      setPassports(rows);
      setUsedFallback(fallback);
      setLoading(false);
    }

    loadPassports();
    return () => { alive = false; };
  }, [user?.email, user?.uid]);

  if (loading) return (
    <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <CircularProgress sx={{ color: binThemeTokens.gold }} />
      <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Accessing Registry...</Typography>
    </Box>
  );

  return (
    <Box sx={{ pb: 6 }}>
      <Box sx={{ mb: 6 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>SOVEREIGN ASSET REGISTRY</Typography>
        <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>Property Passports</Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>Official digital twins of your real estate portfolio.</Typography>
      </Box>

      {usedFallback && (
        <Alert severity="info" sx={{ mb: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>
          Official property passport documents are not issued yet, so provisional passports are shown from linked active assets.
        </Alert>
      )}

      {passports.length === 0 ? (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
          <FileText size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
          <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO PASSPORTS ISSUED YET</Typography>
        </Paper>
      ) : (
        <Grid container spacing={4}>
          {passports.map((p) => (
            <Grid item xs={12} md={6} key={p.id}>
              <Paper sx={{ p: 0, overflow: 'hidden', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, transition: 'all 0.3s ease', opacity: p.placeholder ? 0.76 : 1, '&:hover': { borderColor: binThemeTokens.gold, transform: 'translateY(-4px)' } }}>
                <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ width: 48, height: 48, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold }}>
                      <Building2 size={24} />
                    </Box>
                    <Box>
                      <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', lineHeight: 1.2 }}>{p.propertyName || p.name || 'Property'}</Typography>
                      <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>ID: {String(p.id).slice(0, 8).toUpperCase()}</Typography>
                    </Box>
                  </Stack>
                  <Chip label={p.placeholder ? 'DRAFT' : (p.provisional ? 'PROVISIONAL' : (p.status || 'ACTIVE'))} size="small" sx={{ bgcolor: alpha(p.provisional ? binThemeTokens.gold : '#10b981', 0.1), color: p.provisional ? binThemeTokens.gold : '#10b981', fontWeight: 900, fontSize: '0.65rem' }} />
                </Box>

                <Box sx={{ p: 4 }}>
                  <Grid container spacing={3}>
                    <Grid item xs={6}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>LOCATION</Typography>
                      <Stack direction="row" spacing={1} alignItems="center"><MapPin size={14} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{p.emirate || 'UAE'}</Typography></Stack>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>COMPOSITION</Typography>
                      <Stack direction="row" spacing={1} alignItems="center"><Layers size={14} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{unitCount(p)} Units · {p.floors || 0} Floors</Typography></Stack>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>ISSUANCE DATE</Typography>
                      <Stack direction="row" spacing={1} alignItems="center"><Calendar size={14} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : 'Pending'}</Typography></Stack>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>GOVERNANCE</Typography>
                      <Stack direction="row" spacing={1} alignItems="center"><ShieldCheck size={14} color="#10b981" /><Typography variant="body2" sx={{ color: '#10b981', fontWeight: 700 }}>{p.placeholder ? 'DRAFT' : (p.provisional ? 'READY' : 'VERIFIED')}</Typography></Stack>
                    </Grid>
                  </Grid>

                  <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button fullWidth variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900, borderRadius: 3, py: 1.5 }}>PDF</Button>
                    <Button fullWidth variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(`/owner/property-passport/${p.id}`)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, py: 1.5 }}>VIEW DETAILS</Button>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
