import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Stack, Avatar, CircularProgress, Chip, TextField, Button, Switch, FormControlLabel } from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { db, doc, updateDoc, getDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { User, Phone, Mail, Wrench, Star, Clock } from 'lucide-react';

export default function TechnicianProfilePage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [techData, setTechData] = useState<any>(null);

    const [phone, setPhone] = useState('');
    const [isAvailable, setIsAvailable] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user?.uid) return;
            try {
                const docRef = doc(db, 'users', user.uid);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setTechData(data);
                    setPhone(data.phoneNumber || data.phone || '');
                    setIsAvailable(data.isAvailable !== false);
                }
            } catch (err) {
                console.error("Profile fetch failed:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [user]);

    const handleSave = async () => {
        if (!user?.uid) return;
        setUpdating(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                phoneNumber: phone,
                isAvailable: isAvailable
            });
            setTechData((prev: any) => ({ ...prev, phoneNumber: phone, isAvailable }));
            alert("Profile updated successfully");
        } catch (err) {
            console.error("Update failed", err);
            alert("Failed to update profile");
        } finally {
            setUpdating(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>Technician Profile</Typography>

            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="center" sx={{ mb: 4 }}>
                    <Avatar sx={{ width: 100, height: 100, bgcolor: binThemeTokens.gold, color: '#000' }}>
                        {techData?.displayName?.charAt(0) || <User size={40} />}
                    </Avatar>
                    <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                        <Typography variant="h5" fontWeight="900" color="#FFF">{techData?.displayName || 'Technician'}</Typography>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Mail size={16} />
                            <Typography variant="body2">{techData?.email}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Wrench size={16} />
                            <Typography variant="body2">{techData?.trade || 'General Maintenance'}</Typography>
                        </Stack>
                    </Box>
                </Stack>

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6} md={3}>
                        <Typography variant="caption" color="textSecondary">ACCOUNT STATUS</Typography>
                        <Box sx={{ mt: 1 }}><Chip label={techData?.status === 'active' ? 'APPROVED' : 'PENDING'} color={techData?.status === 'active' ? 'success' : 'warning'} size="small" sx={{ fontWeight: 900 }} /></Box>
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <Typography variant="caption" color="textSecondary">QUALITY SCORE</Typography>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, color: binThemeTokens.gold }}>
                            <Star size={18} fill={binThemeTokens.gold} />
                            <Typography variant="body1" fontWeight="900" color="#FFF">4.9/5</Typography>
                        </Stack>
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <Typography variant="caption" color="textSecondary">SLA COMPLIANCE</Typography>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1, color: '#4ade80' }}>
                            <Clock size={18} />
                            <Typography variant="body1" fontWeight="900" color="#FFF">98%</Typography>
                        </Stack>
                    </Grid>
                </Grid>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', my: 4 }} />

                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3 }}>Edit Details</Typography>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={6}>
                        <TextField 
                            fullWidth 
                            label="Phone Number" 
                            value={phone} 
                            onChange={e => setPhone(e.target.value)}
                            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }} 
                        />
                    </Grid>
                    <Grid item xs={12} md={6} sx={{ display: 'flex', alignItems: 'center' }}>
                        <FormControlLabel
                            control={<Switch checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} color="primary" />}
                            label={<Typography color="#FFF" fontWeight="900">Available for Dispatch</Typography>}
                        />
                    </Grid>
                </Grid>
                
                <Button 
                    variant="contained" 
                    onClick={handleSave} 
                    disabled={updating}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 4, py: 1.5 }}
                >
                    {updating ? <CircularProgress size={24} color="inherit" /> : 'SAVE CHANGES'}
                </Button>
            </Paper>
        </Box>
    );
}
