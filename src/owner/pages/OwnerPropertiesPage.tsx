import React, { useState, useEffect } from 'react';
import {
    Alert, Box, Typography, Paper, Stack, Chip, CircularProgress,
    Grid, alpha, Button, IconButton, Divider
} from '@mui/material';
import { 
    Building2, MapPin, Activity, 
    Shield, ArrowUpRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, where, getDocs, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerPropertiesPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { tx, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [properties, setProperties] = useState<any[]>([]);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!user?.uid) {
            setProperties([]);
            setLoadError(tx('owner.properties.auth_required', 'Authenticated Owner identity is unavailable. Reload the portal and try again.'));
            setLoading(false);
            return undefined;
        }

        // Launch-critical property access is identity-bound. Query the same
        // canonical ownerId field that Firestore rules authorize; do not rely on
        // mutable email or generic createdBy aliases for portfolio ownership.
        const propQ = query(collection(db, 'properties'), where('ownerId', '==', user.uid));
        let active = true;
        let snapshotVersion = 0;
        
        const unsubscribe = onSnapshot(
            propQ,
            async (snap) => {
                const version = ++snapshotVersion;
                const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                try {
                    // Firestore evaluates list permissions against the query, not
                    // against documents after the client filters them. Fetch only
                    // owner-authorized passports, then associate them locally.
                    const passportQueries = [
                        getDocs(query(collection(db, 'propertyPassports'), where('ownerId', '==', user.uid))),
                    ];
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

                    if (!active || version !== snapshotVersion) return;
                    setProperties(props.map((property) => ({
                        ...property,
                        passport: passportsByPropertyId.get(property.id) || {},
                    })));
                    setLoadError('');
                } catch (error) {
                    // The primary property listener is still useful when a legacy
                    // passport record is malformed. Do not leave the page in an
                    // endless loading state or issue a policy-incompatible retry.
                    if (!active || version !== snapshotVersion) return;
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
    }, [user?.uid]);

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{tx('owner.properties.loading', 'Loading property portfolio...')}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 900, letterSpacing: 4 }}>{tx('owner.properties.overline', 'PROPERTY PORTFOLIO')}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.textPrimary, mt: 1 }}>{tx('owner.properties.title', 'My Portfolio')}</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button type="button" data-testid="owner-register-property" variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}>{tx('owner.properties.register', 'Register New Property')}</Button>
                </Stack>
            </Box>

            {loadError && <Alert severity="warning" sx={{ mb: 3 }}>{loadError}</Alert>}

            {properties.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: '#FFFFFF', border: `1px dashed ${binThemeTokens.border}`, borderRadius: 6 }}>
                    <Building2 size={48} color="#D1D5DB" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{tx('owner.properties.empty', 'No properties are linked to your Owner account yet.')}</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    {properties.map(prop => (
                        <Grid item xs={12} md={6} key={prop.id}>
                            <Paper sx={{ 
                                bgcolor: '#FFFFFF', 
                                border: `1px solid ${binThemeTokens.border}`, 
                                borderRadius: 8, 
                                overflow: 'hidden',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': { transform: 'translateY(-4px)', borderColor: binThemeTokens.goldHover, boxShadow: '0 18px 40px rgba(17,24,39,0.08)' }
                            }}>
                                {/* Property Visual Header (Placeholder for actual image) */}
                                <Box sx={{ height: 160, bgcolor: alpha(binThemeTokens.gold, 0.05), display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                    <Building2 size={64} color={alpha(binThemeTokens.gold, 0.2)} />
                                    <Chip 
                                        label={prop.status?.toUpperCase() || 'PENDING'} 
                                        sx={{ position: 'absolute', top: 20, right: 20, bgcolor: 'rgba(0,0,0,0.6)', color: binThemeTokens.gold, fontWeight: 950, backdropFilter: 'blur(10px)', border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}` }} 
                                    />
                                </Box>

                                <Box sx={{ p: 4 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                                        <Box>
                                            <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.textPrimary, letterSpacing: -0.5 }}>{prop.propertyName}</Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, color: binThemeTokens.textSecondary }}>
                                                <MapPin size={14} />
                                                <Typography variant="caption" sx={{ fontWeight: 700 }}>{prop.emirate} · {prop.unitsCount || 0} Units</Typography>
                                            </Box>
                                        </Box>
                                        <IconButton aria-label={`Open ${prop.propertyName || 'property'} passport`} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.1) }} onClick={() => navigate(prop.passport?.id ? `/owner/property-passport/${prop.passport.id}` : '/owner/property-passport')}>
                                            <ArrowUpRight size={20} />
                                        </IconButton>
                                    </Box>

                                    <Grid container spacing={2} sx={{ mb: 4 }}>
                                        <Grid item xs={6}>
                                            <Box sx={{ p: 2, bgcolor: binThemeTokens.softCanvas, borderRadius: 4, border: `1px solid ${binThemeTokens.border}` }}>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1 }}>OCCUPANCY</Typography>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{prop.passport?.occupiedUnits || 0} / {prop.unitsCount || 0}</Typography>
                                            </Box>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, display: 'block', mb: 1 }}>REVENUE (AED)</Typography>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#10b981' }}>{(prop.passport?.rentCollectedTotal || 0).toLocaleString()}</Typography>
                                            </Box>
                                        </Grid>
                                    </Grid>

                                    <Divider sx={{ borderColor: binThemeTokens.border, mb: 3 }} />

                                    <Stack direction="row" spacing={2}>
                                        <Button 
                                            fullWidth 
                                            type="button"
                                            variant="outlined" 
                                            startIcon={<Shield size={16} />}
                                            onClick={() => navigate(prop.passport?.id ? `/owner/property-passport/${prop.passport.id}` : '/owner/property-passport')}
                                            sx={{ borderRadius: 3, borderColor: binThemeTokens.border, color: binThemeTokens.textPrimary, fontWeight: 900 }}
                                        >
                                            PASSPORT
                                        </Button>
                                        <Button 
                                            fullWidth 
                                            type="button"
                                            variant="outlined" 
                                            startIcon={<Activity size={16} />}
                                            onClick={() => navigate('/owner/tickets')}
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
