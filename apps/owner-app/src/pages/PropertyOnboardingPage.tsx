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
    alpha
} from '@mui/material';
import { 
    Shield as ShieldIcon
} from 'lucide-react';
import { useOnboardingStore } from '../store/onboardingStore';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';

// New Guided Steps
import PropertyTypeStep from '../components/onboarding/PropertyTypeStep';
import PropertyLocationStep from '../components/onboarding/PropertyLocationStep';
import BuildingDataStep from '../components/onboarding/BuildingDataStep';
import SystemsDataStep from '../components/onboarding/SystemsDataStep';
import ContractTypeStep from '../components/onboarding/ContractTypeStep';
import PaymentTermsStep from '../components/onboarding/PaymentTermsStep';
import OnboardingReviewStep from '../components/onboarding/OnboardingReviewStep';
import AdminSubmissionStep from '../components/onboarding/AdminSubmissionStep';
import AccountActivationStep from '../components/onboarding/AccountActivationStep';

const PropertyOnboardingPage = () => {
    const { step, nextStep, prevStep } = useOnboardingStore();
    const { t, tx, isRTL } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const onboardingSteps = [
        tx('step.type', 'Type'),
        tx('step.location', 'Location'),
        tx('step.data', 'Building'),
        tx('step.systems', 'Systems'),
        tx('step.contract', 'Contract'),
        tx('step.terms', 'Terms'),
        tx('step.review', 'Review'),
        tx('step.submit', 'Submit')
    ];

    const renderStepContent = (stepIndex: number) => {
        switch (stepIndex) {
            case 1: return <PropertyTypeStep onNext={nextStep} />;
            case 2: return <PropertyLocationStep onNext={nextStep} onBack={prevStep} />;
            case 3: return <BuildingDataStep onNext={nextStep} onBack={prevStep} />;
            case 4: return <SystemsDataStep onNext={nextStep} onBack={prevStep} />;
            case 5: return <ContractTypeStep onNext={nextStep} onBack={prevStep} />;
            case 6: return <PaymentTermsStep onNext={nextStep} onBack={prevStep} />;
            case 7: return <OnboardingReviewStep onNext={nextStep} onBack={prevStep} />;
            case 8: return <AdminSubmissionStep onNext={nextStep} />;
            case 9: return <AccountActivationStep />;
            default: return <PropertyTypeStep onNext={nextStep} />;
        }
    };

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: '#000', 
            backgroundImage: 'radial-gradient(circle at 2% 2%, rgba(198, 167, 94, 0.05) 0%, transparent 40%), radial-gradient(circle at 98% 98%, rgba(198, 167, 94, 0.05) 0%, transparent 40%)'
        }}>
            <CssBaseline />
            
            {/* STICKY HEADER */}
            <Box sx={{ 
                py: 3, px: 2, bgcolor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(15px)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                position: 'sticky', top: 0, zIndex: 1100
            }}>
                <Container maxWidth="lg">
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                        <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.gold }}>
                            BIN GROUP
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ShieldIcon color="#10b981" size={18} />
                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>V2.0 SECURE ONBOARDING</Typography>
                        </Box>
                    </Box>

                    <Stepper activeStep={step - 1} alternativeLabel={!isMobile}>
                        {onboardingSteps.map((label) => (
                            <Step key={label}>
                                <StepLabel 
                                    StepIconProps={{
                                        sx: {
                                            '&.Mui-active': { color: binThemeTokens.gold },
                                            '&.Mui-completed': { color: '#4ADE80' }
                                        }
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
            </Box>

            <Container maxWidth="lg" sx={{ py: 6, minHeight: '60vh' }}>
                {renderStepContent(step)}
            </Container>
        </Box>
    );
};

export default PropertyOnboardingPage;
