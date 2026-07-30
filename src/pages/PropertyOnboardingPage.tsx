import React from 'react';
import { Alert, Box, Button, Chip, Container, LinearProgress, Stack, Step, StepLabel, Stepper, Typography } from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useOnboardingStore } from '../store/onboardingStore';
import CompanyProfileStep from '../components/onboarding/CompanyProfileStep';
import AccountCreationStep from '../components/onboarding/AccountCreationStep';
import AssetProfileStep from '../components/onboarding/AssetProfileStep';
import PropertyLocationStep from '../components/onboarding/PropertyLocationStep';
import SystemsDataStep from '../components/onboarding/SystemsDataStep';
import CommercialTermsStep from '../components/onboarding/CommercialTermsStep';
import ProofUploadStep from '../components/onboarding/ProofUploadStep';
import ReviewBeforeSubmitStep from '../components/onboarding/ReviewBeforeSubmitStep';
import ContractSignatureStep from '../components/onboarding/ContractSignatureStep';
import InspectionSubmissionStep from '../components/onboarding/InspectionSubmissionStep';

const PAGE_COUNT = 5;
const clampPage = (value: number) => Math.min(Math.max(Number(value) || 1, 1), PAGE_COUNT);
const readable = (value: string | undefined, fallback: string) => (!value || value.includes('.') ? fallback : value);

