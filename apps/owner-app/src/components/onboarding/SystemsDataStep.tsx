import React from 'react';
import { 
    Box, Typography, Grid, Paper, Checkbox, FormControlLabel, 
    Stack, Button, Divider, alpha, Container 
} from '@mui/material';
import { ArrowRight, ArrowLeft, Zap, Wind, Waves, ShieldCheck, Flame, Sun, Car } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const SystemsDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();

    const activeProperty = properties[0];

    const systemGroups = [
        {
            title: 'CORE CLIMATE & FLOW',
            systems: [
                { key: 'hvac', label: 'Central HVAC', icon: <Wind size={18} /> },
                { key: 'districtCooling', label: 'District Cooling', icon: <Wind size={18} /> },
                { key: 'tank', label: 'Water Tank / Pump', icon: <Zap size={18} /> },
                { key: 'gen', label: 'Emergency Generator', icon: <Zap size={18} /> },
            ]
        },
        {
            title: 'SAFETY & COMPLIANCE',
            systems: [
                { key: 'fireAlarm', label: 'Civil Defense Alarm', icon: <Flame size={18} /> },
                { key: 'firePump', label: 'Fire Suppression Pump', icon: <Flame size={18} /> },
                { key: 'sira', label: 'SIRA / CCTV System', icon: <ShieldCheck size={18} /> },
                { key: 'bmu', label: 'BMU / Cradle', icon: <Zap size={18} /> },
            ]
        },
        {
            title: 'AMENITIES & SUSTAINABILITY',
            systems: [
                { key: 'pool', label: 'Swimming Pool', icon: <Waves size={18} /> },
                { key: 'solarIntegration', label: 'Solar Integration', icon: <Sun size={18} /> },
                { key: 'evReadiness', label: 'EV Charging Station', icon: <Car size={18} /> },
                { key: 'irrigationSystem', label: 'Smart Irrigation', icon: <Waves size={18} /> },
            ]
        }
    ];

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.systems_audit', 'CRITICAL SYSTEMS AUDIT')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.systems_desc', 'Declare institutional systems for lifecycle modeling and SLA compliance.')}
                </Typography>
            </Box>

            <Container maxWidth="lg">
                <Grid container spacing={3}>
                    {systemGroups.map((group, gIdx) => (
                        <Grid item xs={12} md={4} key={gIdx}>
                            <Paper sx={{ p: 4, borderRadius: 6, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                    {group.title}
                                </Typography>
                                <Stack spacing={1}>
                                    {group.systems.map((sys) => (
                                        <FormControlLabel
                                            key={sys.key}
                                            control={
                                                <Checkbox 
                                                    checked={(activeProperty as any)[sys.key] || false} 
                                                    onChange={(e) => updateProperty(0, { [sys.key]: e.target.checked })}
                                                    sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: binThemeTokens.gold } }}
                                                />
                                            }
                                            label={
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Box sx={{ color: (activeProperty as any)[sys.key] ? binThemeTokens.gold : 'rgba(255,255,255,0.2)' }}>
                                                        {sys.icon}
                                                    </Box>
                                                    <Typography variant="body2" sx={{ color: (activeProperty as any)[sys.key] ? '#FFF' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                                                        {sys.label}
                                                    </Typography>
                                                </Stack>
                                            }
                                            sx={{ 
                                                m: 0, mb: 1, p: 1.5, borderRadius: 2,
                                                bgcolor: (activeProperty as any)[sys.key] ? 'rgba(198, 167, 94, 0.05)' : 'transparent',
                                                border: `1px solid ${(activeProperty as any)[sys.key] ? 'rgba(198, 167, 94, 0.1)' : 'transparent'}`,
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                <Box sx={{ mt: 8, display: 'flex', justifyContent: 'center', gap: 2 }}>
                    <Button 
                        variant="outlined" 
                        size="large" 
                        onClick={onBack}
                        startIcon={<ArrowLeft />}
                        sx={{ borderRadius: 100, px: 6, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                        BACK
                    </Button>
                    <Button 
                        variant="contained" 
                        size="large" 
                        onClick={onNext}
                        endIcon={<ArrowRight />}
                        sx={{ 
                            borderRadius: 100, px: 8, 
                            bgcolor: binThemeTokens.gold, color: '#000', 
                            fontWeight: 950,
                            '&:hover': { bgcolor: '#E6C77A' }
                        }}
                    >
                        INITIALIZE ANALYSIS
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default SystemsDataStep;
