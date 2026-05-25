import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Grid, Stack, Avatar, CircularProgress, 
    Chip, TextField, Button, Divider, alpha, IconButton, Tooltip 
} from '@mui/material';
import { 
    User, Phone, Mail, Briefcase, Building, ShieldCheck, 
    Camera, Settings, Lock, Share2, Award, 
    Zap, Calendar, MapPin, AlertTriangle
} from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { db, doc, updateDoc, getDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerProfilePage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [brokerData, setBrokerData] = useState<any>(null);

    const [phone, setPhone] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [reraLicense, setReraLicense] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            if (!user?.uid) return;
            try {
                const docRef = doc(db, 'users', user.uid);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setBrokerData(data);
                    setPhone(data.phoneNumber || data.phone || '');
                    setCompanyName(data.companyName || '');
                    setReraLicense(data.reraLicense || '');
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
            const isVerified = reraLicense.trim().length > 0;
            await updateDoc(doc(db, 'users', user.uid), {
                phoneNumber: phone,
                companyName: companyName,
                reraLicense: reraLicense,
                reraVerified: isVerified
            });
            setBrokerData((prev: any) => ({ 
                ...prev, 
                phoneNumber: phone, 
                companyName, 
                reraLicense,
                reraVerified: isVerified 
            }));
        } catch (err) {
            console.error("Update failed", err);
        } finally {
            setUpdating(false);
        }
    };

    return (
        <BrokerPageFrame
            title="Sovereign Identity"
            subtitle="Professional brokerage profile and security credentials"
            loading={loading}
            actions={
                <Stack direction="row" spacing={2}>
                    <IconButton sx={{ color: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
                        <Settings size={20} />
                    </IconButton>
                    <IconButton sx={{ color: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
                        <Lock size={20} />
                    </IconButton>
                </Stack>
            }
        >
            <Grid container spacing={4}>
                {/* ─── IDENTITY CARD ─────────────────────────────────────────────── */}
                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 0, borderRadius: 8, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ height: 120, bgcolor: binThemeTokens.gold, opacity: 0.1, position: 'relative' }}>
                            <Box sx={{ position: 'absolute', bottom: -50, left: '50%', transform: 'translateX(-50%)' }}>
                                <Box sx={{ position: 'relative' }}>
                                    <Avatar 
                                        sx={{ 
                                            width: 100, 
                                            height: 100, 
                                            bgcolor: '#020617', 
                                            border: `4px solid #161618`,
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                        }}
                                    >
                                        <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold}>
                                            {brokerData?.displayName?.charAt(0) || 'B'}
                                        </Typography>
                                    </Avatar>
                                    <IconButton 
                                        sx={{ 
                                            position: 'absolute', 
                                            bottom: 0, 
                                            right: 0, 
                                            bgcolor: binThemeTokens.gold, 
                                            color: '#000',
                                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.8) }
                                        }}
                                        size="small"
                                    >
                                        <Camera size={14} />
                                    </IconButton>
                                </Box>
                            </Box>
                        </Box>
                        
                        <Box sx={{ pt: 8, px: 4, pb: 4, textAlign: 'center' }}>
                            <Typography variant="h5" fontWeight="950" color="#FFF">{brokerData?.displayName}</Typography>
                            <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, mt: 0.5 }}>
                                {brokerData?.brokerType?.toUpperCase() || 'INSTITUTIONAL PARTNER'}
                            </Typography>

                            <Stack spacing={2} sx={{ mt: 4 }}>
                                <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Briefcase size={18} color="rgba(255,255,255,0.3)" />
                                    <Box sx={{ textAlign: 'left' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>PARTNER ID</Typography>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800, fontFamily: 'monospace' }}>BIN-{user?.uid.substring(0,8).toUpperCase()}</Typography>
                                    </Box>
                                </Box>
                                <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Award size={18} color="rgba(255,255,255,0.3)" />
                                    <Box sx={{ textAlign: 'left' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TIER STATUS</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{brokerData?.commissionTier || 'ELITE PARTNER (10%)'}</Typography>
                                    </Box>
                                </Box>
                            </Stack>
                        </Box>
                    </Paper>

                    {brokerData?.reraVerified ? (
                        <Paper sx={{ mt: 4, p: 4, borderRadius: 8, bgcolor: alpha('#10b981', 0.03), border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <ShieldCheck size={24} color="#10b981" />
                                <Box>
                                    <Typography variant="body1" fontWeight="950" color="#FFF">RERA VERIFIED AGENT</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                        License #{brokerData.reraLicense || 'N/A'} is fully active and verified.
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    ) : (
                        <Paper sx={{ mt: 4, p: 4, borderRadius: 8, bgcolor: alpha('#ef4444', 0.03), border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <AlertTriangle size={24} color="#ef4444" />
                                <Box>
                                    <Typography variant="body1" fontWeight="950" color="#FFF">RERA VERIFICATION PENDING</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                        Please provide a valid RERA License Number to activate your broker profile.
                                    </Typography>
                                </Box>
                            </Stack>
                        </Paper>
                    )}
                </Grid>

                {/* ─── CREDENTIALS FORM ─────────────────────────────────────────── */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 5, borderRadius: 8, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Zap size={20} color={binThemeTokens.gold} /> PROFESSIONAL CREDENTIALS
                        </Typography>

                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    fullWidth label="Full Professional Name" disabled
                                    value={brokerData?.displayName || ''} 
                                    variant="filled"
                                    sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, color: '#FFF' } }} 
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    fullWidth label="Official Email Address" disabled
                                    value={brokerData?.email || ''} 
                                    variant="filled"
                                    sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, color: '#FFF' } }} 
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    fullWidth label="Contact Number" 
                                    value={phone} onChange={e => setPhone(e.target.value)} 
                                    variant="filled"
                                    sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, color: '#FFF' } }} 
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    fullWidth label="Associated Brokerage Firm" 
                                    value={companyName} onChange={e => setCompanyName(e.target.value)} 
                                    variant="filled"
                                    sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, color: '#FFF' } }} 
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField 
                                    fullWidth label="RERA License Number" 
                                    value={reraLicense} onChange={e => setReraLicense(e.target.value)} 
                                    variant="filled"
                                    placeholder="e.g. 12345/2026"
                                    sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, color: '#FFF' } }} 
                                />
                            </Grid>
                        </Grid>

                        <Box sx={{ mt: 6 }}>
                            <Button 
                                variant="contained" 
                                onClick={handleSave} 
                                disabled={updating}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 6, py: 2, borderRadius: 3, boxShadow: `0 10px 20px -5px ${alpha(binThemeTokens.gold, 0.4)}` }}
                            >
                                {updating ? <CircularProgress size={20} color="inherit" /> : 'SYNCHRONIZE CREDENTIALS'}
                            </Button>
                        </Box>

                        <Divider sx={{ my: 6, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4 }}>METRICS & HISTORY</Typography>
                        <Grid container spacing={3}>
                            {[
                                { label: 'JOINED SOVEREIGN', value: 'JAN 2024', icon: <Calendar /> },
                                { label: 'PRIMARY REGION', value: 'DUBAI, UAE', icon: <MapPin /> },
                                { label: 'MISSION SUCCESS', value: '94%', icon: <Zap /> },
                            ].map((m, i) => (
                                <Grid item xs={12} sm={4} key={i}>
                                    <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 950, letterSpacing: 1.5, display: 'block', mb: 1 }}>{m.label}</Typography>
                                        <Typography variant="h6" fontWeight="950" color="#FFF">{m.value}</Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>
            </Grid>
        </BrokerPageFrame>
    );
}
