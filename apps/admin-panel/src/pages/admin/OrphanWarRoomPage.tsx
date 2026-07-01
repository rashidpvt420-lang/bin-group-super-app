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
import { useAI, useLanguage } from '@bin/shared';
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
    const { t, isRTL } = useLanguage();
    const { setPageContext } = useAI();
    const activeProjectId = 'bin-group-57c60';
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
    }, [orphans, setPageContext]);
    
    const [selectedOrphan, setSelectedOrphan] = useState<any>(null);
    const [targetPropId, setTargetPropId] = useState('');
    const [targetUnitId, setTargetUnitId] = useState('');

    const runInstitutionalRepair = async (dryRun: boolean) => {
        if (!auth.currentUser) {
            setRepairError(t('admin.orphan_war_room.err_session_inactive'));
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
                setRepairError(t('admin.orphan_war_room.err_auth_expired'));
            } else if (err?.code === 'functions/permission-denied') {
                setRepairError(t('admin.orphan_war_room.err_permission_denied'));
            } else if (err?.message?.includes('not a function')) {
                setRepairError(t('admin.orphan_war_room.err_fn_not_found'));
            } else {
                setRepairError(t('admin.orphan_war_room.err_generic').replace('{message}', err.message || 'Check connection'));
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
        <Container maxWidth="xl" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>{t('admin.orphan_war_room.page_title')} <Box component="span" sx={{ color: '#ef4444' }}>{t('admin.orphan_war_room.page_title_highlight')}</Box></Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.orphan_war_room.page_subtitle')}</Typography>
            </Box>

            <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(15,23,42,0.78)', border: '1px solid rgba(218,165,32,0.35)', borderRadius: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                    <Box>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#DAA520', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Wrench size={20} /> {t('admin.orphan_war_room.tech_repair_title')}
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
                            {t('admin.orphan_war_room.dry_run_btn')}
                        </Button>
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={repairRunning === 'commit' ? <CircularProgress size={16} /> : <ShieldAlert size={16} />}
                            disabled={!!repairRunning}
                            onClick={() => runInstitutionalRepair(false)}
                            sx={{ fontWeight: 950 }}
                        >
                            {t('admin.orphan_war_room.commit_btn')}
                        </Button>
                    </Stack>
                </Stack>

                {repairError && (
                    <Alert severity="error" sx={{ mt: 3 }}>
                        <Typography variant="body2" fontWeight="900">{repairError}</Typography>
                        {repairErrorDetail && (
                            <Box component="details" sx={{ mt: 1 }}>
                                <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 800 }}>{t('admin.orphan_war_room.dev_detail_label')}</Box>
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
                                [t('admin.orphan_war_room.report_docs_matched'), repairReport.docsMatched ?? 0],
                                [t('admin.orphan_war_room.report_docs_updated'), repairReport.docsUpdated ?? 0],
                                [t('admin.orphan_war_room.report_docs_skipped'), repairReport.docsSkipped ?? 0],
                                [t('admin.orphan_war_room.report_orphan_ids'), repairReport.orphanTicketIds?.length ?? 0],
                                [t('admin.orphan_war_room.report_invalid_ids'), repairReport.invalidStatusTicketIds?.length ?? 0],
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
                                <Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.orphan_war_room.orphan_ids_label')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', wordBreak: 'break-word' }}>
                                    {repairReport.orphanTicketIds?.join(', ') || t('admin.orphan_war_room.none_label')}
                                </Typography>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.orphan_war_room.invalid_ids_label')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', wordBreak: 'break-word' }}>
                                    {repairReport.invalidStatusTicketIds?.join(', ') || t('admin.orphan_war_room.none_label')}
                                </Typography>
                            </Grid>
                        </Grid>

                        <TableContainer component={Paper} sx={{ mt: 2, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.orphan_war_room.col_ticket')}</TableCell>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.orphan_war_room.col_status')}</TableCell>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.orphan_war_room.col_before_after')}</TableCell>
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
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#60A5FA' }}>{t('admin.orphan_war_room.geo_title')}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>
                            {t('admin.orphan_war_room.geo_desc')}
                        </Typography>
                    </Box>
                    <Chip label={t('admin.orphan_war_room.geo_chip').replace('{count}', String(geoRepairItems.length))} sx={{ bgcolor: 'rgba(59,130,246,0.12)', color: '#93c5fd', fontWeight: 950 }} />
                </Stack>
                {geoRepairItems.length > 0 && (
                    <TableContainer component={Paper} sx={{ mt: 2, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: '#93c5fd', fontWeight: 950 }}>{t('admin.orphan_war_room.col_property')}</TableCell>
                                    <TableCell sx={{ color: '#93c5fd', fontWeight: 950 }}>{t('admin.orphan_war_room.col_legacy_source')}</TableCell>
                                    <TableCell align="right" sx={{ color: '#93c5fd', fontWeight: 950 }}>{t('admin.orphan_war_room.col_action')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {geoRepairItems.slice(0, 10).map((property) => {
                                    const hasLegacyCoords = !!(property.location?.lat || property.coordinates?.lat);
                                    return (
                                        <TableRow key={property.id}>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 800 }}>{property.name || property.propertyName || property.id}</TableCell>
                                            <TableCell sx={{ color: hasLegacyCoords ? '#10b981' : '#f59e0b', fontWeight: 900 }}>
                                                {hasLegacyCoords ? t('admin.orphan_war_room.legacy_coords_avail') : t('admin.orphan_war_room.map_pin_required')}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button size="small" variant="outlined" disabled={!hasLegacyCoords} onClick={() => repairLegacyGeo(property)} sx={{ borderColor: '#93c5fd', color: '#93c5fd', fontWeight: 900 }}>
                                                    {t('admin.orphan_war_room.repair_geo_btn')}
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
                    <Typography variant="h4" fontWeight="950" color="#10b981">{t('admin.orphan_war_room.system_nominal')}</Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mt: 2 }}>{t('admin.orphan_war_room.no_orphans_desc')}</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    <Grid item xs={12}>
                        <Alert severity="warning" variant="filled" sx={{ fontWeight: 900, borderRadius: 2, mb: 4 }}>
                            {t('admin.orphan_war_room.dispatch_nodes_warning').replace('{count}', String(orphans.length))}
                        </Alert>
                        
                        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Table>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>{t('admin.orphan_war_room.col_fault_type')}</TableCell>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>{t('admin.orphan_war_room.col_description')}</TableCell>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>{t('admin.orphan_war_room.col_submitted_by')}</TableCell>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 900 }}>{t('admin.orphan_war_room.col_timestamp')}</TableCell>
                                        <TableCell align="right" sx={{ color: '#ef4444', fontWeight: 900 }}>{t('admin.orphan_war_room.col_protocol')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {orphans.map((o) => (
                                        <TableRow key={o.id} hover>
                                            <TableCell><Chip label={o.type} size="small" color="error" sx={{ fontWeight: 900 }} /></TableCell>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{o.description}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{o.tenantName || o.tenantEmail || t('admin.orphan_war_room.anonymous_label')}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>{o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : t('admin.orphan_war_room.na_label')}</TableCell>
                                            <TableCell align="right">
                                                <Button 
                                                    variant="contained" 
                                                    color="error" 
                                                    startIcon={<LinkIcon size={16} />}
                                                    onClick={() => setSelectedOrphan(o)}
                                                    sx={{ fontWeight: 950 }}
                                                >
                                                    {t('admin.orphan_war_room.bind_node_btn')}
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
                <DialogTitle sx={{ fontWeight: 900 }}>{t('admin.orphan_war_room.dialog_title')}</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Typography variant="body2" color="textSecondary">{t('admin.orphan_war_room.dialog_desc')}</Typography>
                        <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)' }}>
                            <Typography variant="caption" fontWeight="900" color="error">{t('admin.orphan_war_room.orphan_node_label')}</Typography>
                            <Typography variant="body1" fontWeight="700">{selectedOrphan?.description}</Typography>
                        </Paper>

                        <FormControl fullWidth size="small">
                            <InputLabel>{t('admin.orphan_war_room.target_property_label')}</InputLabel>
                            <Select value={targetPropId} label={t('admin.orphan_war_room.target_property_label')} onChange={(e) => { setTargetPropId(e.target.value); setTargetUnitId(''); }}>
                                {properties.map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName}</MenuItem>)}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth size="small" disabled={!targetPropId}>
                            <InputLabel>{t('admin.orphan_war_room.target_unit_label')}</InputLabel>
                            <Select value={targetUnitId} label={t('admin.orphan_war_room.target_unit_label')} onChange={(e) => setTargetUnitId(e.target.value)}>
                                {units.filter(u => u.propertyId === targetPropId).map(u => (
                                    <MenuItem key={u.id} value={u.id}>{t('admin.orphan_war_room.unit_menu_label').replace('{number}', u.unitNumber)}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setSelectedOrphan(null)} sx={{ fontWeight: 900 }}>{t('admin.orphan_war_room.cancel_btn')}</Button>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!targetUnitId || fixing === selectedOrphan?.id}
                        onClick={handleRepair}
                        sx={{ borderRadius: 100, fontWeight: 900 }}
                    >
                        {fixing === selectedOrphan?.id ? <CircularProgress size={20} /> : t('admin.orphan_war_room.secure_linkage_btn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
