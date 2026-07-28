import React from 'react';
import { Alert, Box, Chip, Container, LinearProgress, Stack, Step, StepLabel, Stepper, Typography, Button } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useOnboardingStore } from '../store/onboardingStore';
import { functions, httpsCallable } from '../lib/firebase';
import CompanyProfileStep from '../components/onboarding/CompanyProfileStep';
import AccountCreationStep from '../components/onboarding/AccountCreationStep';
import AssetProfileStep from '../components/onboarding/AssetProfileStep';
import PropertyLocationStep from '../components/onboarding/PropertyLocationStep';
import SystemsDataStep from '../components/onboarding/SystemsDataStep';
import CommercialTermsStep from '../components/onboarding/CommercialTermsStep';
import ProofUploadStep from '../components/onboarding/ProofUploadStep';
import ReviewBeforeSubmitStep from '../components/onboarding/ReviewBeforeSubmitStep';
import ContractSignatureStep from '../components/onboarding/ContractSignatureStep';
import PaymentSummaryStep from '../components/onboarding/PaymentSummaryStep';
import PaymentSubmissionStep from '../components/onboarding/PaymentSubmissionStep';

const INTERNAL_STEP_COUNT = 11;
const VISIBLE_STAGE_COUNT = 5;
const stageByInternalStep = [1, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5];
const clampStep = (value: number, max: number) => Math.min(Math.max(value, 1), max);
const visibleStageForInternalStep = (step: number) => stageByInternalStep[clampStep(step, INTERNAL_STEP_COUNT) - 1] || 1;
const visibleStageProgress = (step: number) => Math.round((visibleStageForInternalStep(step) / VISIBLE_STAGE_COUNT) * 100);
const readable = (value: string | undefined, fallback: string) => (!value || value.includes('.') ? fallback : value);

type ReferralState = 'not_required' | 'waiting_for_owner' | 'capturing' | 'captured' | 'error';

