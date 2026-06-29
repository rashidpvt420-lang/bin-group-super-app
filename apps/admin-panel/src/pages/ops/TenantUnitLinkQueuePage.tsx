import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, alpha
} from '@mui/material';
import {
    CheckCircle2, XCircle, Search, Filter, Link, Home
} from 'lucide-react';
import { db, collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, writeBatch } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import { useAuth } from '../../context/AuthContext';

export default function TenantUnitLinkQueuePage() {
    const { isRTL } = useLanguage();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<any[]>([]);
    const [notice, setNotice] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'tenant_unit_link_requests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error('Failed to load unit requests:', err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAction = async (req: any, action: 'approved' | 'rejected') => {
        try {
            setNotice('');
            const requestRef = doc(db, 'tenant_unit_link_requests', req.id);
            const now = serverTimestamp();
            const actorId = user?.uid || 'admin';

            if (action === 'approved') {
                let targetUnitId = String(req.candidateUnitId || '').trim();
                if (!targetUnitId && req.propertyId && req.unitNumber) {
                    const snap = await getDocs(query(
                        collection(db, 'units'),
                        where('propertyId', '==', req.propertyId),
                        where('unitNumber', '==', req.unitNumber)
                    ));
                    if (!snap.empty) targetUnitId = snap.docs[0].id;
                }

                if (!targetUnitId || !req.propertyId) {
                    setNotice('Cannot approve safely: no existing unit match was found. Create/repair the unit first, then approve the request.');
                    return;
                }

                const tenantId = req.tenantUid || req.tenantId;
                const unitPayload = {
                    tenantId,
                    tenantUid: tenantId,
                    tenantEmail: req.tenantEmail || '',
                    tenantName: req.tenantName || '',
                    occupancyStatus: 'occupied',
                    tenantStatus: 'linked',
                    status: 'OCCUPIED',
                    linkedBy: actorId,
                    linkedAt: now,
                    updatedAt: now,
                };

                const batch = writeBatch(db);
                batch.update(requestRef, {
                    status: 'APPROVED',
                    verificationState: 'ADMIN_VERIFIED',
                    linkedUnitId: targetUnitId,
                    linkedAt: now,
                    updatedAt: now,
                    resolvedAt: now,
                    resolvedBy: actorId
                });
                batch.set(doc(db, 'units', targetUnitId), unitPayload, { merge: true });
                if (tenantId) {
                    batch.set(doc(db, 'users', tenantId), {
                        unitId: targetUnitId,
                        propertyId: req.propertyId,
                        tenantUnitLinkVerified: true,
                        tenantUnitLinkedAt: now,
                        updatedAt: now,
                    }, { merge: true });
                }
                batch.set(doc(collection(db, 'audit_logs')), {
                    action: 'ADMIN_APPROVED_TENANT_UNIT_LINK',
                    actorId,
                    actorRole: 'admin',
                    targetType: 'tenant_unit_link_requests',
                    targetId: req.id,
                    metadata: { ...unitPayload, propertyId: req.propertyId, unitId: targetUnitId },
                    createdAt: now
                });
                await batch.commit();
                setNotice('Tenant unit link approved and attached to the existing unit.');
            } else {
                await updateDoc(requestRef, {
                    status: 'REJECTED',
                    verificationState: 'ADMIN_REJECTED',
                    updatedAt: now,
                    resolvedAt: now,
                    resolvedBy: actorId
                });
                setNotice('Tenant unit link request rejected.');
            }
        } catch (err) {
            console.error('Failed to update request:', err);
            setNotice('Failed to update tenant unit link request.');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <AdminPageFrame title="Tenant Unit-Link Requests">
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5" color="#FFF" fontWeight="950">Unit Linking Queue</Typography>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Filter size={18} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>Filter</Button>
                    <Button variant="outlined" startIcon={<Search size={18} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>Search</Button>
                </Stack>
            </Box>
            {notice && <Paper sx={{ p: 2, mb: 3, bgcolor: alpha(binThemeTokens.gold, 0.08), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, color: '#FFF' }}>{notice}</Paper>}

            <Grid container spacing={3}>
                {requests.map(req => (
                    <Grid item xs={12} md={6} key={req.id}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                                        <Home size={24} />
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle1" color="#FFF" fontWeight="bold">
                                            {req.tenantName || req.tenantEmail || 'Unknown Tenant'}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Requested Unit: {req.unitNumber || 'N/A'}
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Chip 
                                    label={req.status || 'PENDING'} 
                                    size="small" 
                                    sx={{ 
                                        bgcolor: req.status === 'approved' ? alpha('#10b981', 0.2) : req.status === 'rejected' ? alpha('#ef4444', 0.2) : alpha(binThemeTokens.gold, 0.2), 
                                        color: req.status === 'approved' ? '#10b981' : req.status === 'rejected' ? '#ef4444' : binThemeTokens.gold,
                                        fontWeight: 'bold' 
                                    }} 
                                />
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 2 }} />
                            
                            {req.status === 'PENDING_ADMIN_REVIEW' || req.status === 'pending' || !req.status ? (
                                <Stack direction="row" spacing={2} justifyContent="flex-end">
                                    <Button onClick={() => handleAction(req, 'rejected')} color="error" startIcon={<XCircle size={18} />}>
                                        REJECT
                                    </Button>
                                    <Button onClick={() => handleAction(req, 'approved')} sx={{ color: '#10b981' }} startIcon={<CheckCircle2 size={18} />}>
                                        APPROVE & LINK
                                    </Button>
                                </Stack>
                            ) : (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'right' }}>
                                    Processed
                                </Typography>
                            )}
                        </Paper>
                    </Grid>
                ))}
                {requests.length === 0 && (
                    <Grid item xs={12}>
                        <Box sx={{ p: 5, textAlign: 'center' }}>
                            <Link size={48} color={binThemeTokens.gold} style={{ opacity: 0.5, marginBottom: 16 }} />
                            <Typography color="text.secondary">No pending unit linking requests.</Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>
        </AdminPageFrame>
    );
}
