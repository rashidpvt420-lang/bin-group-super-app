// apps/owner-app/src/pages/BrokerPortalPage.tsx
import React from 'react';
import { Box, Typography, Container, Paper, Grid, Stack, Button, Chip, Divider } from '@mui/material';
import { Building, Users, TrendingUp, Landmark, Share2, Search, Briefcase } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

export default function BrokerPortalPage() {
    const { t } = useLanguage();
    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            {/* Background Texture */}
            <Box sx={{ position: 'fixed', top: '10%', right: '5%', width: 600, height: 600, background: 'radial-gradient(circle, rgba(198,167,94,0.02) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

            <Box sx={{ mb: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1 }}>{t('broker.title')}</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 500 }}>{t('broker.subtitle')}</Typography>
                </Box>
                <Button variant="contained" sx={{ background: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900, borderRadius: 3, px: 4 }}>{t('broker.list_new')}</Button>
            </Box>

            {/* Market Intelligence */}
            <Grid container spacing={4} sx={{ mb: 8, position: 'relative', zIndex: 1 }}>
                {[
                    { label: t('broker.kpi.inventory'), val: '42 Assets', icon: <Building size={24} /> },
                    { label: t('broker.kpi.leads'), val: '156', icon: <Users size={24} /> },
                    { label: t('broker.kpi.market'), val: '8.2%', icon: <TrendingUp size={24} /> },
                    { label: t('broker.kpi.commission'), val: 'AED 450k', icon: <Landmark size={24} /> },
                ].map((kpi, i) => (
                    <Grid item xs={12} sm={6} md={3} key={i}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(198,167,94,0.15)', borderRadius: 6, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                            <Box sx={{ color: binThemeTokens.gold, mb: 3 }}>{kpi.icon}</Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 1 }}>{kpi.label}</Typography>
                            <Typography variant="h4" fontWeight="900" sx={{ color: '#FFFFFF' }}>{kpi.val}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* Inventory Deck */}
            <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: '#FFFFFF', letterSpacing: 1, position: 'relative', zIndex: 1 }}>{t('broker.listings')}</Typography>
            <Grid container spacing={4} sx={{ position: 'relative', zIndex: 1 }}>
                {[
                    { name: 'Skyview Penthouse', loc: 'Downtown', price: 'AED 8.5M', yield: '8.4%', image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80' },
                    { name: 'Marina Waterfront Villa', loc: 'Palm Jumeirah', price: 'AED 24M', yield: '6.2%', image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80' },
                    { name: 'Executive Suite', loc: 'Business Bay', price: 'AED 1.2M', yield: '9.1%', image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80' },
                ].map((item, i) => (
                    <Grid item xs={12} md={4} key={i}>
                        <Paper sx={{ overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.4)', border: '1px solid rgba(255,255,255,0.05)', '&:hover': { border: '1px solid rgba(198,167,94,0.3)' } }}>
                            <Box sx={{ height: 200, bgcolor: 'rgba(255,255,255,0.05)', position: 'relative' }}>
                                <Box sx={{ position: 'absolute', top: 20, right: 20 }}>
                                    <Chip label={item.yield + " " + t('broker.yield_label')} size="small" sx={{ bgcolor: binThemeTokens.gold, color: '#0B0B0C', fontWeight: 900 }} />
                                </Box>
                                <Box 
                                    component="img" 
                                    src={item.image} 
                                    alt={item.name} 
                                    sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} 
                                />
                            </Box>
                            <Box sx={{ p: 4 }}>
                                <Typography variant="h6" fontWeight="900" sx={{ color: '#FFFFFF', mb: 0.5 }}>{item.name}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 3 }}>{item.loc} • {t('broker.unit_type')}</Typography>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 3 }} />
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{item.price}</Typography>
                                    <Stack direction="row" spacing={1}>
                                        <Button size="small" sx={{ minWidth: 40, p: 1, color: binThemeTokens.textSecondary }}><Share2 size={18} /></Button>
                                        <Button size="small" variant="outlined" sx={{ borderColor: 'rgba(198,167,94,0.3)', color: binThemeTokens.gold, fontWeight: 900 }}>{t('broker.details')}</Button>
                                    </Stack>
                                </Stack>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
        </Container>
    );
}

