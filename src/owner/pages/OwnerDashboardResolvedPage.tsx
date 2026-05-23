import React from 'react';
import {
    Box, Typography, Grid, Paper, Stack, Button, IconButton, alpha
} from '@mui/material';
import {
    Building2, FileText, ChevronRight, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import OwnerExecutiveDashboardSection from '../components/OwnerExecutiveDashboardSection';

interface OwnerDashboardResolvedPageProps {
    user: any;
    t: (key: string) => string;
    isRTL: boolean;
    properties: any[];
    stats: any;
    contractScope: string;
    missingInfo: any;
}

export default function OwnerDashboardResolvedPage({
    user,
    t,
    isRTL,
    properties,
    stats,
    contractScope,
    missingInfo
}: OwnerDashboardResolvedPageProps) {
    const navigate = useNavigate();

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            
            {/* 1. DASHBOARD ACTIVE HEADER */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>
                        {t('dash.terminal.owner') || 'SOVEREIGN OWNER TERMINAL · ACTIVE'}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1, letterSpacing: -1 }}>
                        {t('dash.hello') || 'Hello'}, {user?.displayName?.split(' ')[0] || 'Partner'}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', mt: 0.5 }}>
                        UAE Owner Control Room: Real-time asset oversight.
                    </Typography>
                </Box>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2}>
                    <Button 
                        variant="contained" 
                        startIcon={<Sparkles size={16} />} 
                        onClick={() => navigate('/design-studio')}
                        sx={{ bgcolor: '#FFF', color: '#000', fontWeight: 900, px: 3, borderRadius: 3, '&:hover': { bgcolor: '#e2e2e2' } }}
                    >
                        {t('nav.ai_studio') || 'AI Studio'}
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={() => navigate('/owner/roi')} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}
                    >
                        {t('dash.portfolio_roi') || 'Portfolio ROI'}
                    </Button>
                </Stack>
            </Box>

            {/* 2-3. FINANCIAL CONTROL & PORTFOLIO HEALTH (Handled within Executive Section) */}
            {/* 5-7-8-10. TENANT REGISTRY, MAJLIS, OPERATIONS/SLA, COMPLIANCE, ACTION ITEMS */}
            <OwnerExecutiveDashboardSection 
                properties={properties}
                stats={stats}
                contractScope={contractScope}
                missingInfo={missingInfo}
                user={user}
            />

            <Grid container spacing={4} sx={{ mt: 2 }}>
                <Grid item xs={12} lg={8}>
                    
                    {/* 4. ACTIVE ASSETS */}
                    <Paper sx={{ p: 0, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden', mb: 4 }}>
                        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Building2 size={20} color={binThemeTokens.gold} /> {t('dash.active_assets') || 'ACTIVE ASSETS'}
                            </Typography>
                            <Button 
                                size="small" 
                                sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} 
                                onClick={() => navigate('/owner/properties')}
                            >
                                {t('common.view_all') || 'View All'}
                            </Button>
                        </Box>
                        <Box sx={{ p: 3 }}>
                            {properties.length === 0 ? (
                                <Box sx={{ py: 6, textAlign: 'center' }}>
                                    <Building2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{t('dash.no_properties') || 'NO PROPERTIES LINKED'}</Typography>
                                </Box>
                            ) : (
                                <Grid container spacing={2.5}>
                                    {properties.map(prop => (
                                        <Grid item xs={12} md={6} key={prop.id}>
                                            <Paper 
                                                onClick={() => navigate(`/owner/property-passport/${prop.id}`)}
                                                sx={{ 
                                                    p: 2.5, 
                                                    bgcolor: 'rgba(255,255,255,0.02)', 
                                                    border: '1px solid rgba(255,255,255,0.05)', 
                                                    borderRadius: 4, 
                                                    cursor: 'pointer', 
                                                    transition: 'all 0.3s ease',
                                                    '&:hover': { 
                                                        bgcolor: 'rgba(255,255,255,0.04)',
                                                        borderColor: alpha(binThemeTokens.gold, 0.35)
                                                    } 
                                                }}
                                            >
                                                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                                                    <Box sx={{ width: 48, height: 48, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Building2 size={24} color={binThemeTokens.gold} />
                                                    </Box>
                                                    <Box sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                                                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF' }}>
                                                            {prop.propertyName || prop.name || 'Property'}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mt: 0.5 }}>
                                                            {prop.emirate || prop.location || 'UAE'} · {prop.units || 0} units
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, display: 'block', mt: 0.5, fontSize: '0.65rem', fontWeight: 900 }}>
                                                            Source: {prop.source ? String(prop.source).toUpperCase().replace('_', ' ') : 'OFFICIAL RECORD'}
                                                        </Typography>
                                                    </Box>
                                                    <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.2)' }}>
                                                        <ChevronRight size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                                    </IconButton>
                                                </Stack>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    
                    {/* 9. PROPERTY PASSPORTS QUICK ACCESS */}
                    <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, mb: 4 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                            PROPERTY PASSPORTS
                        </Typography>
                        <Stack spacing={2}>
                            {properties.slice(0, 3).map((prop, idx) => (
                                <Button
                                    key={idx}
                                    fullWidth
                                    variant="outlined"
                                    onClick={() => navigate(`/owner/property-passport/${prop.id}`)}
                                    sx={{
                                        justifyContent: 'space-between',
                                        px: 2,
                                        py: 1.5,
                                        borderRadius: 3.5,
                                        borderColor: 'rgba(255,255,255,0.05)',
                                        '&:hover': {
                                            borderColor: binThemeTokens.gold,
                                            bgcolor: alpha(binThemeTokens.gold, 0.02)
                                        }
                                    }}
                                >
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                        <FileText size={16} color={binThemeTokens.gold} />
                                        <Typography variant="caption" fontWeight="950" sx={{ color: '#FFF' }}>
                                            {String(prop.propertyName || prop.name || 'Passport').toUpperCase()}
                                        </Typography>
                                    </Stack>
                                    <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
                                </Button>
                            ))}
                            <Button 
                                fullWidth
                                variant="contained"
                                onClick={() => navigate('/owner/property-passport')}
                                sx={{ mt: 1 }}
                            >
                                Open Passport Registry
                            </Button>
                        </Stack>
                    </Paper>

                    {/* Sovereignty Info Panel */}
                    <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                            UAE DATA SOVEREIGNTY
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            Your control room operates strictly in compliance with UAE cybersecurity frameworks, protecting local assets and transaction ledgers.
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
