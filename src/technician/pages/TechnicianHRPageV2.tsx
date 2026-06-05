import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { Bot, HeartPulse, Plus } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { addDoc, collection, db, onSnapshot, orderBy, query, serverTimestamp, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES, BLUE_COLLAR_ESS_TRAINING_VERSION, classifyBlueCollarEssIntent } from '../utils/blueCollarEssIntentRouter';

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

export default function TechnicianHRPageV2() {
  const { user } = useRole();
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'staffRequests'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setRequests(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))));
  }, [user?.uid]);

  const identity = () => ({
    uid: user?.uid,
    technicianId: user?.uid,
    email: user?.email || '',
    displayName: user?.displayName || 'Staff Member',
    role: user?.role || 'technician',
  });

  const createAiCase = async (text = message) => {
    if (!user?.uid || !text.trim()) return;
    setLoading(true);
    try {
      const result = classifyBlueCollarEssIntent(text);
      const base = {
        ...identity(),
        requestType: result.requestType,
        requestLabel: result.requestType.replace(/_/g, ' '),
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'staffRequests'), base);
      await addDoc(collection(db, 'hrAiConversations'), { ...base, question: text.trim(), answer: result.answer });
      setAnswer(`${result.answer} · ${result.language.toUpperCase()} · ${Math.round(result.confidence * 100)}% confidence · ${result.recommendedNextAction}`);
      setMessage('');
    } finally {
      setLoading(false);
    }
  };

  const mood = async (value: string) => {
    if (!user?.uid) return;
    const riskScore = value === 'urgent' ? 100 : value === 'angry' ? 85 : value === 'stressed' ? 70 : value === 'sick' ? 65 : 30;
    await addDoc(collection(db, 'staffMoodCheckins'), { ...identity(), mood: value, riskScore, source: 'paperless_staff_portal', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (riskScore >= 70) await createAiCase(`Wellbeing support needed: ${value}`);
  };

  return (
    <Box sx={{ pb: 6 }}>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>BIN PEOPLE AI · {BLUE_COLLAR_ESS_TRAINING_VERSION}</Typography>
      <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ mb: 1 }}>AI-Driven Multilingual Blue-Collar Workforce ESS</Typography>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 4, maxWidth: 980 }}>Trained for {BLUE_COLLAR_ESS_SUPPORTED_LANGUAGES.join(', ')}. Routes leave, sick leave, overtime, payslip, salary, documents, accommodation, safety, tools/PPE, transport, wellbeing, and HR cases without paperwork.</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}><Bot color={binThemeTokens.gold} /><Typography variant="h6" color="#FFF" fontWeight="950">People AI Intent Router</Typography></Stack>
            <TextField fullWidth multiline minRows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type staff issue in English, Arabic, Hindi, Urdu, Malayalam, Tagalog, Bengali, Nepali, or mixed language" sx={{ textarea: { color: '#fff' }, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.04)' } }} />
            <Button variant="contained" disabled={loading || !message.trim()} onClick={() => createAiCase()} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{loading ? <CircularProgress size={22} sx={{ color: '#000' }} /> : 'CREATE AI HR CASE'}</Button>
            {answer && <Alert severity="success" sx={{ mt: 2 }}>{answer}</Alert>}
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
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}>Quick Training Tests</Typography>
        <Grid container spacing={1.2}>{quickPrompts.map((prompt) => <Grid item xs={12} sm={6} md={4} key={prompt}><Button fullWidth variant="outlined" startIcon={<Plus size={14} />} onClick={() => createAiCase(prompt)} sx={{ justifyContent: 'flex-start', color: '#fff', borderColor: 'rgba(255,255,255,0.14)', fontWeight: 800, textTransform: 'none' }}>{prompt}</Button></Grid>)}</Grid>
      </Paper>

      <Paper sx={{ p: 4, mt: 3, bgcolor: 'rgba(22,22,24,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
        <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 2 }}>AI HR Request Registry</Typography>
        {requests.length === 0 ? <Typography color="rgba(255,255,255,0.5)">No HR cases yet.</Typography> : <Stack spacing={1.5}>{requests.slice(0, 20).map((req) => <Paper key={req.id} sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography color="#FFF" fontWeight="900" sx={{ textTransform: 'uppercase' }}>{String(req.requestLabel || req.requestType).replace(/_/g, ' ')}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{req.reason}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{req.detectedLanguage && `Language: ${req.detectedLanguage} · `}{req.confidence && `Confidence: ${Math.round(Number(req.confidence) * 100)}% · `}{req.recommendedNextAction}</Typography></Box><Chip size="small" label={String(req.priority || 'normal').toUpperCase()} sx={{ color: req.priority === 'urgent' ? '#ef4444' : req.priority === 'high' ? '#eab308' : '#10b981', bgcolor: 'rgba(255,255,255,0.06)', fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
      </Paper>
    </Box>
  );
}
