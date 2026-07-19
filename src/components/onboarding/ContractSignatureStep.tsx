import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControlLabel, Grid,
  Paper, Stack, TextField, Typography, alpha
} from '@mui/material';
import { FileSignature, ScrollText, ShieldCheck } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { functions, httpsCallable } from '../../lib/firebase';

interface ContractSignatureStepProps { onNext: () => void; onBack: () => void }
type LockedQuote = { quoteHash: string; annualContractValue: number; activationDeposit: number; quotedAtMs?: number; expiresAtMs?: number; version?: string };

const modeLabel = (strategy?: string) => {
  if (strategy === 'pm' || strategy === 'pm_only' || strategy === 'rent') return 'Property Management Only / إدارة العقار فقط';
  if (strategy === 'hybrid' || strategy === 'both') return 'Maintenance + Property Management / الصيانة وإدارة العقار معاً';
  return 'Maintenance Only / الصيانة فقط';
};
const AgreementSection = ({ title, ar, children }: { title: string; ar: string; children: React.ReactNode }) => <Box sx={{ mb: 2.25 }}><Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Typography><Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textAlign: 'right', mb: 0.75 }}>{ar}</Typography><Divider sx={{ mb: 1, borderColor: 'rgba(0,0,0,0.08)' }} />{children}</Box>;
const Clause = ({ en, ar }: { en: string; ar: string }) => <Box sx={{ mb: 1.25 }}><Typography variant="caption" sx={{ display: 'block', color: '#111827', lineHeight: 1.7 }}>{en}</Typography><Typography variant="caption" sx={{ display: 'block', color: '#6B7280', textAlign: 'right', lineHeight: 1.8 }}>{ar}</Typography></Box>;

