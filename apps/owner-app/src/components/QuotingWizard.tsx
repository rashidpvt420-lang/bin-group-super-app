import React, { useState } from 'react';
import {
    Box, Button, Card, CardContent, Chip, CircularProgress,
    Divider, FormControl, Grid, InputLabel, MenuItem,
    Select, TextField, Typography, Slider,
    Stack, useTheme, alpha, Paper
} from '@mui/material';
import { 
    TrendingUp, 
    ShieldCheck, 
    Zap, 
    Building2, 
    Briefcase,
    Globe,
    AlertCircle,
    Banknote,
    Lock,
    Wrench,
    Navigation
} from 'lucide-react';
import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';
import { calculateBuildingHealth } from '../utils/buildingHealthEngine';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

const QuotingWizard: React.FC<{ onResult: (result: any) => void }> = ({ onResult }) => {
    const { t, isRTL } = useLanguage();
    const [isCalculating, setIsCalculating] = useState(false);
    const [serviceType, setServiceType] = useState('maintenance');
    const [assetCount, setAssetCount] = useState(1);
    const [emirate, setEmirate] = useState('Dubai');

    const handleGenerate = async () => {
        setIsCalculating(true);
        // Simulate high-frequency computation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const mockResult = {
            valuation: {
                annualPrice: serviceType === 'property_management' ? 25000 : 12000,
                tier: 'SOVEREIGN',
                mode: serviceType
            },
            property: {
                assetCount,
                emirate,
                propertyName: `Portfolio of ${assetCount} Assets`
            }
        };
        
        onResult(mockResult);
        setIsCalculating(false);
    };

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, letterSpacing: -1 }}>
                {t('quote.title') || 'Sovereign Quote Engine'}
            </Typography>
            <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                {t('quote.subtitle') || 'Define your institutional parameters for immediate yield analysis.'}
            </Typography>

            <Grid container spacing={4}>
                <Grid item xs={12} md={8}>
                    <Stack spacing={4}>
                        {/* Service Selection */}
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, mb: 2, display: 'block' }}>
                                01. MISSION TYPE
                            </Typography>
                            <Grid container spacing={2}>
                                {[
                                    { id: 'maintenance', title: t('quote.service.maintenance') || 'Institutional Maintenance', icon: <Wrench size={24} /> },
                                    { id: 'property_management', title: t('quote.service.pm') || 'Property Management', icon: <Building2 size={24} /> }
                                ].map((service) => (
                                    <Grid item xs={12} sm={6} key={service.id}>
                                        <Paper 
                                            onClick={() => setServiceType(service.id)}
                                            sx={{ 
                                                p: 3, cursor: 'pointer', borderRadius: 4, textAlign: 'center',
                                                bgcolor: serviceType === service.id ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)',
                                                border: `2px solid ${serviceType === service.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                                transition: '0.2s', '&:hover': { borderColor: binThemeTokens.gold }
                                            }}
                                        >
                                            <Box sx={{ color: serviceType === service.id ? binThemeTokens.gold : 'rgba(255,255,255,0.3)', mb: 1 }}>{service.icon}</Box>
                                            <Typography variant="subtitle1" fontWeight="900" color={serviceType === service.id ? '#FFF' : 'rgba(255,255,255,0.5)'}>{service.title}</Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>

                        {/* Direct-to-Owner Policy Display (V6 Expansion) */}
                        {serviceType === 'property_management' && (
                            <Box sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 4 }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <ShieldCheck color={binThemeTokens.gold} size={32} />
                                    <Box>
                                        <Typography variant="h6" fontWeight="950" color="#FFF">Direct-to-Owner Payout Model</Typography>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                                            BIN GROUP does not hold tenant rental payments in escrow. All funds are settled directly into your verified UAE bank account. Our management fee is invoiced independently.
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Box>
                        )}

                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, mb: 2, display: 'block' }}>
                                02. ASSET DENSITY
                            </Typography>
                            <Box sx={{ px: 2 }}>
                                <Slider 
                                    value={assetCount}
                                    min={1} max={50}
                                    onChange={(_, v) => setAssetCount(v as number)}
                                    sx={{ color: binThemeTokens.gold }}
                                />
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography variant="caption" color="rgba(255,255,255,0.4)">1 ASSET</Typography>
                                    <Typography variant="h6" fontWeight="900" color={binThemeTokens.gold}>{assetCount} UNITS/VILLAS</Typography>
                                    <Typography variant="caption" color="rgba(255,255,255,0.4)">50+ ASSETS</Typography>
                                </Stack>
                            </Box>
                        </Box>

                        <FormControl fullWidth>
                            <InputLabel sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>OPERATIONAL TERRITORY</InputLabel>
                            <Select 
                                value={emirate} 
                                label="OPERATIONAL TERRITORY"
                                onChange={(e) => setEmirate(e.target.value)}
                                sx={{ bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF', borderRadius: 4 }}
                            >
                                <MenuItem value="Dubai">Dubai Headquarters</MenuItem>
                                <MenuItem value="Abu Dhabi">Abu Dhabi Division</MenuItem>
                                <MenuItem value="Al Ain">Al Ain Operations</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, bgcolor: '#161618', border: '1px solid rgba(198,167,94,0.2)', borderRadius: 6, position: 'sticky', top: 100 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>VALUATION SUMMARY</Typography>
                        <Stack spacing={3} sx={{ mt: 4 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography color="rgba(255,255,255,0.5)">Service Mode</Typography>
                                <Typography fontWeight={900} color="#FFF">{serviceType.toUpperCase().replace('_', ' ')}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography color="rgba(255,255,255,0.5)">Territory</Typography>
                                <Typography fontWeight={900} color="#FFF">{emirate}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Box sx={{ textAlign: 'center', py: 2 }}>
                                <Typography variant="caption" color={binThemeTokens.gold} fontWeight: 900}>ESTIMATED ANNUAL YIELD PROTECTION</Typography>
                                <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ mt: 1 }}>
                                    {serviceType === 'maintenance' ? 'AED 12,000+' : 'AED 25,000+'}
                                </Typography>
                                <Typography variant="caption" color="rgba(255,255,255,0.4)">Institutional Sovereign Pricing</Typography>
                            </Box>
                            <Button 
                                fullWidth 
                                variant="contained" 
                                size="large"
                                onClick={handleGenerate}
                                disabled={isCalculating}
                                sx={{ 
                                    bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 100,
                                    boxShadow: `0 10px 30px ${alpha(binThemeTokens.gold, 0.3)}`
                                }}
                            >
                                {isCalculating ? <CircularProgress size={24} color="inherit" /> : 'GENERATE OFFICIAL QUOTE'}
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}

export default QuotingWizard;
