import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Container, Dialog, DialogActions, DialogContent,
  DialogTitle, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Building2, CheckCircle, ClipboardCheck, Dumbbell, MapPinned, ShieldCheck, Upload, WalletCards } from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, type User as FirebaseUser } from 'firebase/auth';
import { auth, functions, httpsCallable } from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { clearStagedFiles, getStagedFile, probeStagedFile, stageFile } from '../../lib/onboardingDb';
import { formatAED } from '../../utils/formatters';
import { mobilisationDepositFromAnnual } from '../../../functions/shared/mobilisationDeposit';
import { clearOwnerDocumentUploadCache, uploadOwnerDocuments, type OwnerDocumentInput } from './ownerDocumentUploads';
import { isValidLatLng } from '../../utils/geoAnchor';

type ProofKey = 'propertyProof' | 'emiratesId' | 'passport' | 'tradeLicense' | 'tenancySupport' | 'gymSportsApproval' | 'gymInsurance' | 'gymFloorPlan';
type ProofMeta = { name: string; size: number; type: string } | null;
type UploadedDocument = { storagePath?: string; sha256?: string };
type SubmissionResult = {
  intakeId: string;
  contractId: string;
  paymentId: string;
  annualContractValue: number;
  activationDeposit: number;
  idempotent?: boolean;
};

const documents: Array<{ key: ProofKey; en: string; ar: string; gymOnly?: boolean; accept?: string }> = [
  { key: 'propertyProof', en: 'Property Proof', ar: 'إثبات العقار', accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'emiratesId', en: 'Emirates ID', ar: 'الهوية الإماراتية', accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'passport', en: 'Passport', ar: 'جواز السفر', accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'tradeLicense', en: 'Trade Licence', ar: 'الرخصة التجارية', accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'tenancySupport', en: 'Tenancy Support', ar: 'مستندات إيجارية داعمة', accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'gymSportsApproval', en: 'Gym Sports Establishment / Fitness Centre Approval', ar: 'موافقة المنشأة الرياضية / مركز اللياقة', gymOnly: true, accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'gymInsurance', en: 'Gym Insurance Evidence', ar: 'إثبات تأمين النادي', gymOnly: true, accept: '.pdf,.jpg,.jpeg,.png' },
  { key: 'gymFloorPlan', en: 'Gym Floor Plan', ar: 'مخطط النادي الرياضي', gymOnly: true, accept: '.pdf,.jpg,.jpeg,.png' },
];

const MAX_DOCUMENT_SIZE = 8 * 1024 * 1024;

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.split(',').pop() || '' : result);
  };
  reader.onerror = () => reject(reader.error || new Error('Unable to read the selected file.'));
  reader.readAsDataURL(file);
});

