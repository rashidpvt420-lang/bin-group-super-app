import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, LinearProgress, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Building2, CheckCircle, ClipboardCheck, MapPinned, ShieldCheck, WalletCards } from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, type User as FirebaseUser } from 'firebase/auth';
import { auth, functions, httpsCallable } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { clearStagedFiles, getStagedFile } from '../../lib/onboardingDb';
import { formatAED } from '../../utils/formatters';

type ProofKey = 'propertyProof' | 'emiratesId' | 'passport' | 'tradeLicense' | 'tenancySupport';
type UploadedDocument = {
  storagePath: string;
  sha256: string;
  generation: string;
  filename?: string;
  contentType?: string;
  size?: number;
};
type SubmissionResult = {
  intakeId: string;
  contractId: string;
  paymentId: string;
  annualContractValue: number;
  activationDeposit: number;
  idempotent?: boolean;
};

const documents: Array<{ key: ProofKey; en: string; ar: string }> = [
  { key: 'propertyProof', en: 'Property Proof', ar: 'إثبات العقار' },
  { key: 'emiratesId', en: 'Emirates ID', ar: 'الهوية الإماراتية' },
  { key: 'passport', en: 'Passport', ar: 'جواز السفر' },
  { key: 'tradeLicense', en: 'Trade Licence', ar: 'الرخصة التجارية' },
  { key: 'tenancySupport', en: 'Tenancy Support', ar: 'مستندات إيجارية داعمة' },
];

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.split(',').pop() || '' : result);
  };
  reader.onerror = () => reject(reader.error || new Error('Unable to read the selected file.'));
  reader.readAsDataURL(file);
});

