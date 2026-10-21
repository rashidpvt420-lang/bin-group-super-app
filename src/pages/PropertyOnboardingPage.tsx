import React from 'react';
import { Alert, Box, Button, Chip, Container, LinearProgress, Stack, Step, StepLabel, Stepper, Typography } from '@mui/material';
import { initialOwnerSection } from '../components/onboarding/ownerAccountRules';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Languages, Save } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { useOnboardingStore } from '../store/onboardingStore';
import CompanyProfileStep from '../components/onboarding/CompanyProfileStep';
import AccountCreationStep from '../components/onboarding/AccountCreationStep';
import AssetProfileStep from '../components/onboarding/AssetProfileStep';
import PropertyPortfolioIntelligenceStep from '../components/onboarding/PropertyPortfolioIntelligenceStep';
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
    const { t, isRTL, lang, toggleLanguage } = useLanguage();
    const { user } = useRole();
    const { step, nextStep, prevStep, setStep, properties, intakeId, ownerAccount } = useOnboardingStore();
    const signedInSession = Boolean(user?.uid) && !(user as { isAnonymous?: boolean } | null)?.isAnonymous;
    const label = React.useCallback((en: string, ar: string) => lang === 'ar' ? ar : en, [lang]);
    const brokerUid = String(searchParams.get('broker') || '').trim();
    const validBrokerUid = /^[A-Za-z0-9_-]{6,128}$/.test(brokerUid);
    const [guardError, setGuardError] = React.useState('');
    const [section, setSection] = React.useState(0);
    const requestedSectionRef = React.useRef<number | null>(null);

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
        1: [label('Owner or company details', 'بيانات المالك أو الشركة'), label('Create your owner account', 'أنشئ حساب المالك')],
        2: [label('Property profile', 'ملف العقار'), label('Rooms, floor plan & property AI', 'الغرف والمخطط وذكاء العقار'), label('Property location and GPS', 'موقع العقار وGPS'), label('Systems and facilities', 'الأنظمة والمرافق')],
        3: [label('Service plan and commercial terms', 'خطة الخدمة والشروط التجارية'), label('Protected documents', 'المستندات المحمية')],
        4: [label('Review all details', 'مراجعة جميع البيانات'), label('Sign the property application', 'توقيع طلب العقار')],
        5: [label('Final five-page submission', 'الإرسال النهائي للصفحات الخمس')],
    };

    React.useEffect(() => {
        if (step !== safePage) setStep(safePage);
        const requestedSection = requestedSectionRef.current;
        requestedSectionRef.current = null;
        // Resume at the account section when an account exists (e.g. returning from the email link).
        setSection(initialOwnerSection(safePage, requestedSection, Boolean(ownerAccount?.uid) || signedInSession));
        setGuardError('');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [safePage, setStep, step]);

    // Auth resolves after mount: resume page 1 at the account section once, without fighting a later "Edit".
    const autoResumedRef = React.useRef(false);
    React.useEffect(() => {
        if (autoResumedRef.current || safePage !== 1) return;
        if (Boolean(ownerAccount?.uid) || signedInSession) {
            autoResumedRef.current = true;
            setSection((current) => (current === 0 ? 1 : current));
        }
    }, [ownerAccount?.uid, safePage, signedInSession]);

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

    const fixPropertyLocation = () => {
        setGuardError('');
        requestedSectionRef.current = 2;
        if (Number(step) === 2) setSection(2);
        else setStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
            if (section === 1) return <PropertyPortfolioIntelligenceStep onNext={advanceSection} onBack={backSectionOrPage} />;
            if (section === 2) return <PropertyLocationStep onNext={advanceSection} onBack={backSectionOrPage} />;
            return <SystemsDataStep onNext={advancePage} onBack={backSectionOrPage} />;
        }
        if (safePage === 3) {
            return section === 0
                ? <CommercialTermsStep onNext={advanceSection} onBack={backSectionOrPage} />
                : <ProofUploadStep onNext={advancePage} onBack={backSectionOrPage} />;
        }
        if (safePage === 4) {
            return section === 0
                ? <ReviewBeforeSubmitStep onNext={advanceSection} onBack={backSectionOrPage} onFixLocation={fixPropertyLocation} />
                : <ContractSignatureStep onNext={advancePage} onBack={backSectionOrPage} />;
        }
        return <InspectionSubmissionStep onBack={goBackPage} />;
    };

    return (
        <Box className="white-platinum-onboarding" dir={isRTL ? 'rtl' : 'ltr'} sx={{ minHeight: '100dvh', bgcolor: '#FFFFFF', color: '#111827', py: { xs: 1.5, md: 4 } }}>
            <Container maxWidth="xl">
                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 2 }}>
                    <Button startIcon={<ArrowLeft size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />} onClick={() => navigate('/')} sx={{ color: '#7A5C12', fontWeight: 900, minWidth: 0 }}>{readable(t('onboarding.back_home'), label('Back Home', 'الرجوع للرئيسية'))}</Button>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                        {intakeId && <Chip size="small" icon={<Save size={14} />} label={label('Saved', 'محفوظ')} color="success" variant="outlined" />}
                        <Button size="small" variant="outlined" onClick={toggleLanguage} startIcon={<Languages size={16} />} aria-label={label('Switch to Arabic', 'التبديل إلى الإنجليزية')} sx={{ minWidth: 0, fontWeight: 900, borderRadius: 99 }}>{lang === 'ar' ? 'EN' : 'عربي'}</Button>
                    </Stack>
                </Stack>
                {brokerUid && <Chip size="small" sx={{ mb: 1.5 }} label={validBrokerUid ? label('Broker referral will lock after verified email', 'سيتم تثبيت إحالة الوسيط بعد التحقق من البريد') : label('Invalid Broker referral link', 'رابط إحالة الوسيط غير صالح')} color={validBrokerUid ? 'info' : 'warning'} />}
                <Stepper activeStep={safePage - 1} alternativeLabel sx={{ mb: 2, display: { xs: 'none', md: 'flex' } }}>{pageLabels.map((pageLabel) => <Step key={pageLabel}><StepLabel>{pageLabel}</StepLabel></Step>)}</Stepper>
                <Box sx={{ mb: 2.5, maxWidth: 560, mx: 'auto' }}>
                    <Typography variant="caption" display="block" sx={{ color: '#6B7280', fontWeight: 800, mb: 0.75, textAlign: isRTL ? 'right' : 'left' }}>
                        {label(`Step ${safePage} of ${PAGE_COUNT}`, `الخطوة ${safePage} من ${PAGE_COUNT}`)} · {pageLabels[safePage - 1]}
                    </Typography>
                    <LinearProgress variant="determinate" value={pageProgress} aria-label={label('Application progress', 'تقدم الطلب')} sx={{ height: 6, borderRadius: 99 }} />
                    <Typography component="h1" variant="h5" fontWeight={950} sx={{ mt: 2, textAlign: 'center' }}>{sectionLabels[safePage]?.[section] || pageLabels[safePage - 1]}</Typography>
                </Box>
                {guardError && <Alert severity="warning" sx={{ mb: 3 }}>{guardError}</Alert>}
                {renderPage()}
            </Container>
        </Box>
    );
}
