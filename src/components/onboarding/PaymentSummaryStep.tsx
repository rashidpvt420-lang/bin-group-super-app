import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Divider, Grid, Paper, Snackbar, Stack,
  Typography
} from '@mui/material';
import {
  ArrowLeft, Banknote, CheckCircle2, ChevronRight, Lock, ReceiptText, ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { formatAED } from '../../utils/formatters';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

type PaymentMethod = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'STRIPE';
type PaymentConfiguration = {
  version: string;
  effectiveAtMs: number;
  legalBeneficiary: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  currency: 'AED';
  officeLocation: string;
  approvedMethods: PaymentMethod[];
  configHash: string;
};
type CanonicalQuote = {
  quoteHash: string;
  annualContractValue: number;
  activationDeposit: number;
  currency?: string;
  quotedAtMs?: number;
  expiresAtMs?: number;
  version?: string;
};

const methodDefinitions: Array<{ method: PaymentMethod; icon: React.ReactNode; en: string; ar: string; detailEn?: string; detailAr?: string }> = [
  { method: 'CHEQUE', icon: <ReceiptText size={24} />, en: 'Cheque', ar: 'شيك', detailEn: 'Receipt required', detailAr: 'الإيصال مطلوب' },
  { method: 'CASH', icon: <Banknote size={24} />, en: 'Cash', ar: 'نقداً', detailEn: 'Approved office only', detailAr: 'في المكتب المعتمد فقط' },
  { method: 'BANK_TRANSFER', icon: <Banknote size={24} />, en: 'Bank Transfer', ar: 'تحويل بنكي', detailEn: 'Manual verification', detailAr: 'تحقق يدوي' },
  { method: 'STRIPE', icon: <ShieldCheck size={24} />, en: 'Secure Card Payment', ar: 'دفع آمن بالبطاقة', detailEn: 'Secure hosted checkout', detailAr: 'صفحة دفع آمنة' },
];
const errorMessage = (error: unknown, fallback: string) => {
  const value = error as { message?: string; details?: string };
  return String(value?.details || value?.message || fallback);
};

const PaymentSummaryStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
  const { isRTL, lang } = useLanguage();
  const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const {
    properties, selectedAddOns, valuationResult, portfolioSummary, setPaymentVerified,
    setPaymentRequested, paymentVerified, setContractId, paymentMethod, setPaymentMethod,
    paymentManifest, setPaymentManifest, calculateSummary,
  } = useOnboardingStore();
  const [configuration, setConfiguration] = useState<PaymentConfiguration | null>(null);
  const [canonicalQuote, setCanonicalQuote] = useState<CanonicalQuote | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

  useEffect(() => { calculateSummary(); }, [calculateSummary, properties]);

  useEffect(() => {
    let active = true;
    const loadAuthority = async () => {
      setConfigurationLoading(true);
      setConfigurationError(null);
      try {
        const [configurationResult, quoteResult] = await Promise.all([
          httpsCallable(functions, 'getOwnerPaymentConfiguration')({}),
          httpsCallable(functions, 'previewOwnerOnboardingQuote')({ properties, selectedAddOns: selectedAddOns || [] }),
        ]);
        const nextConfiguration = configurationResult.data as PaymentConfiguration;
        if (
          !nextConfiguration?.version ||
          !nextConfiguration?.configHash ||
          nextConfiguration.currency !== 'AED' ||
          !Array.isArray(nextConfiguration.approvedMethods)
        ) {
          throw new Error('The server returned an invalid corporate payment configuration.');
        }
        const nextQuote = quoteResult.data as CanonicalQuote;
        if (!nextQuote?.quoteHash || !/^[a-f0-9]{64}$/i.test(nextQuote.quoteHash) || nextQuote.annualContractValue <= 0 || nextQuote.activationDeposit <= 0) {
          throw new Error(copy('The server returned an invalid portfolio quotation.', 'أرجع الخادم عرض محفظة غير صالح.'));
        }
        if (nextQuote.currency && nextQuote.currency !== 'AED') throw new Error(copy('Only AED portfolio quotations are accepted.', 'يتم قبول عروض المحفظة بالدرهم فقط.'));
        const reviewedQuote = valuationResult?.serverQuote as any;
        if (reviewedQuote?.portfolioAnnualTotal && Math.abs(Number(reviewedQuote.portfolioAnnualTotal) - nextQuote.annualContractValue) > 0.01) {
          throw new Error(copy('The portfolio amount changed after Review. Return and approve the updated server quote.', 'تغيّر مبلغ المحفظة بعد المراجعة. ارجع واعتمد عرض الخادم المحدث.'));
        }
        if (active) {
          setConfiguration(nextConfiguration);
          setCanonicalQuote(nextQuote);
          setPaymentManifest(null);
          setPaymentMethod(null);
        }
      } catch (error) {
        if (active) {
          setConfiguration(null);
          setCanonicalQuote(null);
          setPaymentManifest(null);
          setPaymentMethod(null);
          setConfigurationError(errorMessage(error, copy(
            'Corporate payment instructions are unavailable. Payment initiation is disabled.',
            'تعليمات الدفع المؤسسية غير متاحة. تم تعطيل بدء الدفع.'
          )));
        }
      } finally {
        if (active) setConfigurationLoading(false);
      }
    };
    void loadAuthority();
    return () => { active = false; };
  }, [properties, selectedAddOns, valuationResult?.serverQuote, lang, setPaymentManifest, setPaymentMethod]);

  const annualTotal = Number(canonicalQuote?.annualContractValue || valuationResult?.serverQuote?.portfolioAnnualTotal || portfolioSummary.estimatedACV || 0);
  const activationDeposit = Number(canonicalQuote?.activationDeposit || Math.round(annualTotal * 0.15));
  const totalProperties = properties.length;
  const hasValidAmount = annualTotal > 0 && activationDeposit > 0 && Boolean(canonicalQuote?.quoteHash);
  const approvedMethods = useMemo(() => new Set<PaymentMethod>(configuration?.approvedMethods || []), [configuration?.approvedMethods]);

  const handleGenerateManifest = async (method: PaymentMethod) => {
    if (!hasValidAmount || !canonicalQuote) {
      setSnackbar({ open: true, message: copy('The protected portfolio amount is missing.', 'مبلغ المحفظة المحمي غير موجود.'), severity: 'error' });
      return;
    }
    if (!configuration || !approvedMethods.has(method)) {
      setSnackbar({ open: true, message: copy('This payment method is not enabled by the active corporate configuration.', 'طريقة الدفع هذه غير مفعلة في الإعداد المؤسسي النشط.'), severity: 'error' });
      return;
    }
    setIsGenerating(true);
    try {
      const reference = `BIN-PORTFOLIO-${String(canonicalQuote.quoteHash).slice(0, 10).toUpperCase()}-${Date.now()}`;
      const manifest = {
        payableTo: configuration.legalBeneficiary,
        legalBeneficiary: configuration.legalBeneficiary,
        bankName: configuration.bankName,
        accountNumber: configuration.accountNumber,
        iban: configuration.iban,
        swiftBic: configuration.swiftBic,
        officeLocation: configuration.officeLocation,
        amount: activationDeposit,
        annualContractValue: annualTotal,
        activationDeposit,
        method,
        reference,
        currency: configuration.currency,
        configVersion: configuration.version,
        configHash: configuration.configHash,
        configEffectiveAtMs: configuration.effectiveAtMs,
        quoteHash: canonicalQuote.quoteHash,
        quoteVersion: canonicalQuote.version || null,
        quoteQuotedAtMs: canonicalQuote.quotedAtMs || null,
        quoteExpiresAtMs: canonicalQuote.expiresAtMs || null,
        portfolioPropertyCount: totalProperties,
      };
      setPaymentMethod(method);
      setContractId(`${method}-PORTFOLIO-${Date.now()}`);
      setPaymentManifest(manifest);
      setPaymentRequested(true);
      setPaymentVerified(false);
      if (method === 'STRIPE') {
        onNext();
        return;
      }
      setSnackbar({ open: true, message: copy('Verified portfolio payment instructions generated.', 'تم إنشاء تعليمات دفع موثقة للمحفظة.'), severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: errorMessage(error, copy('Unable to generate payment instructions.', 'تعذر إنشاء تعليمات الدفع.')), severity: 'error' });
    } finally { setIsGenerating(false); }
  };

  const handleContinueAfterManualManifest = () => {
    setPaymentVerified(false);
    setPaymentRequested(true);
    onNext();
  };

  const renderPaymentInstructions = () => {
    if (!paymentManifest || !paymentMethod) return null;
    return (
      <Box sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{copy('Verified payment instructions', 'تعليمات دفع موثقة')}</Typography>
        <Paper sx={{ mt: 2, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
          <Stack spacing={2} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />}>
            <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Legal beneficiary', 'المستفيد القانوني')}</Typography><Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.legalBeneficiary}</Typography></Box>
            {paymentMethod === 'BANK_TRANSFER' && <>
              <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Bank', 'البنك')}</Typography><Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.bankName}</Typography></Box>
              <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Account number', 'رقم الحساب')}</Typography><Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.accountNumber}</Typography></Box>
              <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>IBAN</Typography><Typography fontWeight={800} color={binThemeTokens.textPrimary} sx={{ wordBreak: 'break-all' }}>{paymentManifest.iban}</Typography></Box>
              <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>SWIFT / BIC</Typography><Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.swiftBic}</Typography></Box>
            </>}
            {paymentMethod === 'CASH' && <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Approved office', 'المكتب المعتمد')}</Typography><Typography fontWeight={800} color={binThemeTokens.textPrimary}>{paymentManifest.officeLocation || copy('Contact BIN GROUP before paying cash.', 'تواصل مع BIN GROUP قبل الدفع النقدي.')}</Typography></Box>}
            <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Due now', 'المستحق الآن')}</Typography><Typography variant="h5" fontWeight={950} color={binThemeTokens.goldLight}>AED {formatAED(paymentManifest.amount)}</Typography></Box>
            <Box><Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Mandatory reference', 'المرجع الإلزامي')}</Typography><Typography fontWeight={800} color={binThemeTokens.textPrimary} sx={{ wordBreak: 'break-all' }}>{paymentManifest.reference}</Typography></Box>
          </Stack>
        </Paper>
      </Box>
    );
  };

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'}>
      <Button variant="outlined" onClick={onBack} startIcon={!isRTL ? <ArrowLeft size={18} /> : undefined} sx={{ mb: 3, color: '#FFF', borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, fontWeight: 900 }}>{copy('Back', 'رجوع')}</Button>
      {configurationError && <Alert severity="error" sx={{ mb: 3 }}>{configurationError}</Alert>}
      {!hasValidAmount && !configurationLoading && <Alert severity="warning" sx={{ mb: 3 }}>{copy('The protected portfolio payment value is unavailable. Return to Review and refresh the server quotation.', 'قيمة دفع المحفظة المحمية غير متاحة. ارجع إلى المراجعة وحدّث عرض الخادم.')}</Alert>}

      <Grid container spacing={4}>
        <Grid item xs={12} md={7}>
          <Typography variant="h4" fontWeight={950} sx={{ mb: 1, color: binThemeTokens.gold }}>{copy('Portfolio Payment Options', 'خيارات دفع المحفظة')}</Typography>
          <Typography color={binThemeTokens.textSecondary} sx={{ mb: 4 }}>{copy(`One server-authoritative agreement for ${totalProperties} propert${totalProperties === 1 ? 'y' : 'ies'}.`, `اتفاقية واحدة معتمدة من الخادم لعدد ${totalProperties} عقار.`)}</Typography>
          <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.6)', border: '1px solid rgba(198,167,94,0.1)', mb: 4 }}>
            <Typography variant="h6" fontWeight={950} color={binThemeTokens.gold} mb={3}>{copy('Protected Portfolio Summary', 'ملخص المحفظة المحمي')}</Typography>
            <Stack spacing={3} divider={<Divider sx={{ borderColor: 'rgba(198,167,94,0.1)' }} />}>
              <Box display="flex" justifyContent="space-between" gap={2}><Typography fontWeight={900} color={binThemeTokens.textPrimary}>{copy('Properties included', 'العقارات المشمولة')}</Typography><Typography fontWeight={950} color={binThemeTokens.textPrimary}>{totalProperties}</Typography></Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}><Typography variant="h5" fontWeight={950} color={binThemeTokens.textPrimary}>{copy('Annual portfolio value', 'القيمة السنوية للمحفظة')}</Typography><Typography variant="h3" fontWeight={950} color={binThemeTokens.goldLight}>AED {formatAED(annualTotal)}</Typography></Box>
              <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy(`Server quote hash: ${canonicalQuote?.quoteHash?.slice(0, 16) || '—'}…`, `تجزئة عرض الخادم: ${canonicalQuote?.quoteHash?.slice(0, 16) || '—'}…`)}</Typography>
            </Stack>
          </Paper>
          <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198,167,94,0.05)', border: '1px solid rgba(198,167,94,0.1)' }}>
            <Typography variant="h6" fontWeight={950} color={binThemeTokens.gold} display="flex" alignItems="center" gap={1.5}><TrendingUp size={24} /> {copy('Mandatory 15% Mobilisation Deposit', 'دفعة التعبئة الإلزامية 15٪')}</Typography>
            <Typography color={binThemeTokens.textSecondary} sx={{ mt: 2, lineHeight: 1.8 }}>{copy('The 15% deposit applies to the full portfolio annual value for monthly, quarterly and annual plans. The remaining 85% follows the selected property schedules.', 'تطبق دفعة 15٪ على القيمة السنوية الكاملة للمحفظة لجميع الخطط. ويتم سداد 85٪ المتبقية وفق جداول العقارات المختارة.')}</Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 4, borderRadius: 8, bgcolor: '#161618', border: '1px solid rgba(198,167,94,0.2)', position: { md: 'sticky' }, top: 180, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={950} color={binThemeTokens.gold}>{copy('Official Settlement', 'التسوية الرسمية')}</Typography>
            <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy('Due now', 'المستحق الآن')}</Typography>
            <Typography variant="h2" fontWeight={950} color={binThemeTokens.goldLight} sx={{ mt: 1 }}>AED {formatAED(activationDeposit)}</Typography>
            <Typography variant="caption" color={binThemeTokens.textSecondary}>{copy(`15% of AED ${formatAED(annualTotal)} portfolio value`, `15٪ من قيمة المحفظة البالغة ${formatAED(annualTotal)} درهم`)}</Typography>
            <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.08)' }} />

            {configurationLoading ? <Stack alignItems="center" spacing={2} py={3}><CircularProgress size={28} /><Typography color={binThemeTokens.textSecondary}>{copy('Loading verified payment authority…', 'جارٍ تحميل صلاحية الدفع الموثقة…')}</Typography></Stack> : !paymentVerified ? !paymentManifest ? (
              <Stack spacing={2}>{methodDefinitions.map((definition) => {
                const allowed = approvedMethods.has(definition.method);
                return <Button key={definition.method} variant="outlined" fullWidth onClick={() => void handleGenerateManifest(definition.method)} disabled={isGenerating || !hasValidAmount || !configuration || !allowed} sx={{ py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.3)', color: binThemeTokens.textPrimary, display: 'flex', justifyContent: 'space-between' }}><Box display="flex" alignItems="center" gap={2} textAlign={isRTL ? 'right' : 'left'}><Box color={binThemeTokens.gold} display="flex">{definition.icon}</Box><Box><Typography fontWeight={800}>{copy(definition.en, definition.ar)}</Typography><Typography variant="caption" color={binThemeTokens.textSecondary}>{copy(definition.detailEn || '', definition.detailAr || '')}</Typography></Box></Box><ChevronRight size={20} style={{ transform: isRTL ? 'rotate(180deg)' : undefined }} /></Button>;
              })}</Stack>
            ) : <Box>{renderPaymentInstructions()}{paymentMethod !== 'STRIPE' && <Button fullWidth variant="contained" onClick={handleContinueAfterManualManifest} sx={{ mt: 3, background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', color: '#0B0B0C', py: 2, fontWeight: 950, borderRadius: 4 }}>{copy('Continue to Evidence Submission', 'المتابعة إلى إرسال الإثبات')}</Button>}<Button fullWidth variant="text" onClick={() => { setPaymentManifest(null); setPaymentMethod(null); }} sx={{ mt: 1, color: binThemeTokens.textSecondary, fontWeight: 900 }}>{copy('Change Method', 'تغيير الطريقة')}</Button></Box> : (
              <Box sx={{ p: 4, bgcolor: 'rgba(74,222,128,0.1)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)' }}><CheckCircle2 color="#4ADE80" size={48} /><Typography variant="h5" fontWeight={950} color="#4ADE80" sx={{ mt: 2 }}>{copy('Payment Verified', 'تم التحقق من الدفع')}</Typography><Button fullWidth variant="contained" onClick={onNext} sx={{ mt: 3, bgcolor: '#4ADE80', color: '#0B0B0C', py: 2, fontWeight: 950 }}>{copy('Proceed', 'متابعة')}</Button></Box>
            )}
            {isGenerating && <CircularProgress size={22} sx={{ mt: 3 }} />}
            <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, opacity: 0.7 }}><Lock size={16} color={binThemeTokens.gold} /><Typography variant="caption" fontWeight={900} color={binThemeTokens.goldLight}>{configuration ? `${copy('Config', 'الإعداد')} ${configuration.version}` : copy('Payments locked', 'المدفوعات مقفلة')}</Typography></Box>
          </Paper>
        </Grid>
      </Grid>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>{snackbar.message}</Alert></Snackbar>
    </Box>
  );
};

export default PaymentSummaryStep;
