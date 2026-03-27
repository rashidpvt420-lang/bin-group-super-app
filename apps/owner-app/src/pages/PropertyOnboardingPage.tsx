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
    IconButton,
    alpha
} from '@mui/material';
import { 
    ArrowLeft, 
    ArrowRight,
    Building2, 
    HelpCircle,
    ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PropertyIntakeStep from '../components/onboarding/PropertyIntakeStep';
import QuotingWizard from '../components/QuotingWizard';
import AddOnsStep from '../components/onboarding/AddOnsStep';
import PaymentSummaryStep from '../components/onboarding/PaymentSummaryStep';
import AccountActivationStep from '../components/onboarding/AccountActivationStep';
import AssetAnalysisStep from '../components/onboarding/AssetAnalysisStep';
import QuoteModelingStep from '../components/onboarding/QuoteModelingStep';
import ContractSelectionStep from '../components/onboarding/ContractSelectionStep';
import { useOnboardingStore } from '../store/onboardingStore';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '../context/LanguageContext';

const onboardingSteps = [
    'onboarding.step.landing',
    'onboarding.step.intake',
    'onboarding.step.analysis',
    'onboarding.step.quote',
    'onboarding.step.selection',
    'onboarding.step.tailoring',
    'onboarding.step.deposit',
    'onboarding.step.activation'
];

const PropertyOnboardingPage: React.FC = () => {
    const navigate = useNavigate();
    const { step, nextStep, prevStep, setSelectedPlan, reset } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const handleExit = () => {
        reset();
        navigate('/');
    };

    const handlePlanSelect = (plan: any) => {
        setSelectedPlan(plan);
        nextStep();
    };

    const renderStepContent = (stepIndex: number) => {
        switch (stepIndex) {
            case 0:
                // This shouldn't really be visible as Landing is on its own page
                return <Box sx={{ p: 4, textAlign: 'center' }}><Typography>Redirecting to Landing...</Typography></Box>;
            case 1:
                return <PropertyIntakeStep onNext={nextStep} />;
            case 2:
                return <AssetAnalysisStep onNext={nextStep} />;
            case 3:
                return <QuoteModelingStep onNext={nextStep} onBack={prevStep} />;
            case 4:
                return <ContractSelectionStep onNext={nextStep} onBack={prevStep} />;
            case 5:
                return <AddOnsStep onNext={nextStep} onBack={prevStep} />;
            case 6:
                return <PaymentSummaryStep onNext={nextStep} onBack={prevStep} />;
            case 7:
                return <AccountActivationStep />;
            default:
                return 'Unknown step';
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.black, color: binThemeTokens.textPrimary }}>
            <CssBaseline />
            {/* Onboarding Header */}
            <Box sx={{ 
                p: isMobile ? 2 : 4, 
                bgcolor: 'rgba(11, 11, 12, 0.8)', 
                borderBottom: `1px solid ${theme.palette.divider}`, 
                backdropFilter: 'blur(30px)',
                position: 'sticky',
                top: 0,
                zIndex: 1000
            }}>
                <Container maxWidth="lg">
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box component="img" src="/logo.png" sx={{ height: isMobile ? 32 : 40, filter: 'brightness(0) saturate(100%) invert(75%) sepia(21%) saturate(542%) hue-rotate(1deg) brightness(91%) contrast(83%)' }} />
                            {!isMobile && (
                                <Box sx={{ borderLeft: `1px solid ${theme.palette.divider}`, pl: 2 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 900, letterSpacing: 2, color: binThemeTokens.gold }}>SOVEREIGN INTAKE</Typography>
                                </Box>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <IconButton sx={{ color: binThemeTokens.textSecondary }}><HelpCircle size={20} /></IconButton>
                                <Button 
                                    variant="text"
                                    startIcon={<ArrowLeft style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }} />} 
                                    onClick={handleExit}
                                    sx={{ color: binThemeTokens.textSecondary }}
                                >
                                    {t('btn.exit')}
                                </Button>
                        </Box>
                    </Box>

                    {isMobile ? (
                        <Box sx={{ py: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 900, color: binThemeTokens.gold }}>
                                    STEP {step}: {t(onboardingSteps[step]).toUpperCase()}
                                </Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>
                                    {Math.round((step / (onboardingSteps.length - 1)) * 100)}%
                                </Typography>
                            </Box>
                            <Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                <Box sx={{ 
                                    height: '100%', 
                                    width: `${(step / (onboardingSteps.length - 1)) * 100}%`, 
                                    bgcolor: binThemeTokens.gold, 
                                    transition: 'width 0.5s ease' 
                                }} />
                            </Box>
                        </Box>
                    ) : (
                        <Stepper activeStep={step} alternativeLabel 
                            sx={{ 
                                '& .MuiStepLabel-label': { color: '#2A2A2A', fontWeight: 900, mt: 1 },
                                '& .MuiStepLabel-label.Mui-active': { color: binThemeTokens.gold },
                                '& .MuiStepLabel-label.Mui-completed': { color: binThemeTokens.gold },
                                '& .MuiStepIcon-root': { color: '#2A2A2A' },
                                '& .MuiStepIcon-root.Mui-active': { color: binThemeTokens.gold },
                                '& .MuiStepIcon-root.Mui-completed': { color: binThemeTokens.gold },
                            }}
                        >
                            {onboardingSteps.map((label) => (
                                <Step key={label}>
                                    <StepLabel>{t(label)}</StepLabel>
                                </Step>
                            ))}
                        </Stepper>
                    )}
                </Container>
            </Box>

            <Container maxWidth="lg" sx={{ py: 6, minHeight: '60vh' }}>
                {renderStepContent(step)}
            </Container>
        </Box>
    );
};

export default PropertyOnboardingPage;
