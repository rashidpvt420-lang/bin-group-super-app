import React from 'react';
import {
  Box,
  Container,
  Stepper,
  Step,
  StepLabel,
  Typography,
  CssBaseline,
  GlobalStyles,
  useTheme,
  useMediaQuery,
  alpha,
} from '@mui/material';
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
import ContractSignatureStep from '../components/onboarding/ContractSignatureStep';
import PaymentSummaryStep from '../components/onboarding/PaymentSummaryStep';
import PaymentSubmissionStep from '../components/onboarding/PaymentSubmissionStep';

const readable = (value: string | undefined, fallback: string) => {
  if (!value || value.includes('.')) return fallback;
  return value;
}

const INTERNAL_STEP_COUNT = 11;
const VISIBLE_STAGE_COUNT = 6;

const clampStep = (value: number, max: number) => Math.min(Math.max(value, 1), max);

const visibleStageForInternalStep = (internalStep: number) => {
  if (internalStep <= 3) return 1;
  if (internalStep <= 4) return 2;
  if (internalStep <= 5) return 3;
  if (internalStep <= 7) return 4;
  if (internalStep <= 9) return 5;
  return 6;
};

const visibleStageProgress = (internalStep: number) => {
  if (internalStep <= 3) return `${internalStep}/3`;
  if (internalStep === 4) return '1/1';
  if (internalStep === 5) return '1/1';
  if (internalStep <= 7) return `${internalStep - 5}/2`;
  if (internalStep <= 9) return `${internalStep - 7}/2`;
  return `${internalStep - 9}/2`;
};

const platinum = '#F7F7F4';
const platinumLine = '#E8E3D7';
const ink = '#111827';
const muted = '#667085';
const gold = binThemeTokens.gold;

const whitePlatinumOverrides = {
  body: {
    background: '#FFFFFF !important',
  },
  '#root': {
    background: '#FFFFFF !important',
  },
  '.white-platinum-onboarding': {
    background: '#FFFFFF !important',
    color: `${ink} !important`,
  },
  '.white-platinum-onboarding .MuiTypography-root': {
    color: `${ink} !important`,
  },
  '.white-platinum-onboarding .MuiTypography-caption, .white-platinum-onboarding .MuiTypography-body1, .white-platinum-onboarding .MuiTypography-body2, .white-platinum-onboarding .MuiFormHelperText-root': {
    color: `${muted} !important`,
  },
  '.white-platinum-onboarding .MuiTypography-overline': {
    color: `${gold} !important`,
    letterSpacing: '0.12em',
  },
  '.white-platinum-onboarding .MuiPaper-root': {
    background: 'rgba(255,255,255,0.94) !important',
    color: `${ink} !important`,
    border: `1px solid ${platinumLine} !important`,
    boxShadow: '0 22px 64px rgba(17, 24, 39, 0.08) !important',
  },
  '.white-platinum-onboarding .MuiPaper-root .MuiPaper-root': {
    background: 'rgba(255,255,255,0.98) !important',
    border: `1px solid ${platinumLine} !important`,
    boxShadow: '0 14px 38px rgba(17, 24, 39, 0.06) !important',
  },
  '.white-platinum-onboarding .MuiChip-root': {
    background: `${alpha(gold, 0.10)} !important`,
    color: '#5E4A1F !important',
    border: `1px solid ${alpha(gold, 0.20)} !important`,
    fontWeight: '850 !important',
  },
  '.white-platinum-onboarding .MuiChip-label': {
    color: 'inherit !important',
  },
  '.white-platinum-onboarding svg': {
    color: `${gold} !important`,
    stroke: `${gold} !important`,
  },
  '.white-platinum-onboarding .MuiInputLabel-root': {
    color: `${muted} !important`,
  },
  '.white-platinum-onboarding .MuiOutlinedInput-root': {
    background: '#FFFFFF !important',
    color: `${ink} !important`,
    borderRadius: '18px !important',
  },
  '.white-platinum-onboarding .MuiOutlinedInput-notchedOutline': {
    borderColor: `${platinumLine} !important`,
  },
  '.white-platinum-onboarding .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline, .white-platinum-onboarding .Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: `${gold} !important`,
  },
  '.white-platinum-onboarding .MuiInputBase-input, .white-platinum-onboarding .MuiSelect-select': {
    color: `${ink} !important`,
  },
  '.white-platinum-onboarding .MuiButton-contained, .white-platinum-onboarding .MuiButton-containedPrimary': {
    background: `linear-gradient(135deg, ${binThemeTokens.goldLight}, ${gold}) !important`,
    color: '#111111 !important',
    boxShadow: `0 16px 40px ${alpha(gold, 0.26)} !important`,
  },
  '.white-platinum-onboarding .MuiButton-outlined': {
    color: `${gold} !important`,
    borderColor: `${alpha(gold, 0.42)} !important`,
    background: '#FFFFFF !important',
  },
  '.white-platinum-onboarding .MuiAlert-root': {
    background: '#FFF8E7 !important',
    color: '#6F5522 !important',
    border: `1px solid ${alpha(gold, 0.24)} !important`,
  },
  '.white-platinum-onboarding .MuiStepConnector-line': {
    borderColor: `${platinumLine} !important`,
  },
  '.white-platinum-onboarding .MuiStepIcon-root': {
    color: '#C7CCD4 !important',
  },
  '.white-platinum-onboarding .MuiStepIcon-root.Mui-active': {
    color: `${gold} !important`,
  },
  '.white-platinum-onboarding .MuiStepIcon-root.Mui-completed': {
    color: '#7A6430 !important',
  },
  '.white-platinum-onboarding .MuiStepIcon-text': {
    fill: '#111111 !important',
    fontWeight: '900 !important',
  },
  '.white-platinum-onboarding a': {
    color: `${gold} !important`,
  },
};

