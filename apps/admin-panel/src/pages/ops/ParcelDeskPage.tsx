import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { Plus } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function ParcelDeskPage() {
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [parcels, setParcels] = useState<any[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [propertyId, setPropertyId] = useState('prop_a');
    const [unitId, setUnitId] = useState('unit_a');
    const [tenantUid, setTenantUid] = useState('tenant_a');
    const [recipientName, setRecipientName] = useState('');
    const [courierName, setCourierName] = useState('');
    const [trackingNumberMasked, setTrackingNumberMasked] = useState('');
    const [parcelType, setParcelType] = useState('package');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'parcels'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.receivedAt?.seconds || 0) - (a.receivedAt?.seconds || 0));
            setParcels(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleCreateParcel = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'parcels'), {
                propertyId,
                unitId,
                tenantUid,
                recipientName: recipientName.trim(),
                courierName: courierName.trim(),
                trackingNumberMasked: trackingNumberMasked.trim(),
                parcelType,
                status: 'received',
                receivedBy: 'Security Concierge',
                receivedAt: serverTimestamp(),
                notes
            });
            setOpenAdd(false);
            setRecipientName('');
            setCourierName('');
            setTrackingNumberMasked('');
            setNotes('');
        } catch (err) {
            console.error('Failed to log parcel:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReleaseParcel = async (parcelId: string) => {
        try {
            await updateDoc(doc(db, 'parcels', parcelId), {
                status: 'collected',
                collectedBy: 'Recipient Claim',
                collectedAt: serverTimestamp()
            });
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Parcel Desk Control</Typography>
                    <Typography variant="body2" color="text.secondary">Log incoming resident parcels and track collections.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                    LOG PARCEL
                </Button>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                    <TableCell>Recipient / Unit</TableCell>
                                    <TableCell>Courier / Tracking</TableCell>
                                    <TableCell>Logged Time</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {parcels.map((p) => (
                                    <TableRow key={p.id} hover>
                                        <TableCell>
                                            <Typography variant="subtitle2" color="#FFF" fontWeight="bold">{p.recipientName}</Typography>
                                            <Typography variant="caption" color="textSecondary">Unit {p.unitId} · {p.propertyId}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="#FFF">{p.courierName}</Typography>
                                            <Typography variant="caption" color="textSecondary">{p.trackingNumberMasked || '••••••••'}</Typography>
                                        </TableCell>
                                        <TableCell>{p.receivedAt?.toDate ? p.receivedAt.toDate().toLocaleString() : '—'}</TableCell>
                                        <TableCell>
                                            <Chip label={p.status?.toUpperCase()} size="small" color={p.status === 'collected' ? 'success' : 'warning'} />
                                        </TableCell>
                                        <TableCell align="right">
                                            {p.status !== 'collected' && (
                                                <Button size="small" variant="contained" color="success" onClick={() => handleReleaseParcel(p.id)}>
                                                    RELEASE
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {parcels.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                                            <Typography color="textSecondary">No parcels logged.</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>

            {/* Log Parcel Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateParcel}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Log Received Parcel</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Recipient Name" required value={recipientName} onChange={e => setRecipientName(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Courier (e.g. Aramex, DHL)" required value={courierName} onChange={e => setCourierName(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Tracking Number (Masked)" value={trackingNumberMasked} onChange={e => setTrackingNumberMasked(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Parcel Type</InputLabel>
                                        <Select value={parcelType} onChange={e => setParcelType(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="package">Package / Box</MenuItem>
                                            <MenuItem value="envelope">Envelope / Letter</MenuItem>
                                            <MenuItem value="grocery">Grocery / Food</MenuItem>
                                            <MenuItem value="other">Other</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField fullWidth label="Unit ID" required value={unitId} onChange={e => setUnitId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                                </Grid>
                            </Grid>
                            <TextField fullWidth label="Property ID" required value={propertyId} onChange={e => setPropertyId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Tenant User UID" required value={tenantUid} onChange={e => setTenantUid(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Notes" multiline rows={2} value={notes} onChange={e => setNotes(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'LOG'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
