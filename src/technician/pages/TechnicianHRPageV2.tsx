import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Award, Bot, CloudUpload, FileText, HeartPulse, Plus, Sun, Wallet } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { addDoc, collection, db, doc, functions, getDoc, httpsCallable, onSnapshot, query, ref, serverTimestamp, storage, uploadBytes, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import UnifiedDocumentVault from '../../components/UnifiedDocumentVault';
import { BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES } from '../utils/blueCollarEssIntentRouter';
import { calculateEosbEstimate, getHeatStressSeasonStatus } from '../../lib/uaeWorkforceComplianceEngine';
import { employmentJoinValue } from '../utils/employmentJoinDate';
import type { EosbTerminationReason } from '../../lib/uaeWorkforceComplianceEngine';
import HrBi, { useHrText } from '../components/HrBi';
import TechnicianLanguagePicker from '../components/TechnicianLanguagePicker';
import MyHoursPanel from '../components/MyHoursPanel';
import TechnicianOvertimeClaimCard from '../components/TechnicianOvertimeClaimCard';
import MyPayslipsPanel from '../components/MyPayslipsPanel';

const quickPrompts = [
  'I need annual leave next week',
  'I am sick and going to hospital',
  'My salary is missing deduction issue',
  'I need passport visa Emirates ID update',
  'My room AC and water problem in camp',
  'I need helmet gloves uniform tools',
  'There is unsafe electric shock accident risk',
  'Supervisor pressure unfair treatment complaint',
  'मुझे छुट्टी चाहिए',
  'എനിക്ക് sick leave വേണം',
  'Kailangan ko po ng payslip',
];

const HR_SERVER_TRAINING_VERSION = 'BIN-PEOPLE-AI-ESS-V1.2-SERVER';

const documentTypes = [
  ['emirates_id', 'Emirates ID'],
  ['passport', 'Passport'],
  ['residency_visa', 'Residency Visa'],
  ['medical_certificate', 'Medical / Sick Certificate'],
  ['insurance_card', 'Insurance Card'],
  ['labour_card', 'Labour Card'],
  ['trade_certificate', 'Trade Certificate'],
  ['driving_license', 'Driving Licence'],
  ['signed_acknowledgement', 'Signed Acknowledgement'],
  ['hr_support_file', 'HR Support File'],
];

const leaveTypes = [
  ['annual_leave', 'Annual leave'],
  ['sick_leave', 'Sick leave'],
  ['emergency_leave', 'Emergency leave'],
  ['unpaid_leave', 'Unpaid leave'],
];
// Display only. The server recomputes the day count and rejects bad dates.
const leaveDayCount = (start: string, end: string) => {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};
const requestTitle = (value: string) => String(value || 'hr_support').replace(/_/g, ' ');
const safeFileName = (value: string) => String(value || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
const sortByNewest = (items: any[]) => [...items].sort((a, b) => {
  const aTime = a.createdAt?.toMillis?.() || Date.parse(a.createdAtLocal || '') || 0;
  const bTime = b.createdAt?.toMillis?.() || Date.parse(b.createdAtLocal || '') || 0;
  return bTime - aTime;
});
const toJsDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function TechnicianHRPageV2() {
  const { user } = useRole();
  const { ht, lang: techLang, setLang: setTechLang, isRTL } = useHrText();
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [registryError, setRegistryError] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [letters, setLetters] = useState<any[]>([]);
  const [documentType, setDocumentType] = useState('emirates_id');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [hrProfile, setHrProfile] = useState<any>(null);
  const [eosbScenario, setEosbScenario] = useState<EosbTerminationReason>('resignation');
  const [leaveType, setLeaveType] = useState('annual_leave');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveNote, setLeaveNote] = useState('');
  const [leaveCertificate, setLeaveCertificate] = useState<File | null>(null);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState('');

  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'staffRequests'), where('uid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setRegistryError('');
      setRequests(sortByNewest(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))));
    }, (error) => {
      console.warn('AI HR request registry realtime failed:', error);
      setRegistryError('Live registry sync is not available yet. Newly created cases will still appear instantly on this screen.');
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'staffDocuments'), where('uid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setDocuments(sortByNewest(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))));
    }, (error) => {
      console.warn('Staff document vault realtime failed:', error);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'staffLetters'), where('uid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setLetters(sortByNewest(snap.docs.map((item) => ({ id: item.id, ...item.data() }))));
    }, (error) => {
      console.warn('Staff letters realtime failed:', error);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    Promise.all([
      getDoc(doc(db, 'hrProfiles', user.uid)),
      getDoc(doc(db, 'users', user.uid)),
    ]).then(([hrSnap, userSnap]) => {
      const hrData = hrSnap.exists() ? hrSnap.data() : {};
      const userData = userSnap.exists() ? userSnap.data() : {};
      setHrProfile({
        ...userData,
        ...hrData,
        joiningDate: employmentJoinValue(hrData, userData),
        baseSalary: hrData.baseSalary || hrData.basicSalary || userData.baseSalary || userData.basicSalary || 0,
      });
    }).catch((error) => console.warn('HR profile read failed:', error));
  }, [user?.uid]);

  const identity = () => ({
    uid: user?.uid,
    technicianId: user?.uid,
    userId: user?.uid,
    email: user?.email || '',
    displayName: user?.displayName || 'Staff Member',
    role: user?.role || 'technician',
  });

  const createAiCase = async (text = message, metadata: Record<string, unknown> = {}, leave?: Record<string, unknown>) => {
    if (!user?.uid || !text.trim()) return;
    setLoading(true);
    try {
      const createStaffHrCase = httpsCallable(functions, 'createStaffHrCase');
      const idempotencyKey = `${user.uid}:${text.trim()}:${JSON.stringify(metadata)}:${JSON.stringify(leave || {})}`;
      const response: any = await createStaffHrCase({ message: text.trim(), metadata, idempotencyKey, ...(leave ? { leave } : {}) });
      const result = response?.data?.classification;
      if (!response?.data?.ok || !result?.requestType) throw new Error('Server HR classifier did not return a case.');
      const optimisticId = `local-${Date.now()}`;
      const now = new Date().toISOString();
      const base = {
        ...identity(),
        id: response.data.requestId || optimisticId,
        requestType: result.requestType,
        requestLabel: requestTitle(result.requestType),
        category: result.category,
        priority: result.priority,
        privacyTier: result.privacyTier,
        confidential: result.privacyTier === 'hr_manager_only',
        serverClassified: true,
        classificationSource: 'server_callable',
        reason: text.trim(),
        aiAnswer: result.answer,
        detectedLanguage: result.language,
        confidence: result.confidence,
        matchedKeywords: result.matchedKeywords,
        requiresHumanReview: result.requiresHumanReview,
        recommendedNextAction: result.recommendedNextAction,
        trainingVersion: response.data.trainingVersion || HR_SERVER_TRAINING_VERSION,
        source: 'bin_people_ai_server_hr_case',
        paperless: true,
        status: 'pending_hr_review',
        startDate: String(leave?.startDate || new Date().toISOString().split('T')[0]),
        endDate: String(leave?.endDate || new Date().toISOString().split('T')[0]),
        ...(leave ? { leaveType: leave.leaveType, leaveDays: leaveDayCount(String(leave.startDate), String(leave.endDate)) } : {}),
      };
      const localCase = { ...base, createdAtLocal: now, optimistic: true };
      setRequests((prev) => sortByNewest([localCase, ...prev.filter((item) => item.id !== optimisticId)]));
      setAnswer(`${result.answer} · ${result.language.toUpperCase()} · ${Math.round(result.confidence * 100)}% confidence · ${result.recommendedNextAction}`);
      setMessage('');
    } catch (error: any) {
      console.error('AI HR case creation failed:', error);
      setAnswer(`Case could not be saved: ${error?.message || 'Permission or network issue'}`);
    } finally {
      setLoading(false);
    }
  };

  const uploadStaffDocument = async (file: File | null) => {
    if (!user?.uid || !file) return;
    if (file.size > 15 * 1024 * 1024) {
      setUploadMessage('File is too large. Maximum allowed size is 15MB.');
      return;
    }
    setUploading(true);
    setUploadMessage('');
    try {
      const label = documentTypes.find(([value]) => value === documentType)?.[1] || documentType;
      const path = `staffDocuments/${user.uid}/${documentType}/${Date.now()}-${safeFileName(file.name)}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          staffId: user.uid,
          documentType,
          accessMode: 'firebase_storage_rules',
        },
      });
      const common = {
        ...identity(),
        documentType,
        documentLabel: label,
        documentFileName: file.name,
        fileName: file.name,
        filePath: path,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        sensitiveDocument: true,
        accessMode: 'firebase_storage_rules',
        downloadTokenPersisted: false,
        paperless: true,
        status: 'pending_hr_review',
        source: 'paperless_staff_document_vault',
      };
      await addDoc(collection(db, 'staffDocuments'), { ...common, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await createAiCase(`Document update uploaded for HR review: ${label}`, common);
      setUploadMessage('Document uploaded securely and sent to HR for review. Access remains controlled by Firebase Storage rules.');
    } catch (error: any) {
      console.error('Staff document upload failed:', error);
      setUploadMessage(`Upload failed: ${error?.message || 'Permission or network issue'}`);
    } finally {
      setUploading(false);
    }
  };

  const leaveDaysPreview = leaveDayCount(leaveStart, leaveEnd);

  const submitLeaveForm = async () => {
    if (!user?.uid) return;
    setLeaveMessage('');
    if (!leaveStart || !leaveEnd || leaveDaysPreview < 1) {
      setLeaveMessage('Pick a start and end date. End must be on or after start.');
      return;
    }
    if (leaveType === 'sick_leave' && !leaveCertificate) {
      setLeaveMessage('Sick leave needs a medical certificate.');
      return;
    }
    if (leaveCertificate && leaveCertificate.size > 15 * 1024 * 1024) {
      setLeaveMessage('File is too large. Maximum allowed size is 15MB.');
      return;
    }
    setLeaveSubmitting(true);
    try {
      let certificatePath: string | null = null;
      if (leaveCertificate) {
        certificatePath = `staffDocuments/${user.uid}/medical_certificate/${Date.now()}-${safeFileName(leaveCertificate.name)}`;
        await uploadBytes(ref(storage, certificatePath), leaveCertificate, {
          contentType: leaveCertificate.type || 'application/octet-stream',
          customMetadata: { staffId: user.uid, documentType: 'medical_certificate', accessMode: 'firebase_storage_rules' },
        });
      }
      const label = leaveTypes.find(([value]) => value === leaveType)?.[1] || leaveType;
      const text = `${label}: ${leaveStart} to ${leaveEnd} (${leaveDaysPreview} days). ${leaveNote.trim()}`.trim();
      await createAiCase(text, {}, { leaveType, startDate: leaveStart, endDate: leaveEnd, certificatePath });
      setLeaveMessage(`Leave request sent to HR: ${leaveDaysPreview} days. Balance is deducted only when HR approves.`);
      setLeaveNote('');
      setLeaveCertificate(null);
    } catch (error: any) {
      setLeaveMessage(`Leave request failed: ${error?.message || 'Permission or network issue'}`);
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const mood = async (value: string) => {
    if (!user?.uid) return;
    const riskScore = value === 'urgent' ? 100 : value === 'angry' ? 85 : value === 'stressed' ? 70 : value === 'sick' ? 65 : 30;
    try {
      await addDoc(collection(db, 'staffMoodCheckins'), { ...identity(), mood: value, riskScore, source: 'paperless_staff_portal', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      if (riskScore >= 70) await createAiCase(`Wellbeing support needed: ${value}`);
    } catch (error: any) {
      console.error('Mood check-in failed:', error);
      setAnswer(`Mood check-in could not be saved: ${error?.message || 'Permission or network issue'}`);
    }
  };

  const heatStress = useMemo(() => getHeatStressSeasonStatus(), []);
  const heatStressHeadline = heatStress.inRestrictedWindowNow
    ? 'Restricted outdoor work window is active now'
    : heatStress.inSeason
      ? 'Heat stress season controls are active'
      : 'Outside peak heat stress season';
  const heatStressBody = heatStress.inSeason
    ? `Mandatory midday-break window: ${heatStress.windowLabel}. Season: ${heatStress.seasonLabel}.`
    : `Next heat stress season: ${heatStress.seasonLabel}; restricted window: ${heatStress.windowLabel}.`;

  const eosbBaseSalary = Number(hrProfile?.baseSalary) || 0;
  const eosbJoiningDate = useMemo(
    () => toJsDate(hrProfile?.joiningDate || hrProfile?.joinedAt || hrProfile?.hireDate),
    [hrProfile]
  );
  const eosbEstimate = useMemo(() => {
    if (!eosbBaseSalary || !eosbJoiningDate) return null;
    return calculateEosbEstimate({
      basicMonthlySalaryAed: eosbBaseSalary,
      joiningDate: eosbJoiningDate,
      lastWorkingDate: new Date(),
      terminationReason: eosbScenario,
    });
  }, [eosbBaseSalary, eosbJoiningDate, eosbScenario]);

  return (
    <Box sx={{ pb: 6 }} dir={isRTL ? 'rtl' : 'ltr'} lang={techLang}>
      <Box sx={{ mb: 2, maxWidth: 720 }}><TechnicianLanguagePicker value={techLang} onChange={setTechLang} label={ht('Language')} /></Box>
      <Typography variant="overline" sx={{ color: binThemeTokens.goldText, fontWeight: 950, letterSpacing: 3 }}>STAFF REQUESTS · {HR_SERVER_TRAINING_VERSION}</Typography>
      <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ mb: 1 }}><HrBi en={"Sick leave, vacation, and HR requests"} ar={"الإجازة المرضية والإجازة السنوية وطلبات الموارد البشرية"} /></Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.78)', mb: 2, maxWidth: 980 }}><HrBi en={"Languages: "} ar={"اللغات: "} /> {BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES.join(', ')}. <HrBi en={"Use this chat for sick leave, vacation, documents, pay questions, and safety. Overtime pay is not created here. During an active shift, submit 1 to 120 minutes with the job. That claim stores your clock-in and clock-out as proof. Leave is calculated after HR approves it, and only when your joining date is on file."} ar={"استخدم هذه المحادثة للإجازة المرضية والإجازة السنوية والمستندات وأسئلة الراتب والسلامة. لا تُنشئ هذه المحادثة أجراً عن العمل الإضافي. أثناء الوردية النشطة، أرسل من 1 إلى 120 دقيقة مع العمل. يحفظ الطلب وقت الحضور والانصراف كإثبات. تُحسب الإجازة بعد موافقة الموارد البشرية، وفقط عندما يكون تاريخ الالتحاق مسجلاً."} /></Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Bot color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950"><HrBi en={"Send a request to HR"} ar={"أرسل طلباً إلى الموارد البشرية"} /></Typography></Stack>
            <TextField fullWidth multiline minRows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type staff issue in English, Arabic, Hindi, Urdu, Malayalam, Tagalog, Bengali, Nepali, or mixed language" sx={{ textarea: { color: '#fff' }, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.04)' } }} />
            <Button variant="contained" disabled={loading || !message.trim()} onClick={() => createAiCase()} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{loading ? <CircularProgress size={22} sx={{ color: '#000' }} /> : 'CREATE AI HR CASE'}</Button>
            <Alert data-testid="overtime-chat-not-payable" severity="info" sx={{ mt: 2 }}>{ht('Overtime pay is not requested in this chat. During an active shift, claim 1 to 120 minutes with the job evidence.')}</Alert>
            {answer && <Alert severity={answer.includes('could not') || answer.includes('payable overtime') ? 'warning' : 'success'} sx={{ mt: 2 }}>{answer}</Alert>}
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><HeartPulse color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950"><HrBi en={"Wellbeing Check-In"} ar={"متابعة الحالة الصحية"} /></Typography></Stack>
            <Grid container spacing={1}>{['okay', 'tired', 'sick', 'stressed', 'angry', 'urgent'].map((item) => <Grid item xs={6} key={item}><Button fullWidth variant="outlined" onClick={() => mood(item)} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{item.toUpperCase()}</Button></Grid>)}</Grid>
          </Paper>
        </Grid>
      </Grid>

      <Paper id="overtime" sx={{ p: 4, mt: 3, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 5 }}>
        <TechnicianOvertimeClaimCard isRTL={isRTL} />
      </Paper>
      <MyHoursPanel />
      <MyPayslipsPanel />

      <Paper data-testid="leave-request-form" sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Sun color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950"><HrBi en={"Leave Request"} ar={"طلب إجازة"} /></Typography></Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField select label={ht('Leave type')} value={leaveType} onChange={(e) => setLeaveType(e.target.value)} sx={{ minWidth: 200, '& .MuiInputBase-root': { color: '#111827' } }}>
            {leaveTypes.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <TextField type="date" label={ht('Start date')} value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#111827' } }} />
          <TextField type="date" label={ht('End date')} value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ '& .MuiInputBase-root': { color: '#111827' } }} />
          <Chip data-testid="leave-day-count" label={`${leaveDaysPreview} ${ht('days')}`} sx={{ alignSelf: 'center', fontWeight: 900, bgcolor: binThemeTokens.gold, color: '#000' }} />
        </Stack>
        <TextField fullWidth multiline minRows={2} value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} placeholder="Reason (optional, any language)" sx={{ mt: 2, textarea: { color: '#fff' }, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.04)' } }} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 2 }} alignItems={{ md: 'center' }}>
          <Button component="label" variant="outlined" startIcon={<CloudUpload size={18} />} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.24)', fontWeight: 900 }}>
            {leaveCertificate ? leaveCertificate.name : leaveType === 'sick_leave' ? 'ATTACH MEDICAL CERTIFICATE (REQUIRED)' : 'ATTACH CERTIFICATE (OPTIONAL)'}
            <input hidden type="file" accept="application/pdf,image/*" onChange={(e) => setLeaveCertificate(e.target.files?.[0] || null)} />
          </Button>
          <Button variant="contained" disabled={leaveSubmitting} onClick={submitLeaveForm} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{leaveSubmitting ? <CircularProgress size={22} sx={{ color: '#000' }} /> : 'SEND LEAVE REQUEST'}</Button>
        </Stack>
        {leaveMessage && <Alert severity={leaveMessage.startsWith('Leave request sent') ? 'success' : 'error'} sx={{ mt: 2 }}>{leaveMessage}</Alert>}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><CloudUpload color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950"><HrBi en={"Staff Document Upload Vault"} ar={"خزنة مستندات الموظف"} /></Typography></Stack>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 1 }}><HrBi en={"Upload Emirates ID, passport, visa, medical certificates, insurance cards, labour cards, trade certificates, driving licence, signed acknowledgements, and HR support files."} ar={"ارفع الهوية الإماراتية وجواز السفر والتأشيرة والشهادات الطبية وبطاقات التأمين وبطاقة العمل والشهادات المهنية ورخصة القيادة والإقرارات الموقعة."} /></Typography>
        <Typography variant="caption" sx={{ color: binThemeTokens.goldText, display: 'block', mb: 2 }}><HrBi en={"Sensitive files remain behind authenticated Firebase Storage rules. Firestore stores the protected object path, not a reusable public download URL."} ar={"تبقى الملفات الحساسة محمية بقواعد تخزين موثقة، ولا يُحفظ رابط تنزيل عام."} /></Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField select label={ht('Document Type')} value={documentType} onChange={(e) => setDocumentType(e.target.value)} sx={{ minWidth: 280, '& .MuiInputBase-root': { color: '#111827' }, '& .MuiInputLabel-root': { color: '#344054' } }}>
            {documentTypes.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Button component="label" variant="contained" disabled={uploading} startIcon={uploading ? <CircularProgress size={18} sx={{ color: '#000' }} /> : <CloudUpload size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
            {uploading ? 'UPLOADING...' : 'UPLOAD DOCUMENT'}
            <input hidden type="file" accept="application/pdf,image/*" onChange={(e) => uploadStaffDocument(e.target.files?.[0] || null)} />
          </Button>
        </Stack>
        {uploadMessage && <Alert severity={uploadMessage.startsWith('Upload failed') || uploadMessage.startsWith('File is too') ? 'error' : 'success'} sx={{ mt: 2 }}>{uploadMessage}</Alert>}
        {documents.length > 0 && <Stack spacing={1.2} sx={{ mt: 3 }}>{documents.slice(0, 8).map((doc) => <Paper key={doc.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between"><Stack direction="row" spacing={1.2} alignItems="center"><FileText color={binThemeTokens.gold} size={18} /><Box><Typography color="#FFF" fontWeight="900">{doc.documentLabel || requestTitle(doc.documentType)}</Typography><Typography variant="caption" color="textSecondary">{doc.fileName}</Typography></Box></Stack><Chip label={String(doc.status || 'pending_hr_review').replace(/_/g, ' ').toUpperCase()} size="small" sx={{ bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Wallet color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950"><HrBi en={"Estimated End-of-Service Gratuity"} ar={"مكافأة نهاية الخدمة التقديرية"} /></Typography></Stack>
        {!eosbBaseSalary || !eosbJoiningDate ? (
          <Typography color="rgba(255,255,255,0.5)"><HrBi en={"Your basic salary and/or joining date are not on file yet. Ask HR to update your profile to see an estimate here."} ar={"راتبك الأساسي أو تاريخ التحاقك غير مسجل بعد. اطلب من الموارد البشرية تحديث ملفك لرؤية التقدير هنا."} /></Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1.2} sx={{ mb: 2 }}>
              <Button size="small" variant={eosbScenario === 'resignation' ? 'contained' : 'outlined'} onClick={() => setEosbScenario('resignation')} sx={eosbScenario === 'resignation' ? { bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 } : { color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{ht('IF I RESIGN')}</Button>
              <Button size="small" variant={eosbScenario === 'employer_terminated' ? 'contained' : 'outlined'} onClick={() => setEosbScenario('employer_terminated')} sx={eosbScenario === 'employer_terminated' ? { bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 } : { color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{ht('CONTRACT END / EMPLOYER-INITIATED')}</Button>
            </Stack>
            <Typography variant="h3" fontWeight="950" sx={{ color: binThemeTokens.gold }}>AED {eosbEstimate!.finalEstimateAed.toLocaleString()}</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 1 }}>{eosbEstimate!.note} <HrBi en={"Based on"} ar={"بناءً على"} /> {eosbEstimate!.serviceYears} <HrBi en={"years of service to date."} ar={"سنوات خدمة حتى الآن."} /></Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 2 }}>{eosbEstimate!.disclaimer}</Typography>
          </>
        )}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}><HrBi en={"HR Letters"} ar={"خطابات الموارد البشرية"} /></Typography>
        {letters.length === 0 ? <Typography color="rgba(255,255,255,0.5)"><HrBi en={"No HR letters yet."} ar={"لا توجد خطابات بعد."} /></Typography> : <Stack spacing={1.2}>{letters.slice(0, 8).map((letter) => <Paper key={letter.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction="row" spacing={1.2} alignItems="center" justifyContent="space-between"><Stack direction="row" spacing={1.2} alignItems="center"><Award color={binThemeTokens.gold} size={18} /><Box><Typography color="#FFF" fontWeight="900">{letter.title || letter.letterType || 'HR Letter'}</Typography><Typography variant="caption" color="textSecondary">{letter.status || 'pending'}</Typography></Box></Stack><Chip label={String(letter.status || 'pending').replace(/_/g, ' ').toUpperCase()} size="small" sx={{ bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}><HrBi en={"Heat Stress Season"} ar={"موسم الإجهاد الحراري"} /></Typography>
        <Stack direction="row" spacing={1.2} alignItems="center"><Sun color={heatStress.inRestrictedWindowNow ? '#ef4444' : heatStress.inSeason ? '#f59e0b' : binThemeTokens.gold} /><Typography color="#FFF" fontWeight="900">{heatStressHeadline}</Typography></Stack>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1 }}>{heatStressBody}</Typography>
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}><HrBi en={"Quick Training Tests"} ar={"اختبارات تدريب سريعة"} /></Typography>
        <Grid container spacing={1.2}>{quickPrompts.map((prompt) => <Grid item xs={12} sm={6} md={4} key={prompt}><Button fullWidth variant="outlined" startIcon={<Plus size={14} />} disabled={loading} onClick={() => void createAiCase(prompt)} sx={{ justifyContent: 'flex-start', color: '#fff', borderColor: 'rgba(255,255,255,0.14)', fontWeight: 800, textTransform: 'none' }}>{prompt}</Button></Grid>)}</Grid>
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}><HrBi en={"AI HR Request Registry"} ar={"سجل طلبات الموارد البشرية"} /></Typography>
        {registryError && <Alert severity="warning" sx={{ mb: 2 }}>{registryError}</Alert>}
        {requests.length === 0 ? <Typography color="rgba(255,255,255,0.5)"><HrBi en={"No HR cases yet."} ar={"لا توجد طلبات بعد."} /></Typography> : <Stack spacing={1.5}>{requests.slice(0, 20).map((req) => <Paper key={req.id} sx={{ p: 2.5, bgcolor: req.optimistic ? 'rgba(198,167,94,0.08)' : 'rgba(255,255,255,0.03)', border: req.optimistic ? `1px solid ${binThemeTokens.gold}` : '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography color="#FFF" fontWeight="900" sx={{ textTransform: 'uppercase' }}>{requestTitle(req.requestLabel || req.requestType)}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{req.reason}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.goldText }}>{req.detectedLanguage && `Language: ${String(req.detectedLanguage).toUpperCase()} · `}{req.confidence && `Confidence: ${Math.round(Number(req.confidence) * 100)}% · `}{req.recommendedNextAction}{req.optimistic ? ' · Saving...' : ''}</Typography></Box><Chip size="small" label={String(req.priority || 'normal').toUpperCase()} sx={{ color: req.priority === 'urgent' ? '#ef4444' : req.priority === 'high' ? '#eab308' : '#10b981', bgcolor: 'rgba(255,255,255,0.06)', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>
      <Box sx={{ mt: 3 }}>
        <UnifiedDocumentVault
          title="Technician Document Vault"
          subtitle="Work evidence and permitted HR documents linked to your staff and assigned-job record IDs."
        />
      </Box>
    </Box>
  );
}
