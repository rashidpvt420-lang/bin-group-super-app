import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Stack, Chip, CircularProgress, 
    Grid, alpha, Button, IconButton, Divider
} from '@mui/material';
import {
    Building2, MapPin, Activity,
    Shield, ArrowUpRight,
    Layout, QrCode, ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, where, getDocs, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerPropertiesPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [properties, setProperties] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.email) return;

        const email = user.email.toLowerCase();
        const propQ = query(collection(db, 'properties'), where('ownerEmail', '==', email));
        
        const unsubscribe = onSnapshot(propQ, async (snap) => {
            const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Enrich with passport data for occupancy/revenue
            const enriched = await Promise.all(props.map(async (p) => {
                const passportQ = query(collection(db, 'propertyPassports'), where('propertyId', '==', p.id));
                const passportSnap = await getDocs(passportQ);
                const passport = passportSnap.docs[0]?.data() || {};
                return { ...p, passport };
            }));
            
            setProperties(enriched);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.email]);

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Scanning Asset Registry...</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6 }}>
            {/* Header */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>SOVEREIGN ASSET REGISTRY</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>My Portfolio</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Layout size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }}>Grid View</Button>
                    <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}>Register New Asset</Button>
                </Stack>
            </Box>

            {properties.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <Building2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO PROPERTIES LINKED TO YOUR SOVEREIGN ACCOUNT</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {properties.map(prop => (
                        <Grid item xs={12} md={6} key={prop.id}>
                            <Paper sx={{ 
                                bgcolor: 'rgba(15, 23, 42, 0.4)', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                borderRadius: 8, 
                                overflow: 'hidden',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': { transform: 'translateY(-8px)', borderColor: binThemeTokens.gold, bgcolor: 'rgba(15, 23, 42, 0.6)' }
                            }}>
                                {/* Property Visual Header (Placeholder for actual image) */}
                                <Box sx={{ height: 160, bgcolor: alpha(binThemeTokens.gold, 0.05), display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                    <Building2 size={64} color={alpha(binThemeTokens.gold, 0.2)} />
                                    <Chip 
                                        label={prop.status?.toUpperCase() || 'ACTIVE'} 
                                        sx={{ position: 'absolute', top: 20, right: 20, bgcolor: 'rgba(0,0,0,0.6)', color: binThemeTokens.gold, fontWeight: 950, backdropFilter: 'blur(10px)', border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }} 
                                    />
                                </Box>

                                <Box sx={{ p: 4 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                                        <Box>
                                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -0.5 }}>{prop.propertyName}</Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, color: 'rgba(255,255,255,0.4)' }}>
                                                <MapPin size={14} />
                                                <Typography variant="caption" sx={{ fontWeight: 700 }}>{prop.emirate} · {prop.unitsCount || 0} Units</Typography>
                                            </Box>
                                        </Box>
                                        <IconButton sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.1) }} onClick={() => navigate(`/owner/properties/${prop.id}`)}>
                                            <ArrowUpRight size={20} />
                                        </IconButton>
                                    </Box>

                                    <Grid container spacing={2} sx={{ mb: 4 }}>
                                        <Grid item xs={6}>
                                            <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, display: 'block', mb: 1 }}>OCCUPANCY</Typography>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>{prop.passport?.occupiedUnits || 0} / {prop.unitsCount || 0}</Typography>
                                            </Box>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, display: 'block', mb: 1 }}>REVENUE (AED)</Typography>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#10b981' }}>{(prop.passport?.rentCollectedTotal || 0).toLocaleString()}</Typography>
                                            </Box>
                                        </Grid>
                                    </Grid>

                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 3 }} />

                                    <Stack direction="row" spacing={2}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            startIcon={<Shield size={16} />}
                                            onClick={() => window.open(`/passport/${prop.id}`, '_blank')}
                                            sx={{ borderRadius: 3, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 900 }}
                                        >
                                            PASSPORT
                                        </Button>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            startIcon={<Activity size={16} />}
                                            onClick={() => navigate('/owner/tickets')}
                                            sx={{ borderRadius: 3, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 900 }}
                                        >
                                            HISTORY
                                        </Button>
                                    </Stack>
                                    <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
                                        <Button
                                            fullWidth
                                            size="small"
                                            startIcon={<QrCode size={14} />}
                                            onClick={() => window.open(`/passport/${prop.id}`, '_blank')}
                                            sx={{ borderRadius: 3, borderColor: alpha(binThemeTokens.gold, 0.3), color: binThemeTokens.gold, fontWeight: 900, border: '1px solid' }}
                                        >
                                            QR Passport
                                        </Button>
                                        <Button
                                            fullWidth
                                            size="small"
                                            startIcon={<ShieldCheck size={14} />}
                                            onClick={() => navigate(`/verify/property/${prop.id}`)}
                                            sx={{ borderRadius: 3, borderColor: alpha(binThemeTokens.gold, 0.3), color: binThemeTokens.gold, fontWeight: 900, border: '1px solid' }}
                                        >
                                            Verify Badge
                                        </Button>
                                    </Stack>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}
