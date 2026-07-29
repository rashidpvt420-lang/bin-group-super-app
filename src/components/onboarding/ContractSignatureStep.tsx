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
type LockedQuote = { quoteHash: string; annualContractValue: number; activationDeposit: number; currency?: string; quotedAtMs?: number; expiresAtMs?: number; version?: string };

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
    setContractOtpVerificationId, setValuationResult, intakeId, onboardingSessionId, calculateSummary,
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
  const agreementVersion = 'BIN-GROUP-OWNER-APPLICATION-v2.0-INSPECTION-FIRST';
  const reviewedQuote = valuationResult?.serverQuote as any;
  const serviceModes = useMemo(() => [...new Set(properties.map((property) => modeLabel(property.strategy)))], [properties]);

  useEffect(() => { calculateSummary(); }, [calculateSummary, properties]);
  useEffect(() => { setContractSignature(accepted, typedName); }, [typedName, accepted, setContractSignature]);

  const loadLockedQuote = React.useCallback(async () => {
    if (!ownerAccount?.uid || !properties.length) return;
    setQuoteLoading(true);
    setOtpError('');
    try {
      const result = await httpsCallable(functions, 'previewOwnerInspectionQuote')({ properties, selectedAddOns: selectedAddOns || [] });
      const quote = result.data as LockedQuote;
      if (!quote?.quoteHash || !/^[a-f0-9]{64}$/.test(quote.quoteHash) || quote.annualContractValue <= 0 || quote.activationDeposit <= 0 || !quote.quotedAtMs) {
        throw new Error(copy('The server did not return a valid property application quotation.', 'لم يُرجع الخادم عرضاً صالحاً لطلب العقار.'));
      }
      if (reviewedQuote?.portfolioAnnualTotal && Math.abs(Number(reviewedQuote.portfolioAnnualTotal) - quote.annualContractValue) > 0.01) {
        throw new Error(copy('The portfolio amount changed after Review. Return to Review and confirm the new amount.', 'تغيّر مبلغ المحفظة بعد المراجعة. ارجع إلى المراجعة وأكد المبلغ الجديد.'));
      }
      setLockedQuote(quote);
      setValuationResult({
        ...(valuationResult || {}),
        serverQuote: {
          ...quote,
          portfolioAnnualTotal: quote.annualContractValue,
          mobilisationDeposit: quote.activationDeposit,
        },
      });
    } catch (error: any) {
      setLockedQuote(null);
      setOtpError(error?.message || copy('The protected property quotation could not be loaded.', 'تعذر تحميل عرض العقار المحمي.'));
    } finally { setQuoteLoading(false); }
  }, [ownerAccount?.uid, properties, selectedAddOns, reviewedQuote?.portfolioAnnualTotal, lang, setValuationResult]);

  useEffect(() => { void loadLockedQuote(); }, [loadLockedQuote]);

  const canRequestOtp = typedName.trim().length >= 3 && accepted && Boolean(ownerAccount?.uid && contractReference && lockedQuote?.quoteHash);
  const isValid = canRequestOtp && Boolean(contractOtpVerificationId);

  const requestOtp = async () => {
    if (!canRequestOtp || !lockedQuote) return;
    setOtpBusy(true); setOtpError('');
    try {
      const result = await httpsCallable(functions, 'requestOwnerInspectionSignatureOtp')({
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
      const result = await httpsCallable(functions, 'verifyOwnerInspectionSignatureOtp')({ requestId: otpRequestId, otp: otp.trim(), signature: typedName.trim() });
      const data = result.data as { verificationId?: string; contractId?: string };
      if (!data.verificationId || data.contractId !== contractReference) throw new Error(copy('OTP verification did not match this application.', 'لم يطابق التحقق بالرمز هذا الطلب.'));
      setContractOtpVerificationId(data.verificationId);
    } catch (error: any) {
      setContractOtpVerificationId(null);
      setOtpError(error?.message || copy('OTP verification failed.', 'فشل التحقق من الرمز.'));
    } finally { setOtpBusy(false); }
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 1040, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 } }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom>{copy('Property Service Application Agreement', 'اتفاقية طلب خدمات العقار')}</Typography>
        <Typography color="rgba(255,255,255,0.58)">{copy('Sign the application now. Payment is not collected on these five pages; the 15% mobilisation becomes due only after BIN GROUP completes the property visit.', 'وقّع الطلب الآن. لا يتم تحصيل الدفع في هذه الصفحات الخمس؛ تصبح دفعة التعبئة 15٪ مستحقة فقط بعد إكمال BIN GROUP زيارة العقار.')}</Typography>
      </Box>
      {otpError && <Alert severity="error" sx={{ mb: 3 }} action={!lockedQuote ? <Button color="inherit" onClick={() => void loadLockedQuote()}>{copy('Retry quote', 'إعادة العرض')}</Button> : undefined}>{otpError}</Alert>}
      {quoteLoading && <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 3 }}>{copy('Locking the server quotation…', 'جارٍ قفل عرض السعر من الخادم…')}</Alert>}
      {lockedQuote && <Alert severity="success" icon={<ShieldCheck size={18} />} sx={{ mb: 3 }}>{copy(`Protected quote locked · ${properties.length} properties · AED ${formatAED(lockedQuote.annualContractValue)} annually · AED ${formatAED(lockedQuote.activationDeposit)} payable only after the Admin site visit.`, `تم قفل العرض المحمي · ${properties.length} عقار · ${formatAED(lockedQuote.annualContractValue)} درهم سنوياً · ${formatAED(lockedQuote.activationDeposit)} درهم تُدفع فقط بعد زيارة الموقع الإدارية.`)}</Alert>}

      <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.65)', border: '1px solid rgba(255,255,255,0.06)', mb: 4 }}>
        <Box sx={{ bgcolor: '#FFF', color: '#000', p: { xs: 2.5, md: 4 }, borderRadius: 2, mb: 4, position: 'relative', overflow: 'hidden', maxHeight: 760, overflowY: 'auto' }}>
          <ShieldCheck size={220} style={{ position: 'absolute', top: -20, right: -20, opacity: 0.05, transform: 'rotate(-15deg)' }} />
          <Typography variant="h5" fontWeight="950" align="center" sx={{ color: binThemeTokens.gold }}>BIN GROUP L.L.C - S.P.C</Typography>
          <Typography variant="subtitle2" align="center" fontWeight="950">OWNER PROPERTY SERVICE APPLICATION</Typography>
          <Typography variant="caption" align="center" display="block" color="text.secondary">طلب خدمات عقار المالك</Typography>
          <Typography variant="caption" align="center" display="block" color="text.secondary" sx={{ mb: 3 }}>Version: {agreementVersion}</Typography>

          <AgreementSection title="1. Application Cover" ar="غلاف الطلب">
            <Grid container spacing={1.25}>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Owner / المالك</Typography><Typography variant="body2" fontWeight="800">{ownerName}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Company / الشركة</Typography><Typography variant="body2" fontWeight="800">{companyProfile.name || 'Private / فردي'}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Portfolio / المحفظة</Typography><Typography variant="body2" fontWeight="800">{properties.length} {copy('properties', 'عقار')}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Service mode / نوع الخدمة</Typography><Typography variant="body2" fontWeight="800">{serviceModes.join(' · ')}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Pre-inspection annual value / القيمة السنوية قبل الفحص</Typography><Typography variant="body2" fontWeight="950" color="primary.main">AED {formatAED(lockedQuote?.annualContractValue || portfolioSummary.estimatedACV || 0)}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">15% mobilisation after visit / دفعة 15٪ بعد الزيارة</Typography><Typography variant="body2" fontWeight="950">AED {formatAED(lockedQuote?.activationDeposit || Math.round((portfolioSummary.estimatedACV || 0) * 0.15))}</Typography></Grid>
            </Grid>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>{properties.map((property, index) => <Box key={property.id || index} sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.035)', borderRadius: 2 }}><Typography variant="caption" color="text.secondary">{copy('Property', 'العقار')} {index + 1}</Typography><Typography variant="body2" fontWeight="800">{property.address || property.area || property.emirate || 'UAE'} · {property.propertyType} · {modeLabel(property.strategy)}</Typography></Box>)}</Stack>
          </AgreementSection>

          <AgreementSection title="2. Inspection and Activation Sequence" ar="تسلسل الفحص والتفعيل">
            <Clause en="The Owner completes and signs the five-page application first. BIN GROUP then reviews the documents and property information, arranges a site visit, confirms the submitted location and service scope, and only then requests the 15% mobilisation payment." ar="يكمل المالك ويوقع الطلب المكون من خمس صفحات أولاً. ثم تراجع BIN GROUP المستندات وبيانات العقار وترتب زيارة للموقع وتؤكد الموقع ونطاق الخدمة، وبعد ذلك فقط تطلب دفعة التعبئة 15٪." />
            <Clause en="The Owner dashboard and operational services remain locked until the property visit is completed, the exact 15% mobilisation payment is received with evidence, and Admin gives final approval." ar="تبقى لوحة المالك والخدمات التشغيلية مقفلة حتى اكتمال زيارة العقار واستلام دفعة التعبئة 15٪ كاملة مع الإثبات وإصدار الموافقة النهائية من المسؤول." />
          </AgreementSection>

          <AgreementSection title="3. Commercial Model" ar="النموذج التجاري">
            <Clause en="Rent is paid directly to the Owner’s registered bank account. BIN GROUP does not hold Owner rent funds. Property-management fees and approved maintenance charges are invoiced separately according to the selected plan." ar="يُدفع الإيجار مباشرة إلى الحساب البنكي المسجل للمالك. لا تحتفظ BIN GROUP بأموال إيجار المالك. وتُفوتر رسوم إدارة العقار وتكاليف الصيانة المعتمدة بشكل منفصل وفقاً للخطة المختارة." />
            <Clause en="The server quotation shown in this application is based on the submitted property facts. If the site visit reveals a material mismatch, BIN GROUP may return the application for correction and a fresh signature before collecting payment." ar="يعتمد عرض الخادم الظاهر في هذا الطلب على بيانات العقار المقدمة. إذا كشفت زيارة الموقع اختلافاً جوهرياً، يجوز لـ BIN GROUP إعادة الطلب للتصحيح والتوقيع من جديد قبل تحصيل الدفع." />
          </AgreementSection>

          <AgreementSection title="4. Scope, Owner Duties, Payment" ar="النطاق والتزامات المالك والدفع">
            <Clause en="BIN GROUP provides only services expressly listed in the selected package, locked quotation, service schedule or signed addendum. Additional work, materials, authority fees, inspections, fit-out, civil work and MEP upgrades require written approval and additional payment." ar="تقدم BIN GROUP فقط الخدمات المذكورة صراحة في الباقة المختارة وعرض السعر المقفل وجدول الخدمات أو الملحق الموقع. وتتطلب الأعمال الإضافية والمواد ورسوم الجهات والفحوصات والتشطيبات والأعمال المدنية وترقيات الأعمال الكهروميكانيكية موافقة خطية وسداداً إضافياً." />
            <Clause en="The Owner must provide accurate identity, title deed, property, occupancy, access and payment information and ensure safe authorised access to every property in the portfolio." ar="يلتزم المالك بتقديم معلومات دقيقة عن الهوية وسندات الملكية والعقارات والإشغال والدخول والدفع وضمان الوصول الآمن والمصرح به إلى كل عقار في المحفظة." />
          </AgreementSection>

          <AgreementSection title="5. Legal Protection Clauses" ar="بنود الحماية القانونية">
            <Clause en="BIN GROUP is not responsible for hidden or pre-existing defects, structural/design defects, unlawful modifications, authority violations, tenant disputes, loss of rent or profit, force majeure, misuse, negligence, unauthorised repairs or third-party acts except where liability cannot be excluded under UAE law." ar="لا تكون BIN GROUP مسؤولة عن العيوب المخفية أو السابقة أو الإنشائية أو التصميمية أو التعديلات غير القانونية أو مخالفات الجهات أو نزاعات المستأجرين أو فقدان الإيجار أو الأرباح أو القوة القاهرة أو سوء الاستخدام أو الإهمال أو الإصلاحات غير المصرح بها أو تصرفات الأطراف الثالثة إلا إذا تعذر استبعاد المسؤولية بموجب قانون دولة الإمارات." />
          </AgreementSection>

          <AgreementSection title="6. Digital Evidence, AI Disclaimer, Law" ar="الإثبات الرقمي وإخلاء مسؤولية الذكاء الاصطناعي والقانون">
            <Clause en="BIN GROUP may timestamp, hash and retain applications, quotations, invoices, property passports, tickets, photos, approvals, signatures, GPS and audit logs. AI outputs are decision-support only and do not replace legal, engineering, tax, accounting, insurance or authority advice." ar="يجوز لـ BIN GROUP ختم الطلبات وعروض الأسعار والفواتير وجوازات العقار والتذاكر والصور والموافقات والتوقيعات وسجلات GPS والتدقيق زمنياً وتجزئتها وحفظها. مخرجات الذكاء الاصطناعي أدوات مساعدة للقرار ولا تستبدل الاستشارات القانونية أو الهندسية أو الضريبية أو المحاسبية أو التأمينية أو استشارات الجهات." />
            <Clause en="This Agreement is governed by UAE law as applicable in Abu Dhabi. Abu Dhabi Courts have jurisdiction subject to mandatory law. If the English and Arabic texts conflict before UAE mainland courts, Arabic prevails unless a signed addendum states otherwise." ar="تخضع هذه الاتفاقية لقوانين دولة الإمارات المطبقة في أبوظبي. تختص محاكم أبوظبي مع مراعاة القوانين الإلزامية. وفي حال تعارض النصين الإنجليزي والعربي أمام محاكم الدولة البرية، يسود النص العربي ما لم ينص ملحق موقع على خلاف ذلك." />
          </AgreementSection>
        </Box>

        <Box sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), borderRadius: 2, border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" mb={2}><FileSignature size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">{copy('Digital Signature', 'التوقيع الرقمي')}</Typography></Stack>
          <TextField fullWidth label={copy('Type your full legal name to sign', 'اكتب اسمك القانوني الكامل للتوقيع')} value={typedName} onChange={(event) => setTypedName(event.target.value)} sx={{ mb: 2 }} InputProps={{ sx: { color: '#FFF', fontFamily: 'monospace', fontSize: '1.1rem' } }} />
          <FormControlLabel control={<Checkbox checked={accepted} onChange={(event) => setAccepted(event.target.checked)} sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />} label={<Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>{copy(`I, ${typedName || '___'}, accept this five-page property application, the inspection-first sequence, the locked server quotation, and the UAE legal terms.`, `أنا ${typedName || '___'} أوافق على طلب العقار المكون من خمس صفحات وتسلسل الفحص أولاً وعرض الخادم المقفل والشروط القانونية الإماراتية.`)}</Typography>} />
          <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.12)' }} />
          {contractOtpVerificationId ? <Alert severity="success">{copy('Email OTP verified for this property application.', 'تم التحقق من رمز البريد لهذا الطلب.')}</Alert> : <Stack spacing={2}>
            <Button variant="outlined" disabled={!canRequestOtp || otpBusy || quoteLoading} onClick={() => void requestOtp()}>{otpBusy ? <CircularProgress size={20} /> : copy('SEND SIGNATURE OTP', 'إرسال رمز التوقيع')}</Button>
            {otpRequestId && <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}><TextField fullWidth label={copy('6-digit OTP', 'رمز التحقق من 6 أرقام')} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputProps={{ inputMode: 'numeric', maxLength: 6 }} /><Button variant="contained" disabled={otp.length !== 6 || otpBusy} onClick={() => void verifyOtp()}>{copy('VERIFY OTP', 'تحقق من الرمز')}</Button></Stack>}
          </Stack>}
        </Box>
      </Paper>

      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}>
        <Button variant="outlined" onClick={onBack} fullWidth sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, borderRadius: 100, fontWeight: 950 }}>{copy('Back', 'رجوع')}</Button>
        <Button variant="contained" onClick={onNext} disabled={!isValid || !lockedQuote} fullWidth sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 100 }}><ScrollText size={18} style={{ marginInlineEnd: 8 }} />{copy('Sign & Continue to Final Submission', 'التوقيع والمتابعة إلى الإرسال النهائي')}</Button>
      </Stack>
    </Box>
  );
}