export default function ContractSignatureStep({ onNext, onBack }: ContractSignatureStepProps) {
  const {
    companyProfile, ownerAccount, properties, selectedAddOns, portfolioSummary, valuationResult,
    isContractSigned, signatureName, contractOtpVerificationId, setContractSignature,
    setContractOtpVerificationId, intakeId, onboardingSessionId, calculateSummary,
  } = useOnboardingStore();
  const { isRTL, lang } = useLanguage();
  const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [typedName, setTypedName] = useState(signatureName || '');
  const [accepted, setAccepted] = useState(isContractSigned);
  const [otpRequestId, setOtpRequestId] = useState('');
  const [otp, setOtp] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [lockedQuote, setLockedQuote] = useState<LockedQuote | null>(null);

  const ownerName = ownerAccount?.fullName || companyProfile.contactPerson || copy('Owner', 'المالك');
  const contractReference = intakeId || onboardingSessionId;
  const agreementVersion = 'BIN-GROUP-OWNER-AGREEMENT-v1.1-PORTFOLIO';
  const reviewedQuote = valuationResult?.serverQuote as any;
  const serviceModes = useMemo(() => [...new Set(properties.map((property) => modeLabel(property.strategy)))], [properties]);

  useEffect(() => { calculateSummary(); }, [calculateSummary, properties]);
  useEffect(() => { setContractSignature(accepted, typedName); }, [typedName, accepted, setContractSignature]);

  const loadLockedQuote = React.useCallback(async () => {
    if (!ownerAccount?.uid || !properties.length) return;
    setQuoteLoading(true);
    setOtpError('');
    try {
      const result = await httpsCallable(functions, 'previewOwnerOnboardingQuote')({ properties, selectedAddOns: selectedAddOns || [] });
      const quote = result.data as LockedQuote;
      if (!quote?.quoteHash || !/^[a-f0-9]{64}$/.test(quote.quoteHash) || quote.annualContractValue <= 0 || quote.activationDeposit <= 0) {
        throw new Error(copy('The server did not return a valid portfolio contract quote.', 'لم يُرجع الخادم عرض عقد صالحاً للمحفظة.'));
      }
      if (reviewedQuote?.portfolioAnnualTotal && Math.abs(Number(reviewedQuote.portfolioAnnualTotal) - quote.annualContractValue) > 0.01) {
        throw new Error(copy('The portfolio quote changed after Review. Return to Review and confirm the new amount.', 'تغيّر عرض المحفظة بعد المراجعة. ارجع إلى المراجعة وأكد المبلغ الجديد.'));
      }
      if (reviewedQuote?.mobilisationDeposit && Math.abs(Number(reviewedQuote.mobilisationDeposit) - quote.activationDeposit) > 0.01) {
        throw new Error(copy('The 15% deposit changed after Review. Return to Review and confirm it.', 'تغيّرت دفعة 15٪ بعد المراجعة. ارجع إلى المراجعة وأكدها.'));
      }
      setLockedQuote(quote);
    } catch (error: any) {
      setLockedQuote(null);
      setOtpError(error?.message || copy('The protected portfolio quote could not be loaded.', 'تعذر تحميل عرض المحفظة المحمي.'));
    } finally { setQuoteLoading(false); }
  }, [ownerAccount?.uid, properties, selectedAddOns, reviewedQuote?.portfolioAnnualTotal, reviewedQuote?.mobilisationDeposit, lang]);

  useEffect(() => { void loadLockedQuote(); }, [loadLockedQuote]);

  const canRequestOtp = typedName.trim().length >= 3 && accepted && Boolean(ownerAccount?.uid && contractReference && lockedQuote?.quoteHash);
  const isValid = canRequestOtp && Boolean(contractOtpVerificationId);

  const requestOtp = async () => {
    if (!canRequestOtp || !lockedQuote) return;
    setOtpBusy(true); setOtpError('');
    try {
      const result = await httpsCallable(functions, 'requestContractSignatureOtp')({
        email: ownerAccount?.email,
        contractId: contractReference,
        contractHash: lockedQuote.quoteHash,
        propertyName: properties.length === 1 ? (properties[0]?.address || properties[0]?.emirate || 'BIN GROUP property') : `BIN GROUP portfolio · ${properties.length} properties`,
      });
      const requestId = String((result.data as any)?.requestId || '');
      if (!requestId) throw new Error(copy('OTP request reference was not returned.', 'لم يتم إرجاع مرجع طلب الرمز.'));
      setOtpRequestId(requestId);
      setContractOtpVerificationId(null);
    } catch (error: any) {
      setOtpError(error?.message || copy('OTP delivery failed.', 'تعذر إرسال رمز التحقق.'));
    } finally { setOtpBusy(false); }
  };

  const verifyOtp = async () => {
    if (!otpRequestId || otp.trim().length !== 6) return;
    setOtpBusy(true); setOtpError('');
    try {
      const result = await httpsCallable(functions, 'verifyContractSignatureOtp')({ requestId: otpRequestId, otp: otp.trim(), signature: typedName.trim() });
      const data = result.data as { verificationId?: string; contractId?: string };
      if (!data.verificationId || data.contractId !== contractReference) throw new Error(copy('OTP verification did not match this contract.', 'لم يطابق التحقق بالرمز هذا العقد.'));
      setContractOtpVerificationId(data.verificationId);
    } catch (error: any) {
      setContractOtpVerificationId(null);
      setOtpError(error?.message || copy('OTP verification failed.', 'فشل التحقق من الرمز.'));
    } finally { setOtpBusy(false); }
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 1040, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 } }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom>{copy('Full Bilingual Portfolio Service Agreement', 'اتفاقية خدمات المحفظة ثنائية اللغة')}</Typography>
        <Typography color="rgba(255,255,255,0.58)">{copy('The signed values below are the server-authoritative total for every property in this onboarding portfolio.', 'القيم الموقعة أدناه هي إجمالي الخادم المعتمد لجميع عقارات محفظة التسجيل.')}</Typography>
      </Box>
      {otpError && <Alert severity="error" sx={{ mb: 3 }} action={!lockedQuote ? <Button color="inherit" onClick={() => void loadLockedQuote()}>{copy('Retry quote', 'إعادة العرض')}</Button> : undefined}>{otpError}</Alert>}
      {quoteLoading && <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 3 }}>{copy('Locking the server portfolio quotation…', 'جارٍ قفل عرض المحفظة من الخادم…')}</Alert>}
      {lockedQuote && <Alert severity="success" icon={<ShieldCheck size={18} />} sx={{ mb: 3 }}>{copy(`Protected portfolio quote locked · ${properties.length} properties · AED ${formatAED(lockedQuote.annualContractValue)} annually · AED ${formatAED(lockedQuote.activationDeposit)} due now.`, `تم قفل عرض المحفظة المحمي · ${properties.length} عقار · ${formatAED(lockedQuote.annualContractValue)} درهم سنوياً · ${formatAED(lockedQuote.activationDeposit)} درهم مستحق الآن.`)}</Alert>}

      <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.65)', border: '1px solid rgba(255,255,255,0.06)', mb: 4 }}>
        <Box sx={{ bgcolor: '#FFF', color: '#000', p: { xs: 2.5, md: 4 }, borderRadius: 2, mb: 4, position: 'relative', overflow: 'hidden', maxHeight: 760, overflowY: 'auto' }}>
          <ShieldCheck size={220} style={{ position: 'absolute', top: -20, right: -20, opacity: 0.05, transform: 'rotate(-15deg)' }} />
          <Typography variant="h5" fontWeight="950" align="center" sx={{ color: binThemeTokens.gold }}>BIN GROUP L.L.C - S.P.C</Typography>
          <Typography variant="subtitle2" align="center" fontWeight="950">PORTFOLIO OWNER SERVICE AGREEMENT</Typography>
          <Typography variant="caption" align="center" display="block" color="text.secondary">اتفاقية خدمات محفظة المالك</Typography>
          <Typography variant="caption" align="center" display="block" color="text.secondary" sx={{ mb: 3 }}>Version: {agreementVersion}</Typography>

          <AgreementSection title="1. Contract Cover" ar="غلاف العقد">
            <Grid container spacing={1.25}>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Owner / المالك</Typography><Typography variant="body2" fontWeight="800">{ownerName}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Company / الشركة</Typography><Typography variant="body2" fontWeight="800">{companyProfile.name || 'Private / فردي'}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Portfolio / المحفظة</Typography><Typography variant="body2" fontWeight="800">{properties.length} {copy('properties', 'عقار')}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Contract modes / أنواع العقد</Typography><Typography variant="body2" fontWeight="800">{serviceModes.join(' · ')}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Annual portfolio value / القيمة السنوية للمحفظة</Typography><Typography variant="body2" fontWeight="950" color="primary.main">AED {formatAED(lockedQuote?.annualContractValue || portfolioSummary.estimatedACV || 0)}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">15% mobilisation / دفعة التعبئة 15٪</Typography><Typography variant="body2" fontWeight="950">AED {formatAED(lockedQuote?.activationDeposit || Math.round((portfolioSummary.estimatedACV || 0) * 0.15))}</Typography></Grid>
            </Grid>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>{properties.map((property, index) => <Box key={property.id || index} sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.035)', borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{copy('Property', 'العقار')} {index + 1}</Typography><Typography variant="body2" fontWeight="800">{property.address || property.area || property.emirate || 'UAE'} · {property.propertyType} · {modeLabel(property.strategy)}</Typography></Box>)}</Stack>
          </AgreementSection>

          <AgreementSection title="2. Commercial Model" ar="النموذج التجاري">
            <Clause en="Rent is paid directly to the Owner’s registered bank account. BIN GROUP does not hold Owner rent funds. Property-management fees and approved maintenance charges are invoiced separately according to the selected plan." ar="يُدفع الإيجار مباشرة إلى الحساب البنكي المسجل للمالك. لا تحتفظ BIN GROUP بأموال إيجار المالك. وتُفوتر رسوم إدارة العقار وتكاليف الصيانة المعتمدة بشكل منفصل وفقاً للخطة المختارة." />
            <Clause en="Maintenance Only, Property Management Only, and Maintenance + Property Management apply separately to each listed property as shown in the locked quotation and property schedule." ar="تطبق الصيانة فقط أو إدارة العقار فقط أو الصيانة مع إدارة العقار بشكل منفصل على كل عقار مدرج وفق عرض السعر المقفل وجدول العقارات." />
          </AgreementSection>

          <AgreementSection title="3. Institutional / Non-Tenant Properties" ar="العقارات المؤسسية وغير القائمة على المستأجرين">
            <Clause en="For Majlis, government buildings, hospitals, schools, mosques, malls, hotels, staff accommodation and similar properties, Authorized Reporters may submit operational requests without receiving tenancy, ownership, employment, payment or agency rights." ar="بالنسبة للمجالس والمباني الحكومية والمستشفيات والمدارس والمساجد والمراكز التجارية والفنادق وسكن الموظفين وما يماثلها، يجوز للمبلغين المعتمدين تقديم طلبات تشغيلية دون اكتساب حقوق إيجار أو ملكية أو عمل أو دفع أو وكالة." />
          </AgreementSection>

          <AgreementSection title="4. Scope, Owner Duties, Payment" ar="النطاق والتزامات المالك والدفع">
            <Clause en="BIN GROUP provides only services expressly listed in the selected package, locked quotation, service schedule or signed addendum. Additional work, materials, authority fees, inspections, fit-out, civil work and MEP upgrades require written approval and additional payment." ar="تقدم BIN GROUP فقط الخدمات المذكورة صراحة في الباقة المختارة وعرض السعر المقفل وجدول الخدمات أو الملحق الموقع. وتتطلب الأعمال الإضافية والمواد ورسوم الجهات والفحوصات والتشطيبات والأعمال المدنية وترقيات الأعمال الكهروميكانيكية موافقة خطية وسداداً إضافياً." />
            <Clause en="The Owner must provide accurate identity, title deed, property, occupancy, access and payment information and ensure safe authorised access to every property in the portfolio." ar="يلتزم المالك بتقديم معلومات دقيقة عن الهوية وسندات الملكية والعقارات والإشغال والدخول والدفع وضمان الوصول الآمن والمصرح به إلى كل عقار في المحفظة." />
          </AgreementSection>

          <AgreementSection title="5. Legal Protection Clauses" ar="بنود الحماية القانونية">
            <Clause en="BIN GROUP is not responsible for hidden or pre-existing defects, structural/design defects, unlawful modifications, authority violations, tenant disputes, loss of rent or profit, force majeure, misuse, negligence, unauthorised repairs or third-party acts except where liability cannot be excluded under UAE law." ar="لا تكون BIN GROUP مسؤولة عن العيوب المخفية أو السابقة أو الإنشائية أو التصميمية أو التعديلات غير القانونية أو مخالفات الجهات أو نزاعات المستأجرين أو فقدان الإيجار أو الأرباح أو القوة القاهرة أو سوء الاستخدام أو الإهمال أو الإصلاحات غير المصرح بها أو تصرفات الأطراف الثالثة إلا إذا تعذر استبعاد المسؤولية بموجب قانون دولة الإمارات." />
          </AgreementSection>

          <AgreementSection title="6. Digital Evidence, AI Disclaimer, Law" ar="الإثبات الرقمي وإخلاء مسؤولية الذكاء الاصطناعي والقانون">
            <Clause en="BIN GROUP may timestamp, hash and retain contracts, quotations, invoices, property passports, tickets, photos, approvals, signatures, GPS and audit logs. AI outputs are decision-support only and do not replace legal, engineering, tax, accounting, insurance or authority advice." ar="يجوز لـ BIN GROUP ختم العقود وعروض الأسعار والفواتير وجوازات العقار والتذاكر والصور والموافقات والتوقيعات وسجلات GPS والتدقيق زمنياً وتجزئتها وحفظها. مخرجات الذكاء الاصطناعي أدوات مساعدة للقرار ولا تستبدل الاستشارات القانونية أو الهندسية أو الضريبية أو المحاسبية أو التأمينية أو استشارات الجهات." />
            <Clause en="This Agreement is governed by UAE law as applicable in Abu Dhabi. Abu Dhabi Courts have jurisdiction subject to mandatory law. If the English and Arabic texts conflict before UAE mainland courts, Arabic prevails unless a signed addendum states otherwise." ar="تخضع هذه الاتفاقية لقوانين دولة الإمارات المطبقة في أبوظبي. تختص محاكم أبوظبي مع مراعاة القوانين الإلزامية. وفي حال تعارض النصين الإنجليزي والعربي أمام محاكم الدولة البرية، يسود النص العربي ما لم ينص ملحق موقع على خلاف ذلك." />
          </AgreementSection>
        </Box>

        <Box sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), borderRadius: 2, border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" mb={2}><FileSignature size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">{copy('Digital Signature', 'التوقيع الرقمي')}</Typography></Stack>
          <TextField fullWidth label={copy('Type your full legal name to sign', 'اكتب اسمك القانوني الكامل للتوقيع')} value={typedName} onChange={(event) => setTypedName(event.target.value)} sx={{ mb: 2 }} InputProps={{ sx: { color: '#FFF', fontFamily: 'monospace', fontSize: '1.1rem' } }} />
          <FormControlLabel control={<Checkbox checked={accepted} onChange={(event) => setAccepted(event.target.checked)} sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />} label={<Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>{copy(`I, ${typedName || '___'}, accept the complete bilingual portfolio agreement, the locked server quotation for ${properties.length} properties, the exclusions, liability limits, digital evidence terms and UAE governing law.`, `أنا ${typedName || '___'} أوافق على اتفاقية المحفظة ثنائية اللغة كاملة وعرض الخادم المقفل لعدد ${properties.length} عقار والاستثناءات وحدود المسؤولية وشروط الأدلة الرقمية والقانون الإماراتي.`)}</Typography>} />
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.12)' }} />
          {contractOtpVerificationId ? <Alert severity="success">{copy('Email OTP verified for this portfolio contract.', 'تم التحقق من رمز البريد لعقد المحفظة.')}</Alert> : <Stack spacing={2}>
            <Button variant="outlined" disabled={!canRequestOtp || otpBusy || quoteLoading} onClick={() => void requestOtp()}>{otpBusy ? <CircularProgress size={20} /> : copy('SEND CONTRACT OTP', 'إرسال رمز توقيع العقد')}</Button>
            {otpRequestId && <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}><TextField fullWidth label={copy('6-digit OTP', 'رمز التحقق من 6 أرقام')} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputProps={{ inputMode: 'numeric', maxLength: 6 }} /><Button variant="contained" disabled={otp.length !== 6 || otpBusy} onClick={() => void verifyOtp()}>{copy('VERIFY OTP', 'تحقق من الرمز')}</Button></Stack>}
          </Stack>}
        </Box>
      </Paper>

      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}>
        <Button variant="outlined" onClick={onBack} fullWidth sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, borderRadius: 100, fontWeight: 950 }}>{copy('Back', 'رجوع')}</Button>
        <Button variant="contained" onClick={onNext} disabled={!isValid || !lockedQuote} fullWidth sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 100 }}><ScrollText size={18} style={{ marginInlineEnd: 8 }} />{copy('Sign Portfolio Agreement & Continue to Payment', 'توقيع اتفاقية المحفظة والمتابعة إلى الدفع')}</Button>
      </Stack>
    </Box>
  );
}
