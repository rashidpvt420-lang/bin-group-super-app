import React, { useEffect, useState } from 'react';
import { 
    Box, Typography, Container, Paper, Grid, Button, 
    CircularProgress, Stack, Snackbar, Alert
} from '@mui/material';
import { MapPin, Navigation, AlertTriangle, Crosshair } from 'lucide-react';
import { db, functions, collection, documentId, getCountFromServer, getDocs, httpsCallable, limit, orderBy, query, startAfter } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { buildGeoAnchor } from '../../utils/geoAnchor';
import { resolveVerifiedPropertyPin } from '../../lib/verifiedPropertyPin';

export default function GeoRepairCommandCenter() {
    const [loading, setLoading] = useState(true);
    const [properties, setProperties] = useState<any[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [repairing, setRepairing] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
    const [scanMeta, setScanMeta] = useState({ properties: { scanned: 0, total: 0, hasMore: false }, tickets: { scanned: 0, total: 0, hasMore: false }, technicians: { scanned: 0, total: 0, hasMore: false } });
    const [scanCursors, setScanCursors] = useState<Record<string, any>>({});

    useEffect(() => {
        fetchAnomalies();
    }, []);

    const PAGE = 40;
    const scanCollection = async (collectionName: string, constraints: any[], appendFrom: any, cap: number) => {
        const base = query(collection(db, collectionName), ...constraints, orderBy(documentId()));
        const total = (await getCountFromServer(query(collection(db, collectionName), ...constraints))).data().count;
        const rows: any[] = [];
        let cursor = appendFrom;
        let scanned = 0;
        while (scanned < cap) {
            const page = cursor
                ? query(base, startAfter(cursor), limit(PAGE))
                : query(base, limit(PAGE));
            const snap = await getDocs(page);
            if (!snap.docs.length) break;
            rows.push(...snap.docs.map((item) => ({ id: item.id, _doc: item, ...item.data() })));
            cursor = snap.docs[snap.docs.length - 1];
            scanned += snap.docs.length;
            if (snap.docs.length < PAGE) break;
        }
        return { rows, cursor, scanned, total, hasMore: scanned < total };
    };

    const fetchAnomalies = async (append = false) => {
        setLoading(true);
        try {
            const [propScan, ticketScan, techScan] = await Promise.all([
                scanCollection('properties', [], append ? scanCursors.properties : null, append ? PAGE : 200),
                scanCollection('maintenanceTickets', [], append ? scanCursors.tickets : null, append ? PAGE : 200),
                scanCollection('users', [], append ? scanCursors.technicians : null, append ? PAGE : 200),
            ]);
            const propAnomalies = propScan.rows.filter((p: any) => !resolveVerifiedPropertyPin(p));
            const ticketAnomalies = ticketScan.rows.filter((t: any) => !t.geo || !t.geo.lat || !t.geo.lng);
            const techAnomalies = techScan.rows.filter((u: any) => u.role === 'technician' && (!u.emirate || !u.citiesCovered));
            setProperties((current) => append ? [...current, ...propAnomalies] : propAnomalies);
            setTickets((current) => append ? [...current, ...ticketAnomalies] : ticketAnomalies);
            setTechnicians((current) => append ? [...current, ...techAnomalies] : techAnomalies);
            setScanCursors({ properties: propScan.cursor, tickets: ticketScan.cursor, technicians: techScan.cursor });
            setScanMeta({
                properties: { scanned: (append ? scanMeta.properties.scanned : 0) + propScan.scanned, total: propScan.total, hasMore: propScan.hasMore },
                tickets: { scanned: (append ? scanMeta.tickets.scanned : 0) + ticketScan.scanned, total: ticketScan.total, hasMore: ticketScan.hasMore },
                technicians: { scanned: (append ? scanMeta.technicians.scanned : 0) + techScan.scanned, total: techScan.total, hasMore: techScan.hasMore },
            });
        } catch (error) {
            console.error("Error fetching anomalies:", error);
        } finally {
            setLoading(false);
        }
    };

    const repairProperty = async (prop: any) => {
        setRepairing(prop.id);
        try {
            const source = prop.geo || prop.location || prop.coordinates;
            const repairedGeo = buildGeoAnchor({
                lat: source?.lat ?? source?.latitude,
                lng: source?.lng ?? source?.longitude,
                address: prop.addressLine || prop.address || prop.geo?.address,
                emirate: prop.emirate || prop.geo?.emirate,
                city: prop.city || prop.area || prop.serviceZone || prop.geo?.city,
                area: prop.area || prop.serviceZone || prop.city || prop.geo?.area,
                placeId: prop.googlePlaceId || prop.placeId || prop.geo?.placeId,
                source: 'admin_manual'
            });

            if (repairedGeo) {
                const submitCandidate = httpsCallable(functions, 'adminRepairPropertyGeo');
                await submitCandidate({
                    propertyId: prop.id,
                    lat: repairedGeo.lat,
                    lng: repairedGeo.lng,
                    address: repairedGeo.address,
                    emirate: repairedGeo.emirate,
                    city: repairedGeo.city,
                    area: repairedGeo.area,
                    placeId: repairedGeo.placeId,
                });
                await fetchAnomalies();
                setNotice({
                    open: true,
                    message: `${prop.propertyName || prop.id} location candidate was saved for authoritative review; it is not dispatch-ready.`,
                    severity: 'success'
                });
            }
        } catch (error) {
            console.error(error);
            setNotice({ open: true, message: error instanceof Error ? error.message : 'Geo repair failed. Select a verified pin and retry.', severity: 'error' });
        } finally {
            setRepairing(null);
        }
    };

    if (loading) return <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>GEO-ANCHOR REPAIR CENTER</Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>Systematic resolution of legacy location data.</Typography>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                            <MapPin color="#ef4444" />
                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>Property Anomalies ({properties.length})</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Properties without server-verified canonical dispatch geography. Candidate repair never grants trust.</Typography>
                        
                        <Stack spacing={2}>
                            {properties.map(p => (
                                <Paper key={p.id} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="body1" fontWeight="900" sx={{ color: '#FFF' }}>{p.propertyName || 'Unnamed Property'}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>{p.id}</Typography>
                                    <Button 
                                        size="small" 
                                        variant="outlined" 
                                        onClick={() => repairProperty(p)}
                                        disabled={repairing === p.id}
                                        startIcon={repairing === p.id ? <CircularProgress size={14} /> : <Crosshair size={14} />}
                                        sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}
                                    >
                                        Submit Geo Candidate
                                    </Button>
                                </Paper>
                            ))}
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                            <AlertTriangle color="#f59e0b" />
                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>Ticket Anomalies ({tickets.length})</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Dispatches blocking auto-assignment due to missing spatial data.</Typography>
                        <Typography variant="caption" sx={{ color: '#f59e0b' }}>* Repair the underlying property first. Tickets will auto-sync.</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                            <Navigation color="#3b82f6" />
                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>Technician Anomalies ({technicians.length})</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Field staff missing operation zones.</Typography>
                    </Paper>
                </Grid>
            </Grid>
            <Snackbar open={notice.open} autoHideDuration={6000} onClose={() => setNotice((prev) => ({ ...prev, open: false }))}>
                <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((prev) => ({ ...prev, open: false }))}>
                    {notice.message}
                </Alert>
            </Snackbar>
                    {(scanMeta.properties.hasMore || scanMeta.tickets.hasMore || scanMeta.technicians.hasMore) && (
                <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => void fetchAnomalies(true)} disabled={loading}>Scan more records</Button>}>
                    Scanned {scanMeta.properties.scanned} of {scanMeta.properties.total} properties, {scanMeta.tickets.scanned} of {scanMeta.tickets.total} tickets, and {scanMeta.technicians.scanned} of {scanMeta.technicians.total} users. Load more to continue the geo-anomaly scan.
                </Alert>
            )}
</Container>
    );
}
