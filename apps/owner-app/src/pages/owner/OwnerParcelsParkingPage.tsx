import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Grid, Stack, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, IconButton } from '@mui/material';
import { Package, Car, Check, X } from 'lucide-react';
import { db, collection, query, where, getDocs, onSnapshot, updateDoc, doc, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerParcelsParkingPage() {
    const { user } = useRole();
    const { t, tx, isRTL } = useLanguage();
    const [properties, setProperties] = useState<any[]>([]);
    const [parcels, setParcels] = useState<any[]>([]);
    const [parkingRequests, setParkingRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;

        const fetchData = async () => {
            try {
                // Get owner properties
                const qProp = query(collection(db, 'properties'), where('ownerId', '==', user.uid));
                const snapProp = await getDocs(qProp);
                const props = snapProp.docs.map(d => ({ id: d.id, ...d.data() }));
                setProperties(props);

                const propIds = props.map(p => p.id);
                if (propIds.length > 0) {
                    // Listen to parcels matching owner property ids
                    const qParcels = query(collection(db, 'parcels'), where('propertyId', 'in', propIds));
                    const unsubParcels = onSnapshot(qParcels, (snap) => {
                        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        list.sort((a: any, b: any) => (b.receivedAt?.seconds || 0) - (a.receivedAt?.seconds || 0));
                        setParcels(list);
                    });

                    // Listen to visitor parking requests matching owner property ids
                    const qParking = query(collection(db, 'visitorParkingRequests'), where('propertyId', 'in', propIds));
                    const unsubParking = onSnapshot(qParking, (snap) => {
                        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                        setParkingRequests(list);
                        setLoading(false);
                    }, (err) => {
                        console.error(err);
                        setLoading(false);
                    });

                    return () => {
                        unsubParcels();
                        unsubParking();
                    };
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    const handleUpdateParkingStatus = async (requestId: string, status: string) => {
        try {
            await updateDoc(doc(db, 'visitorParkingRequests', requestId), {
                status,
                approvedAt: serverTimestamp(),
                approvedBy: user?.uid
            });
        } catch (err) {
            console.error("Failed to update parking request:", err);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                    {tx('ops.owner_subtitle', 'BUILDING OPERATIONS MONITOR')}
                </Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">
                    {tx('ops.owner_title', 'Parcels & Visitor Parking Overview')}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    {tx('ops.owner_desc', 'Track incoming courier deliveries and authorize tenant visitor parking passes.')}
                </Typography>
            </Box>

            {properties.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Package size={48} color={binThemeTokens.gold} style={{ marginBottom: 16 }} />
                    <Typography variant="h5" color="#FFF" gutterBottom>No properties linked.</Typography>
                    <Typography variant="body2" color="textSecondary">Onboard a property to monitor logistics and parking.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {/* Parcels Log */}
                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="bold" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Package size={20} color={binThemeTokens.gold} />
                                {tx('ops.parcels_log', 'Building Parcel Desk Log')}
                            </Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ '& th': { color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' } }}>
                                            <TableCell>Recipient/Unit</TableCell>
                                            <TableCell>Courier</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {parcels.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell sx={{ color: '#FFF' }}>
                                                    <Typography variant="subtitle2" fontWeight="bold">{p.recipientName}</Typography>
                                                    <Typography variant="caption" color="textSecondary">Unit {p.unitId || '—'}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                                    {p.courierName}
                                                    <Typography variant="caption" display="block" color="textSecondary">{p.trackingNumberMasked}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>{p.parcelType}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={(p.status || 'received').toUpperCase()}
                                                        size="small"
                                                        color={p.status === 'collected' ? 'success' : p.status === 'notified' ? 'info' : 'warning'}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {parcels.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                                                    <Typography color="textSecondary">No parcels logged.</Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    {/* Visitor Parking Requests */}
                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="bold" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Car size={20} color={binThemeTokens.gold} />
                                {tx('ops.parking_requests', 'Visitor Parking Approvals')}
                            </Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ '& th': { color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' } }}>
                                            <TableCell>Visitor/Plate</TableCell>
                                            <TableCell>Unit</TableCell>
                                            <TableCell>Duration</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {parkingRequests.map((req) => (
                                            <TableRow key={req.id}>
                                                <TableCell sx={{ color: '#FFF' }}>
                                                    <Typography variant="subtitle2" fontWeight="bold">{req.visitorName}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{req.vehiclePlate}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>Unit {req.unitId || '—'}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                                    {req.visitStartAt ? new Date(req.visitStartAt).toLocaleDateString() : '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={(req.status || 'pending').toUpperCase()}
                                                        size="small"
                                                        color={req.status === 'approved' ? 'success' : req.status === 'pending' ? 'warning' : 'error'}
                                                    />
                                                </TableCell>
                                                <TableCell align="right">
                                                    {req.status === 'pending' && (
                                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                            <IconButton size="small" color="success" onClick={() => handleUpdateParkingStatus(req.id, 'approved')}>
                                                                <Check size={14} />
                                                            </IconButton>
                                                            <IconButton size="small" color="error" onClick={() => handleUpdateParkingStatus(req.id, 'rejected')}>
                                                                <X size={14} />
                                                            </IconButton>
                                                        </Stack>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {parkingRequests.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                                    <Typography color="textSecondary">No parking requests found.</Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                </Grid>
            )}
        </Container>
    );
}
