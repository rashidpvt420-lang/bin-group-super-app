import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Stack, Avatar, CircularProgress, Chip, TextField, Button, Switch, FormControlLabel, Divider, Alert } from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { db, auth, doc, setDoc, getDoc, updateProfile, sendPasswordResetEmail, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { User, Phone, Mail, Wrench, Star, Clock, Save, KeyRound, MapPin } from 'lucide-react';

export default function TechnicianProfilePage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [techData, setTechData] = useState<any>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);

    const [displayName, setDisplayName] = useState('');
    const [phone, setPhone] = useState('');
    const [trade, setTrade] = useState('');
    const [serviceZone, setServiceZone] = useState('');
    const [emergencyName, setEmergencyName] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');
    const [isAvailable, setIsAvailable] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                const data = snap.exists() ? snap.data() : {};
                setTechData(data);
                setDisplayName(data.displayName || user.displayName || '');
                setPhone(data.phoneNumber || data.phone || user.phoneNumber || '');
                setTrade(data.trade || data.specialty || data.primaryTrade || 'General Maintenance');
                setServiceZone(data.serviceZone || data.zone || data.city || '');
                setEmergencyName(data.emergencyContact?.name || '');
                setEmergencyPhone(data.emergencyContact?.phone || '');
                setIsAvailable(data.isAvailable !== false);
            } catch (err) {
                console.error('Profile fetch failed:', err);
                setNotice({ type: 'error', text: 'Technician profile could not be loaded.' });
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user?.uid, user?.displayName, user?.phoneNumber]);

    const handleSave = async () => {
        if (!user?.uid) return;
        if (!displayName.trim()) {
            setNotice({ type: 'warning', text: 'Full name is required.' });
            return;
        }
        setUpdating(true);
        setNotice(null);
        try {
            if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: displayName.trim() });
            const payload = {
                uid: user.uid,
                email: user.email || techData?.email || '',
                role: techData?.role || 'technician',
                displayName: displayName.trim(),
                phoneNumber: phone.trim(),
                phone: phone.trim(),
                trade: trade.trim() || 'General Maintenance',
                specialty: trade.trim() || 'General Maintenance',
                serviceZone: serviceZone.trim(),
                emergencyContact: { name: emergencyName.trim(), phone: emergencyPhone.trim() },
                isAvailable,
                updatedAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
            setTechData((prev: any) => ({ ...prev, ...payload }));
            setNotice({ type: 'success', text: 'Technician profile updated successfully.' });
        } catch (err: any) {
            console.error('Update failed', err);
            setNotice({ type: 'error', text: err?.message || 'Failed to update technician profile.' });
        } finally {
            setUpdating(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!user?.email) {
            setNotice({ type: 'warning', text: 'No email is attached to this account.' });
            return;
        }
        setResetting(true);
        setNotice(null);
        try {
            await sendPasswordResetEmail(auth, user.email, { url: `${window.location.origin}/login?email=${encodeURIComponent(user.email)}&intendedRole=technician`, handleCodeInApp: false });
            setNotice({ type: 'success', text: 'Password reset email sent. Check inbox or spam folder.' });
        } catch (err: any) {
            setNotice({ type: 'error', text: err?.message || 'Could not send password reset email.' });
        } finally {
            setResetting(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    const score = techData?.qualityScore || techData?.rating || 'Pending';
    const sla = techData?.slaCompliance || techData?.slaScore || 'Pending';

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>Technician Profile</Typography>
            {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="center" sx={{ mb: 4 }}>
                    <Avatar sx={{ width: 100, height: 100, bgcolor: binThemeTokens.gold, color: '#000' }}>
                        {displayName?.charAt(0) || <User size={40} />}
                    </Avatar>
                    <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                        <Typography variant="h5" fontWeight="900" color="#FFF">{displayName || 'Technician'}</Typography>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Mail size={16} /><Typography variant="body2">{techData?.email || user?.email}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Wrench size={16} /><Typography variant="body2">{trade || 'General Maintenance'}</Typography>
                        </Stack>
                        {serviceZone && <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}><MapPin size={16} /><Typography variant="body2">{serviceZone}</Typography></Stack>}
                    </Box>
                </Stack>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">ACCOUNT STATUS</Typography><Box sx={{ mt: 1 }}><Chip label={(techData?.status || 'pending').toUpperCase()} color={techData?.status === 'active' ? 'success' : 'warning'} size="small" sx={{ fontWeight: 900 }} /></Box></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">QUALITY SCORE</Typography><Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, color: binThemeTokens.gold }}><Star size={18} fill={binThemeTokens.gold} /><Typography variant="body1" fontWeight="900" color="#FFF">{typeof score === 'number' ? `${score}/5` : score}</Typography></Stack></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">SLA COMPLIANCE</Typography><Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, color: '#4ade80' }}><Clock size={18} /><Typography variant="body1" fontWeight="900" color="#FFF">{typeof sla === 'number' ? `${sla}%` : sla}</Typography></Stack></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">DISPATCH</Typography><Box sx={{ mt: 1 }}><Chip label={isAvailable ? 'AVAILABLE' : 'OFF DUTY'} color={isAvailable ? 'success' : 'default'} size="small" sx={{ fontWeight: 900 }} /></Box></Grid>
                </Grid>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', my: 4 }} />

                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3 }}>Edit Details</Typography>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Full Name" value={displayName} onChange={e => setDisplayName(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.5)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.5)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Primary Trade" value={trade} onChange={e => setTrade(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.5)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Service Zone" value={serviceZone} onChange={e => setServiceZone(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.5)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Emergency Contact Name" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.5)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Emergency Contact Phone" value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,.5)' } }} /></Grid>
                    <Grid item xs={12} md={6} sx={{ display: 'flex', alignItems: 'center' }}><FormControlLabel control={<Switch checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} color="primary" />} label={<Typography color="#FFF" fontWeight="900">Available for Dispatch</Typography>} /></Grid>
                </Grid>
                
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="contained" startIcon={<Save size={17} />} onClick={handleSave} disabled={updating} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 4, py: 1.5 }}>{updating ? <CircularProgress size={24} color="inherit" /> : 'SAVE CHANGES'}</Button>
                    <Button variant="outlined" startIcon={<KeyRound size={17} />} onClick={handlePasswordReset} disabled={resetting} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, px: 4, py: 1.5 }}>{resetting ? 'SENDING...' : 'SEND PASSWORD RESET'}</Button>
                </Stack>
            </Paper>
        </Box>
    );
}
