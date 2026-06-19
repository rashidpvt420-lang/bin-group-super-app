import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Award, Bot, CloudUpload, FileText, HeartPulse, Plus, Sun } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { addDoc, collection, db, getDownloadURL, onSnapshot, query, ref, serverTimestamp, storage, uploadBytes, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES, BLUE_COLLAR_ESS_TRAINING_VERSION, classifyBlueCollarEssIntent } from '../utils/blueCollarEssIntentRouter';
import { getHeatStressSeasonStatus } from '../../lib/uaeWorkforceComplianceEngine';

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

const requestTitle = (value: string) => String(value || 'hr_support').replace(/_/g, ' ');
const safeFileName = (value: string) => String(value || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
const sortByNewest = (items: any[]) => [...items].sort((a, b) => {
  const aTime = a.createdAt?.toMillis?.() || Date.parse(a.createdAtLocal || '') || 0;
  const bTime = b.createdAt?.toMillis?.() || Date.parse(b.createdAtLocal || '') || 0;
  return bTime - aTime;
});

export default function TechnicianHRPageV2() {
  const { user } = useRole();
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

  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'staffRequests'), where('uid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setRegistryError('');
      setRequests(sortByNewest(snap.docs.map((item) => ({ id: item.id, ...item.data() }))));
    }, (error) => {
      console.warn('AI HR request registry realtime failed:', error);
      setRegistryError('Live registry sync is not available yet. Newly created cases will still appear instantly on this screen.');
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'staffDocuments'), where('uid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setDocuments(sortByNewest(snap.docs.map((item) => ({ id: item.id, ...item.data() }))));
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

  return (
    <Box sx={{ pb: 6 }}>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>BIN PEOPLE AI · {BLUE_COLLAR_ESS_TRAINING_VERSION}</Typography>
      <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ mb: 1 }}>AI-Driven Multilingual Blue-Collar Workforce ESS</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 4, maxWidth: 980 }}>Trained for {BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES.join(', ')}. Routes leave, sick leave, overtime, payslip, salary, documents, accommodation, safety, tools/PPE, transport, wellbeing, and HR cases without paperwork.</Typography>

      {heatStress.inSeason && (
        <Alert severity={heatStress.inRestrictedWindowNow ? 'error' : 'warning'} icon={<Sun size={20} />} sx={{ mb: 3, borderRadius: 3 }}>
          Midday outdoor work ban is active ({heatStress.seasonLabel}). You must not be asked to work outdoors in direct sun {heatStress.windowLabel} daily{heatStress.inRestrictedWindowNow ? ' — that restricted window is in effect right now' : ''}. If a supervisor asks you to work outdoors during this window, report it here as a safety case.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Bot color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">People AI Intent Router</Typography></Stack>
            <TextField fullWidth multiline minRows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type staff issue in English, Arabic, Hindi, Urdu, Malayalam, Tagalog, Bengali, Nepali, or mixed language" sx={{ textarea: { color: '#fff' }, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.04)' } }} />
            <Button variant="contained" disabled={loading || !message.trim()} onClick={() => createAiCase()} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{loading ? <CircularProgress size={22} sx={{ color: '#000' }} /> : 'CREATE AI HR CASE'}</Button>
            {answer && <Alert severity={answer.includes('could not') ? 'error' : 'success'} sx={{ mt: 2 }}>{answer}</Alert>}
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><HeartPulse color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">Wellbeing Check-In</Typography></Stack>
            <Grid container spacing={1}>{['okay', 'tired', 'sick', 'stressed', 'angry', 'urgent'].map((item) => <Grid item xs={6} key={item}><Button fullWidth variant="outlined" onClick={() => mood(item)} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{item.toUpperCase()}</Button></Grid>)}</Grid>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><CloudUpload color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">Staff Document Upload Vault</Typography></Stack>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 2 }}>Upload Emirates ID, passport, visa, medical certificates, insurance cards, labour cards, trade certificates, driving licence, signed acknowledgements, and HR support files.</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField select label="Document Type" value={documentType} onChange={(e) => setDocumentType(e.target.value)} sx={{ minWidth: 280, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' } }}>
            {documentTypes.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>
          <Button component="label" variant="contained" disabled={uploading} startIcon={uploading ? <CircularProgress size={18} sx={{ color: '#000' }} /> : <CloudUpload size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
            {uploading ? 'UPLOADING...' : 'UPLOAD DOCUMENT'}
            <input hidden type="file" accept="application/pdf,image/*" onChange={(e) => uploadStaffDocument(e.target.files?.[0] || null)} />
          </Button>
        </Stack>
        {uploadMessage && <Alert severity={uploadMessage.startsWith('Upload failed') || uploadMessage.startsWith('File is too') ? 'error' : 'success'} sx={{ mt: 2 }}>{uploadMessage}</Alert>}
        {documents.length > 0 && <Stack spacing={1.2} sx={{ mt: 3 }}>{documents.slice(0, 8).map((item) => <Paper key={item.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between"><Stack direction="row" spacing={1.2} alignItems="center"><FileText color={binThemeTokens.gold} size={18} /><Box><Typography color="#FFF" fontWeight="900">{item.documentLabel || requestTitle(item.documentType)}</Typography><Typography variant="caption" color="textSecondary">{item.fileName}</Typography></Box></Stack><Chip label={String(item.status || 'pending_hr_review').replace(/_/g, ' ').toUpperCase()} size="small" sx={{ bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Award color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">My HR Letters</Typography></Stack>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 2 }}>NOC letters, experience letters, and salary certificates issued by HR. Request one via the AI router above.</Typography>
        {letters.length === 0 ? <Typography color="rgba(255,255,255,0.5)">No letters issued yet.</Typography> : <Stack spacing={1.2}>{letters.slice(0, 10).map((letter) => (
          <Paper key={letter.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1.2} alignItems="center"><Award color={binThemeTokens.gold} size={18} /><Box><Typography color="#FFF" fontWeight="900">{requestTitle(letter.letterType)}</Typography><Typography variant="caption" color="textSecondary">Ref: {letter.referenceNumber || 'N/A'}</Typography></Box></Stack>
              {letter.fileUrl ? <Button size="small" variant="outlined" component="a" href={letter.fileUrl} target="_blank" rel="noopener noreferrer" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}>DOWNLOAD</Button> : <Chip label="ISSUED" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 900 }} />}
            </Stack>
          </Paper>
        ))}</Stack>}
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}>Quick Training Tests</Typography>
        <Grid container spacing={1.2}>{quickPrompts.map((prompt) => <Grid item xs={12} sm={6} md={4} key={prompt}><Button fullWidth variant="outlined" startIcon={<Plus size={14} />} onClick={() => createAiCase(prompt)} sx={{ justifyContent: 'flex-start', color: '#fff', borderColor: 'rgba(255,255,255,0.14)', fontWeight: 800, textTransform: 'none' }}>{prompt}</Button></Grid>)}</Grid>
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}>AI HR Request Registry</Typography>
        {registryError && <Alert severity="warning" sx={{ mb: 2 }}>{registryError}</Alert>}
        {requests.length === 0 ? <Typography color="rgba(255,255,255,0.5)">No HR cases yet.</Typography> : <Stack spacing={1.5}>{requests.slice(0, 20).map((req) => <Paper key={req.id} sx={{ p: 2.5, bgcolor: req.optimistic ? 'rgba(198,167,94,0.08)' : 'rgba(255,255,255,0.03)', border: req.optimistic ? `1px solid ${binThemeTokens.gold}` : '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography color="#FFF" fontWeight="900" sx={{ textTransform: 'uppercase' }}>{requestTitle(req.requestLabel || req.requestType)}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{req.reason}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{req.detectedLanguage && `Language: ${String(req.detectedLanguage).toUpperCase()} · `}{req.confidence && `Confidence: ${Math.round(Number(req.confidence) * 100)}% · `}{req.recommendedNextAction}{req.optimistic ? ' · Saving...' : ''}</Typography></Box><Chip size="small" label={String(req.priority || 'normal').toUpperCase()} sx={{ color: req.priority === 'urgent' ? '#ef4444' : req.priority === 'high' ? '#eab308' : '#10b981', bgcolor: 'rgba(255,255,255,0.06)', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>
    </Box>
  );
}
