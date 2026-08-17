import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ClipboardCheck, Eye, ReceiptText } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerEvidenceSection({ properties }: { properties?: any[] }) {
  const { user } = useRole();
  const [inspections, setInspections] = useState<any[]>([]);
  const [liveProperties, setLiveProperties] = useState<any[]>([]);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLiveProperties([]);
      return undefined;
    }

    const byOwnerId = new Map<string, any>();
    const byOwnerUid = new Map<string, any>();
    let active = true;

    const publish = () => {
      if (!active) return;
      const merged = new Map<string, any>();
      for (const property of [...byOwnerId.values(), ...byOwnerUid.values()]) {
        const key = String(property.id || property.propertyId || '').trim();
        if (key) merged.set(key, property);
      }
      setLiveProperties(Array.from(merged.values()));
    };

    const attach = (field: 'ownerId' | 'ownerUid', target: Map<string, any>) => onSnapshot(
      query(collection(db, 'properties'), where(field, '==', user.uid)),
      (snapshot) => {
        target.clear();
        snapshot.docs.forEach((document) => target.set(document.id, { id: document.id, ...document.data() }));
        publish();
      },
      (error) => {
        console.warn(`[OwnerEvidence] Live property listener failed for ${field}.`, error);
      },
    );

    const unsubs = [
      attach('ownerId', byOwnerId),
      attach('ownerUid', byOwnerUid),
    ];

    return () => {
      active = false;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.uid]);

  useEffect(() => {
    let alive = true;
    async function loadInspections() {
      if (!user?.uid && !user?.email) {
        setInspections([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const listOwnerHandoverInspections = httpsCallable(functions, 'listOwnerHandoverInspections');
        const result = await listOwnerHandoverInspections({});
        const data = (result.data || {}) as { inspections?: any[] };
        const rows = Array.isArray(data.inspections) ? data.inspections : [];
        rows.sort((a, b) => {
          const tA = new Date(a.submittedAt || a.createdAt).getTime() || 0;
          const tB = new Date(b.submittedAt || b.createdAt).getTime() || 0;
          return tB - tA;
        });
        if (alive) {
          setInspections(rows);
          setWarning('');
        }
      } catch (err) {
        console.warn('[OwnerEvidence] callable load failed:', err);
        if (alive) {
          setWarning('Some inspection evidence could not load. Check access permissions.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void loadInspections();
    return () => { alive = false; };
  }, [user?.uid, user?.email]);

  const displayProperties = useMemo(() => {
    const merged = new Map<string, any>();
    for (const property of [...(properties || []), ...liveProperties]) {
      const key = String(property?.id || property?.propertyId || '').trim();
      if (key) merged.set(key, property);
    }
    return Array.from(merged.values());
  }, [properties, liveProperties]);

  const displayInspections = inspections.slice(0, 5);
  const money = (val: any) => `AED ${Number(val || 0).toLocaleString()}`;
  void money;

  return (
    <Paper sx={{ p: { xs: 2.25, md: 4 }, bgcolor: 'rgba(15,23,42,.58)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, borderRadius: 5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>OWNER EVIDENCE CENTER</Typography>
          <Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>Move-in & Move-out Handover Evidence</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: 0.75 }}>
            Review condition reports, settle deposit deductions, and approve tenant handovers directly.
          </Typography>
        </Box>
        <Button variant="outlined" href="/owner/inspections" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
          View All Inspections
        </Button>
      </Stack>

      {displayProperties.length > 0 && (
        <Box data-testid="owner-live-property-portfolio" sx={{ mb: 3 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.48)', fontWeight: 900, letterSpacing: 1.2 }}>
            LIVE PROPERTY PORTFOLIO
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            {displayProperties.map((property) => (
              <Chip
                key={String(property.id || property.propertyId)}
                label={property.propertyName || property.name || property.address || 'Property'}
                size="small"
                sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: '#fff', fontWeight: 850 }}
              />
            ))}
          </Stack>
        </Box>
      )}

      {warning && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 3, fontWeight: 700 }}>
          {warning}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Stack>
      ) : displayInspections.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,.05)' }}>
          <ClipboardCheck size={48} color="rgba(255,255,255,.2)" style={{ margin: '0 auto 16px' }} />
          <Typography sx={{ color: 'rgba(255,255,255,.5)' }}>No handover evidence records found for your properties.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {displayInspections.map((inspection) => {
            const status = String(inspection.status || 'SUBMITTED').replace(/_/g, ' ');
            const type = String(inspection.inspectionType || 'UNKNOWN').replace(/_/g, ' ');
            return (
              <Grid item xs={12} key={inspection.id}>
                <Paper sx={{ p: 3, borderRadius: 3, bgcolor: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)' }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <Chip label={type} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                        <Chip label={status} size="small" sx={{ bgcolor: 'rgba(255,255,255,.1)', color: '#fff', fontWeight: 700 }} />
                      </Stack>
                      <Typography variant="h6" fontWeight={900} sx={{ color: '#fff' }}>{inspection.propertyName || 'Property'} - {inspection.unitNumber}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)', display: 'block' }}>Tenant: {inspection.tenantName || 'Unknown'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.5)' }}>Submitted: {new Date(inspection.submittedAt || inspection.createdAt).toLocaleString()}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {inspection.pdfUrl && (
                        <Button size="small" variant="outlined" onClick={() => window.open(inspection.pdfUrl, '_blank')} sx={{ borderColor: 'rgba(255,255,255,.2)', color: '#fff' }} startIcon={<ReceiptText size={16} />}>
                          View PDF
                        </Button>
                      )}
                      <Button size="small" variant="contained" href="/owner/inspections" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} startIcon={<Eye size={16} />}>
                        Review Handover
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Paper>
  );
}
