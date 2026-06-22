import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, Switch, FormControlLabel, IconButton } from '@mui/material';
import { Check, X, Plus } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import SafeIcon from '../../components/SafeIcon';

export default function AmenityControlPage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [amenities, setAmenities] = useState<any[]>([]);
    const [bookings, setBookings] = useState<any[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [name, setName] = useState('');
    const [type, setType] = useState('gym');
    const [description, setDescription] = useState('');
    const [propertyId, setPropertyId] = useState('prop_a');
    const [capacity, setCapacity] = useState('10');
    const [requiresApproval, setRequiresApproval] = useState(false);

    useEffect(() => {
        // Listen to amenities
        const unsubAmen = onSnapshot(collection(db, 'amenities'), (snap) => {
            setAmenities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        // Listen to bookings
        const unsubBook = onSnapshot(collection(db, 'amenityBookings'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setBookings(list);
        });

        return () => {
            unsubAmen();
            unsubBook();
        };
    }, []);

    const handleCreateAmenity = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'amenities'), {
                name,
                type,
                description,
                propertyId,
                capacity: parseInt(capacity, 10),
                requiresApproval,
                active: true,
                createdAt: serverTimestamp()
            });
            setOpenAdd(false);
            setName('');
            setDescription('');
        } catch (err) {
            console.error('Failed to create amenity:', err);
            alert('Error creating amenity.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateBookingStatus = async (bookingId: string, status: string) => {
        try {
            await updateDoc(doc(db, 'amenityBookings', bookingId), {
                status,
                approvedAt: serverTimestamp(),
                approvedBy: 'Admin'
            });
        } catch (err) {
            console.error('Failed to update booking:', err);
        }
    };

    const handleDeleteAmenity = async (amenityId: string) => {
        if (!window.confirm('Delete this amenity?')) return;
        try {
            await deleteDoc(doc(db, 'amenities', amenityId));
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
                    <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Amenity Control</Typography>
                    <Typography variant="body2" color="text.secondary">Manage building amenities, slots, and tenant bookings.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                    ADD AMENITY
                </Button>
            </Box>

            <Grid container spacing={4}>
                {/* Amenities list */}
                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                        <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 3 }}>Amenities Directory</Typography>
                        <Stack spacing={2}>
                          {amenities.map(amen => (
                              <Box key={amen.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 2 }}>
                                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                                      <Box>
                                          <Typography variant="subtitle2" color="#FFF" fontWeight="bold">{amen.name}</Typography>
                                          <Typography variant="caption" color="textSecondary">{amen.type?.toUpperCase()} · Cap: {amen.capacity}</Typography>
                                      </Box>
                                      <Button size="small" color="error" onClick={() => handleDeleteAmenity(amen.id)}>DELETE</Button>
                                  </Stack>
                              </Box>
                          ))}
                        </Stack>
                    </Paper>
                </Grid>

                {/* Bookings list */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                        <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 3 }}>Amenity Bookings Log</Typography>
                        <TableContainer>
                            <Table sx={{ minWidth: 600, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                        <TableCell>Amenity</TableCell>
                                        <TableCell>Tenant</TableCell>
                                        <TableCell>Property / Unit</TableCell>
                                        <TableCell>Date / Slot</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {bookings.map((b) => (
                                        <TableRow key={b.id} hover>
                                            <TableCell sx={{ fontWeight: 'bold', color: '#FFF' }}>{b.amenityName}</TableCell>
                                            <TableCell>{b.tenantName || b.tenantUid}</TableCell>
                                            <TableCell>{b.propertyId} / {b.unitId || '—'}</TableCell>
                                            <TableCell>{b.bookingDate} · {b.timeSlot}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={(b.status || 'pending').toUpperCase()}
                                                    size="small"
                                                    color={b.status === 'approved' || b.status === 'booked' ? 'success' : b.status === 'pending' ? 'warning' : 'error'}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                {b.status === 'pending' && (
                                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                        <IconButton size="small" color="success" onClick={() => handleUpdateBookingStatus(b.id, 'approved')}>
                                                            <SafeIcon icon={Check} size={16} />
                                                        </IconButton>
                                                        <IconButton size="small" color="error" onClick={() => handleUpdateBookingStatus(b.id, 'rejected')}>
                                                            <SafeIcon icon={X} size={16} />
                                                        </IconButton>
                                                    </Stack>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {bookings.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                                <Typography color="textSecondary">No bookings logged yet.</Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>

            {/* Add Amenity Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateAmenity}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Create Building Amenity</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Amenity Name" required value={name} onChange={e => setName(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Amenity Type</InputLabel>
                                <Select value={type} onChange={e => setType(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    <MenuItem value="gym">Gymnasium</MenuItem>
                                    <MenuItem value="pool">Swimming Pool</MenuItem>
                                    <MenuItem value="hall">Resident Majlis / Hall</MenuItem>
                                    <MenuItem value="parking">Parking Space</MenuItem>
                                    <MenuItem value="meeting">Meeting Room</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Description" multiline rows={2} value={description} onChange={e => setDescription(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Property ID" required value={propertyId} onChange={e => setPropertyId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Capacity limit" required type="number" value={capacity} onChange={e => setCapacity(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControlLabel control={<Switch checked={requiresApproval} onChange={e => setRequiresApproval(e.target.checked)} />} label="Requires manual booking approval" />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'CREATE'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
