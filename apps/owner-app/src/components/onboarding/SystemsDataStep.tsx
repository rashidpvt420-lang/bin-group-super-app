import React from 'react';
import { 
    Box, Typography, Grid, Paper, Checkbox, FormControlLabel, 
    Stack, Button, Container 
} from '@mui/material';
import { ArrowRight, ArrowLeft, Zap, Wind, Waves, ShieldCheck, Flame, Sun, Car } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const SystemsDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const activeProperty = properties[0];

    const systemGroups = [
        {
            title: t('onboarding.sys.core'),
            systems: [
                { key: 'hvac', label: t('onboarding.sys.hvac'), icon: <Wind size={18} /> },
                { key: 'districtCooling', label: t('onboarding.sys.districtCooling'), icon: <Wind size={18} /> },
                { key: 'tank', label: t('onboarding.sys.tank'), icon: <Zap size={18} /> },
                { key: 'gen', label: t('onboarding.sys.gen'), icon: <Zap size={18} /> },
                { key: 'lifts', label: t('onboarding.sys.lifts'), icon: <Zap size={18} /> },
            ]
        },
        {
            title: t('onboarding.sys.safety'),
            systems: [
                { key: 'fireAlarm', label: t('onboarding.sys.fireAlarm'), icon: <Flame size={18} /> },
                { key: 'firePump', label: t('onboarding.sys.firePump'), icon: <Flame size={18} /> },
                { key: 'sira', label: t('onboarding.sys.sira'), icon: <ShieldCheck size={18} /> },
                { key: 'bmu', label: t('onboarding.sys.bmu'), icon: <Zap size={18} /> },
                { key: 'wasteMan', label: t('onboarding.sys.wasteMan'), icon: <Zap size={18} /> },
            ]
        },
        {
            title: t('onboarding.sys.amenities'),
            systems: [
                { key: 'pool', label: t('onboarding.sys.pool'), icon: <Waves size={18} /> },
                { key: 'gasSystem', label: t('onboarding.sys.gasSystem'), icon: <Flame size={18} /> },
                { key: 'greaseTrap', label: t('onboarding.sys.greaseTrap'), icon: <Waves size={18} /> },
                { key: 'majlisGarden', label: t('onboarding.sys.majlisGarden'), icon: <Sun size={18} /> },
                { key: 'solarIntegration', label: t('onboarding.sys.solarIntegration'), icon: <Sun size={18} /> },
                { key: 'evReadiness', label: t('onboarding.sys.evReadiness'), icon: <Car size={18} /> },
            ]
        }
    ];

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                    {t('onboarding.systems_audit')}
                </Typography>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.systems_matrix')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 800, mx: 'auto' }}>
                    {t('onboarding.systems_desc')}
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
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                                '& .MuiTypography-root': { flexGrow: 1, textAlign: isRTL ? 'right' : 'left' }
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                <Box sx={{ mt: 8, display: 'flex', justifyContent: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Button 
                        variant="outlined" 
                        size="large" 
                        onClick={onBack}
                        startIcon={!isRTL ? <ArrowLeft /> : null}
                        endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null}
                        sx={{ borderRadius: 100, px: 6, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                        {t('onboarding.back')}
                    </Button>
                    <Button 
                        variant="contained" 
                        size="large" 
                        onClick={onNext}
                        endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                        sx={{ 
                            borderRadius: 100, px: 8, 
                            bgcolor: binThemeTokens.gold, color: '#000', 
                            fontWeight: 950,
                            '&:hover': { bgcolor: '#E6C77A' }
                        }}
                    >
                        {t('onboarding.initialize_analysis')}
                    </Button>
                </Box>
            </Container>
        </Box>
    );
};

export default SystemsDataStep;
