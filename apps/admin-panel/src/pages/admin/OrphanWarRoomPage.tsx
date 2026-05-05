// admin-panel/src/pages/admin/OrphanWarRoomPage.tsx
import React, { useState, useEffect } from 'react';
import {
    Container, Box, Typography, Paper, Grid, Stack, Button, Chip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
    DialogActions, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { 
    ShieldAlert, Link as LinkIcon, 
    Search, Wrench, CheckCircle2
} from 'lucide-react';
import { db, collection, query, where, doc, writeBatch, serverTimestamp, onSnapshot, auth, functions, httpsCallable } from '../../lib/firebase';
import { useAI } from '@bin/shared';
import { buildGeoAnchor } from '../../utils/geoAnchor';

type RepairReport = {
    dryRun?: boolean;
    project?: string;
    database?: string;
    collection?: string;
    docsMatched?: number;
    docsUpdated?: number;
    docsSkipped?: number;
    repairedTicketIds?: string[];
    orphanTicketIds?: string[];
    invalidStatusTicketIds?: string[];
    log?: Array<{
        id: string;
        status?: string;
        reason?: string;
        changes?: Record<string, any>;
    }>;
};

export default function OrphanWarRoomPage() {
    const { setPageContext } = useAI();
    const activeProjectId = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_FIREBASE_PROJECT_ID : 'UNCONFIGURED_PROJECT';
    const [orphans, setOrphans] = useState<any[]>([]);
    const [properties, setProperties] = useState<any[]>([]);
    const [geoRepairItems, setGeoRepairItems] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fixing, setFixing] = useState<string | null>(null);
    const [repairRunning, setRepairRunning] = useState<'dryRun' | 'commit' | null>(null);
    const [repairReport, setRepairReport] = useState<RepairReport | null>(null);
    const [repairError, setRepairError] = useState<string | null>(null);
    const [repairErrorDetail, setRepairErrorDetail] = useState<string | null>(null);

    useEffect(() => {
        if (orphans.length > 0) {
            setPageContext({ orphans });
        } else {
            setPageContext(null);
        }
        return () => setPageContext(null);
    }, [orphans]);
    
    const [selectedOrphan, setSelectedOrphan] = useState<any>(null);
    const [targetPropId, setTargetPropId] = useState('');
    const [targetUnitId, setTargetUnitId] = useState('');

    const runInstitutionalRepair = async (dryRun: boolean) => {
        if (!auth.currentUser) {
            setRepairError("Your admin session is not active. Please log in again before running repair operations.");
            setRepairErrorDetail(null);
            return;
        }

        setRepairRunning(dryRun ? 'dryRun' : 'commit');
        setRepairError(null);
        setRepairErrorDetail(null);
        try {
            // Force refresh token to ensure admin claim is current
            const tokenResult = await auth.currentUser.getIdTokenResult(true);
            console.log("🛡️ [TECH-REPAIR] Admin Claims:", tokenResult.claims);

            const repairFn = httpsCallable<{ dryRun: boolean }, RepairReport>(functions, 'institutionalRepairTrigger');
            const result = await repairFn({ dryRun });
            setRepairReport(result.data);
        } catch (err: any) {
            console.error('[TECH-REPAIR] Callable failure:', err);
            
            setRepairErrorDetail(JSON.stringify({
                code: err?.code || 'UNKNOWN',
                message: err?.message || 'Unknown server error',
                details: err?.details || 'Check console logs'
            }, null, 2));

            if (err?.code === 'functions/unauthenticated') {
                setRepairError("Administrative access expired. Sign in again to re-validate your Sovereign credentials.");
            } else if (err?.code === 'functions/permission-denied') {
                setRepairError("Permission Denied: Your account requires explicit 'admin' or 'super_admin' claims to run repair batch protocols.");
            } else if (err?.message?.includes('not a function')) {
                setRepairError("Cloud Function 'institutionalRepairTrigger' not found. Verify backend deployment and primary region (europe-west3).");
            } else {
                setRepairError(`Institutional Repair Protocol failed: ${err.message || 'Check connection'}`);
            }
        } finally {
            setRepairRunning(null);
        }
    };

    useEffect(() => {
        // 1. Listen for orphans (Tickets or Tenants missing linkage)
        const unsubTickets = onSnapshot(query(collection(db, 'maintenanceTickets'), where('propertyId', '==', 'UNASSOCIATED')), (snap) => {
            setOrphans(prev => {
                const filtered = prev.filter(p => p.type !== 'TICKET');
                return [...filtered, ...snap.docs.map(d => ({ id: d.id, type: 'TICKET', ...d.data() }))];
            });
            setLoading(false);
        });

        const unsubTenants = onSnapshot(query(collection(db, 'users'), where('role', '==', 'tenant'), where('propertyId', '==', 'UNASSOCIATED')), (snap) => {
            setOrphans(prev => {
                const filtered = prev.filter(p => p.type !== 'TENANT');
                return [...filtered, ...snap.docs.map(d => ({ id: d.id, type: 'TENANT', description: `Tenant: ${d.data().displayName || d.data().email}`, ...d.data() }))];
            });
        });

        // 2. Load potential link targets
        const unsubProps = onSnapshot(collection(db, 'properties'), (snap) => {
            const fetched: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setProperties(fetched);
            setGeoRepairItems(fetched.filter((property) => !property.geo?.lat || !property.geo?.lng || !property.geo?.geohash));
        });

        const unsubUnits = onSnapshot(collection(db, 'units'), (snap) => {
            setUnits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => { unsubTickets(); unsubTenants(); unsubProps(); unsubUnits(); };
    }, []);

    const handleRepair = async () => {
        if (!selectedOrphan || !targetPropId || !targetUnitId) return;
        setFixing(selectedOrphan.id);
        try {
            const prop = properties.find(p => p.id === targetPropId);
            const unit = units.find(u => u.id === targetUnitId);
            const adminId = auth.currentUser?.uid || 'SYSTEM_ADMIN';
            
            const batch = writeBatch(db);
            const docRef = doc(db, selectedOrphan.type === 'TICKET' ? 'maintenanceTickets' : 'users', selectedOrphan.id);
            
            const commonData = {
                propertyId: targetPropId,
                unitId: targetUnitId,
                propertyName: prop?.name || prop?.propertyName,
                unitNumber: unit?.unitNumber,
                ownerId: prop?.ownerId || 'SYSTEM',
                updatedAt: serverTimestamp(),
                repairedAt: serverTimestamp(),
                repairSource: 'ADMIN_WAR_ROOM'
            };

            if (selectedOrphan.type === 'TICKET') {
                batch.update(docRef, { ...commonData, status: 'OPEN' });
            } else {
                batch.update(docRef, { ...commonData });
                batch.update(doc(db, 'units', targetUnitId), {
                    occupancyStatus: 'OCCUPIED',
                    currentTenantId: selectedOrphan.id,
                    tenantId: selectedOrphan.id,
                    updatedAt: serverTimestamp()
                });
            }

            // 📜 AUDIT LOGGING
            const logRef = doc(collection(db, 'audit_logs'));
            batch.set(logRef, {
                action: 'SECURE_LINKAGE_REPAIR',
                adminId,
                timestamp: serverTimestamp(),
                orphanId: selectedOrphan.id,
                orphanType: selectedOrphan.type,
                previousState: { propertyId: 'UNASSOCIATED', unitId: 'UNASSOCIATED' },
                newState: { propertyId: targetPropId, unitId: targetUnitId },
                reason: 'ADMIN_WAR_ROOM_MANUAL_FIX'
            });
            
            await batch.commit();
            setSelectedOrphan(null);
            setTargetPropId('');
            setTargetUnitId('');
        } catch (err) {
            console.error("Repair failed:", err);
            alert("Sovereign Protocol Failure: Linkage could not be established.");
        } finally {
            setFixing(null);
        }
    };

    const repairLegacyGeo = async (property: any) => {
        const adminId = auth.currentUser?.uid || 'SYSTEM_ADMIN';
        try {
            const geoSource = property.geo || property.location || property.coordinates;
            const geo = buildGeoAnchor({
                lat: geoSource?.lat ?? geoSource?.latitude,
                lng: geoSource?.lng ?? geoSource?.longitude,
                address: property.addressLine || property.address || property.geo?.address,
                emirate: property.emirate || property.geo?.emirate,
                city: property.city || property.area || property.serviceZone || property.geo?.city,
                area: property.area || property.serviceZone || property.city || property.geo?.area,
                placeId: property.googlePlaceId || property.placeId || property.geo?.placeId,
                verifiedBy: adminId
            });
            const companyId = property.companyId || 'BIN_GROUP';
            const payload = {
                companyId,
                geo,
                location: { lat: geo.lat, lng: geo.lng },
                coordinates: { lat: geo.lat, lng: geo.lng },
                addressLine: property.addressLine || property.address || geo.address,
                googlePlaceId: property.googlePlaceId || geo.placeId || '',
                city: property.city || geo.city,
                area: property.area || geo.area,
                emirate: property.emirate || geo.emirate,
                geoAnchorStatus: 'admin_repaired',
                updatedAt: serverTimestamp()
            };
            const batch = writeBatch(db);
            batch.set(doc(db, 'properties', property.id), payload, { merge: true });
            batch.set(doc(db, 'companies', companyId, 'properties', property.id), { ...property, ...payload, propertyId: property.id }, { merge: true });
            batch.set(doc(collection(db, 'audit_logs')), {
                action: 'GEO_ANCHOR_REPAIR',
                adminId,
                propertyId: property.id,
                companyId,
                previousState: {
                    geo: property.geo || null,
                    location: property.location || null,
                    coordinates: property.coordinates || null
                },
                newState: { lat: geo.lat, lng: geo.lng, geohash: geo.geohash },
                createdAt: serverTimestamp(),
                auditVersion: 1
            });
            await batch.commit();
        } catch (err: any) {
            alert(err?.message || 'Open map and select a verified pin before repairing this property.');
        }
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>ORPHAN <Box component="span" sx={{ color: '#ef4444' }}>WAR ROOM</Box></Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>RELATIONAL INTEGRITY ENFORCEMENT MODULE</Typography>
            </Box>

            <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(15,23,42,0.78)', border: '1px solid rgba(218,165,32,0.35)', borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                    <Box>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#DAA520', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Wrench size={20} /> TECH REPAIR CONTROL
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800, display: 'block', mt: 0.5 }}>
                            project: {activeProjectId} | database: (default) | collection: maintenanceTickets
                        </Typography>
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <Button
                            variant="outlined"
                            startIcon={repairRunning === 'dryRun' ? <CircularProgress size={16} /> : <Search size={16} />}
                            disabled={!!repairRunning}
                            onClick={() => runInstitutionalRepair(true)}
                            sx={{ fontWeight: 950, borderColor: '#DAA520', color: '#DAA520' }}
                        >
                            Dry Run Tech Repair
                        </Button>
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={repairRunning === 'commit' ? <CircularProgress size={16} /> : <ShieldAlert size={16} />}
                            disabled={!!repairRunning}
                            onClick={() => runInstitutionalRepair(false)}
                            sx={{ fontWeight: 950 }}
                        >
                            Commit Tech Repair
                        </Button>
                    </Stack>
                </Stack>

                {repairError && (
                    <Alert severity="error" sx={{ mt: 3 }}>
                        <Typography variant="body2" fontWeight="900">{repairError}</Typography>
                        {repairErrorDetail && (
                            <Box component="details" sx={{ mt: 1 }}>
                                <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 800 }}>Developer detail</Box>
                                <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                                    {repairErrorDetail}
                                </Typography>
                            </Box>
                        )}
                    </Alert>
                )}

                {repairReport && (
                    <Box sx={{ mt: 3 }}>
                        <Grid container spacing={2}>
                            {[
                                ['Docs matched', repairReport.docsMatched ?? 0],
                                ['Docs updated', repairReport.docsUpdated ?? 0],
                                ['Docs skipped', repairReport.docsSkipped ?? 0],
                                ['Orphan IDs', repairReport.orphanTicketIds?.length ?? 0],
                                ['Invalid-status IDs', repairReport.invalidStatusTicketIds?.length ?? 0],
                            ].map(([label, value]) => (
                                <Grid item xs={6} md={2.4} key={label}>
                                    <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 900 }}>{label}</Typography>
                                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{value}</Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>

                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 950 }}>ORPHAN TICKET IDS</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', wordBreak: 'break-word' }}>
                                    {repairReport.orphanTicketIds?.join(', ') || 'None'}
                                </Typography>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 950 }}>INVALID-STATUS TICKET IDS</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', wordBreak: 'break-word' }}>
                                    {repairReport.invalidStatusTicketIds?.join(', ') || 'None'}
                                </Typography>
                            </Grid>
                        </Grid>

                        <TableContainer component={Paper} sx={{ mt: 2, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 950 }}>TICKET</TableCell>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 950 }}>STATUS</TableCell>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 950 }}>BEFORE / AFTER</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(repairReport.log || []).map((entry) => (
                                        <TableRow key={`${entry.id}-${entry.reason || 'repair'}`}>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 800 }}>{entry.id}</TableCell>
                                            <TableCell sx={{ color: entry.status === 'SKIPPED' ? '#f59e0b' : '#10b981', fontWeight: 900 }}>
                                                {entry.status || 'MATCHED'}{entry.reason ? `: ${entry.reason}` : ''}
                                            </TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.72)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                                {JSON.stringify(entry.changes || {}, null, 2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}
            </Paper>

            <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(15,23,42,0.78)', border: '1px solid rgba(59,130,246,0.28)', borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                    <Box>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#60A5FA' }}>GEO MIGRATION / REPAIR</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>
                            Finds properties missing geo, properties with legacy location/coordinates only, and repairs when coordinates are available. Map pin repair is required when no coordinates exist.
                        </Typography>
                    </Box>
                    <Chip label={`${geoRepairItems.length} PROPERTIES NEED GEO REVIEW`} sx={{ bgcolor: 'rgba(59,130,246,0.12)', color: '#93c5fd', fontWeight: 950 }} />
                </Stack>
                {geoRepairItems.length > 0 && (
                    <TableContainer component={Paper} sx={{ mt: 2, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: '#93c5fd', fontWeight: 950 }}>PROPERTY</TableCell>
                                    <TableCell sx={{ color: '#93c5fd', fontWeight: 950 }}>LEGACY SOURCE</TableCell>
                                    <TableCell align="right" sx={{ color: '#93c5fd', fontWeight: 950 }}>ACTION</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {geoRepairItems.slice(0, 10).map((property) => {
                                    const hasLegacyCoords = !!(property.location?.lat || property.coordinates?.lat);
                                    return (
                                        <TableRow key={property.id}>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 800 }}>{property.name || property.propertyName || property.id}</TableCell>
                                            <TableCell sx={{ color: hasLegacyCoords ? '#10b981' : '#f59e0b', fontWeight: 900 }}>
                                                {hasLegacyCoords ? 'legacy coordinates available' : 'map pin required'}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button size="small" variant="outlined" disabled={!hasLegacyCoords} onClick={() => repairLegacyGeo(property)} sx={{ borderColor: '#93c5fd', color: '#93c5fd', fontWeight: 900 }}>
                                                    Repair Geo
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {orphans.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(16,185,129,0.05)', border: '1px solid #10b981', borderRadius: 4 }}>
                    <CheckCircle2 size={64} color="#10b981" style={{ marginBottom: 24 }} />
                    <Typography variant="h4" fontWeight="950" color="#10b981">SYSTEM NOMINAL</Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mt: 2 }}>No unassociated asset dispatches detected in current sector.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    <Grid item xs={12}>
                        <Alert severity="warning" variant="filled" sx={{ fontWeight: 900, borderRadius: 2, mb: 4 }}>
                            DETECTED {orphans.length} DISPATCH NODES WITHOUT RELATIONAL BINDING
                        </Alert>
                        
                        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Table>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>FAULT TYPE</TableCell>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>DESCRIPTION</TableCell>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>SUBMITTED BY</TableCell>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>TIMESTAMP</TableCell>
                                        <TableCell align="right" sx={{ color: '#ef4444', fontWeight: 900 }}>PROTOCOL</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {orphans.map((o) => (
                                        <TableRow key={o.id} hover>
                                            <TableCell><Chip label={o.type} size="small" color="error" sx={{ fontWeight: 900 }} /></TableCell>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{o.description}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{o.tenantName || o.tenantEmail || 'Anonymous'}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>{o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : 'N/A'}</TableCell>
                                            <TableCell align="right">
                                                <Button 
                                                    variant="contained" 
                                                    color="error" 
                                                    startIcon={<LinkIcon size={16} />}
                                                    onClick={() => setSelectedOrphan(o)}
                                                    sx={{ fontWeight: 950 }}
                                                >
                                                    BIND NODE
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Grid>
                </Grid>
            )}

            {/* REPAIR DIALOG */}
            <Dialog open={!!selectedOrphan} onClose={() => setSelectedOrphan(null)} fullWidth maxWidth="sm">
                <DialogTitle sx={{ fontWeight: 900 }}>RELATIONAL BINDING PROTOCOL</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Typography variant="body2" color="textSecondary">Assign the following unlinked node to a verified asset:</Typography>
                        <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)' }}>
                            <Typography variant="caption" fontWeight="900" color="error">ORPHAN NODE:</Typography>
                            <Typography variant="body1" fontWeight="700">{selectedOrphan?.description}</Typography>
                        </Paper>

                        <FormControl fullWidth size="small">
                            <InputLabel>TARGET PROPERTY</InputLabel>
                            <Select value={targetPropId} label="TARGET PROPERTY" onChange={(e) => { setTargetPropId(e.target.value); setTargetUnitId(''); }}>
                                {properties.map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small" disabled={!targetPropId}>
                            <InputLabel>TARGET UNIT</InputLabel>
                            <Select value={targetUnitId} label="TARGET UNIT" onChange={(e) => setTargetUnitId(e.target.value)}>
                                {units.filter(u => u.propertyId === targetPropId).map(u => (
                                    <MenuItem key={u.id} value={u.id}>Unit {u.unitNumber}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setSelectedOrphan(null)} sx={{ fontWeight: 900 }}>CANCEL</Button>
                    <Button 
                        variant="contained" 
                        color="primary" 
                        disabled={!targetUnitId || fixing === selectedOrphan?.id}
                        onClick={handleRepair}
                        sx={{ borderRadius: 100, fontWeight: 900 }}
                    >
                        {fixing === selectedOrphan?.id ? <CircularProgress size={20} /> : 'SECURE LINKAGE'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
