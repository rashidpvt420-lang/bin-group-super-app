import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControl, FormControlLabel, Grid, InputLabel, MenuItem, Paper, Select, Stack, Switch, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { Plus } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { addDoc, collection, db, deleteDoc, doc, onSnapshot, query, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type Property = { id: string; name: string };

export default function StaffDirectoryPage() {
    const { isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [contacts, setContacts] = useState<any[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null);
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
        const unsubContacts = onSnapshot(query(collection(db, 'staffDirectory')), (snap) => {
            setContacts(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
            setLoading(false);
        }, (error) => { setNotice({ error: true, message: `Property contact sync failed: ${error.message}` }); setLoading(false); });
        const unsubProperties = onSnapshot(query(collection(db, 'properties')), (snap) => {
            setProperties(snap.docs.map((entry) => {
                const data = entry.data();
                return { id: entry.id, name: data.propertyName || data.name || data.buildingName || entry.id };
            }).sort((a, b) => a.name.localeCompare(b.name)));
        }, (error) => setNotice({ error: true, message: `Property selector sync failed: ${error.message}` }));
        return () => { unsubContacts(); unsubProperties(); };
    }, []);

    const propertyById = useMemo(() => new Map(properties.map((property) => [property.id, property.name])), [properties]);

    const resetForm = () => {
        setPropertyId(''); setDisplayName(''); setRole('concierge'); setPhone(''); setEmail(''); setWhatsapp('');
        setShiftLabel('09:00 AM - 06:00 PM'); setEmergencyContact(false); setVisibleToTenants(true);
    };

    const handleCreateContact = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!propertyId) { setNotice({ error: true, message: 'Choose a real property before adding a contact.' }); return; }
        setSubmitting(true); setNotice(null);
        try {
            await addDoc(collection(db, 'staffDirectory'), {
                propertyId, displayName: displayName.trim(), role, phone: phone.trim(), email: email.trim(),
                whatsapp: whatsapp.trim(), shiftLabel: shiftLabel.trim(), emergencyContact, visibleToTenants,
                active: true, directoryType: 'PROPERTY_CONTACT', createdAt: serverTimestamp(),
            });
            setOpenAdd(false); resetForm();
            setNotice({ error: false, message: 'Property contact added. No employee login, Auth claims or HR profile were created.' });
        } catch (error: any) { setNotice({ error: true, message: `Unable to add property contact: ${error?.message || error}` }); }
        finally { setSubmitting(false); }
    };

    const handleDeleteContact = async (id: string) => {
        if (!window.confirm('Delete this property contact card? This does not affect any employee identity.')) return;
        try { await deleteDoc(doc(db, 'staffDirectory', id)); setNotice({ error: false, message: 'Property contact card deleted.' }); }
        catch (error: any) { setNotice({ error: true, message: `Unable to delete property contact: ${error?.message || error}` }); }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
                <Box><Typography variant="h4" fontWeight={950} color="#fff">Property Contacts Directory</Typography><Typography variant="body2" color="text.secondary">Building-facing concierge, security, maintenance supervisor and property-manager contact cards. This is not employee registration.</Typography></Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>ADD PROPERTY CONTACT</Button>
            </Stack>
            <Alert severity="info" sx={{ mb: 3 }}>Employee accounts belong in HR Command → Staff Registry → Register Staff. Entries here have no Firebase Auth user, custom claims, HR profile, payroll identity or technician identity.</Alert>
            {notice && <Alert severity={notice.error ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice.message}</Alert>}

            <Grid container spacing={4}><Grid item xs={12}><TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}><Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}><TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}><TableRow sx={{ '& th': { color: '#fff', fontWeight: 900 } }}><TableCell>Property</TableCell><TableCell>Name / Contact Role</TableCell><TableCell>Shift</TableCell><TableCell>Contact details</TableCell><TableCell>Audience / State</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>
                {contacts.map((contact) => <TableRow key={contact.id} hover><TableCell><Typography variant="body2" fontWeight={800} color="#fff">{propertyById.get(contact.propertyId) || contact.propertyId || 'Unassigned property'}</Typography></TableCell><TableCell><Typography variant="subtitle2" color="#fff" fontWeight={800}>{contact.displayName}</Typography><Typography variant="caption" color="text.secondary">{String(contact.role || '').replace(/_/g, ' ').toUpperCase()}</Typography></TableCell><TableCell>{contact.shiftLabel}</TableCell><TableCell><Typography variant="body2">{contact.phone} {contact.whatsapp && `(WA: ${contact.whatsapp})`}</Typography><Typography variant="caption" color="text.secondary">{contact.email}</Typography></TableCell><TableCell><Stack direction="row" spacing={1} flexWrap="wrap">{contact.visibleToTenants && <Chip label="VISIBLE TO TENANTS" size="small" color="primary" />}{contact.emergencyContact && <Chip label="EMERGENCY CONTACT" size="small" color="error" />}</Stack></TableCell><TableCell align="right"><Button size="small" color="error" onClick={() => handleDeleteContact(contact.id)}>DELETE CONTACT</Button></TableCell></TableRow>)}
                {contacts.length === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8 }}><Typography color="text.secondary">No property contacts registered.</Typography></TableCell></TableRow>}
            </TableBody></Table></TableContainer></Grid></Grid>

            <Dialog open={openAdd} onClose={() => !submitting && setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#fff', borderRadius: 4 } }} fullWidth maxWidth="sm"><form onSubmit={handleCreateContact}><DialogTitle sx={{ fontWeight: 900 }}>Add Property Contact</DialogTitle><DialogContent><Stack spacing={2.5} sx={{ mt: 2 }}><FormControl fullWidth required><InputLabel>Property</InputLabel><Select value={propertyId} label="Property" onChange={(e) => setPropertyId(String(e.target.value))}>{properties.map((property) => <MenuItem key={property.id} value={property.id}>{property.name}</MenuItem>)}</Select></FormControl>{properties.length === 0 && <Alert severity="warning">No real properties are available. Create/onboard a property first; there is no hard-coded fallback property.</Alert>}<TextField fullWidth label="Contact Name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /><FormControl fullWidth><InputLabel>Contact role</InputLabel><Select value={role} label="Contact role" onChange={(e) => setRole(String(e.target.value))}><MenuItem value="concierge">Concierge</MenuItem><MenuItem value="security">Security Manager</MenuItem><MenuItem value="maintenance">Maintenance Supervisor</MenuItem><MenuItem value="property_manager">Property Manager</MenuItem></Select></FormControl><TextField fullWidth label="Phone" required value={phone} onChange={(e) => setPhone(e.target.value)} /><TextField fullWidth label="WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /><TextField fullWidth label="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><TextField fullWidth label="Shift label (e.g. 24/7, Morning)" value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><FormControlLabel control={<Switch checked={emergencyContact} onChange={(e) => setEmergencyContact(e.target.checked)} />} label="Emergency contact" /><FormControlLabel control={<Switch checked={visibleToTenants} onChange={(e) => setVisibleToTenants(e.target.checked)} />} label="Visible to tenants" /></Stack></Stack></DialogContent><DialogActions sx={{ p: 3 }}><Button onClick={() => setOpenAdd(false)} disabled={submitting}>CANCEL</Button><Button type="submit" variant="contained" disabled={submitting || properties.length === 0} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>{submitting ? <CircularProgress size={20} /> : 'ADD PROPERTY CONTACT'}</Button></DialogActions></form></Dialog>
        </Container>
    );
}
