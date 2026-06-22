import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton } from '@mui/material';
import { Check, X } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, onSnapshot, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import SafeIcon from '../../components/SafeIcon';

export default function VisitorParkingPage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<any[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'visitorParkingRequests'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setRequests(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleUpdateStatus = async (id: string, status: string) => {
        try {
            await updateDoc(doc(db, 'visitorParkingRequests', id), {
                status,
                approvedBy: 'Admin Operator',
                approvedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to update request:', err);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Visitor Parking Approvals</Typography>
                <Typography variant="body2" color="text.secondary">Review and approve tenant visitor vehicle gate access requests.</Typography>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                    <TableCell>Visitor / Vehicle</TableCell>
                                    <TableCell>Tenant / Unit</TableCell>
                                    <TableCell>Duration</TableCell>
                                    <TableCell>Pass Code</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {requests.map((r) => (
                                    <TableRow key={r.id} hover>
                                        <TableCell sx={{ fontWeight: 'bold', color: '#FFF' }}>
                                            <Typography variant="subtitle2" color="#FFF" fontWeight="bold">{r.visitorName}</Typography>
                                            <Typography variant="caption" color="textSecondary">Plate: {r.vehiclePlate}</Typography>
                                        </TableCell>
                                        <TableCell>{r.tenantUid} (Unit {r.unitId})</TableCell>
                                        <TableCell>
                                            {r.visitStartAt ? new Date(r.visitStartAt).toLocaleString() : ''} - {r.visitEndAt ? new Date(r.visitEndAt).toLocaleString() : ''}
                                        </TableCell>
                                        <TableCell>{r.passCode || '—'}</TableCell>
                                        <TableCell>
                                            <Chip label={r.status?.toUpperCase()} size="small" color={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'error'} />
                                        </TableCell>
                                        <TableCell align="right">
                                            {r.status === 'pending' && (
                                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                    <IconButton size="small" color="success" onClick={() => handleUpdateStatus(r.id, 'approved')}>
                                                        <SafeIcon icon={Check} size={16} />
                                                    </IconButton>
                                                    <IconButton size="small" color="error" onClick={() => handleUpdateStatus(r.id, 'rejected')}>
                                                        <SafeIcon icon={X} size={16} />
                                                    </IconButton>
                                                </Stack>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {requests.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                            <Typography color="textSecondary">No visitor parking requests registered.</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </Container>
    );
}