export default function InspectionSubmissionStep({
  onBack,
  onFixDocuments,
}: {
  onBack: () => void;
  onFixDocuments?: () => void;
}) {
  const {
    companyProfile, ownerAccount, properties, selectedAddOns, proofDocuments,
    intakeId, onboardingSessionId, signatureName, contractOtpVerificationId,
    isContractSigned, valuationResult, portfolioSummary, setProofDocument,
  } = useOnboardingStore();
  const { lang, isRTL } = useLanguage();
  const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<SubmissionResult | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [stagedReady, setStagedReady] = useState<Record<string, boolean>>({});
  const [probingDocs, setProbingDocs] = useState(true);
  const [stagingKey, setStagingKey] = useState<ProofKey | null>(null);

  const serverQuote = valuationResult?.serverQuote as any;
  const annualValue = Number(serverQuote?.annualContractValue || serverQuote?.portfolioAnnualTotal || portfolioSummary.estimatedACV || 0);
  const activationDeposit = Number(serverQuote?.activationDeposit || serverQuote?.mobilisationDeposit || mobilisationDepositFromAnnual(annualValue));
  const effectiveIntakeId = intakeId || onboardingSessionId || ownerAccount?.uid || '';
  const ownerEmail = ownerAccount?.email || companyProfile.email || '';
  const proofMap = proofDocuments as unknown as Record<ProofKey, ProofMeta>;
  const gymProperties = useMemo(() => properties.filter((property) => property.propertyType === 'Gym / Fitness Centre'), [properties]);
  const hasGym = gymProperties.length > 0;
  const visibleDocuments = useMemo(() => documents.filter((item) => !item.gymOnly || hasGym), [hasGym]);
  const gymRequired = {
    gymSportsApproval: gymProperties.some((property) => property.gymProfile?.sportsEstablishmentApprovalStatus === 'available'),
    gymInsurance: gymProperties.some((property) => property.gymProfile?.insuranceStatus === 'available'),
    gymFloorPlan: gymProperties.some((property) => property.gymProfile?.floorPlanStatus === 'available'),
  };

  const requiredKeys = useMemo(() => {
    const keys: ProofKey[] = ['propertyProof'];
    const identityReady = Boolean(stagedReady.emiratesId && stagedReady.passport);
    const entityReady = Boolean(stagedReady.tradeLicense);
    if (!identityReady && !entityReady) {
      // Keep the identity path the Owner already started; default to individual docs.
      if (proofMap.tradeLicense && !proofMap.emiratesId && !proofMap.passport) keys.push('tradeLicense');
      else keys.push('emiratesId', 'passport');
    }
    if (gymRequired.gymSportsApproval) keys.push('gymSportsApproval');
    if (gymRequired.gymInsurance) keys.push('gymInsurance');
    if (gymRequired.gymFloorPlan) keys.push('gymFloorPlan');
    return Array.from(new Set(keys));
  }, [
    stagedReady.emiratesId,
    stagedReady.passport,
    stagedReady.tradeLicense,
    proofMap.tradeLicense,
    proofMap.emiratesId,
    proofMap.passport,
    gymRequired.gymSportsApproval,
    gymRequired.gymInsurance,
    gymRequired.gymFloorPlan,
  ]);

  const reconcileStagedDocuments = React.useCallback(async () => {
    setProbingDocs(true);
    const nextReady: Record<string, boolean> = {};
    for (const document of visibleDocuments) {
      if (!proofMap[document.key]) {
        nextReady[document.key] = false;
        continue;
      }
      // Keep proof metadata even when bytes are gone — clearing it would flip Owners
      // from the trade-licence path onto Emirates ID + Passport after a session loss.
      const file = await probeStagedFile(document.key);
      nextReady[document.key] = Boolean(file);
    }
    setStagedReady(nextReady);
    setProbingDocs(false);
  }, [visibleDocuments, proofMap]);

  useEffect(() => {
    void reconcileStagedDocuments();
    // Re-run when metadata keys change (upload/remove), not on every render object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    proofDocuments.propertyProof?.name,
    proofDocuments.emiratesId?.name,
    proofDocuments.passport?.name,
    proofDocuments.tradeLicense?.name,
    proofDocuments.tenancySupport?.name,
    (proofDocuments as any).gymSportsApproval?.name,
    (proofDocuments as any).gymInsurance?.name,
    (proofDocuments as any).gymFloorPlan?.name,
    hasGym,
  ]);

  const missingRequired = requiredKeys.filter((key) => !stagedReady[key]);
  const readyDocuments = useMemo(
    () => visibleDocuments.filter((item) => stagedReady[item.key]),
    [visibleDocuments, stagedReady],
  );

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

  const validate = (user: FirebaseUser) => {
    if (!ownerAccount?.uid || user.uid !== ownerAccount.uid) throw new Error(copy('The signed-in Owner does not match this application.', 'حساب المالك المسجل لا يطابق هذا الطلب.'));
    if (!user.emailVerified) throw new Error(copy('Verify the Owner email before final submission.', 'تحقق من بريد المالك قبل الإرسال النهائي.'));
    if (!properties.length) throw new Error(copy('Add at least one property.', 'أضف عقاراً واحداً على الأقل.'));
    if (!properties.every((property) => isValidLatLng(Number(property.geo?.lat), Number(property.geo?.lng)))) throw new Error(copy('Every property must include a valid GPS location.', 'يجب أن يحتوي كل عقار على موقع GPS صالح.'));
    if (!isContractSigned || signatureName.trim().length < 3 || !contractOtpVerificationId) throw new Error(copy('Complete the signed email-OTP agreement before submission.', 'أكمل الاتفاقية الموقعة والمتحقق منها عبر البريد قبل الإرسال.'));
    if (!serverQuote?.quoteHash || !serverQuote?.quotedAtMs || annualValue <= 0 || activationDeposit <= 0) throw new Error(copy('The signed server quotation is missing. Return to the Contract page and refresh it.', 'عرض الخادم الموقع غير موجود. ارجع إلى صفحة العقد وحدّثه.'));
    if (missingRequired.length) {
      const labels = missingRequired.map((key) => {
        const doc = documents.find((item) => item.key === key);
        return copy(doc?.en || key, doc?.ar || key);
      });
      throw new Error(copy(
        `Protected documents missing from this browser session: ${labels.join(', ')}. Re-upload them below.`,
        `مستندات محمية مفقودة من جلسة هذا المتصفح: ${labels.join('، ')}. أعد رفعها أدناه.`,
      ));
    }
  };

  const sha256Hex = async (file: Blob) => {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  };
  const uploadCache = typeof window !== 'undefined' ? window.sessionStorage : null;

  const handleRestage = async (key: ProofKey, file: File | null) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_DOCUMENT_SIZE) {
      setError(copy('File is larger than the secure 8 MB limit.', 'حجم الملف أكبر من الحد الآمن البالغ 8 ميجابايت.'));
      return;
    }
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type) && !/\.(pdf|jpg|jpeg|png)$/i.test(file.name)) {
      setError(copy('Only PDF, JPG and PNG files are accepted.', 'يتم قبول ملفات PDF وJPG وPNG فقط.'));
      return;
    }
    setStagingKey(key);
    try {
      await stageFile(key, file);
      setProofDocument(key as any, { name: file.name, size: file.size, type: file.type });
      setStagedReady((current) => ({ ...current, [key]: true }));
    } catch (stageError: any) {
      setError(stageError?.message || copy('Failed to stage file.', 'فشل تجهيز الملف.'));
    } finally {
      setStagingKey(null);
    }
  };

  // F-6 / F-9: upload returns Storage paths (no permanent URLs); transient failures retry with
  // backoff; documents already uploaded with identical bytes are not re-uploaded on retry.
  const uploadDocuments = async (user: FirebaseUser) => {
    const staged: OwnerDocumentInput[] = [];
    for (const document of readyDocuments) {
      const file = await getStagedFile(document.key);
      if (!file) throw new Error(copy(`${document.en} is missing from this browser. Upload it again.`, `ملف ${document.ar} غير موجود في هذا المتصفح. ارفعه مرة أخرى.`));
      if (file.size > MAX_DOCUMENT_SIZE) throw new Error(copy(`${document.en} exceeds the secure 8 MB final-upload limit.`, `يتجاوز ملف ${document.ar} حد الرفع الآمن البالغ 8 ميجابايت.`));
      staged.push({ key: document.key, file });
    }
    // Also include optional docs that are still staged (e.g. tenancy support).
    for (const document of visibleDocuments) {
      if (readyDocuments.some((item) => item.key === document.key)) continue;
      if (!stagedReady[document.key]) continue;
      const file = await probeStagedFile(document.key);
      if (file) staged.push({ key: document.key, file });
    }
    const callable = httpsCallable(functions, 'uploadOwnerInspectionProofDocument');
    try {
      return await uploadOwnerDocuments({
        uid: user.uid,
        intakeId: effectiveIntakeId,
        documents: staged,
        hash: sha256Hex,
        cache: uploadCache,
        onProgress: (key, percent) => setUploadProgress((current) => ({ ...current, [key]: percent })),
        upload: async ({ key, file }) => {
          const namedFile = file as File;
          const result = await callable({
            ownerUid: user.uid,
            ownerEmail: user.email || ownerEmail,
            intakeId: effectiveIntakeId,
            onboardingSessionId: effectiveIntakeId,
            docType: key,
            filename: String(namedFile.name || key).replace(/[^A-Za-z0-9._-]/g, '_'),
            contentType: namedFile.type || 'application/octet-stream',
            encodedDocument: await fileToBase64(namedFile),
          });
          return result.data as UploadedDocument;
        },
      });
    } catch (uploadError: any) {
      const failed = documents.find((item) => item.key === uploadError?.documentKey);
      if (failed) throw new Error(copy(`Secure upload failed for ${failed.en}.`, `فشل الرفع الآمن لملف ${failed.ar}.`));
      throw uploadError;
    }
  };

  const submitWithUser = async (user: FirebaseUser) => {
    await reconcileStagedDocuments();
    validate(user);
    await user.getIdToken(true);
    const documentPaths = await uploadDocuments(user);
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
      documentPaths,
    }).catch((submitError: any) => {
      // A path the server could not verify (e.g. object removed) must be uploaded again next time.
      if (String(submitError?.code || '').includes('failed-precondition') && /document/i.test(String(submitError?.message || ''))) {
        clearOwnerDocumentUploadCache(uploadCache, user.uid, effectiveIntakeId, Object.keys(documentPaths));
      }
      throw submitError;
    });
    const result = response.data as SubmissionResult;
    if (!result?.intakeId || !result?.contractId || !result?.paymentId) throw new Error(copy('The server did not return the protected application references.', 'لم يُرجع الخادم مراجع الطلب المحمية.'));
    clearOwnerDocumentUploadCache(uploadCache, user.uid, effectiveIntakeId, Object.keys(documentPaths));
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
      setError(submissionError?.message || String(submissionError));
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
      setError(reauthError?.message || copy('Owner sign-in failed.', 'فشل تسجيل دخول المالك.'));
    } finally { setLoading(false); }
  };

  if (success) {
    return (
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 8 } }} dir={isRTL ? 'rtl' : 'ltr'}>
        <Paper sx={{ p: { xs: 3, md: 6 }, textAlign: 'center', borderRadius: 6, bgcolor: 'rgba(22,22,24,0.82)', border: '1px solid #4ADE80' }}>
          <CheckCircle size={62} color="#4ADE80" />
          <Typography variant="h4" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>{copy('Five-page application submitted', 'تم إرسال الطلب المكون من خمس صفحات')}</Typography>
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.72)', lineHeight: 1.8 }}>
            {copy('BIN GROUP Admin will review the documents and property details, complete the property visit, verify measured facts, and generate the final server quote. Only then is the exact 15% mobilisation payment due. Final Admin payment approval unlocks the Owner dashboard.', 'سيقوم مسؤول BIN GROUP بمراجعة المستندات وبيانات العقار وإتمام زيارة العقار والتحقق من القياسات الفعلية ثم إصدار عرض السعر النهائي من الخادم. تستحق دفعة 15٪ بعد الزيارة والتحقق النهائي فقط. تفتح الموافقة النهائية على الدفع لوحة المالك.')}
          </Typography>
          <Stack spacing={1.2} sx={{ mt: 4, textAlign: isRTL ? 'right' : 'left', p: 3, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
            <Typography color="#FFF"><b>{copy('Application reference', 'مرجع الطلب')}:</b> {success.intakeId}</Typography>
            <Typography color="#FFF"><b>{copy('Pre-visit annual estimate', 'التقدير السنوي قبل الزيارة')}:</b> AED {formatAED(success.annualContractValue)}</Typography>
            <Typography color="#FFF"><b>{copy('Pre-visit 15% estimate', 'تقدير 15٪ قبل الزيارة')}:</b> AED {formatAED(success.activationDeposit)}</Typography>
            <Typography color="#4ADE80" fontWeight={900}>{copy('Current status: Awaiting Admin review, property visit and final verified quote', 'الحالة الحالية: بانتظار مراجعة المسؤول وزيارة العقار وعرض السعر النهائي الموثق')}</Typography>
          </Stack>
          <Button variant="contained" sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} onClick={() => { window.location.href = '/login'; }}>{copy('Go to Owner Login', 'الانتقال إلى دخول المالك')}</Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 980, mx: 'auto', width: '100%', pb: 10 }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Typography variant="h4" fontWeight={950} color="#FFF">{copy('Submit for Admin Review & Property Visit', 'الإرسال لمراجعة المسؤول وزيارة العقار')}</Typography>
        <Typography color="rgba(255,255,255,0.6)" sx={{ mt: 1 }}>{copy('This is page 5 of 5. No payment is collected now.', 'هذه الصفحة 5 من 5. لا يتم تحصيل الدفع الآن.')}</Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {probingDocs && <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 3 }}>{copy('Checking protected documents in this browser…', 'جارٍ التحقق من المستندات المحمية في هذا المتصفح…')}</Alert>}
      {!!missingRequired.length && !probingDocs && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={onFixDocuments ? <Button color="inherit" onClick={onFixDocuments}>{copy('Open Documents page', 'فتح صفحة المستندات')}</Button> : undefined}
        >
          {copy(
            'Some protected documents are no longer available in this browser session (encrypted staging is session-bound). Re-upload the missing files below, then submit.',
            'بعض المستندات المحمية لم تعد متاحة في جلسة هذا المتصفح (التجهيز المشفّر مرتبط بالجلسة). أعد رفع الملفات المفقودة أدناه ثم أرسل.',
          )}
        </Alert>
      )}
      <Paper sx={{ p: { xs: 2.5, md: 5 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 4 }}>
          {copy('Payment order: application submitted → Admin document review → property visit and measured verification → final server re-quote → exact 15% received → final Admin approval → dashboard unlocked.', 'ترتيب الدفع: إرسال الطلب ← مراجعة المستندات إدارياً ← زيارة العقار والتحقق من القياسات ← إعادة التسعير النهائي من الخادم ← استلام دفعة 15٪ الدقيقة ← الموافقة النهائية ← فتح لوحة التحكم.')}
        </Alert>
        <Stack spacing={2.2}>
          <Stack direction="row" spacing={2} alignItems="center"><ClipboardCheck color={binThemeTokens.gold} /><Box><Typography color="#FFF" fontWeight={900}>{copy('Application and signed agreement ready', 'الطلب والاتفاقية الموقعة جاهزان')}</Typography><Typography variant="caption" color="rgba(255,255,255,0.55)">{effectiveIntakeId}</Typography></Box></Stack>
          <Stack direction="row" spacing={2} alignItems="center"><Building2 color={binThemeTokens.gold} /><Typography color="#FFF" fontWeight={900}>{properties.length} {copy('property records', 'سجلات عقارية')}</Typography></Stack>
          <Stack direction="row" spacing={2} alignItems="center"><MapPinned color={binThemeTokens.gold} /><Typography color="#FFF" fontWeight={900}>{copy('GPS and measured property facts will be verified during the Admin site visit', 'سيتم التحقق من GPS وقياسات العقار الفعلية خلال زيارة الموقع الإدارية')}</Typography></Stack>
          {hasGym && <Stack direction="row" spacing={2} alignItems="center"><Dumbbell color={binThemeTokens.gold} /><Typography color="#FFF" fontWeight={900}>{copy('Gym area and complexity will be verified on site before the final payable quote is issued', 'سيتم التحقق من مساحة النادي وتعقيده في الموقع قبل إصدار عرض السعر النهائي المستحق')}</Typography></Stack>}
          <Stack direction="row" spacing={2} alignItems="center"><WalletCards color={binThemeTokens.gold} /><Typography color="#FFF" fontWeight={900}>{copy(`AED ${formatAED(activationDeposit)} is a pre-visit 15% estimate; the payable amount is locked only after final verification`, `مبلغ ${formatAED(activationDeposit)} درهم هو تقدير 15٪ قبل الزيارة؛ يتم تثبيت المبلغ المستحق فقط بعد التحقق النهائي`)}</Typography></Stack>
          {visibleDocuments.map((document) => {
            const ready = stagedReady[document.key];
            const required = requiredKeys.includes(document.key);
            if (!ready && !required && !proofMap[document.key]) return null;
            return (
              <Box key={document.key} sx={{ p: 1.5, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)' }}>
                <Typography variant="caption" color={ready ? '#4ADE80' : required ? '#FCA5A5' : 'rgba(255,255,255,0.58)'}>
                  {ready ? '✓' : '•'} {copy(document.en, document.ar)}
                  {uploadProgress[document.key] ? ` · ${uploadProgress[document.key]}%` : ''}
                  {!ready && required ? ` · ${copy('missing — re-upload required', 'مفقود — يلزم إعادة الرفع')}` : ''}
                </Typography>
                {!ready && required && (
                  <Button
                    component="label"
                    size="small"
                    startIcon={stagingKey === document.key ? <CircularProgress size={14} /> : <Upload size={14} />}
                    disabled={Boolean(stagingKey)}
                    sx={{ mt: 1, color: binThemeTokens.gold, fontWeight: 900 }}
                  >
                    {copy(`Re-upload ${document.en}`, `إعادة رفع ${document.ar}`)}
                    <input
                      hidden
                      type="file"
                      accept={document.accept || '.pdf,.jpg,.jpeg,.png'}
                      onChange={(event) => void handleRestage(document.key, event.target.files?.[0] || null)}
                    />
                  </Button>
                )}
              </Box>
            );
          })}
        </Stack>
        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 5 }}>
          <Button variant="outlined" fullWidth onClick={onBack} disabled={loading} sx={{ py: 1.5, borderRadius: 100, fontWeight: 950 }}>{copy('Back', 'رجوع')}</Button>
          <Button
            variant="contained"
            fullWidth
            onClick={() => void submit()}
            disabled={loading || probingDocs || missingRequired.length > 0}
            sx={{ py: 1.5, borderRadius: 100, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : copy('Submit All 5 Pages', 'إرسال الصفحات الخمس')}
          </Button>
        </Stack>
        {missingRequired.length > 0 && !probingDocs && (
          <Typography variant="caption" display="block" sx={{ mt: 2, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
            {copy('Submit unlocks after every required document is re-uploaded in this browser.', 'يُفعّل الإرسال بعد إعادة رفع كل مستند مطلوب في هذا المتصفح.')}
          </Typography>
        )}
      </Paper>

      <Dialog open={reauthOpen} onClose={() => setReauthOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{copy('Reconnect secure Owner session', 'إعادة ربط جلسة المالك الآمنة')}</DialogTitle>
        <DialogContent><TextField autoFocus margin="dense" fullWidth type="password" label={copy('Owner password', 'كلمة مرور المالك')} value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} /></DialogContent>
        <DialogActions><Button onClick={() => setReauthOpen(false)}>{copy('Cancel', 'إلغاء')}</Button><Button variant="contained" onClick={() => void reconnectAndSubmit()} disabled={loading}>{copy('Reconnect & Submit', 'إعادة الربط والإرسال')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