const PropertyOnboardingPage = () => {
    const { step, setStep, nextStep, prevStep } = useOnboardingStore();
    const { t, isRTL, lang } = useLanguage();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);

    const visibleStages = [
        label('Owner Property', 'بيانات المالك والعقار'),
        label('Systems + Add-ons', 'الأنظمة والإضافات'),
        label('Plan Price', 'الخطة والسعر'),
        label('Documents Account', 'المستندات والحساب'),
        label('Contract', 'العقد'),
        label('Payment', 'الدفع'),
    ];

    const internalStepLabels = [
        readable(t('onboarding.company'), label('Company', 'الشركة')),
        readable(t('onboarding.asset'), label('Asset', 'الأصل')),
        readable(t('onboarding.location'), label('Location', 'الموقع')),
        readable(t('onboarding.systems'), label('Systems + Add-ons', 'الأنظمة والإضافات')),
        readable(t('onboarding.service_plan'), label('Service Plan', 'خطة الخدمة')),
        readable(t('onboarding.documents'), label('Documents', 'المستندات')),
        readable(t('onboarding.verification'), label('Account', 'الحساب')),
        readable(t('onboarding.review'), label('Review', 'المراجعة')),
        readable(t('onboarding.contract'), label('Contract', 'العقد')),
        readable(t('onboarding.payment_options'), label('Payment Options', 'خيارات الدفع')),
        readable(t('onboarding.payment_submission'), label('Payment Submission', 'تقديم الدفع')),
    ];

    const safeStep = clampStep(step, INTERNAL_STEP_COUNT);
    const visibleStage = visibleStageForInternalStep(safeStep);
    const activeVisibleStageIndex = clampStep(visibleStage, VISIBLE_STAGE_COUNT) - 1;
    const currentInternalLabel = internalStepLabels[Math.max(0, safeStep - 1)];
    const currentVisibleLabel = visibleStages[activeVisibleStageIndex];
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
            case 10: return <PaymentSummaryStep onNext={nextStep} />;
            case 11: return <PaymentSubmissionStep onBack={prevStep} />;
            default: return <CompanyProfileStep onNext={nextStep} />;
        }
    };

    return (
        <Box
            className="white-platinum-onboarding"
            dir={isRTL ? 'rtl' : 'ltr'}
            sx={{
                minHeight: '100dvh',
                height: 'auto',
                overflowX: 'hidden',
                overflowY: 'visible',
                bgcolor: '#FFFFFF',
                color: ink,
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                pb: { xs: 14, md: 8 },
                position: 'relative',
                backgroundImage: `radial-gradient(circle at 8% 5%, ${alpha(gold, 0.12)} 0%, transparent 34rem), radial-gradient(circle at 94% 96%, ${alpha('#C0C6CF', 0.22)} 0%, transparent 34rem), linear-gradient(180deg, #FFFFFF 0%, ${platinum} 100%)`,
                '&::before': {
                    content: '"BIN GROUP"',
                    position: 'fixed',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: ink,
                    opacity: 0.035,
                    fontWeight: 950,
                    fontSize: { xs: '17vw', md: '11vw' },
                    letterSpacing: '-0.08em',
                    pointerEvents: 'none',
                    zIndex: 0,
                },
                '& > *': {
                    position: 'relative',
                    zIndex: 1,
                },
            }}
        >
            <CssBaseline />
            <GlobalStyles styles={whitePlatinumOverrides} />

            <Container maxWidth="lg" sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 1, md: 2 }, px: { xs: 1.5, sm: 3 } }}>
                <Typography variant="caption" sx={{ display: 'block', color: `${gold} !important`, fontWeight: 950, textAlign: 'center', mb: 0.75 }}>
                    {lang === 'ar' ? `المرحلة ${visibleStage} من ${VISIBLE_STAGE_COUNT}: ${currentVisibleLabel}` : `Stage ${visibleStage} of ${VISIBLE_STAGE_COUNT}: ${currentVisibleLabel}`}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', color: `${muted} !important`, fontWeight: 800, textAlign: 'center', mb: { xs: 1, md: 2 } }}>
                    {lang === 'ar' ? `الجزء ${currentStageProgress}: ${currentInternalLabel}` : `Part ${currentStageProgress}: ${currentInternalLabel}`}
                </Typography>
                <Stepper
                    activeStep={activeVisibleStageIndex}
                    alternativeLabel={!isMobile}
                    sx={{
                        mb: { xs: 1.5, md: 4 },
                        minHeight: isMobile ? 34 : 'auto',
                        overflowX: isMobile ? 'auto' : 'visible',
                        overflowY: 'hidden',
                        WebkitOverflowScrolling: 'touch',
                        '& .MuiStepLabel-labelContainer': { display: isMobile ? 'none' : 'block' },
                        '& .MuiStep-root': { direction: isRTL ? 'rtl' : 'ltr', minWidth: isMobile ? 48 : 'auto' },
                    }}
                >
                    {visibleStages.map((stageLabel) => (
                        <Step key={stageLabel}>
                            <StepLabel
                                StepIconProps={{
                                    sx: {
                                        '&.Mui-active': { color: gold },
                                        '&.Mui-completed': { color: '#7A6430' },
                                    },
                                }}
                            >
                                {!isMobile && (
                                    <Typography variant="caption" fontWeight="700" sx={{ color: `${muted} !important` }}>
                                        {stageLabel}
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
                {renderStepContent(safeStep)}
            </Container>
        </Box>
    );
};

export default PropertyOnboardingPage;
