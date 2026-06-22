import React, { useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Container, IconButton,
  LinearProgress, Paper, Stack, TextField, Typography, alpha,
} from '@mui/material';
import { AlertCircle, Bot, Camera, CheckCircle2, ChevronRight, Send, Sparkles, Wrench, X } from 'lucide-react';
import { addDoc, collection, db, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

// ── Conversation state machine ────────────────────────────────────────────────
type Step = 'idle' | 'describe' | 'location' | 'photo' | 'confirm' | 'submitted' | 'error';

interface Message {
  id: string;
  from: 'bot' | 'user';
  text: string;
  timestamp: Date;
}

// ── Category / priority detection ─────────────────────────────────────────────
const CATEGORY_RULES: Array<{ keywords: string[]; category: string; priority: 'HIGH' | 'NORMAL' | 'URGENT' }> = [
  { keywords: ['ac', 'air', 'cooling', 'cold', 'heat', 'hvac', 'aircon'], category: 'AC / Cooling', priority: 'HIGH' },
  { keywords: ['water', 'leak', 'pipe', 'drain', 'tap', 'toilet', 'flush', 'flood', 'plumb'], category: 'Plumbing', priority: 'HIGH' },
  { keywords: ['power', 'electric', 'light', 'socket', 'trip', 'breaker', 'voltage', 'short'], category: 'Electrical', priority: 'HIGH' },
  { keywords: ['fire', 'smoke', 'alarm', 'emergency', 'gas', 'hazard'], category: 'Safety / Emergency', priority: 'URGENT' },
  { keywords: ['lift', 'elevator', 'stuck', 'door', 'lock', 'access'], category: 'Lift / Access', priority: 'HIGH' },
  { keywords: ['pest', 'cockroach', 'bug', 'rodent', 'rat', 'ants', 'insect'], category: 'Pest Control', priority: 'NORMAL' },
  { keywords: ['clean', 'garbage', 'waste', 'trash', 'dirty'], category: 'Cleaning / Hygiene', priority: 'NORMAL' },
  { keywords: ['paint', 'wall', 'crack', 'ceiling', 'floor', 'tile', 'damage'], category: 'Civil / Structural', priority: 'NORMAL' },
  { keywords: ['internet', 'wifi', 'tv', 'network', 'cable'], category: 'IT / Network', priority: 'NORMAL' },
  { keywords: ['appliance', 'fridge', 'oven', 'washing', 'dryer', 'dishwasher'], category: 'Appliances', priority: 'NORMAL' },
];

const URGENT_SIGNALS = ['not working', 'broken', 'urgent', 'asap', 'immediately', 'dangerous', 'cannot', 'no water', 'no power', 'مكسور', 'عاجل', 'خطر'];

function classifyIssue(text: string): { category: string; priority: 'HIGH' | 'NORMAL' | 'URGENT' } {
  const lower = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      const hasUrgentSignal = URGENT_SIGNALS.some((sig) => lower.includes(sig));
      return { category: rule.category, priority: hasUrgentSignal ? 'URGENT' : rule.priority };
    }
  }
  return { category: 'General Maintenance', priority: 'NORMAL' };
}

const BOT_MESSAGES: Record<Step, string | ((ctx: ConversationContext) => string)> = {
  idle: 'مرحباً / Hello! I am BIN AI. Describe your issue and I will prepare a no-call maintenance ticket — no phone call needed.',
  describe: 'Please describe the issue. You can write in English or Arabic. Example: "AC not cooling in master bedroom" or "تسرب مياه في الحمام".',
  location: (ctx) => `Got it — I detected: **${ctx.category}** (${ctx.priority} priority).\n\nWhich room or area is affected? Example: "Master bedroom", "Kitchen", "Entrance lobby", "Unit 304".`,
  photo: 'Optional but helpful: Can you upload a photo of the issue? Tap the camera icon, or tap **Skip** to continue without a photo.',
  confirm: (ctx) =>
    `✅ Draft ready — please review:\n\n📋 **Category:** ${ctx.category}\n📍 **Location:** ${ctx.location}\n⚡ **Priority:** ${ctx.priority}\n🖼️ **Photo:** ${ctx.photoUrl ? 'Attached' : 'No photo'}\n\n**Submit this ticket?**`,
  submitted: '🎉 Ticket submitted! Your request has been logged. Our team will assign a technician without you needing to call. You can track status under **My Tickets**.',
  error: 'Something went wrong submitting your ticket. Please try again or use **New Request** from the dashboard.',
};

