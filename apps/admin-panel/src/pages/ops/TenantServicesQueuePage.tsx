import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, alpha
} from '@mui/material';
import {
    CheckCircle2, XCircle, Search, Filter, MessageSquare, Car, Key, Package, Store
} from 'lucide-react';
import { db, collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function TenantServicesQueuePage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<any[]>([]);

    useEffect(() => {
        const collections = [
            { name: 'tenant_services_requests', type: 'service' },
            { name: 'gatePasses', type: 'visitor_parking' }, // gatePass uses similar icon
            { name: 'visitorParkingRequests', type: 'visitor_parking' }
        ];

        let unsubscribes: any[] = [];
        const stateMap = new Map();

        const updateState = () => {
            const allDocs = Array.from(stateMap.values()).flat();
            allDocs.sort((a, b) => {
                const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return tb - ta;
            });
            setRequests(allDocs);
            setLoading(false);
        };

        collections.forEach(col => {
            const q = query(collection(db, col.name), orderBy('createdAt', 'desc'));
            const unsub = onSnapshot(q, (snap) => {
                stateMap.set(col.name, snap.docs.map(d => ({ 
                    id: d.id, 
                    _collection: col.name,
                    _mappedType: col.type,
                    ...d.data() 
                })));
                updateState();
            }, (err) => {
                console.error(`Failed to load ${col.name}:`, err);
                if (collections.indexOf(col) === collections.length - 1) setLoading(false);
            });
            unsubscribes.push(unsub);
        });

        return () => unsubscribes.forEach(fn => fn());
    }, []);

    const handleAction = async (item: any, action: 'approved' | 'rejected') => {
        try {
            await updateDoc(doc(db, item._collection || 'tenant_services_requests', item.id), {
                status: action,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to update request:', err);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'visitor_parking': return <Car size={18} />;
            case 'key_handover': return <Key size={18} />;
            case 'parcel': return <Package size={18} />;
            case 'marketplace': return <Store size={18} />;
            default: return <MessageSquare size={18} />;
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <AdminPageFrame title="Tenant Services Queue">
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h5" color="#FFF" fontWeight="950">Tenant Services Operations</Typography>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Filter size={18} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>Filter</Button>
                    <Button variant="outlined" startIcon={<Search size={18} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>Search</Button>
                </Stack>
            </Box>

            <Grid container spacing={3}>
                {requests.map(req => (
                    <Grid item xs={12} md={6} key={req.id}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                                        {getIcon(req.type)}
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle1" color="#FFF" fontWeight="bold">
                                            {req.title || String(req.type || '').toUpperCase()}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {req.tenantName || 'Unknown Tenant'} • Unit {req.unitNumber || 'N/A'}
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
                            <Typography variant="body2" color="rgba(255,255,255,0.7)" sx={{ mb: 3 }}>
                                {req.description || 'No additional details provided.'}
                            </Typography>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 2 }} />
                            
                            {req.status === 'pending' || !req.status ? (
                                <Stack direction="row" spacing={2} justifyContent="flex-end">
                                    <Button onClick={() => handleAction(req, 'rejected')} color="error" startIcon={<XCircle size={18} />}>
                                        REJECT
                                    </Button>
                                    <Button onClick={() => handleAction(req, 'approved')} sx={{ color: '#10b981' }} startIcon={<CheckCircle2 size={18} />}>
                                        APPROVE
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
                            <Typography color="text.secondary">No pending tenant service requests.</Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>
        </AdminPageFrame>
    );
}
