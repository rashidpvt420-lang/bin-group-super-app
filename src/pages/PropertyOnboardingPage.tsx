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
} from '@mui/material';
import { useOnboardingStore } from '../store/onboardingStore';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';

import CompanyProfileStep from '../components/onboarding/CompanyProfileStep';
import AssetProfileStep from '../components/onboarding/AssetProfileStep';
import PropertyLocationStep from '../components/onboarding/PropertyLocationStep';
import SystemsDataStep from '../components/onboarding/SystemsDataStep';
import CommercialTermsStep from '../components/onboarding/CommercialTermsStep';
import AddOnsStep from '../components/onboarding/AddOnsStep';
import ProofUploadStep from '../components/onboarding/ProofUploadStep';
import AccountCreationStep from '../components/onboarding/AccountCreationStep';
import ReviewBeforeSubmitStep from '../components/onboarding/ReviewBeforeSubmitStep';
import PaymentSubmissionStep from '../components/onboarding/PaymentSubmissionStep';

const readable = (value: string | undefined, fallback: string) => {
  if (!value || value.includes('.')) return fallback;
  return value;
};

const PropertyOnboardingPage = () => {
    const { step, nextStep, prevStep } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const onboardingSteps = [
        readable(t('onboarding.company'), 'Company'),
        readable(t('onboarding.asset'), 'Asset'),
        readable(t('onboarding.location'), 'Location'),
        readable(t('onboarding.systems'), 'Systems'),
        readable(t('onboarding.service_plan'), 'Service Plan'),
        readable(t('onboarding.addons'), 'Add-ons'),
        readable(t('onboarding.documents'), 'Documents'),
        readable(t('onboarding.verification'), 'Verification'),
        readable(t('onboarding.review'), 'Review'),
        readable(t('onboarding.payment'), 'Payment'),
    ];

    const renderStepContent = (stepIndex: number) => {
        switch (stepIndex) {
            case 1: return <CompanyProfileStep onNext={nextStep} />;
            case 2: return <AssetProfileStep onNext={nextStep} onBack={prevStep} />;
            case 3: return <PropertyLocationStep onNext={nextStep} onBack={prevStep} />;
            case 4: return <SystemsDataStep onNext={nextStep} onBack={prevStep} />;
            case 5: return <CommercialTermsStep onNext={nextStep} onBack={prevStep} />;
            case 6: return <AddOnsStep onNext={nextStep} onBack={prevStep} />;
            case 7: return <ProofUploadStep onNext={nextStep} onBack={prevStep} />;
            case 8: return <AccountCreationStep onNext={nextStep} onBack={prevStep} />;
            case 9: return <ReviewBeforeSubmitStep onNext={nextStep} onBack={prevStep} />;
            case 10: return <PaymentSubmissionStep onBack={prevStep} />;
            default: return <CompanyProfileStep onNext={nextStep} />;
        }
    };

    return (
        <Box
            dir={isRTL ? 'rtl' : 'ltr'}
            sx={{
                minHeight: '100dvh',
                height: 'auto',
                overflowX: 'hidden',
                overflowY: 'visible',
                bgcolor: '#000',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                pb: { xs: 14, md: 8 },
                backgroundImage: 'radial-gradient(circle at 2% 2%, rgba(198, 167, 94, 0.05) 0%, transparent 40%), radial-gradient(circle at 98% 98%, rgba(198, 167, 94, 0.05) 0%, transparent 40%)'
            }}
        >
            <CssBaseline />

            <Container maxWidth="lg" sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 1, md: 2 }, px: { xs: 1.5, sm: 3 } }}>
                <Typography variant="caption" sx={{ display: { xs: 'block', sm: 'none' }, color: binThemeTokens.gold, fontWeight: 950, textAlign: 'center', mb: 1 }}>
                    Step {step} of {onboardingSteps.length}: {onboardingSteps[Math.max(0, step - 1)]}
                </Typography>
                <Stepper
                    activeStep={step - 1}
                    alternativeLabel={!isMobile}
                    sx={{
                        mb: { xs: 1.5, md: 4 },
                        minHeight: isMobile ? 34 : 'auto',
                        overflowX: isMobile ? 'auto' : 'visible',
                        overflowY: 'hidden',
                        WebkitOverflowScrolling: 'touch',
                        '& .MuiStepLabel-labelContainer': { display: isMobile ? 'none' : 'block' },
                        '& .MuiStep-root': { direction: isRTL ? 'rtl' : 'ltr', minWidth: isMobile ? 36 : 'auto' },
                    }}
                >
                    {onboardingSteps.map((label) => (
                        <Step key={label}>
                            <StepLabel
                                StepIconProps={{
                                    sx: {
                                        '&.Mui-active': { color: binThemeTokens.gold },
                                        '&.Mui-completed': { color: '#4ADE80' },
                                    },
                                }}
                            >
                                {!isMobile && (
                                    <Typography variant="caption" fontWeight="700" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                        {label}
                                    </Typography>
                                )}
                            </StepLabel>
                        </Step>
                    ))}
                </Stepper>
            </Container>

            <Container
                maxWidth="lg"
                sx={{
                    py: { xs: 1.5, md: 4 },
                    px: { xs: 1.5, sm: 3 },
                    minHeight: 'auto',
                    overflow: 'visible',
                }}
            >
                {renderStepContent(step)}
            </Container>
        </Box>
    );
};

export default PropertyOnboardingPage;
