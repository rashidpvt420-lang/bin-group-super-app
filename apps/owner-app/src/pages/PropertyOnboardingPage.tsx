import React from 'react';
import { 
    Box, 
    Container, 
    Stepper, 
    Step, 
    StepLabel, 
    Typography,
    Paper,
    CssBaseline,
    Stack,
    Divider,
    Button,
    useTheme,
    useMediaQuery,
    alpha
} from '@mui/material';
import { 
    CheckCircle, 
    ArrowRight, 
    ArrowLeft, 
    Shield, 
    TrendingUp,
    Building,
    MousePointer as WorkflowIcon,
    Shield as ShieldIcon
} from 'lucide-react';
import { useOnboardingStore } from '../store/onboardingStore';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';

// Steps
import PropertyIntakeStep from '../components/onboarding/PropertyIntakeStep';
import AssetAnalysisStep from '../components/onboarding/AssetAnalysisStep';
import QuoteModelingStep from '../components/onboarding/QuoteModelingStep';
import ContractSelectionStep from '../components/onboarding/ContractSelectionStep';
import AddOnsStep from '../components/onboarding/AddOnsStep';
import PaymentSummaryStep from '../components/onboarding/PaymentSummaryStep';
import AccountActivationStep from '../components/onboarding/AccountActivationStep';

const PropertyOnboardingPage = () => {
    const { step, nextStep, prevStep } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const onboardingSteps = [
        t('step.intake'),
        t('step.analysis'),
        t('step.quote'),
        t('step.tier'),
        t('step.addons'),
        t('step.summary'),
        t('step.account')
    ];

    const renderStepContent = (stepIndex: number) => {
        switch (stepIndex) {
            case 1: return <PropertyIntakeStep onNext={nextStep} />;
            case 2: return <AssetAnalysisStep onNext={nextStep} />;
            case 3: return <QuoteModelingStep onNext={nextStep} onBack={prevStep} />;
            case 4: return <ContractSelectionStep onNext={nextStep} onBack={prevStep} />;
            case 5: return <AddOnsStep onNext={nextStep} onBack={prevStep} />;
            case 6: return <PaymentSummaryStep onNext={nextStep} onBack={prevStep} />;
            case 7: return <AccountActivationStep />;
            default: return <PropertyIntakeStep onNext={nextStep} />;
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
                            BIN-Groups
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ShieldIcon color="#10b981" size={18} />
                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>V1.22 SECURE PROTOCOL</Typography>
                        </Box>
                    </Box>

                    <Stepper activeStep={step - 1} alternativeLabel={!isMobile}>
                        {(Array.isArray(onboardingSteps) ? onboardingSteps : []).map((label) => (
                            <Step key={label}>
                                <StepLabel 
                                    StepIconProps={{
                                        sx: {
                                            '&.Mui-active': { color: binThemeTokens.gold },
                                            '&.Mui-completed': { color: '#4ADE80' }
                                        }
                                    }}
                                >
                                    <Typography variant="caption" fontWeight="700" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                        {label}
                                    </Typography>
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
