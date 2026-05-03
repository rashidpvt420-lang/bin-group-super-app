import React, { useEffect, useState } from 'react';
import { 
    Box, Typography, Container, Paper, Grid, Button, 
    CircularProgress, Stack, Snackbar, Alert
} from '@mui/material';
import { MapPin, Navigation, AlertTriangle, Crosshair } from 'lucide-react';
import { db, collection, getDocs, doc, writeBatch, serverTimestamp } from '@/lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { buildGeoAnchor } from '../../utils/geoAnchor';

export default function GeoRepairCommandCenter() {
    const [loading, setLoading] = useState(true);
    const [properties, setProperties] = useState<any[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [technicians, setTechnicians] = useState<any[]>([]);
    const [repairing, setRepairing] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

    useEffect(() => {
        fetchAnomalies();
    }, []);

    const fetchAnomalies = async () => {
        setLoading(true);
        try {
            // Fetch Properties
            const propSnap = await getDocs(collection(db, 'properties'));
            const propAnomalies = propSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter((p: any) => !p.geo || !p.geo.lat || !p.geo.lng || !p.geo.emirate);
            
            // Fetch Tickets
            const ticketSnap = await getDocs(collection(db, 'maintenanceTickets'));
            const ticketAnomalies = ticketSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter((t: any) => !t.geo || !t.geo.lat || !t.geo.lng);

            // Fetch Technicians
            const techSnap = await getDocs(collection(db, 'users'));
            const techAnomalies = techSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter((u: any) => u.role === 'technician' && (!u.emirate || !u.citiesCovered));

            setProperties(propAnomalies);
            setTickets(ticketAnomalies);
            setTechnicians(techAnomalies);
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
                source: 'admin_manual',
                verified: true,
                verifiedBy: 'ADMIN_GEO_REPAIR_CENTER'
            });
            
            if (repairedGeo) {
                const batch = writeBatch(db);
                const companyId = prop.companyId || 'BIN_GROUP';
                const payload = {
                    companyId,
                    geo: repairedGeo,
                    location: { lat: repairedGeo.lat, lng: repairedGeo.lng },
                    coordinates: { lat: repairedGeo.lat, lng: repairedGeo.lng },
                    geoAnchorStatus: 'verified_and_locked',
                    updatedAt: serverTimestamp()
                };
                batch.set(doc(db, 'properties', prop.id), payload, { merge: true });
                batch.set(doc(db, 'companies', companyId, 'properties', prop.id), { ...prop, ...payload, propertyId: prop.id }, { merge: true });
                
                await batch.commit();
                await fetchAnomalies();
                setNotice({ open: true, message: `${prop.propertyName || prop.id} is now verified and locked.`, severity: 'success' });
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
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Properties missing strict coordinates or emirate tags.</Typography>
                        
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
                                        Auto-Repair Node
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
        </Container>
    );
}
