import React, { useState, useEffect } from 'react';
import {
    Alert, Box, Typography, Paper, Stack, Chip, CircularProgress,
    Grid, alpha, Button, IconButton, Divider
} from '@mui/material';
import { 
    Building2, MapPin, Activity, 
    Shield, ArrowUpRight,
    Layout
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
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!user?.email) return;

        const email = user.email.toLowerCase();
        const propQ = query(collection(db, 'properties'), where('ownerEmail', '==', email));
        let active = true;
        
        const unsubscribe = onSnapshot(
            propQ,
            async (snap) => {
                const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                try {
                    // Firestore evaluates list permissions against the query, not
                    // against documents after the client filters them. Fetch only
                    // owner-authorized passports, then associate them locally.
                    const passportQueries = [
                        getDocs(query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email))),
                    ];
                    if (user?.uid) {
                        passportQueries.unshift(
                            getDocs(query(collection(db, 'propertyPassports'), where('ownerId', '==', user.uid))),
                        );
                    }
                    const passportSnapshots = await Promise.all(passportQueries);
                    const passportsByPropertyId = new Map<string, any>();
                    for (const passportSnapshot of passportSnapshots) {
                        for (const passportDoc of passportSnapshot.docs) {
                            const passport: any = { id: passportDoc.id, ...passportDoc.data() };
                            const propertyId = String(passport.propertyId || '').trim();
                            if (propertyId && !passportsByPropertyId.has(propertyId)) {
                                passportsByPropertyId.set(propertyId, passport);
                            }
                        }
                    }

                    if (!active) return;
                    setProperties(props.map((property) => ({
                        ...property,
                        passport: passportsByPropertyId.get(property.id) || {},
                    })));
                    setLoadError('');
                } catch (error) {
                    // The primary property listener is still useful when a legacy
                    // passport record is malformed. Do not leave the page in an
                    // endless loading state or issue a policy-incompatible retry.
                    if (!active) return;
                    setProperties(props.map((property) => ({ ...property, passport: {} })));
                    setLoadError('Portfolio metrics are temporarily unavailable. Property access remains active.');
                    console.warn('[OwnerProperties] authorized passport enrichment failed:', error);
                } finally {
                    if (active) setLoading(false);
                }
            },
            (error) => {
                if (!active) return;
                setProperties([]);
                setLoadError('Unable to load the property portfolio. Please refresh and try again.');
                setLoading(false);
                console.warn('[OwnerProperties] property listener failed:', error);
            },
        );

        return () => {
            active = false;
            unsubscribe();
        };
    }, [user?.email, user?.uid]);

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

            {loadError && <Alert severity="warning" sx={{ mb: 3 }}>{loadError}</Alert>}

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
                                        <IconButton sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.1) }} onClick={() => navigate(prop.passport?.id ? `/owner/property-passport/${prop.passport.id}` : '/owner/property-passport')}>
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
                                            sx={{ borderRadius: 3, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 900 }}
                                        >
                                            PASSPORT
                                        </Button>
                                        <Button 
                                            fullWidth 
                                            variant="outlined" 
                                            startIcon={<Activity size={16} />}
                                            sx={{ borderRadius: 3, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 900 }}
                                        >
                                            HISTORY
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
