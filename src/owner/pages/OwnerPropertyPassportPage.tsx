import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Box, Typography, Grid, Paper, CircularProgress, 
    Stack, Chip, alpha, Button, Divider 
} from '@mui/material';
import { 
    FileText, Building2, MapPin, Layers, 
    ShieldCheck, Calendar, ArrowRight, Download 
} from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerPropertyPassportPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [passports, setPassports] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.email) return;
        
        const email = user.email.toLowerCase();
        const passportQ = query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email));
        
        const unsubscribe = onSnapshot(passportQ, (snap) => {
            setPassports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.email]);

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Accessing Registry...</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>SOVEREIGN ASSET REGISTRY</Typography>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>Property Passports</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>Official digital twins of your real estate portfolio.</Typography>
            </Box>

            {passports.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <FileText size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO PASSPORTS ISSUED YET</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {passports.map(p => (
                        <Grid item xs={12} md={6} key={p.id}>
                            <Paper sx={{ 
                                p: 0, overflow: 'hidden', bgcolor: 'rgba(15, 23, 42, 0.4)', 
                                border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
                                transition: 'all 0.3s ease',
                                '&:hover': { borderColor: binThemeTokens.gold, transform: 'translateY(-4px)' }
                            }}>
                                <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Box sx={{ width: 48, height: 48, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold }}>
                                            <Building2 size={24} />
                                        </Box>
                                        <Box>
                                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', lineHeight: 1.2 }}>{p.propertyName || p.name || 'Property'}</Typography>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>ID: {p.id.slice(0, 8).toUpperCase()}</Typography>
                                        </Box>
                                    </Stack>
                                    <Chip label={p.status || 'ACTIVE'} size="small" sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 900, fontSize: '0.65rem' }} />
                                </Box>

                                <Box sx={{ p: 4 }}>
                                    <Grid container spacing={3}>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>LOCATION</Typography>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <MapPin size={14} color={binThemeTokens.gold} />
                                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{p.emirate || 'UAE'}</Typography>
                                            </Stack>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>COMPOSITION</Typography>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Layers size={14} color={binThemeTokens.gold} />
                                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{p.totalUnits || 0} Units · {p.floors || 0} Floors</Typography>
                                            </Stack>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>ISSUANCE DATE</Typography>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Calendar size={14} color={binThemeTokens.gold} />
                                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</Typography>
                                            </Stack>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 0.5 }}>GOVERNANCE</Typography>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <ShieldCheck size={14} color="#10b981" />
                                                <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 700 }}>VERIFIED</Typography>
                                            </Stack>
                                        </Grid>
                                    </Grid>

                                    <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <Button fullWidth variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 900, borderRadius: 3, py: 1.5 }}>
                                            PDF
                                        </Button>
                                        <Button fullWidth variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(`/owner/property-passport/${p.id}`)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, py: 1.5 }}>
                                            VIEW DETAILS
                                        </Button>
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}
