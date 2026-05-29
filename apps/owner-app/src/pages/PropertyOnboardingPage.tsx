import React from 'react';
import {
  Box,
  Container,
  Stepper,
  Step,
  StepLabel,
  Typography,
  CssBaseline,
  useTheme,
  useMediaQuery,
  alpha,
  Button
} from '@mui/material';
import { Shield as ShieldIcon } from 'lucide-react';
import { useOnboardingStore } from '../store/onboardingStore';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';

import CompanyProfileStep from '../components/onboarding/CompanyProfileStep';
import AssetProfileStep from '../components/onboarding/AssetProfileStep';
import PropertyLocationStep from '../components/onboarding/PropertyLocationStep';
import SystemsDataStep from '../components/onboarding/SystemsDataStep';
import CommercialTermsStep from '../components/onboarding/CommercialTermsStep';

import ProofUploadStep from '../components/onboarding/ProofUploadStep';
import AccountCreationStep from '../components/onboarding/AccountCreationStep';
import ReviewBeforeSubmitStep from '../components/onboarding/ReviewBeforeSubmitStep';
import PaymentSummaryStep from '../components/onboarding/PaymentSummaryStep';
import PaymentSubmissionStep from '../components/onboarding/PaymentSubmissionStep';

const PropertyOnboardingPage = () => {
    const { step, nextStep, prevStep } = useOnboardingStore();
    const { lang, setLang, t, isRTL } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const onboardingSteps = [
        t('onboarding.company'),
        t('onboarding.asset'),
        t('onboarding.location'),
        t('onboarding.systems'),
        t('onboarding.service_plan'),

        t('onboarding.documents'),
        t('onboarding.verification'),
        t('onboarding.review'),
        'Payment Options',
        t('onboarding.payment')
    ];

    const renderStepContent = (stepIndex: number) => {
        switch (stepIndex) {
            case 1: return <CompanyProfileStep onNext={nextStep} />;
            case 2: return <AssetProfileStep onNext={nextStep} onBack={prevStep} />;
            case 3: return <PropertyLocationStep onNext={nextStep} onBack={prevStep} />;
            case 4: return <SystemsDataStep onNext={nextStep} onBack={prevStep} />;
            case 5: return <CommercialTermsStep onNext={nextStep} onBack={prevStep} />;
            case 6: return <ProofUploadStep onNext={nextStep} onBack={prevStep} />;
            case 7: return <AccountCreationStep onNext={nextStep} onBack={prevStep} />;
            case 8: return <ReviewBeforeSubmitStep onNext={nextStep} onBack={prevStep} />;
            case 9: return <PaymentSummaryStep onNext={nextStep} onBack={prevStep} />;
            case 10: return <PaymentSubmissionStep onBack={prevStep} />;
            default: return <CompanyProfileStep onNext={nextStep} />;
        }
    };

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ 
            minHeight: '100vh', 
            bgcolor: '#000', 
            backgroundImage: 'radial-gradient(circle at 2% 2%, rgba(198, 167, 94, 0.05) 0%, transparent 40%), radial-gradient(circle at 98% 98%, rgba(198, 167, 94, 0.05) 0%, transparent 40%)'
        }}>
            <CssBaseline />
            <Box sx={{ py: 3, px: 2, bgcolor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(15px)', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, zIndex: 1100 }}>
                <Container maxWidth="lg">
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>BIN GROUP</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Button variant="text" size="small" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1 }}>
                                {lang === 'en' ? 'عربي' : 'English'}
                            </Button>
                            <Button component="a" href="/" variant="text" size="small" sx={{ color: 'rgba(255,255,255,0.7)', textTransform: 'none', fontWeight: 800 }}>
                                {t('onboarding.back_website')}
                            </Button>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <ShieldIcon color="#10b981" size={18} />
                                <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{t('onboarding.institutional')}</Typography>
                            </Box>
                            <Button variant="outlined" size="small" sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.3), textTransform: 'none', fontWeight: 700 }}>
                                {t('onboarding.save_later')}
                            </Button>
                        </Box>
                    </Box>

                    <Stepper activeStep={step - 1} alternativeLabel={!isMobile} sx={{ minHeight: isMobile ? 34 : 'auto', '& .MuiStepLabel-labelContainer': { display: isMobile ? 'none' : 'block' }, '& .MuiStep-root': { direction: isRTL ? 'rtl' : 'ltr' } }}>
                        {onboardingSteps.map((label) => (
                            <Step key={label}>
                                <StepLabel StepIconProps={{ sx: { '&.Mui-active': { color: binThemeTokens.gold }, '&.Mui-completed': { color: '#4ADE80' } } }}>
                                    {!isMobile && <Typography variant="caption" fontWeight="700" sx={{ color: 'rgba(255,255,255,0.7)' }}>{label}</Typography>}
                                </StepLabel>
                            </Step>
                        ))}
                    </Stepper>
                </Container>
            </Box>

            <Container maxWidth="lg" sx={{ py: 6, minHeight: '60vh' }}>
                {renderStepContent(step)}
            </Container>
        </Box>
    );
};

export default PropertyOnboardingPage;
