import React from 'react';
import { 
    Box, Typography, Grid, Paper, TextField, Button, Stack, Container, Divider
} from '@mui/material';
import { Building2, User, Phone, Mail, FileText, ArrowRight, ShieldCheck, Target, Eye } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const CompanyProfileStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { companyProfile, updateCompanyProfile } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const canProceed = companyProfile.name && companyProfile.email && companyProfile.phone;

    const missionCards = [
        { icon: <Target size={22} />, title: t('onboarding.company_mission_title'), desc: t('onboarding.company_mission_desc') },
        { icon: <Eye size={22} />, title: t('onboarding.company_vision_title'), desc: t('onboarding.company_vision_desc') },
        { icon: <ShieldCheck size={22} />, title: t('onboarding.company_compliance_title'), desc: t('onboarding.company_compliance_desc') },
    ];

    return (
        <Box sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.company_profile')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 760, mx: 'auto' }}>
                    {t('onboarding.company_desc')}
                </Typography>
            </Box>

            <Container maxWidth="lg">
                <Grid container spacing={3}>
                    <Grid item xs={12} md={5}>
                        <Stack spacing={2}>
                            {missionCards.map((card) => (
                                <Paper key={card.title} sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(198,167,94,0.18)' }}>
                                    <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Box sx={{ color: binThemeTokens.gold, mt: 0.3 }}>{card.icon}</Box>
                                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="subtitle2" sx={{ color: '#FFF', fontWeight: 950, mb: 0.75 }}>{card.title}</Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>{card.desc}</Typography>
                                        </Box>
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>
                    </Grid>

                    <Grid item xs={12} md={7}>
                        <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Stack spacing={4}>
                                <TextField
                                    fullWidth label={t('onboarding.company_name')}
                                    value={companyProfile.name}
                                    onChange={(e) => updateCompanyProfile({ name: e.target.value })}
                                    InputProps={{ startAdornment: !isRTL ? <Building2 size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> : undefined, endAdornment: isRTL ? <Building2 size={20} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : undefined }}
                                    sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                />
                                <TextField
                                    fullWidth label={t('onboarding.trade_license')}
                                    value={companyProfile.licenseNumber}
                                    onChange={(e) => updateCompanyProfile({ licenseNumber: e.target.value })}
                                    InputProps={{ startAdornment: !isRTL ? <FileText size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> : undefined, endAdornment: isRTL ? <FileText size={20} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : undefined }}
                                    sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                />
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>{t('onboarding.primary_contact')}</Typography>
                                <TextField
                                    fullWidth label={t('onboarding.contact_name')}
                                    value={companyProfile.contactPerson}
                                    onChange={(e) => updateCompanyProfile({ contactPerson: e.target.value })}
                                    InputProps={{ startAdornment: !isRTL ? <User size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> : undefined, endAdornment: isRTL ? <User size={20} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : undefined }}
                                    sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                />
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth label={t('onboarding.contact_phone')}
                                            value={companyProfile.phone}
                                            onChange={(e) => updateCompanyProfile({ phone: e.target.value })}
                                            InputProps={{ startAdornment: !isRTL ? <Phone size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> : undefined, endAdornment: isRTL ? <Phone size={20} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : undefined }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <TextField
                                            fullWidth label={t('onboarding.contact_email')}
                                            value={companyProfile.email}
                                            onChange={(e) => updateCompanyProfile({ email: e.target.value })}
                                            InputProps={{ startAdornment: !isRTL ? <Mail size={20} style={{ marginRight: 12, color: binThemeTokens.gold }} /> : undefined, endAdornment: isRTL ? <Mail size={20} style={{ marginLeft: 12, color: binThemeTokens.gold }} /> : undefined }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                </Grid>

                                <Button 
                                    variant="contained" fullWidth size="large" 
                                    onClick={onNext} disabled={!canProceed}
                                    endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                    sx={{ mt: 2, py: 2, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                >
                                    {t('onboarding.onboard_btn')}
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default CompanyProfileStep;
