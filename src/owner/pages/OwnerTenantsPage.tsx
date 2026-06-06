import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Stack, Chip, CircularProgress, 
    Grid, Avatar, IconButton, TextField, InputAdornment, alpha,
    Button, Divider
} from '@mui/material';
import { 
    Users, Search, Mail, Phone, MessageSquare, 
    MapPin, Building2, ChevronRight, Filter,
    Activity, Shield, CheckCircle2
} from 'lucide-react';
import { db, collection, query, where, getDocs, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerTenantsPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [tenants, setTenants] = useState<any[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!user?.email) return;
        
        // 1. Get properties linked to owner email
        const propQ = query(collection(db, 'properties'), where('ownerEmail', '==', user.email.toLowerCase()));
        
        const unsubscribe = onSnapshot(propQ, async (propSnap) => {
            const propIds = propSnap.docs.map(d => d.id);
            if (propIds.length === 0) { 
                setTenants([]);
                setLoading(false); 
                return; 
            }

            // 2. Get tenants linked to these properties
            const tenantQ = query(collection(db, 'users'), where('role', '==', 'tenant'), where('ownerId', '==', user.uid));
            onSnapshot(tenantQ, (tenantSnap) => {
                const allTenants = tenantSnap.docs.map(d => {
                    const data = d.data();
                    const prop = propSnap.docs.find(p => p.id === data.propertyId)?.data();
                    return {
                        id: d.id,
                        ...data,
                        propertyName: prop?.name || prop?.propertyName || 'Sovereign Asset'
                    };
                });
                setTenants(allTenants);
                setLoading(false);
            });
        });

        return () => unsubscribe();
    }, [user?.email]);

    const filtered = tenants.filter(t => 
        t.displayName?.toLowerCase().includes(search.toLowerCase()) ||
        t.email?.toLowerCase().includes(search.toLowerCase()) ||
        t.propertyName?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return (
        <Box sx={{ height: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Mapping Population...</Typography>
        </Box>
    );

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>TENANT RELATIONSHIP NODES</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>Sovereign Directory</Typography>
                </Box>
                <TextField 
                    size="small" 
                    placeholder="Search by name, email, property..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{ 
                        startAdornment: <InputAdornment position="start"><Search size={16} color="rgba(255,255,255,0.4)" /></InputAdornment>,
                        sx: { borderRadius: 3, bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderColor: 'rgba(255,255,255,0.1)' }
                    }}
                    sx={{ width: { xs: '100%', sm: 300 } }}
                />
            </Box>

            {filtered.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <Users size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO TENANTS REGISTERED IN YOUR PORTFOLIO</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {filtered.map(tenant => (
                        <Grid item xs={12} md={6} lg={4} key={tenant.id}>
                            <Paper sx={{ 
                                p: 3, 
                                bgcolor: 'rgba(15, 23, 42, 0.4)', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                borderRadius: 6,
                                transition: 'all 0.2s',
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.02)', borderColor: binThemeTokens.gold }
                            }}>
                                <Stack spacing={2.5}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <Stack direction="row" spacing={2} alignItems="center">
                                            <Avatar sx={{ 
                                                width: 56, 
                                                height: 56, 
                                                bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                                color: binThemeTokens.gold,
                                                fontWeight: 950,
                                                border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`
                                            }}>
                                                {tenant.displayName?.charAt(0) || 'T'}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -0.5 }}>
                                                    {tenant.displayName || 'Unnamed Tenant'}
                                                </Typography>
                                                <Chip 
                                                    label={tenant.status?.toUpperCase() || 'ACTIVE'} 
                                                    size="small" 
                                                    sx={{ 
                                                        height: 16, 
                                                        fontSize: '0.6rem', 
                                                        fontWeight: 950,
                                                        bgcolor: alpha('#10b981', 0.1),
                                                        color: '#10b981',
                                                        mt: 0.5
                                                    }} 
                                                />
                                            </Box>
                                        </Stack>
                                        <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.2)' }}><Activity size={18} /></IconButton>
                                    </Box>

                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <MapPin size={14} color={binThemeTokens.gold} />
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                                {tenant.propertyName} · Unit {tenant.unitNumber || '—'}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Mail size={14} color="rgba(255,255,255,0.4)" />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                                                {tenant.email}
                                            </Typography>
                                        </Box>
                                    </Stack>

                                    <Stack direction="row" spacing={1}>
                                        <Button 
                                            fullWidth 
                                            variant="outlined" 
                                            size="small"
                                            startIcon={<Mail size={14} />}
                                            href={`mailto:${tenant.email}`}
                                            sx={{ borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', borderRadius: 2, fontWeight: 900, fontSize: '0.65rem' }}
                                        >
                                            EMAIL
                                        </Button>
                                        <Button 
                                            fullWidth 
                                            variant="outlined" 
                                            size="small"
                                            startIcon={<MessageSquare size={14} />}
                                            sx={{ borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', borderRadius: 2, fontWeight: 900, fontSize: '0.65rem' }}
                                        >
                                            CHAT
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Compliance Footer */}
            <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
                <Grid container spacing={4} alignItems="center">
                    <Grid item xs={12} md={8}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Shield size={16} /> PRIVACY SOVEREIGNTY
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            Tenant contact data is strictly governed. Owners are permitted communication for asset-related matters only. 
                            All interactions are logged in the **Institutional Audit Stream** for RERA compliance.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={4} sx={{ textAlign: 'right' }}>
                        <Button variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900, px: 3, borderRadius: 3 }} startIcon={<CheckCircle2 size={16} />}>
                            RERA Compliant
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
