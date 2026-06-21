import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Grid, Stack, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, IconButton } from '@mui/material';
import { Calendar, Check, X, Ban, ShieldAlert } from 'lucide-react';
import { db, collection, query, where, getDocs, updateDoc, doc, onSnapshot, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerAmenitiesPage() {
    const { user } = useRole();
    const { t, tx, isRTL } = useLanguage();
    const [properties, setProperties] = useState<any[]>([]);
    const [amenities, setAmenities] = useState<any[]>([]);
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;

        const fetchData = async () => {
            try {
                // Get owner property ids
                const qProp = query(collection(db, 'properties'), where('ownerId', '==', user.uid));
                const snapProp = await getDocs(qProp);
                const props = snapProp.docs.map(d => ({ id: d.id, ...d.data() }));
                setProperties(props);

                const propIds = props.map(p => p.id);
                if (propIds.length > 0) {
                    // Listen to amenities belonging to owner properties
                    const qAmen = query(collection(db, 'amenities'), where('propertyId', 'in', propIds));
                    const unsubAmen = onSnapshot(qAmen, (snap) => {
                        setAmenities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    });

                    // Listen to bookings belonging to owner properties
                    const qBook = query(collection(db, 'amenityBookings'), where('propertyId', 'in', propIds));
                    const unsubBook = onSnapshot(qBook, (snap) => {
                        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                        setBookings(list);
                        setLoading(false);
                    }, (err) => {
                        console.error(err);
                        setLoading(false);
                    });

                    return () => {
                        unsubAmen();
                        unsubBook();
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

    const handleUpdateBookingStatus = async (bookingId: string, status: string) => {
        try {
            await updateDoc(doc(db, 'amenityBookings', bookingId), {
                status,
                approvedAt: serverTimestamp(),
                approvedBy: user?.uid
            });
        } catch (err) {
            console.error("Failed to update booking status:", err);
        }
    };

    const handleToggleAmenityActive = async (amenityId: string, currentActive: boolean) => {
        try {
            await updateDoc(doc(db, 'amenities', amenityId), {
                active: !currentActive
            });
        } catch (err) {
            console.error("Failed to update amenity state:", err);
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
                    {tx('amenity.owner_subtitle', 'AMENITY CONTROL HUB')}
                </Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">
                    {tx('amenity.owner_title', 'Amenities & Bookings Overview')}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    {tx('amenity.owner_desc', 'Monitor shared assets, approve booking requests, and block slots for maintenance.')}
                </Typography>
            </Box>

            {properties.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Calendar size={48} color={binThemeTokens.gold} style={{ marginBottom: 16 }} />
                    <Typography variant="h5" color="#FFF" gutterBottom>No properties linked.</Typography>
                    <Typography variant="body2" color="textSecondary">Onboard a property to manage building amenities.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {/* Amenities Directory */}
                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="bold" color="#FFF" sx={{ mb: 4 }}>
                                {tx('amenity.list_title', 'Amenities Directory')}
                            </Typography>
                            <Stack spacing={2.5}>
                                {amenities.map((amen) => (
                                    <Box key={amen.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="subtitle1" color="#FFF" fontWeight="bold">{amen.name}</Typography>
                                                <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                                                    {amen.type?.toUpperCase()} · Max Capacity: {amen.capacity}
                                                </Typography>
                                            </Box>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                color={amen.active ? 'success' : 'error'}
                                                onClick={() => handleToggleAmenityActive(amen.id, amen.active)}
                                                sx={{ minWidth: 80, fontWeight: 'bold' }}
                                            >
                                                {amen.active ? 'ACTIVE' : 'BLOCKED'}
                                            </Button>
                                        </Stack>
                                    </Box>
                                ))}
                                {amenities.length === 0 && (
                                    <Typography color="textSecondary">No amenities created yet. Configure them via the Admin Panel.</Typography>
                                )}
                            </Stack>
                        </Paper>
                    </Grid>

                    {/* Bookings log */}
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="bold" color="#FFF" sx={{ mb: 4 }}>
                                {tx('amenity.bookings_title', 'Tenant Booking Log')}
                            </Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ '& th': { color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' } }}>
                                            <TableCell>Amenity</TableCell>
                                            <TableCell>Tenant</TableCell>
                                            <TableCell>Unit</TableCell>
                                            <TableCell>Date/Slot</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {bookings.map((b) => (
                                            <TableRow key={b.id}>
                                                <TableCell sx={{ color: '#FFF', fontWeight: 'bold' }}>{b.amenityName}</TableCell>
                                                <TableCell sx={{ color: '#FFF' }}>{b.tenantName || 'Tenant'}</TableCell>
                                                <TableCell>{b.unitId || '—'}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                                    {b.bookingDate} · {b.timeSlot}
                                                </TableCell>
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
                                                                <Check size={16} />
                                                            </IconButton>
                                                            <IconButton size="small" color="error" onClick={() => handleUpdateBookingStatus(b.id, 'rejected')}>
                                                                <X size={16} />
                                                            </IconButton>
                                                        </Stack>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {bookings.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                                                    <Typography color="textSecondary">No booking requests found.</Typography>
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