interface ConversationContext {
  description: string;
  category: string;
  priority: 'HIGH' | 'NORMAL' | 'URGENT';
  location: string;
  photoUrl: string;
  photoFile: File | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: '#ef4444',
  HIGH: '#f59e0b',
  NORMAL: '#10b981',
};

const makeMsgId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

function getBotText(step: Step, ctx: ConversationContext): string {
  const template = BOT_MESSAGES[step];
  return typeof template === 'function' ? template(ctx) : template;
}

// ── Upload helper (no Cloud Functions — direct Storage REST not available from browser, use data URL fallback) ──
async function uploadPhotoToStorage(file: File, uid: string): Promise<string> {
  // We store the photo as a base64 data URL in Firestore since direct Storage SDK upload is not available here
  // In production with Storage SDK available this would use uploadBytes → getDownloadURL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TenantAIConciergePage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const [step, setStep] = useState<Step>('idle');
  const [messages, setMessages] = useState<Message[]>([
    { id: makeMsgId(), from: 'bot', text: getBotText('idle', { description: '', category: '', priority: 'NORMAL', location: '', photoUrl: '', photoFile: null }), timestamp: new Date() },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [ctx, setCtx] = useState<ConversationContext>({ description: '', category: '', priority: 'NORMAL', location: '', photoUrl: '', photoFile: null });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const pushMessage = (from: 'bot' | 'user', text: string) => {
    const msg: Message = { id: makeMsgId(), from, text, timestamp: new Date() };
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  };

  const advanceBot = (nextStep: Step, nextCtx: ConversationContext) => {
    setStep(nextStep);
    setCtx(nextCtx);
    setTimeout(() => {
      pushMessage('bot', getBotText(nextStep, nextCtx));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }, 420);
  };

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    pushMessage('user', text);
    setInputValue('');

    if (step === 'idle' || step === 'describe') {
      const { category, priority } = classifyIssue(text);
      const nextCtx: ConversationContext = { ...ctx, description: text, category, priority };
      advanceBot('location', nextCtx);
    } else if (step === 'location') {
      const nextCtx: ConversationContext = { ...ctx, location: text };
      advanceBot('photo', nextCtx);
    } else if (step === 'submitted' || step === 'error') {
      setMessages([{ id: makeMsgId(), from: 'bot', text: getBotText('idle', ctx), timestamp: new Date() }]);
      setCtx({ description: '', category: '', priority: 'NORMAL', location: '', photoUrl: '', photoFile: null });
      setStep('idle');
    }
  };

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    pushMessage('user', `📷 Photo attached: ${file.name}`);
    try {
      const dataUrl = await uploadPhotoToStorage(file, user?.uid || 'anon');
      const nextCtx: ConversationContext = { ...ctx, photoUrl: dataUrl, photoFile: file };
      advanceBot('confirm', nextCtx);
    } catch {
      pushMessage('bot', 'Could not attach photo. Tap **Skip** to continue without it.');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSkipPhoto = () => {
    pushMessage('user', 'Skip photo');
    advanceBot('confirm', { ...ctx, photoUrl: '', photoFile: null });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'maintenanceRequests'), {
        tenantId: user?.uid || null,
        tenantEmail: user?.email || null,
        tenantName: user?.displayName || null,
        description: ctx.description,
        category: ctx.category,
        location: ctx.location,
        priority: ctx.priority,
        photoUrl: ctx.photoUrl || null,
        source: 'AI_CONCIERGE',
        status: 'OPEN',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      advanceBot('submitted', ctx);
    } catch (err) {
      console.error('[BIN AI] ticket submit failed', err);
      advanceBot('error', ctx);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestart = () => {
    setMessages([{ id: makeMsgId(), from: 'bot', text: getBotText('idle', ctx), timestamp: new Date() }]);
    setCtx({ description: '', category: '', priority: 'NORMAL', location: '', photoUrl: '', photoFile: null });
    setStep('idle');
    setInputValue('');
  };

  const priorityColor = PRIORITY_COLOR[ctx.priority] || '#10b981';

  const renderBotText = (text: string) =>
    text.split('\n').map((line, idx) => (
      <Typography key={idx} variant="body2" sx={{ color: '#fff', fontWeight: line.startsWith('📋') || line.startsWith('📍') || line.startsWith('⚡') || line.startsWith('🖼️') ? 900 : 400, lineHeight: 1.7 }}>
        {line.replace(/\*\*(.*?)\*\*/g, '$1')}
      </Typography>
    ));

  return (
    <Container maxWidth="md" sx={{ py: 3, direction: isRTL ? 'rtl' : 'ltr', height: '100%' }}>
      <Stack spacing={0} sx={{ height: '100%' }}>
        {/* Header */}
        <Paper sx={{ p: { xs: 2.5, md: 3 }, bgcolor: 'rgba(15,23,42,.92)', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: '24px 24px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.12), border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SafeIcon icon={Bot} size={22} style={{ color: binThemeTokens.gold }} />
            </Box>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3, lineHeight: 1 }}>
                {tx('ai.label', 'NO-CALL MAINTENANCE')}
              </Typography>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, lineHeight: 1.2 }}>
                {tx('ai.title', 'BIN AI Concierge')}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {ctx.category && step !== 'idle' && (
              <Chip
                size="small"
                label={ctx.priority}
                sx={{ bgcolor: alpha(priorityColor, 0.12), color: priorityColor, fontWeight: 950, fontSize: '0.65rem' }}
              />
            )}
            <IconButton size="small" onClick={handleRestart} sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
              <X size={16} />
            </IconButton>
          </Stack>
        </Paper>

        {/* Progress bar */}
        {step !== 'idle' && step !== 'submitted' && step !== 'error' && (
          <LinearProgress
            variant="determinate"
            value={{ describe: 20, location: 50, photo: 70, confirm: 90 }[step as string] || 0}
            sx={{ height: 3, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }}
          />
        )}

        {/* Message thread */}
        <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: '#020617', p: { xs: 2, md: 3 }, minHeight: 340, maxHeight: 480 }}>
          <Stack spacing={2}>
            {messages.map((msg) => (
              <Stack key={msg.id} direction={msg.from === 'user' ? (isRTL ? 'row' : 'row-reverse') : (isRTL ? 'row-reverse' : 'row')} spacing={1.5} alignItems="flex-end">
                {msg.from === 'bot' && (
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.1), border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mb: 0.5 }}>
                    <SafeIcon icon={Bot} size={16} style={{ color: binThemeTokens.gold }} />
                  </Box>
                )}
                <Box
                  sx={{
                    maxWidth: '78%',
                    px: 2.5,
                    py: 1.5,
                    borderRadius: msg.from === 'bot' ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
                    bgcolor: msg.from === 'bot' ? 'rgba(255,255,255,0.055)' : alpha(binThemeTokens.gold, 0.12),
                    border: `1px solid ${msg.from === 'bot' ? 'rgba(255,255,255,0.07)' : alpha(binThemeTokens.gold, 0.22)}`,
                  }}
                >
                  {msg.from === 'bot' ? renderBotText(msg.text) : (
                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>{msg.text}</Typography>
                  )}
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.28)', mt: 0.5, display: 'block', textAlign: msg.from === 'user' ? 'right' : 'left' }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                </Box>
              </Stack>
            ))}
            <div ref={bottomRef} />
          </Stack>
        </Box>

        {/* Action area */}
        <Paper sx={{ p: { xs: 2, md: 2.5 }, bgcolor: 'rgba(15,23,42,.92)', border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, borderTop: '1px solid rgba(255,255,255,0.06)', borderRadius: '0 0 24px 24px' }}>
          {/* Confirm submit buttons */}
          {step === 'confirm' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={submitting ? <CircularProgress size={16} sx={{ color: '#000' }} /> : <SafeIcon icon={CheckCircle2} size={18} />}
                onClick={handleSubmit}
                disabled={submitting}
                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}
              >
                {submitting ? 'Submitting…' : 'Submit Ticket'}
              </Button>
              <Button fullWidth variant="outlined" onClick={handleRestart} sx={{ borderColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)', fontWeight: 950, borderRadius: 4 }}>
                Start Over
              </Button>
            </Stack>
          )}

          {/* Photo step buttons */}
          {step === 'photo' && (
            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
              <Button
                variant="outlined"
                startIcon={uploadingPhoto ? <CircularProgress size={16} /> : <SafeIcon icon={Camera} size={18} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 4, flex: 1 }}
              >
                {uploadingPhoto ? 'Uploading…' : 'Attach Photo'}
              </Button>
              <Button variant="outlined" onClick={handleSkipPhoto} sx={{ borderColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)', fontWeight: 950, borderRadius: 4 }}>
                Skip
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
            </Stack>
          )}

          {/* Detected category chip */}
          {ctx.category && step === 'location' && (
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap">
              <Chip size="small" icon={<Wrench size={13} />} label={ctx.category} sx={{ bgcolor: alpha(priorityColor, 0.1), color: priorityColor, fontWeight: 900 }} />
              <Chip size="small" icon={<AlertCircle size={13} />} label={`${ctx.priority} priority`} sx={{ bgcolor: alpha(priorityColor, 0.08), color: priorityColor, fontWeight: 900 }} />
            </Stack>
          )}

          {/* Quick suggestions */}
          {(step === 'idle' || step === 'describe') && (
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
              {['AC not cooling', 'Water leak', 'Power issue', 'Pest problem', 'Door lock broken'].map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  size="small"
                  icon={<Sparkles size={12} />}
                  onClick={() => { setInputValue(suggestion); }}
                  sx={{ cursor: 'pointer', bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', fontWeight: 700, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold } }}
                />
              ))}
            </Stack>
          )}

          {/* Text input */}
          {step !== 'confirm' && step !== 'photo' && step !== 'submitted' && (
            <Stack direction="row" spacing={1.5} alignItems="flex-end">
              <TextField
                fullWidth
                multiline
                maxRows={4}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={
                  step === 'location' ? 'e.g. Master bedroom, Kitchen, Unit 304…'
                    : step === 'error' ? 'Type anything to restart…'
                    : 'Describe your issue in English or Arabic…'
                }
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: '#fff',
                    bgcolor: 'rgba(255,255,255,0.04)',
                    borderRadius: 4,
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                    '&:hover fieldset': { borderColor: alpha(binThemeTokens.gold, 0.4) },
                    '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold },
                  },
                  '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.3)' },
                }}
              />
              <IconButton
                onClick={handleSend}
                disabled={!inputValue.trim()}
                sx={{
                  width: 48, height: 48, flexShrink: 0,
                  bgcolor: inputValue.trim() ? binThemeTokens.gold : 'rgba(255,255,255,0.06)',
                  color: inputValue.trim() ? '#000' : 'rgba(255,255,255,0.3)',
                  borderRadius: 3,
                  transition: 'all .18s ease',
                  '&:hover': { bgcolor: inputValue.trim() ? '#d4a017' : 'rgba(255,255,255,0.1)' },
                }}
              >
                <ChevronRight size={22} />
              </IconButton>
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                sx={{ width: 48, height: 48, flexShrink: 0, bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', borderRadius: 3, '&:hover': { color: binThemeTokens.gold } }}
              >
                <Camera size={20} />
              </IconButton>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
            </Stack>
          )}

          {/* Submitted state CTAs */}
          {step === 'submitted' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button fullWidth variant="contained" startIcon={<SafeIcon icon={CheckCircle2} size={18} />} onClick={() => { window.location.href = '/tenant/tickets'; }} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}>
                View My Tickets
              </Button>
              <Button fullWidth variant="outlined" startIcon={<SafeIcon icon={Send} size={18} />} onClick={handleRestart} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 4 }}>
                New Request
              </Button>
            </Stack>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
