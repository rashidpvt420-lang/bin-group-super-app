import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, Switch, FormControlLabel, Alert } from '@mui/material';
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
    const [error, setError] = useState('');
    const [propertyId, setPropertyId] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [role, setRole] = useState('concierge');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [shiftLabel, setShiftLabel] = useState('09:00 AM - 06:00 PM');
    const [emergencyContact, setEmergencyContact] = useState(false);
    const [visibleToTenants, setVisibleToTenants] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, 'staffDirectory')), (snap) => {
            setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            setError(String(err?.message || err));
            setLoading(false);
        });
        return unsub;
    }, []);

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!propertyId.trim()) { setError('Select or enter a real property ID. Property contacts cannot use a placeholder property.'); return; }
        setSubmitting(true); setError('');
        try {
            await addDoc(collection(db, 'staffDirectory'), {
                propertyId: propertyId.trim(), displayName: displayName.trim(), role,
                phone: phone.trim(), email: email.trim(), whatsapp: whatsapp.trim(),
                shiftLabel: shiftLabel.trim(), emergencyContact, visibleToTenants,
                active: true, directoryType: 'PROPERTY_CONTACT', createdAt: serverTimestamp(),
            });
            setOpenAdd(false); setDisplayName(''); setPhone(''); setEmail(''); setWhatsapp(''); setPropertyId('');
        } catch (err: any) { setError(err?.message || 'Failed to add property contact.'); }
        finally { setSubmitting(false); }
    };

    const handleDeleteStaff = async (id: string) => {
        if (!window.confirm('Delete this property contact? This does not delete any employee account.')) return;
        try { await deleteDoc(doc(db, 'staffDirectory', id)); }
        catch (err: any) { setError(err?.message || 'Failed to delete property contact.'); }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2, flexWrap: 'wrap' }}>
                <Box><Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Property Contacts Directory</Typography><Typography variant="body2" color="text.secondary">Building-facing contacts only. Employee/Technician identities must be created from HR Command → Staff Access.</Typography></Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>ADD PROPERTY CONTACT</Button>
            </Box>
            <Alert severity="info" sx={{ mb: 3 }}>This directory does not create Firebase Auth users, HR profiles, payroll identities or Technician accounts.</Alert>
            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            <Grid container spacing={4}><Grid item xs={12}><TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}><Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}><TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}><TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}><TableCell>Name / Role</TableCell><TableCell>Property</TableCell><TableCell>Shift</TableCell><TableCell>Contact</TableCell><TableCell>Audience / State</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{staff.map((s) => <TableRow key={s.id} hover><TableCell><Typography variant="subtitle2" color="#FFF" fontWeight="bold">{s.displayName}</Typography><Typography variant="caption" color="textSecondary">{s.role?.toUpperCase()}</Typography></TableCell><TableCell>{s.propertyId}</TableCell><TableCell>{s.shiftLabel}</TableCell><TableCell><Typography variant="body2">{s.phone} {s.whatsapp && `(WA: ${s.whatsapp})`}</Typography><Typography variant="caption" color="textSecondary">{s.email}</Typography></TableCell><TableCell><Stack direction="row" spacing={1}>{s.visibleToTenants && <Chip label="VISIBLE TO TENANTS" size="small" color="primary" />}{s.emergencyContact && <Chip label="EMERGENCY CONTACT" size="small" color="error" />}</Stack></TableCell><TableCell align="right"><Button size="small" color="error" onClick={() => void handleDeleteStaff(s.id)}>DELETE CONTACT</Button></TableCell></TableRow>)}{staff.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8 }}><Typography color="textSecondary">No property contacts registered.</Typography></TableCell></TableRow>}</TableBody></Table></TableContainer></Grid></Grid>

            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}><form onSubmit={handleCreateStaff}><DialogTitle sx={{ fontWeight: 'bold' }}>Add Property Contact</DialogTitle><DialogContent><Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}><TextField fullWidth label="Property ID" required value={propertyId} onChange={e => setPropertyId(e.target.value)} /><TextField fullWidth label="Contact Name" required value={displayName} onChange={e => setDisplayName(e.target.value)} /><FormControl fullWidth><InputLabel>Role</InputLabel><Select value={role} label="Role" onChange={e => setRole(e.target.value)}><MenuItem value="concierge">Concierge</MenuItem><MenuItem value="security">Security Manager</MenuItem><MenuItem value="maintenance">Maintenance Supervisor</MenuItem><MenuItem value="property_manager">Property Manager</MenuItem></Select></FormControl><TextField fullWidth label="Phone" required value={phone} onChange={e => setPhone(e.target.value)} /><TextField fullWidth label="WhatsApp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} /><TextField fullWidth label="Email" value={email} onChange={e => setEmail(e.target.value)} /><TextField fullWidth label="Shift Label" value={shiftLabel} onChange={e => setShiftLabel(e.target.value)} /><Stack direction="row" spacing={4}><FormControlLabel control={<Switch checked={emergencyContact} onChange={e => setEmergencyContact(e.target.checked)} />} label="Emergency contact" /><FormControlLabel control={<Switch checked={visibleToTenants} onChange={e => setVisibleToTenants(e.target.checked)} />} label="Visible to tenants" /></Stack></Stack></DialogContent><DialogActions><Button onClick={() => setOpenAdd(false)}>CANCEL</Button><Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>{submitting ? <CircularProgress size={20} color="inherit" /> : 'ADD CONTACT'}</Button></DialogActions></form></Dialog>
        </Container>
    );
}
