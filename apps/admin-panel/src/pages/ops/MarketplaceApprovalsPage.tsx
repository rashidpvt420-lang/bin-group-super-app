import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { db, collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function MarketplaceApprovalsPage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [providers, setProviders] = useState<any[]>([]);
    const [offers, setOffers] = useState<any[]>([]);
    const [openAddProvider, setOpenAddProvider] = useState(false);
    const [openAddOffer, setOpenAddOffer] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Provider fields
    const [name, setName] = useState('');
    const [category, setCategory] = useState('cleaning');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [email, setEmail] = useState('');
    const [serviceAreas, setServiceAreas] = useState('Dubai');

    // Offer fields
    const [providerId, setProviderId] = useState('');
    const [offerTitle, setOfferTitle] = useState('');
    const [offerDesc, setOfferDesc] = useState('');
    const [discountText, setDiscountText] = useState('');

    useEffect(() => {
        const unsubProv = onSnapshot(collection(db, 'marketplaceProviders'), (snap) => {
            setProviders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        const unsubOff = onSnapshot(collection(db, 'marketplaceOffers'), (snap) => {
            setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubProv();
            unsubOff();
        };
    }, []);

    const handleCreateProvider = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'marketplaceProviders'), {
                name,
                category,
                description,
                phone,
                whatsapp,
                email,
                approved: true,
                approvedBy: 'Admin Operator',
                serviceAreas,
                ratingSummary: '4.8',
                createdAt: serverTimestamp()
            });
            setOpenAddProvider(false);
            setName('');
            setDescription('');
            setPhone('');
            setWhatsapp('');
            setEmail('');
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateOffer = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'marketplaceOffers'), {
                providerId,
                title: offerTitle,
                description: offerDesc,
                discountText,
                active: true,
                createdAt: serverTimestamp()
            });
            setOpenAddOffer(false);
            setOfferTitle('');
            setOfferDesc('');
            setDiscountText('');
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleApproveProvider = async (id: string, approved: boolean) => {
        try {
            await updateDoc(doc(db, 'marketplaceProviders', id), {
                approved,
                approvedBy: 'Admin Operator'
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
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Marketplace & Vendor Directory</Typography>
                    <Typography variant="body2" color="text.secondary">Moderate third-party local service providers and verified resident discounts.</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" onClick={() => setOpenAddProvider(true)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 'bold' }}>
                        ADD PROVIDER
                    </Button>
                    <Button variant="contained" onClick={() => setOpenAddOffer(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                        ADD OFFER
                    </Button>
                </Stack>
            </Box>

            <Grid container spacing={4}>
                {/* Providers */}
                <Grid item xs={12} lg={7}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                        <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 3 }}>Directory Providers</Typography>
                        <TableContainer>
                            <Table sx={{ '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                        <TableCell>Provider</TableCell>
                                        <TableCell>Category</TableCell>
                                        <TableCell>Contact</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {providers.map((p) => (
                                        <TableRow key={p.id} hover>
                                            <TableCell>
                                                <Typography variant="subtitle2" color="#FFF" fontWeight="bold">{p.name}</Typography>
                                                <Typography variant="caption" color="textSecondary">{p.serviceAreas}</Typography>
                                            </TableCell>
                                            <TableCell>{p.category?.toUpperCase()}</TableCell>
                                            <TableCell>{p.phone || p.email}</TableCell>
                                            <TableCell>
                                                <Chip label={p.approved ? 'APPROVED' : 'PENDING'} size="small" color={p.approved ? 'success' : 'warning'} />
                                            </TableCell>
                                            <TableCell align="right">
                                                {p.approved ? (
                                                    <Button size="small" color="error" onClick={() => handleApproveProvider(p.id, false)}>SUSPEND</Button>
                                                ) : (
                                                    <Button size="small" color="success" onClick={() => handleApproveProvider(p.id, true)}>APPROVE</Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* Offers */}
                <Grid item xs={12} lg={5}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                        <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 3 }}>Active Offers & Discounts</Typography>
                        <Stack spacing={2}>
                            {offers.map((offer) => {
                                const provider = providers.find(p => p.id === offer.providerId);
                                return (
                                    <Box key={offer.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="subtitle2" color={binThemeTokens.gold} fontWeight="bold">{offer.discountText}</Typography>
                                                <Typography variant="body2" color="#FFF" fontWeight="bold">{offer.title}</Typography>
                                                <Typography variant="caption" color="textSecondary">{offer.description}</Typography>
                                                {provider && <Typography variant="caption" display="block" color="textSecondary" sx={{ mt: 1 }}>By {provider.name}</Typography>}
                                            </Box>
                                        </Stack>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            {/* Add Provider Dialog */}
            <Dialog open={openAddProvider} onClose={() => setOpenAddProvider(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateProvider}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Register Vendor Provider</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Vendor Name" required value={name} onChange={e => setName(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                                <Select value={category} onChange={e => setCategory(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    <MenuItem value="cleaning">Cleaning Service</MenuItem>
                                    <MenuItem value="laundry">Laundry Care</MenuItem>
                                    <MenuItem value="moving">Moving / Packing</MenuItem>
                                    <MenuItem value="maintenance">Maintenance Corps</MenuItem>
                                    <MenuItem value="food">Food & Dining</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Description" multiline rows={2} value={description} onChange={e => setDescription(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Phone" value={phone} onChange={e => setPhone(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="WhatsApp Number" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Email" value={email} onChange={e => setEmail(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Service Areas (e.g. Dubai, Abu Dhabi)" value={serviceAreas} onChange={e => setServiceAreas(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAddProvider(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'REGISTER'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Add Offer Dialog */}
            <Dialog open={openAddOffer} onClose={() => setOpenAddOffer(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateOffer}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Add Resident Discount Offer</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Vendor Provider</InputLabel>
                                <Select value={providerId} onChange={e => setProviderId(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    {providers.map(p => (
                                        <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Discount Text (e.g. 20% OFF)" required value={discountText} onChange={e => setDiscountText(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Offer Title" required value={offerTitle} onChange={e => setOfferTitle(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Description" multiline rows={2} value={offerDesc} onChange={e => setOfferDesc(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAddOffer(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting || !providerId} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'CREATE OFFER'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
