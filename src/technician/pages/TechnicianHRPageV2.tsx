import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Award, Bot, CloudUpload, FileText, HeartPulse, Plus, Sun, Wallet } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { addDoc, collection, db, doc, getDoc, getDownloadURL, onSnapshot, query, ref, serverTimestamp, storage, uploadBytes, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES, BLUE_COLLAR_ESS_TRAINING_VERSION, classifyBlueCollarEssIntent } from '../utils/blueCollarEssIntentRouter';
import { calculateEosbEstimate, getHeatStressSeasonStatus } from '../../lib/uaeWorkforceComplianceEngine';
import type { EosbTerminationReason } from '../../lib/uaeWorkforceComplianceEngine';

const quickPrompts = [
  'I need annual leave next week',
  'I am sick and going to hospital',
  'I worked overtime yesterday',
  'My salary is missing deduction issue',
  'I need passport visa Emirates ID update',
  'My room AC and water problem in camp',
  'I need helmet gloves uniform tools',
  'There is unsafe electric shock accident risk',
  'Supervisor pressure unfair treatment complaint',
  'مجھے اوور ٹائم چاہیے',
  'मुझे छुट्टी चाहिए',
  'എനിക്ക് sick leave വേണം',
  'Kailangan ko po ng payslip',
];

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
  const { tx, isRTL } = useLanguage();
  const documentTypes = useMemo(() => [
    ['emirates_id', tx('technician.hr.doc.emirates_id', 'Emirates ID')],
    ['passport', tx('technician.hr.doc.passport', 'Passport')],
    ['residency_visa', tx('technician.hr.doc.residency_visa', 'Residency Visa')],
    ['medical_certificate', tx('technician.hr.doc.medical_certificate', 'Medical / Sick Certificate')],
    ['insurance_card', tx('technician.hr.doc.insurance_card', 'Insurance Card')],
    ['labour_card', tx('technician.hr.doc.labour_card', 'Labour Card')],
    ['trade_certificate', tx('technician.hr.doc.trade_certificate', 'Trade Certificate')],
    ['driving_license', tx('technician.hr.doc.driving_license', 'Driving Licence')],
    ['signed_acknowledgement', tx('technician.hr.doc.signed_acknowledgement', 'Signed Acknowledgement')],
    ['hr_support_file', tx('technician.hr.doc.hr_support_file', 'HR Support File')],
  ], [tx]);
  const moodLabels: Record<string, string> = useMemo(() => ({
    okay: tx('technician.hr.mood.okay', 'okay'),
    tired: tx('technician.hr.mood.tired', 'tired'),
    sick: tx('technician.hr.mood.sick', 'sick'),
    stressed: tx('technician.hr.mood.stressed', 'stressed'),
    angry: tx('technician.hr.mood.angry', 'angry'),
    urgent: tx('technician.hr.mood.urgent', 'urgent'),
  }), [tx]);
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
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) setHrProfile(snap.data());
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

  const createAiCase = async (text = message) => {
    if (!user?.uid || !text.trim()) return;
    setLoading(true);
    try {
      const result = classifyBlueCollarEssIntent(text);
      const optimisticId = `local-${Date.now()}`;
      const now = new Date().toISOString();
      const base = {
        ...identity(),
        requestType: result.requestType,
        requestLabel: requestTitle(result.requestType),
        category: result.category,
        priority: result.priority,
        reason: text.trim(),
        aiAnswer: result.answer,
        detectedLanguage: result.language,
        confidence: result.confidence,
        matchedKeywords: result.matchedKeywords,
        requiresHumanReview: result.requiresHumanReview,
        recommendedNextAction: result.recommendedNextAction,
        trainingVersion: BLUE_COLLAR_ESS_TRAINING_VERSION,
        source: 'bin_people_ai_multilingual_ess',
        paperless: true,
        status: 'pending_hr_review',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        hours: 0,
      };
      const localCase = { id: optimisticId, ...base, createdAtLocal: now, optimistic: true };
      setRequests((prev) => sortByNewest([localCase, ...prev.filter((item) => item.id !== optimisticId)]));
      await addDoc(collection(db, 'staffRequests'), { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'hrAiConversations'), { ...base, question: text.trim(), answer: result.answer, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
      await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
      const fileUrl = await getDownloadURL(fileRef);
      const common = {
        ...identity(),
        documentType,
        documentLabel: label,
        documentFileName: file.name,
        documentFileUrl: fileUrl,
        fileName: file.name,
        filePath: path,
        fileUrl,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        paperless: true,
        status: 'pending_hr_review',
        source: 'paperless_staff_document_vault',
      };
      await addDoc(collection(db, 'staffDocuments'), { ...common, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'staffRequests'), {
        ...common,
        requestType: 'document_update',
        requestLabel: `Document Upload: ${label}`,
        category: 'documents',
        priority: documentType === 'medical_certificate' ? 'high' : 'normal',
        reason: `Uploaded ${label}: ${file.name}`,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        hours: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setUploadMessage('Document uploaded and sent to HR for review.');
    } catch (error: any) {
      console.error('Staff document upload failed:', error);
      setUploadMessage(`Upload failed: ${error?.message || 'Permission or network issue'}`);
    } finally {
      setUploading(false);
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

  const eosbBaseSalary = Number(hrProfile?.baseSalary) || 0;
  const eosbJoiningDate = useMemo(
    () => toJsDate(hrProfile?.joiningDate || hrProfile?.joinedAt || hrProfile?.hireDate || hrProfile?.createdAt),
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
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{tx('technician.hr.headerPrefix', 'BIN PEOPLE AI ·')} {BLUE_COLLAR_ESS_TRAINING_VERSION}</Typography>
      <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ mb: 1 }}>{tx('technician.hr.heroTitle', 'AI-Driven Multilingual Blue-Collar Workforce ESS')}</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 4, maxWidth: 980 }}>{tx('technician.hr.heroDesc', 'Trained for {{languages}}. Routes leave, sick leave, overtime, payslip, salary, documents, accommodation, safety, tools/PPE, transport, wellbeing, and HR cases without paperwork.', { languages: BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES.join(', ') })}</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Bot color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">{tx('technician.hr.intentRouterTitle', 'People AI Intent Router')}</Typography></Stack>
            <TextField fullWidth multiline minRows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tx('technician.hr.intentPlaceholder', 'Type staff issue in English, Arabic, Hindi, Urdu, Malayalam, Tagalog, Bengali, Nepali, or mixed language')} sx={{ textarea: { color: '#fff' }, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.04)' } }} />
            <Button variant="contained" disabled={loading || !message.trim()} onClick={() => createAiCase()} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{loading ? <CircularProgress size={22} sx={{ color: '#000' }} /> : tx('technician.hr.createCaseBtn', 'CREATE AI HR CASE')}</Button>
            {answer && <Alert severity={answer.includes('could not') ? 'error' : 'success'} sx={{ mt: 2 }}>{answer}</Alert>}
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><HeartPulse color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">{tx('technician.hr.wellbeingTitle', 'Wellbeing Check-In')}</Typography></Stack>
            <Grid container spacing={1}>{['okay', 'tired', 'sick', 'stressed', 'angry', 'urgent'].map((item) => <Grid item xs={6} key={item}><Button fullWidth variant="outlined" onClick={() => mood(item)} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{moodLabels[item].toUpperCase()}</Button></Grid>)}</Grid>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><CloudUpload color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">{tx('technician.hr.uploadVaultTitle', 'Staff Document Upload Vault')}</Typography></Stack>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 2 }}>{tx('technician.hr.uploadVaultDesc', 'Upload Emirates ID, passport, visa, medical certificates, insurance cards, labour cards, trade certificates, driving licence, signed acknowledgements, and HR support files.')}</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField select label={tx('technician.hr.documentTypeLabel', 'Document Type')} value={documentType} onChange={(e) => setDocumentType(e.target.value)} sx={{ minWidth: 280, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' } }}>
            {documentTypes.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Button component="label" variant="contained" disabled={uploading} startIcon={uploading ? <CircularProgress size={18} sx={{ color: '#000' }} /> : <CloudUpload size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
            {uploading ? tx('technician.hr.uploading', 'UPLOADING...') : tx('technician.hr.uploadDocumentBtn', 'UPLOAD DOCUMENT')}
            <input hidden type="file" accept="application/pdf,image/*" onChange={(e) => uploadStaffDocument(e.target.files?.[0] || null)} />
          </Button>
        </Stack>
        {uploadMessage && <Alert severity={uploadMessage.startsWith('Upload failed') || uploadMessage.startsWith('File is too') ? 'error' : 'success'} sx={{ mt: 2 }}>{uploadMessage}</Alert>}
        {documents.length > 0 && <Stack spacing={1.2} sx={{ mt: 3 }}>{documents.slice(0, 8).map((doc) => <Paper key={doc.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between"><Stack direction="row" spacing={1.2} alignItems="center"><FileText color={binThemeTokens.gold} size={18} /><Box><Typography color="#FFF" fontWeight="900">{doc.documentLabel || requestTitle(doc.documentType)}</Typography><Typography variant="caption" color="textSecondary">{doc.fileName}</Typography></Box></Stack><Chip label={String(doc.status || 'pending_hr_review').replace(/_/g, ' ').toUpperCase()} size="small" sx={{ bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Wallet color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">{tx('technician.hr.eosbTitle', 'Estimated End-of-Service Gratuity')}</Typography></Stack>
        {!eosbBaseSalary || !eosbJoiningDate ? (
          <Typography color="rgba(255,255,255,0.5)">{tx('technician.hr.eosbMissingData', 'Your basic salary and/or joining date are not on file yet. Ask HR to update your profile to see an estimate here.')}</Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1.2} sx={{ mb: 2 }}>
              <Button size="small" variant={eosbScenario === 'resignation' ? 'contained' : 'outlined'} onClick={() => setEosbScenario('resignation')} sx={eosbScenario === 'resignation' ? { bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 } : { color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{tx('technician.hr.eosbResignation', 'IF I RESIGN')}</Button>
              <Button size="small" variant={eosbScenario === 'employer_terminated' ? 'contained' : 'outlined'} onClick={() => setEosbScenario('employer_terminated')} sx={eosbScenario === 'employer_terminated' ? { bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 } : { color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{tx('technician.hr.eosbEmployerTerminated', 'CONTRACT END / EMPLOYER-INITIATED')}</Button>
            </Stack>
            <Typography variant="h3" fontWeight="950" sx={{ color: binThemeTokens.gold }}>AED {eosbEstimate!.finalEstimateAed.toLocaleString()}</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 1 }}>{eosbEstimate!.note} {tx('technician.hr.eosbServiceYears', 'Based on {{years}} years of service to date.', { years: eosbEstimate!.serviceYears })}</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 2 }}>{eosbEstimate!.disclaimer}</Typography>
          </>
        )}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Sun color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">{tx('technician.hr.heatStressTitle', 'Midday Heat-Stress Work Ban')}</Typography></Stack>
        {heatStress.inRestrictedWindowNow ? (
          <Alert severity="error">{tx('technician.hr.heatStressBannedNow', 'Outdoor direct-sun work is banned right now ({{window}}, {{season}}). Stop outdoor work and move to shade until the window ends.', { window: heatStress.windowLabel, season: heatStress.seasonLabel })}</Alert>
        ) : heatStress.inSeason ? (
          <Alert severity="warning">{tx('technician.hr.heatStressSeasonActive', 'Heat-stress season is active ({{season}}). Outdoor direct-sun work is banned daily {{window}}.', { season: heatStress.seasonLabel, window: heatStress.windowLabel })}</Alert>
        ) : (
          <Alert severity="success">{tx('technician.hr.heatStressOutOfSeason', 'Outside heat-stress season right now. The daily {{window}} outdoor work ban applies {{season}}.', { window: heatStress.windowLabel, season: heatStress.seasonLabel })}</Alert>
        )}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}>{tx('technician.hr.lettersTitle', 'HR Letters')}</Typography>
        {letters.length === 0 ? <Typography color="rgba(255,255,255,0.5)">{tx('technician.hr.noLettersYet', 'No HR letters yet.')}</Typography> : <Stack spacing={1.2}>{letters.slice(0, 8).map((letter) => <Paper key={letter.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction="row" spacing={1.2} alignItems="center" justifyContent="space-between"><Stack direction="row" spacing={1.2} alignItems="center"><Award color={binThemeTokens.gold} size={18} /><Box><Typography color="#FFF" fontWeight="900">{letter.title || letter.letterType || tx('technician.hr.letterFallback', 'HR Letter')}</Typography><Typography variant="caption" color="textSecondary">{letter.status || tx('technician.hr.statusPending', 'pending')}</Typography></Box></Stack><Chip label={String(letter.status || 'pending').replace(/_/g, ' ').toUpperCase()} size="small" sx={{ bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}>{tx('technician.hr.quickTestsTitle', 'Quick Training Tests')}</Typography>
        <Grid container spacing={1.2}>{quickPrompts.map((prompt) => <Grid item xs={12} sm={6} md={4} key={prompt}><Button fullWidth variant="outlined" startIcon={<Plus size={14} />} onClick={() => createAiCase(prompt)} sx={{ justifyContent: 'flex-start', color: '#fff', borderColor: 'rgba(255,255,255,0.14)', fontWeight: 800, textTransform: 'none' }}>{prompt}</Button></Grid>)}</Grid>
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}>{tx('technician.hr.registryTitle', 'AI HR Request Registry')}</Typography>
        {registryError && <Alert severity="warning" sx={{ mb: 2 }}>{registryError}</Alert>}
        {requests.length === 0 ? <Typography color="rgba(255,255,255,0.5)">{tx('technician.hr.noCasesYet', 'No HR cases yet.')}</Typography> : <Stack spacing={1.5}>{requests.slice(0, 20).map((req) => <Paper key={req.id} sx={{ p: 2.5, bgcolor: req.optimistic ? 'rgba(198,167,94,0.08)' : 'rgba(255,255,255,0.03)', border: req.optimistic ? `1px solid ${binThemeTokens.gold}` : '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography color="#FFF" fontWeight="900" sx={{ textTransform: 'uppercase' }}>{requestTitle(req.requestLabel || req.requestType)}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{req.reason}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{req.detectedLanguage && `Language: ${String(req.detectedLanguage).toUpperCase()} · `}{req.confidence && `Confidence: ${Math.round(Number(req.confidence) * 100)}% · `}{req.recommendedNextAction}{req.optimistic ? ' · Saving...' : ''}</Typography></Box><Chip size="small" label={String(req.priority || 'normal').toUpperCase()} sx={{ color: req.priority === 'urgent' ? '#ef4444' : req.priority === 'high' ? '#eab308' : '#10b981', bgcolor: 'rgba(255,255,255,0.06)', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>
    </Box>
  );
}
