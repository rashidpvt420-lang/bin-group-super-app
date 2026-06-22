import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, Switch, FormControlLabel } from '@mui/material';
import { Plus } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function StaffDirectoryPage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [staff, setStaff] = useState<any[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [propertyId, setPropertyId] = useState('prop_a');
    const [displayName, setDisplayName] = useState('');
    const [role, setRole] = useState('concierge');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [shiftLabel, setShiftLabel] = useState('09:00 AM - 06:00 PM');
    const [emergencyContact, setEmergencyContact] = useState(false);
    const [visibleToTenants, setVisibleToTenants] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'staffDirectory'));
        const unsub = onSnapshot(q, (snap) => {
            setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'staffDirectory'), {
                propertyId,
                displayName: displayName.trim(),
                role,
                phone: phone.trim(),
                email: email.trim(),
                whatsapp: whatsapp.trim(),
                shiftLabel: shiftLabel.trim(),
                emergencyContact,
                visibleToTenants,
                active: true,
                createdAt: serverTimestamp()
            });
            setOpenAdd(false);
            setDisplayName('');
            setPhone('');
            setEmail('');
            setWhatsapp('');
        } catch (err) {
            console.error('Failed to add staff contact:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteStaff = async (id: string) => {
        if (!window.confirm('Delete staff contact?')) return;
        try {
            await deleteDoc(doc(db, 'staffDirectory', id));
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
                    <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Staff Contacts Directory</Typography>
                    <Typography variant="body2" color="text.secondary">Manage building contacts, emergency contacts, and toggle tenant visibility.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                    ADD STAFF CONTACT
                </Button>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                    <TableCell>Name / Role</TableCell>
                                    <TableCell>Shift Time</TableCell>
                                    <TableCell>Contact details</TableCell>
                                    <TableCell>Audience / State</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {staff.map((s) => (
                                    <TableRow key={s.id} hover>
                                        <TableCell sx={{ fontWeight: 'bold', color: '#FFF' }}>
                                            <Typography variant="subtitle2" color="#FFF" fontWeight="bold">{s.displayName}</Typography>
                                            <Typography variant="caption" color="textSecondary">{s.role?.toUpperCase()}</Typography>
                                        </TableCell>
                                        <TableCell>{s.shiftLabel}</TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{s.phone} {s.whatsapp && `(WA: ${s.whatsapp})`}</Typography>
                                            <Typography variant="caption" color="textSecondary">{s.email}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                {s.visibleToTenants && <Chip label="VISIBLE TO TENANTS" size="small" color="primary" />}
                                                {s.emergencyContact && <Chip label="EMERGENCY CONTACT" size="small" color="error" />}
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button size="small" color="error" onClick={() => handleDeleteStaff(s.id)}>DELETE</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {staff.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 8 }}>
                                            <Typography color="textSecondary">No staff contacts registered.</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>

            {/* Add Staff Contact Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateStaff}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Add Property Contact</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Contact Name" required value={displayName} onChange={e => setDisplayName(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Role</InputLabel>
                                <Select value={role} onChange={e => setRole(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    <MenuItem value="concierge">Concierge</MenuItem>
                                    <MenuItem value="security">Security Manager</MenuItem>
                                    <MenuItem value="maintenance">Maintenance Supervisor</MenuItem>
                                    <MenuItem value="property_manager">Property Manager</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Phone" required value={phone} onChange={e => setPhone(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="WhatsApp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Email" value={email} onChange={e => setEmail(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Shift Label (e.g. 24/7, Morning)" value={shiftLabel} onChange={e => setShiftLabel(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Property ID" required value={propertyId} onChange={e => setPropertyId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <Stack direction="row" spacing={4}>
                                <FormControlLabel control={<Switch checked={emergencyContact} onChange={e => setEmergencyContact(e.target.checked)} />} label="Emergency contact" />
                                <FormControlLabel control={<Switch checked={visibleToTenants} onChange={e => setVisibleToTenants(e.target.checked)} />} label="Visible to tenants" />
                            </Stack>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'ADD'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
