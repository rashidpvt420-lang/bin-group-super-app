import React from 'react';
import { Box, Container, LinearProgress, Stack, Step, StepLabel, Stepper, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useOnboardingStore } from '../store/onboardingStore';
import CompanyProfileStep from '../components/onboarding/CompanyProfileStep';
import AssetProfileStep from '../components/onboarding/AssetProfileStep';
import PropertyLocationStep from '../components/onboarding/PropertyLocationStep';
import SystemsDataStep from '../components/onboarding/SystemsDataStep';
import CommercialTermsStep from '../components/onboarding/CommercialTermsStep';
import ProofUploadStep from '../components/onboarding/ProofUploadStep';
import AccountCreationStep from '../components/onboarding/AccountCreationStep';
import ReviewBeforeSubmitStep from '../components/onboarding/ReviewBeforeSubmitStep';
import ContractSignatureStep from '../components/onboarding/ContractSignatureStep';
import PaymentSummaryStep from '../components/onboarding/PaymentSummaryStep';
import PaymentSubmissionStep from '../components/onboarding/PaymentSubmissionStep';

const INTERNAL_STEP_COUNT = 11;
const VISIBLE_STAGE_COUNT = 5;
const stageByInternalStep = [1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 5];

const clampStep = (value: number, max: number) => Math.min(Math.max(value, 1), max);
const visibleStageForInternalStep = (step: number) => stageByInternalStep[clampStep(step, INTERNAL_STEP_COUNT) - 1] || 1;
const visibleStageProgress = (step: number) => Math.round((visibleStageForInternalStep(step) / VISIBLE_STAGE_COUNT) * 100);
const readable = (value: string | undefined, fallback: string) => (!value || value.includes('.') ? fallback : value);

export default function PropertyOnboardingPage() {
    const navigate = useNavigate();
    const { t, isRTL, lang } = useLanguage();
    const { step, nextStep, prevStep, setStep } = useOnboardingStore();
    const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);

    const visibleStages = [
        readable(t('onboarding.company'), label('Company', 'الشركة')),
        label('Property', 'العقار'),
        readable(t('onboarding.service_plan'), label('Plan', 'الخطة')),
        label('Account & Review', 'الحساب والمراجعة'),
        readable(t('onboarding.payment_options'), label('Contract & Payment', 'العقد والدفع')),
    ];

    const safeStep = clampStep(step, INTERNAL_STEP_COUNT);
    const visibleStage = visibleStageForInternalStep(safeStep);
    const activeVisibleStageIndex = clampStep(visibleStage, VISIBLE_STAGE_COUNT) - 1;
    const currentStageProgress = visibleStageProgress(safeStep);

    React.useEffect(() => {
        if (step !== safeStep) setStep(safeStep);
    }, [safeStep, setStep, step]);

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
            case 9: return <ContractSignatureStep onNext={nextStep} onBack={prevStep} />;
            case 10: return <PaymentSummaryStep onNext={nextStep} onBack={prevStep} />;
            case 11: return <PaymentSubmissionStep onBack={prevStep} />;
            default: return <CompanyProfileStep onNext={nextStep} />;
        }
    };

    return (
        <Box className="white-platinum-onboarding" dir={isRTL ? 'rtl' : 'ltr'} sx={{ minHeight: '100dvh', bgcolor: '#FFFFFF', color: '#111827', py: { xs: 2, md: 4 } }}>
            <Container maxWidth="xl">
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Button startIcon={<ArrowLeft size={18} />} onClick={() => navigate('/')} sx={{ color: '#B8932F', fontWeight: 900 }}>{readable(t('onboarding.back_home'), label('Back Home', 'الرجوع'))}</Button>
                    <Typography variant="caption" sx={{ color: '#B8932F', fontWeight: 900 }}>BIN GROUP ONBOARDING</Typography>
                </Stack>
                <Stepper activeStep={activeVisibleStageIndex} alternativeLabel sx={{ mb: 3 }}>
                    {visibleStages.map((stage) => <Step key={stage}><StepLabel>{stage}</StepLabel></Step>)}
                </Stepper>
                <LinearProgress variant="determinate" value={currentStageProgress} sx={{ mb: 4, height: 8, borderRadius: 99 }} />
                {renderStepContent(safeStep)}
            </Container>
        </Box>
    );
}