export default function InspectionSubmissionStep({ onBack }: { onBack: () => void }) {
  const {
    companyProfile, ownerAccount, properties, selectedAddOns, proofDocuments,
    intakeId, onboardingSessionId, signatureName, contractOtpVerificationId,
    isContractSigned, valuationResult, portfolioSummary,
  } = useOnboardingStore();
  const { lang, isRTL } = useLanguage();
  const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SubmissionResult | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const serverQuote = valuationResult?.serverQuote as any;
  const annualValue = Number(serverQuote?.annualContractValue || serverQuote?.portfolioAnnualTotal || portfolioSummary.estimatedACV || 0);
  const activationDeposit = Number(serverQuote?.activationDeposit || serverQuote?.mobilisationDeposit || Math.round(annualValue * 0.15));
  const effectiveIntakeId = intakeId || onboardingSessionId || ownerAccount?.uid || '';
  const ownerEmail = ownerAccount?.email || companyProfile.email || '';
  const readyDocuments = useMemo(() => documents.filter((item) => Boolean(proofDocuments[item.key])), [proofDocuments]);
  const totalProgress = readyDocuments.length
    ? Math.round(readyDocuments.reduce((sum, item) => sum + Number(uploadProgress[item.key] || 0), 0) / readyDocuments.length)
    : 0;

  const waitForCurrentUser = (timeoutMs = 8000): Promise<FirebaseUser | null> => new Promise((resolve) => {
    if (auth.currentUser) { resolve(auth.currentUser); return; }
    let completed = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (completed) return;
      completed = true;
      unsubscribe();
      resolve(user);
    });
    window.setTimeout(() => {
      if (completed) return;
      completed = true;
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);
  });

  const validate = async (user: FirebaseUser) => {
    if (!ownerAccount?.uid || user.uid !== ownerAccount.uid) throw new Error(copy('The signed-in Owner does not match this application.', 'حساب المالك المسجل لا يطابق هذا الطلب.'));
    await user.reload();
    if (!user.emailVerified) throw new Error(copy('Verify the Owner email before final submission.', 'تحقق من بريد المالك قبل الإرسال النهائي.'));
    const token = await user.getIdTokenResult(true);
    const role = String(token.claims.role || token.claims.userRole || token.claims.primaryRole || '').toLowerCase();
    if (role !== 'owner') throw new Error(copy('The verified Owner security role is not ready. Return to page 1 and confirm verification again.', 'دور أمان المالك الموثق غير جاهز. ارجع إلى الصفحة الأولى وأكد التحقق مرة أخرى.'));
    if (!properties.length) throw new Error(copy('Add at least one property.', 'أضف عقاراً واحداً على الأقل.'));
    if (!properties.every((property) => Number.isFinite(Number(property.geo?.lat)) && Number.isFinite(Number(property.geo?.lng)))) throw new Error(copy('Every property must include a valid GPS location.', 'يجب أن يحتوي كل عقار على موقع GPS صالح.'));
    if (!isContractSigned || signatureName.trim().length < 3 || !contractOtpVerificationId) throw new Error(copy('Complete the signed email-OTP agreement before submission.', 'أكمل الاتفاقية الموقعة والمتحقق منها عبر البريد قبل الإرسال.'));
    if (!serverQuote?.quoteHash || !serverQuote?.quotedAtMs || annualValue <= 0 || activationDeposit <= 0) throw new Error(copy('The signed server quotation is missing. Return to the Contract page and refresh it.', 'عرض الخادم الموقع غير موجود. ارجع إلى صفحة العقد وحدّثه.'));
    const hasIndividualIdentity = Boolean(proofDocuments.emiratesId && proofDocuments.passport);
    if (!proofDocuments.propertyProof || (!hasIndividualIdentity && !proofDocuments.tradeLicense)) throw new Error(copy('Property proof and Owner identity documents are required.', 'يلزم إثبات العقار ومستندات هوية المالك.'));
  };

  const uploadDocuments = async (user: FirebaseUser) => {
    const evidence: Record<string, UploadedDocument> = {};
    for (const document of readyDocuments) {
      const staged = await getStagedFile(document.key);
      if (!staged) throw new Error(copy(`${document.en} is missing from this browser. Upload it again.`, `ملف ${document.ar} غير موجود في هذا المتصفح. ارفعه مرة أخرى.`));
      if (staged.size > 8 * 1024 * 1024) throw new Error(copy(`${document.en} exceeds the secure 8 MB final-upload limit.`, `يتجاوز ملف ${document.ar} حد الرفع الآمن البالغ 8 ميجابايت.`));
      setUploadProgress((current) => ({ ...current, [document.key]: 20 }));
      const callable = httpsCallable(functions, 'uploadOwnerInspectionProofDocument');
      const result = await callable({
        ownerUid: user.uid,
        ownerEmail: user.email || ownerEmail,
        intakeId: effectiveIntakeId,
        onboardingSessionId: effectiveIntakeId,
        docType: document.key,
        filename: staged.name.replace(/[^A-Za-z0-9._-]/g, '_'),
        contentType: staged.type || 'application/octet-stream',
        encodedDocument: await fileToBase64(staged),
      });
      const uploaded = result.data as UploadedDocument;
      if (!uploaded.storagePath || !/^[a-f0-9]{64}$/i.test(uploaded.sha256 || '') || !uploaded.generation) {
        throw new Error(copy(`Protected upload failed for ${document.en}.`, `فشل الرفع المحمي لملف ${document.ar}.`));
      }
      evidence[document.key] = uploaded;
      setUploadProgress((current) => ({ ...current, [document.key]: 100 }));
    }
    return evidence;
  };

  const submitWithUser = async (user: FirebaseUser) => {
    await validate(user);
    const documentEvidence = await uploadDocuments(user);
    const callable = httpsCallable(functions, 'submitOwnerInspectionFirstOnboarding');
    const response = await callable({
      ownerUid: user.uid,
      ownerEmail: user.email || ownerEmail,
      ownerName: ownerAccount?.fullName || companyProfile.contactPerson,
      ownerMobile: ownerAccount?.mobile || companyProfile.phone,
      intakeId: effectiveIntakeId,
      onboardingSessionId: effectiveIntakeId,
      companyProfile,
      properties,
      selectedAddOns: selectedAddOns || [],
      signatureName: signatureName.trim(),
      otpVerificationId: contractOtpVerificationId,
      contractOtpVerificationId,
      quoteHash: serverQuote.quoteHash,
      quoteQuotedAtMs: serverQuote.quotedAtMs,
      documentEvidence,
    });
    const result = response.data as SubmissionResult;
    if (!result?.intakeId || !result?.contractId || !result?.paymentId) throw new Error(copy('The server did not return the protected application references.', 'لم يُرجع الخادم مراجع الطلب المحمية.'));
    await clearStagedFiles();
    setSuccess(result);
  };

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const user = await waitForCurrentUser();
      if (!user) {
        setReauthOpen(true);
        throw new Error(copy('Your secure session expired. Re-enter the Owner password to submit.', 'انتهت الجلسة الآمنة. أعد إدخال كلمة مرور المالك للإرسال.'));
      }
      await submitWithUser(user);
    } catch (submissionError: any) {
      setError(submissionError?.details || submissionError?.message || String(submissionError));
    } finally { setLoading(false); }
  };

  const reconnectAndSubmit = async () => {
    if (!ownerEmail || !reauthPassword) { setError(copy('Enter the Owner password.', 'أدخل كلمة مرور المالك.')); return; }
    setLoading(true);
    setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, ownerEmail.trim().toLowerCase(), reauthPassword);
      setReauthOpen(false);
      await submitWithUser(credential.user);
    } catch (reauthError: any) {
      setError(reauthError?.details || reauthError?.message || copy('Owner sign-in failed.', 'فشل تسجيل دخول المالك.'));
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 8 } }} dir={isRTL ? 'rtl' : 'ltr'}>
        <Paper sx={{ p: { xs: 3, md: 6 }, textAlign: 'center', borderRadius: 6, bgcolor: 'rgba(22,22,24,0.82)', border: '1px solid #4ADE80' }}>
          <CheckCircle size={62} color="#4ADE80" />
          <Typography variant="h4" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>{copy('Five-page application submitted securely', 'تم إرسال الطلب المكون من خمس صفحات بأمان')}</Typography>
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.72)', lineHeight: 1.8 }}>
            {copy('Your documents are private and no permanent download links were created. Admin must record verified GPS, checklist, findings, timestamps and photo evidence for every property visit. Only then can the exact 15% Cash or Cheque payment be recorded and finally approved.', 'مستنداتك خاصة ولم يتم إنشاء روابط تنزيل دائمة. يجب على المسؤول تسجيل GPS موثق وقائمة فحص ونتائج وأوقات وصورة لكل زيارة عقار. بعد ذلك فقط يمكن تسجيل دفعة 15٪ الدقيقة نقداً أو بشيك واعتمادها نهائياً.')}
          </Typography>
          <Stack spacing={1.2} sx={{ mt: 4, textAlign: isRTL ? 'right' : 'left', p: 3, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
            <Typography color="#FFF"><b>{copy('Application reference', 'مرجع الطلب')}:</b> {success.intakeId}</Typography>
            <Typography color="#FFF"><b>{copy('Annual value', 'القيمة السنوية')}:</b> AED {formatAED(success.annualContractValue)}</Typography>
            <Typography color="#FFF"><b>{copy('Exact 15% after verified visits', '15٪ الدقيقة بعد الزيارات الموثقة')}:</b> AED {formatAED(success.activationDeposit)}</Typography>
            <Typography color="#4ADE80" fontWeight={900}>{copy('Current status: Awaiting Admin review and verified property visits', 'الحالة الحالية: بانتظار مراجعة المسؤول وزيارات العقارات الموثقة')}</Typography>
          </Stack>
          <Button variant="contained" sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} onClick={() => { window.location.href = '/login'; }}>{copy('Go to Owner Login', 'الانتقال إلى دخول المالك')}</Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 980, mx: 'auto', width: '100%', pb: 10 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h4" fontWeight={950} color="#FFF">{copy('Submit for Admin Review & Verified Property Visits', 'الإرسال لمراجعة المسؤول وزيارات العقارات الموثقة')}</Typography>
        <Typography color="rgba(255,255,255,0.6)" sx={{ mt: 1 }}>{copy('This is page 5 of 5. No payment is collected now.', 'هذه الصفحة 5 من 5. لا يتم تحصيل الدفع الآن.')}</Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {loading && <Box sx={{ mb: 3 }}><LinearProgress variant="determinate" value={Math.max(totalProgress, 8)} /><Typography variant="caption" color="rgba(255,255,255,0.55)">{copy(`Protected upload and submission: ${Math.max(totalProgress, 8)}%`, `الرفع والإرسال المحمي: ${Math.max(totalProgress, 8)}٪`)}</Typography></Box>}
      <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.76)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Stack spacing={2.5}>
          <Alert icon={<ShieldCheck size={20} />} severity="success">{copy('Documents are stored privately with SHA-256 and immutable Storage generation evidence. Admin receives only short-lived signed access.', 'تُخزن المستندات بشكل خاص مع SHA-256 ودليل إصدار تخزين غير قابل للتغيير. يحصل المسؤول فقط على وصول موقع قصير المدة.')}</Alert>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Paper sx={{ p: 2.5, flex: 1, bgcolor: 'rgba(255,255,255,0.03)' }}><Building2 /><Typography fontWeight={900} color="#FFF">{properties.length} {copy('properties', 'عقارات')}</Typography></Paper>
            <Paper sx={{ p: 2.5, flex: 1, bgcolor: 'rgba(255,255,255,0.03)' }}><MapPinned /><Typography fontWeight={900} color="#FFF">{copy('GPS pending Admin verification', 'GPS بانتظار تحقق المسؤول')}</Typography></Paper>
            <Paper sx={{ p: 2.5, flex: 1, bgcolor: 'rgba(255,255,255,0.03)' }}><WalletCards /><Typography fontWeight={900} color="#FFF">AED {formatAED(activationDeposit)} · {copy('Cash/Cheque after visits', 'نقد/شيك بعد الزيارات')}</Typography></Paper>
          </Stack>
          <Alert icon={<ClipboardCheck size={20} />} severity="info">{copy('Sequence: secure submission → Admin document review → one evidence-backed visit per property → exact 15% Cash/Cheque receipt → MFA final approval → dashboard unlock.', 'التسلسل: إرسال آمن ← مراجعة المستندات ← زيارة موثقة لكل عقار ← إيصال 15٪ نقداً/بشيك ← موافقة نهائية عبر MFA ← فتح لوحة التحكم.')}</Alert>
          <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}>
            <Button variant="outlined" fullWidth onClick={onBack} disabled={loading}>{copy('Back', 'رجوع')}</Button>
            <Button variant="contained" fullWidth onClick={submit} disabled={loading} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : copy('Submit all 5 pages securely', 'إرسال الصفحات الخمس بأمان')}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Dialog open={reauthOpen} onClose={() => !loading && setReauthOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{copy('Reconnect secure Owner session', 'إعادة اتصال جلسة المالك الآمنة')}</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth type="password" label={copy('Owner password', 'كلمة مرور المالك')} value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} sx={{ mt: 1 }} /></DialogContent>
        <DialogActions><Button onClick={() => setReauthOpen(false)}>{copy('Cancel', 'إلغاء')}</Button><Button variant="contained" onClick={reconnectAndSubmit} disabled={loading}>{copy('Reconnect and submit', 'إعادة الاتصال والإرسال')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
