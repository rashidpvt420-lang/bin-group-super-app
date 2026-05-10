import React, { useState, useEffect } from 'react';
import { 
    Box, Container, Typography, Grid, Paper, Stack, 
    Button, IconButton, Divider, alpha, TextField,
    Switch, FormControlLabel, Card, CardContent,
    InputAdornment, Tooltip, CircularProgress, Chip
} from '@mui/material';
import { 
    Save, Building2, Globe, Phone, Mail, 
    MessageSquare, ShieldCheck, MapPin, 
    Plus, Trash2, Edit3, CheckCircle, 
    AlertCircle, Briefcase, Zap, Info
} from 'lucide-react';
import { db, doc, onSnapshot, updateDoc, setDoc } from '../../../lib/firebase';
import { binThemeTokens } from '../../../theme/binGroupTheme';
import { useLanguage } from '../../../context/LanguageContext';
import { useSnackbar } from 'notistack';

export default function CompanyProfileSettingsPage() {
    const { isRTL } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<any>({
        companyName: '',
        licenseInfo: '',
        services: [],
        contact: { whatsapp: '', email: '', phone: '' },
        serviceAreas: [],
        termsUrl: '',
        privacyUrl: '',
        aboutText: ''
    });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'companyProfile'), (snap) => {
            if (snap.exists()) {
                setProfile(snap.data());
            }
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'companyProfile'), profile, { merge: true });
            enqueueSnackbar('Company profile synchronized across Sovereign OS', { variant: 'success' });
        } catch (err) {
            console.error(err);
            enqueueSnackbar('Synchronization failed', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const updateService = (id: number, field: string, value: string) => {
        const newServices = profile.services.map((s: any) => 
            s.id === id ? { ...s, [field]: value } : s
        );
        setProfile({ ...profile, services: newServices });
    };

    if (loading) return (
        <Box sx={{ p: 10, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    return (
        <Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* ─── HEADER ───────────────────────────────────────────────────── */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="h4" fontWeight="950" color="#FFF" sx={{ letterSpacing: -1 }}>
                        COMPANY IDENTITY CONTROL
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>
                        MANAGE PUBLIC PROFILE, LICENSING, AND SERVICE CAPABILITIES
                    </Typography>
                </Box>
                <Button 
                    variant="contained" 
                    startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <Save size={20} />}
                    onClick={handleSave}
                    disabled={saving}
                    sx={{ 
                        bgcolor: binThemeTokens.gold, 
                        color: '#000', 
                        fontWeight: 950, 
                        px: 4,
                        '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.8) }
                    }}
                >
                    {saving ? 'SYNCHRONIZING...' : 'SAVE CHANGES'}
                </Button>
            </Stack>

            <Grid container spacing={3}>
                {/* ─── CORE IDENTITY ────────────────────────────────────────── */}
                <Grid item xs={12} md={8}>
                    <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <CardContent sx={{ p: 4 }}>
                            <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Building2 size={24} color={binThemeTokens.gold} /> Core Identity
                            </Typography>
                            
                            <Grid container spacing={3}>
                                <Grid item xs={12}>
                                    <TextField 
                                        fullWidth 
                                        label="Institutional Company Name"
                                        value={profile.companyName}
                                        onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                                        variant="filled"
                                        InputProps={{ disableUnderline: true, style: { fontWeight: 800, color: '#FFF' } }}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                    />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <TextField 
                                        fullWidth 
                                        label="Trade License / Registration Info"
                                        value={profile.licenseInfo}
                                        onChange={(e) => setProfile({ ...profile, licenseInfo: e.target.value })}
                                        variant="filled"
                                        InputProps={{ 
                                            disableUnderline: true, 
                                            style: { fontWeight: 800, color: '#FFF' },
                                            startAdornment: <InputAdornment position="start"><ShieldCheck size={18} color={binThemeTokens.gold} /></InputAdornment>
                                        }}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                    />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <TextField 
                                        fullWidth 
                                        label="Primary Jurisdiction"
                                        placeholder="Dubai, UAE"
                                        variant="filled"
                                        InputProps={{ disableUnderline: true, style: { fontWeight: 800, color: '#FFF' } }}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField 
                                        fullWidth 
                                        multiline 
                                        rows={4}
                                        label="Institutional About Text"
                                        value={profile.aboutText}
                                        onChange={(e) => setProfile({ ...profile, aboutText: e.target.value })}
                                        variant="filled"
                                        InputProps={{ disableUnderline: true, style: { fontWeight: 700, color: 'rgba(255,255,255,0.7)' } }}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                    />
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* ─── SERVICES ───────────────────────────────────────────── */}
                    <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, mt: 3 }}>
                        <CardContent sx={{ p: 4 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Zap size={24} color={binThemeTokens.gold} /> Service Capabilities
                                </Typography>
                                <Button variant="text" startIcon={<Plus size={18} />} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                                    ADD SERVICE
                                </Button>
                            </Stack>

                            <Stack spacing={2}>
                                {profile.services?.map((service: any) => (
                                    <Paper key={service.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Grid container spacing={2} alignItems="center">
                                            <Grid item xs={12} md={4}>
                                                <TextField 
                                                    fullWidth 
                                                    size="small"
                                                    label="Service Title"
                                                    value={service.title}
                                                    onChange={(e) => updateService(service.id, 'title', e.target.value)}
                                                    variant="standard"
                                                    InputProps={{ disableUnderline: true, style: { fontWeight: 900, color: '#FFF' } }}
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={7}>
                                                <TextField 
                                                    fullWidth 
                                                    size="small"
                                                    label="Description"
                                                    value={service.desc}
                                                    onChange={(e) => updateService(service.id, 'desc', e.target.value)}
                                                    variant="standard"
                                                    InputProps={{ disableUnderline: true, style: { fontWeight: 700, color: 'rgba(255,255,255,0.5)' } }}
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={1}>
                                                <IconButton sx={{ color: 'rgba(255,255,255,0.2)', '&:hover': { color: '#ef4444' } }}>
                                                    <Trash2 size={18} />
                                                </IconButton>
                                            </Grid>
                                        </Grid>
                                    </Paper>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                {/* ─── CONTACT & REACH ─────────────────────────────────────── */}
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, mb: 3 }}>
                        <CardContent sx={{ p: 4 }}>
                            <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Phone size={24} color={binThemeTokens.gold} /> Global Reach
                            </Typography>

                            <Stack spacing={3}>
                                <TextField 
                                    fullWidth 
                                    label="Official WhatsApp"
                                    value={profile.contact?.whatsapp}
                                    onChange={(e) => setProfile({ ...profile, contact: { ...profile.contact, whatsapp: e.target.value } })}
                                    variant="filled"
                                    InputProps={{ 
                                        disableUnderline: true, 
                                        style: { fontWeight: 800, color: '#FFF' },
                                        startAdornment: <InputAdornment position="start"><MessageSquare size={18} color="#25D366" /></InputAdornment>
                                    }}
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                />
                                <TextField 
                                    fullWidth 
                                    label="Support Email"
                                    value={profile.contact?.email}
                                    onChange={(e) => setProfile({ ...profile, contact: { ...profile.contact, email: e.target.value } })}
                                    variant="filled"
                                    InputProps={{ 
                                        disableUnderline: true, 
                                        style: { fontWeight: 800, color: '#FFF' },
                                        startAdornment: <InputAdornment position="start"><Mail size={18} color={binThemeTokens.gold} /></InputAdornment>
                                    }}
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                />
                                <TextField 
                                    fullWidth 
                                    label="UAE Hotline"
                                    value={profile.contact?.phone}
                                    onChange={(e) => setProfile({ ...profile, contact: { ...profile.contact, phone: e.target.value } })}
                                    variant="filled"
                                    InputProps={{ 
                                        disableUnderline: true, 
                                        style: { fontWeight: 800, color: '#FFF' },
                                        startAdornment: <InputAdornment position="start"><Phone size={18} color={binThemeTokens.gold} /></InputAdornment>
                                    }}
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                />
                            </Stack>

                            <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                            <Typography variant="subtitle2" fontWeight="950" color="#FFF" sx={{ mb: 2 }}>Coverage Zones</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {profile.serviceAreas?.map((area: string) => (
                                    <Chip 
                                        key={area} 
                                        label={area} 
                                        onDelete={() => {}}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold, fontWeight: 900, borderRadius: 2 }}
                                    />
                                ))}
                                <IconButton size="small" sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.1) }}>
                                    <Plus size={16} />
                                </IconButton>
                            </Box>
                        </CardContent>
                    </Card>

                    <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <CardContent sx={{ p: 4 }}>
                            <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Globe size={24} color={binThemeTokens.gold} /> Compliance Docs
                            </Typography>
                            <Stack spacing={3}>
                                <TextField 
                                    fullWidth 
                                    label="Terms of Service URL"
                                    value={profile.termsUrl}
                                    onChange={(e) => setProfile({ ...profile, termsUrl: e.target.value })}
                                    variant="filled"
                                    InputProps={{ disableUnderline: true, style: { fontWeight: 700, color: '#FFF' } }}
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                />
                                <TextField 
                                    fullWidth 
                                    label="Privacy Policy URL"
                                    value={profile.privacyUrl}
                                    onChange={(e) => setProfile({ ...profile, privacyUrl: e.target.value })}
                                    variant="filled"
                                    InputProps={{ disableUnderline: true, style: { fontWeight: 700, color: '#FFF' } }}
                                    sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}
                                />
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