export default function PropertyOnboardingPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t, isRTL, lang } = useLanguage();
    const { step, nextStep, prevStep, setStep, properties, intakeId } = useOnboardingStore();
    const label = React.useCallback((en: string, ar: string) => lang === 'ar' ? ar : en, [lang]);
    const brokerUid = String(searchParams.get('broker') || '').trim();
    const validBrokerUid = /^[A-Za-z0-9_-]{6,128}$/.test(brokerUid);
    const [guardError, setGuardError] = React.useState('');
    const [section, setSection] = React.useState(0);

    const safePage = clampPage(step);
    const pageProgress = safePage * 20;
    const pageLabels = [
        label('Owner Account', 'حساب المالك'),
        label('Property Details', 'بيانات العقار'),
        label('Service & Documents', 'الخدمة والمستندات'),
        label('Review & Sign', 'المراجعة والتوقيع'),
        label('Submit for Visit', 'الإرسال للزيارة'),
    ];
    const sectionLabels: Record<number, string[]> = {
        1: [label('Owner or company details', 'بيانات المالك أو الشركة'), label('Secure account verification', 'التحقق من الحساب الآمن')],
        2: [label('Property profile', 'ملف العقار'), label('Property location and GPS', 'موقع العقار وGPS'), label('Systems and facilities', 'الأنظمة والمرافق')],
        3: [label('Service plan and commercial terms', 'خطة الخدمة والشروط التجارية'), label('Protected documents', 'المستندات المحمية')],
        4: [label('Review all details', 'مراجعة جميع البيانات'), label('Sign the property application', 'توقيع طلب العقار')],
        5: [label('Final five-page submission', 'الإرسال النهائي للصفحات الخمس')],
    };

    React.useEffect(() => {
        if (step !== safePage) setStep(safePage);
        setSection(0);
        setGuardError('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [safePage, setStep, step]);


    const advancePage = () => {
        setGuardError('');
        setSection(0);
        nextStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const goBackPage = () => {
        setGuardError('');
        setSection(0);
        prevStep();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const advanceSection = () => {
        setGuardError('');
        setSection((current) => current + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const backSectionOrPage = () => {
        if (section > 0) {
            setSection((current) => Math.max(0, current - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        goBackPage();
    };

    const guardedAssetNext = () => {
        const property = properties[0];
        const descriptor = `${property?.propertyType || ''} ${property?.subType || ''}`.toLowerCase();
        const isMosque = descriptor.includes('mosque') || descriptor.includes('masjid');
        if (!isMosque) { advanceSection(); return; }
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
        advanceSection();
    };

    const renderPage = () => {
        if (safePage === 1) {
            return section === 0
                ? <CompanyProfileStep onNext={advanceSection} />
                : <AccountCreationStep onNext={advancePage} onBack={backSectionOrPage} brokerUid={brokerUid} />;
        }
        if (safePage === 2) {
            if (section === 0) return <AssetProfileStep onNext={guardedAssetNext} onBack={backSectionOrPage} />;
            if (section === 1) return <PropertyLocationStep onNext={advanceSection} onBack={backSectionOrPage} />;
            return <SystemsDataStep onNext={advancePage} onBack={backSectionOrPage} />;
        }
        if (safePage === 3) {
            return section === 0
                ? <CommercialTermsStep onNext={advanceSection} onBack={backSectionOrPage} />
                : <ProofUploadStep onNext={advancePage} onBack={backSectionOrPage} />;
        }
        if (safePage === 4) {
            return section === 0
                ? <ReviewBeforeSubmitStep onNext={advanceSection} onBack={backSectionOrPage} />
                : <ContractSignatureStep onNext={advancePage} onBack={backSectionOrPage} />;
        }
        return <InspectionSubmissionStep onBack={goBackPage} />;
    };

    return (
        <Box className="white-platinum-onboarding" dir={isRTL ? 'rtl' : 'ltr'} sx={{ minHeight: '100dvh', bgcolor: '#FFFFFF', color: '#111827', py: { xs: 2, md: 4 } }}>
            <Container maxWidth="xl">
                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" gap={2} sx={{ mb: 3 }}>
                    <Button startIcon={<ArrowLeft size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />} onClick={() => navigate('/')} sx={{ color: '#B8932F', fontWeight: 900 }}>{readable(t('onboarding.back_home'), label('Back Home', 'الرجوع للرئيسية'))}</Button>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip icon={<ShieldCheck size={15} />} label={`${label('Page', 'الصفحة')} ${safePage} / ${PAGE_COUNT}`} sx={{ fontWeight: 900 }} />
                        <Chip icon={<Save size={15} />} label={intakeId ? label('Application reference saved', 'تم حفظ مرجع الطلب') : label('Secure session active', 'الجلسة الآمنة نشطة')} color="success" variant="outlined" />
                        {brokerUid && <Chip label={validBrokerUid ? label('Broker referral will lock after verified email', 'سيتم تثبيت إحالة الوسيط بعد التحقق من البريد') : label('Invalid Broker referral link', 'رابط إحالة وسيط غير صالح')} color={validBrokerUid ? 'info' : 'error'} variant="outlined" />}
                    </Stack>
                </Stack>
                <Box sx={{ mb: 2, textAlign: 'center' }}>
                    <Typography variant="h6" fontWeight={950}>{sectionLabels[safePage]?.[section] || pageLabels[safePage - 1]}</Typography>
                    <Typography variant="caption" color="text.secondary">{label('Five clear pages. Payment is requested only after BIN GROUP completes the property visit.', 'خمس صفحات واضحة. يتم طلب الدفع فقط بعد إكمال BIN GROUP زيارة العقار.')}</Typography>
                </Box>
                <Stepper activeStep={safePage - 1} alternativeLabel sx={{ mb: 3 }}>{pageLabels.map((pageLabel) => <Step key={pageLabel}><StepLabel>{pageLabel}</StepLabel></Step>)}</Stepper>
                <LinearProgress variant="determinate" value={pageProgress} sx={{ mb: 1, height: 8, borderRadius: 99 }} />
                <Typography variant="caption" display="block" textAlign="center" color="text.secondary" mb={3}>{pageProgress}% · {label('five-page application progress', 'تقدم الطلب المكون من خمس صفحات')}</Typography>
                {guardError && <Alert severity="warning" sx={{ mb: 3 }}>{guardError}</Alert>}
                {renderPage()}
            </Container>
        </Box>
    );
}