export default function PropertyOnboardingPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t, isRTL, lang } = useLanguage();
    const { step, nextStep, prevStep, setStep, properties, intakeId, onboardingSessionId, ownerAccount } = useOnboardingStore();
    const label = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const brokerUid = String(searchParams.get('broker') || '').trim();
    const validBrokerUid = /^[A-Za-z0-9_-]{6,128}$/.test(brokerUid);
    const [guardError, setGuardError] = React.useState('');
    const [referralState, setReferralState] = React.useState<ReferralState>(brokerUid ? 'waiting_for_owner' : 'not_required');
    const capturedReferralKey = React.useRef('');

    const visibleStages = [
        readable(t('onboarding.company'), label('Company', 'الشركة')),
        readable(t('onboarding.verification'), label('Account', 'الحساب')),
        readable(t('onboarding.property'), label('Property', 'العقار')),
        readable(t('onboarding.service_plan'), label('Service & Proof', 'الخدمة والإثبات')),
        readable(t('onboarding.contract_payment'), label('Contract & Payment', 'العقد والدفع')),
    ];
    const internalStepLabels = [
        label('Legal identity', 'الهوية القانونية'), label('Account verification', 'التحقق من الحساب'),
        label('Asset profile', 'ملف العقار'), label('Property location', 'موقع العقار'), label('Systems and facilities', 'الأنظمة والمرافق'),
        label('Commercial terms', 'الشروط التجارية'), label('Protected documents', 'المستندات المحمية'), label('Review', 'المراجعة'),
        label('Contract signature', 'توقيع العقد'), label('Payment method', 'طريقة الدفع'), label('Final submission', 'الإرسال النهائي'),
    ];

    const safeStep = clampStep(step, INTERNAL_STEP_COUNT);
    const visibleStage = visibleStageForInternalStep(safeStep);
    const activeVisibleStageIndex = clampStep(visibleStage, VISIBLE_STAGE_COUNT) - 1;
    const currentStageProgress = visibleStageProgress(safeStep);
    const exactProgress = Math.round((safeStep / INTERNAL_STEP_COUNT) * 100);

    React.useEffect(() => {
        if (step !== safeStep) setStep(safeStep);
        setGuardError('');
    }, [safeStep, setStep, step]);

    React.useEffect(() => {
        if (!brokerUid) {
            setReferralState('not_required');
            return;
        }
        if (!validBrokerUid) {
            setReferralState('error');
            setGuardError(label('The Broker referral link is invalid. Ask the Broker to share a new link.', 'رابط إحالة الوسيط غير صالح. اطلب من الوسيط إرسال رابط جديد.'));
            return;
        }
        if (!ownerAccount?.uid) {
            setReferralState('waiting_for_owner');
            return;
        }

        const captureKey = `${brokerUid}:${ownerAccount.uid}`;
        if (capturedReferralKey.current === captureKey || referralState === 'capturing' || referralState === 'captured') return;
        capturedReferralKey.current = captureKey;
        setReferralState('capturing');
        setGuardError('');

        const captureReferral = httpsCallable(functions, 'captureBrokerReferralAttribution');
        captureReferral({
            brokerUid,
            intakeId: intakeId || onboardingSessionId,
            onboardingSubmissionId: intakeId || onboardingSessionId,
            ownerName: ownerAccount.fullName,
        }).then(() => {
            setReferralState('captured');
        }).catch((error: any) => {
            console.error('[OwnerOnboarding] Broker referral capture failed:', { code: error?.code, message: error?.message });
            capturedReferralKey.current = '';
            setReferralState('error');
            setGuardError(label(
                'Your Owner account was created, but the Broker referral could not be verified. Continue is locked so the referral is not lost. Retry or request a new link.',
                'تم إنشاء حساب المالك، لكن تعذر التحقق من إحالة الوسيط. تم إيقاف المتابعة حتى لا تضيع الإحالة. أعد المحاولة أو اطلب رابطاً جديداً.',
            ));
        });
    }, [brokerUid, intakeId, label, onboardingSessionId, ownerAccount, referralState, validBrokerUid]);

    const guardedAccountNext = () => {
        if (brokerUid && referralState !== 'captured') {
            setGuardError(referralState === 'capturing'
                ? label('Broker referral verification is still running. Please wait a moment.', 'لا يزال التحقق من إحالة الوسيط جارياً. انتظر لحظة.')
                : label('Broker referral verification must complete before continuing.', 'يجب إكمال التحقق من إحالة الوسيط قبل المتابعة.'));
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        nextStep();
    };

    const guardedAssetNext = () => {
        const property = properties[0];
        const isMosque = property?.propertyType === 'Mosque / Masjid';
        if (!isMosque) { nextStep(); return; }
        const mosque = property?.mosqueProfile || {};
        const missing = [
            !String(mosque.mosqueName || '').trim() ? label('mosque name', 'اسم المسجد') : '',
            !(Number(mosque.grossFloorAreaSqft) > 0) ? label('gross floor area', 'المساحة الإجمالية') : '',
            !(Number(mosque.maxWorshipperCapacity) > 0) ? label('worshipper capacity', 'سعة المصلين') : '',
            !(Number(mosque.wuduAreasCount) > 0) ? label('Wudu areas', 'مناطق الوضوء') : '',
            mosque.cctvInstalled && !(Number(mosque.storageDays) > 0) ? label('CCTV retention days', 'أيام الاحتفاظ بالكاميرات') : '',
        ].filter(Boolean);
        if (missing.length) {
            setGuardError(label(`Complete the mandatory Mosque profile before continuing: ${missing.join(', ')}.`, `أكمل بيانات المسجد الإلزامية قبل المتابعة: ${missing.join('، ')}.`));
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        nextStep();
    };

    const renderStepContent = (stepIndex: number) => {
        switch (stepIndex) {
            case 1: return <CompanyProfileStep onNext={nextStep} />;
            case 2: return <AccountCreationStep onNext={guardedAccountNext} onBack={prevStep} />;
            case 3: return <AssetProfileStep onNext={guardedAssetNext} onBack={prevStep} />;
            case 4: return <PropertyLocationStep onNext={nextStep} onBack={prevStep} />;
            case 5: return <SystemsDataStep onNext={nextStep} onBack={prevStep} />;
            case 6: return <CommercialTermsStep onNext={nextStep} onBack={prevStep} />;
            case 7: return <ProofUploadStep onNext={nextStep} onBack={prevStep} />;
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
                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
                    <Button startIcon={<ArrowLeft size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />} onClick={() => navigate('/')} sx={{ color: '#B8932F', fontWeight: 900 }}>{readable(t('onboarding.back_home'), label('Back Home', 'الرجوع للرئيسية'))}</Button>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip icon={<ShieldCheck size={15} />} label={`${label('Step', 'الخطوة')} ${safeStep} / ${INTERNAL_STEP_COUNT}`} sx={{ fontWeight: 900 }} />
                        <Chip icon={<Save size={15} />} label={intakeId ? label('Resume reference saved', 'تم حفظ مرجع الاستكمال') : label('Secure session active', 'الجلسة الآمنة نشطة')} color="success" variant="outlined" />
                        {brokerUid && <Chip label={referralState === 'captured' ? label('Broker referral locked', 'تم تثبيت إحالة الوسيط') : label('Broker referral pending', 'إحالة الوسيط قيد التحقق')} color={referralState === 'captured' ? 'success' : 'warning'} variant="outlined" />}
                    </Stack>
                </Stack>
                <Box sx={{ mb: 2, textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight={950}>{internalStepLabels[safeStep - 1]}</Typography>
                    <Typography variant="caption" color="text.secondary">{label('Only the current step and intake reference are retained for safe recovery.', 'يتم الاحتفاظ بالخطوة الحالية ومرجع التسجيل فقط للاستكمال الآمن.')}</Typography>
                </Box>
                <Stepper activeStep={activeVisibleStageIndex} alternativeLabel sx={{ mb: 3 }}>{visibleStages.map((stage) => <Step key={stage}><StepLabel>{stage}</StepLabel></Step>)}</Stepper>
                <LinearProgress variant="determinate" value={currentStageProgress} sx={{ mb: 1, height: 8, borderRadius: 99 }} />
                <Typography variant="caption" display="block" textAlign="center" color="text.secondary" mb={3}>{exactProgress}% · {label('exact workflow progress', 'التقدم الفعلي للمسار')}</Typography>
                {guardError && <Alert severity="warning" sx={{ mb: 3 }}>{guardError}</Alert>}
                {renderStepContent(safeStep)}
            </Container>
        </Box>
    );
}
