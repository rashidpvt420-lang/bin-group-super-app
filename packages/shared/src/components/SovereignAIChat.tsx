import React, { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Drawer,
  Fab,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  SwipeableDrawer,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Bot, Send, ShieldCheck, Sparkles, User, X } from 'lucide-react';
import type { Functions } from 'firebase/functions';
import { httpsCallable } from 'firebase/functions';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useAI } from '../context/AIContext';
import { functions as defaultFunctions } from '../lib/firebase';

export interface SovereignAIChatProps {
  role: 'owner' | 'tenant' | 'technician' | 'broker' | 'admin' | 'unknown';
  onNavigate?: (path: string) => void;
  /**
   * Host applications with their own Firebase Auth boundary must pass their
   * Functions instance here. Otherwise the shared package can initialize a
   * second Firebase app, which makes callable requests arrive unauthenticated.
   */
  functionsOverride?: Functions;
  isAuthenticated?: boolean;
  authUserId?: string | null;
}

interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
  live?: boolean;
  provider?: string;
  operationalStatus?: 'healthy' | 'degraded' | 'error' | 'ready';
}

type PromptAction = 'SUMMARIZE' | 'NAVIGATE' | 'MESSAGE';

type Prompt = {
  label: string;
  action: PromptAction;
  payload: string;
};

const roleData: Record<SovereignAIChatProps['role'], { greeting: string; prompts: Prompt[] }> = {
  owner: {
    greeting: 'Owner AI is ready for advisory guidance. Authoritative approvals, payments, and property records remain in the dashboard.',
    prompts: [
      { label: 'Summarize Page', action: 'SUMMARIZE', payload: 'Summarize my current owner dashboard and identify missing actions.' },
      { label: 'Pending Approvals', action: 'NAVIGATE', payload: '/dashboard' },
      { label: 'Explain Property Score', action: 'MESSAGE', payload: 'Explain the property health and maintenance credit score.' },
    ],
  },
  tenant: {
    greeting: 'Tenant AI is ready for advisory guidance. Repair status and service records remain authoritative in the tenant portal.',
    prompts: [
      { label: 'Summarize Page', action: 'SUMMARIZE', payload: 'Summarize my tenant services and active requests.' },
      { label: 'Report Issue', action: 'NAVIGATE', payload: '/tenant' },
      { label: 'Move-In Ready?', action: 'MESSAGE', payload: 'How do I know a room is ready and repairs are completed?' },
    ],
  },
  technician: {
    greeting: 'Technician AI is ready for advisory guidance. Assigned missions, safety controls, and completion authority remain in the operations system.',
    prompts: [
      { label: 'Mission Summary', action: 'SUMMARIZE', payload: 'Summarize my current technician assignment and proof requirements.' },
      { label: 'View Missions', action: 'NAVIGATE', payload: '/tech' },
      { label: 'SLA Rules', action: 'MESSAGE', payload: 'Explain the SLA and before-after evidence rules.' },
    ],
  },
  broker: {
    greeting: 'Broker AI is ready for advisory guidance. KYC, attribution, commission, and payout decisions remain server-authoritative.',
    prompts: [
      { label: 'Pipeline Summary', action: 'SUMMARIZE', payload: 'Summarize my broker pipeline and commission status.' },
      { label: 'Submit Lead', action: 'NAVIGATE', payload: '/broker' },
      { label: 'Commission Status', action: 'MESSAGE', payload: 'Explain how broker commission is locked and paid.' },
    ],
  },
  admin: {
    greeting: 'Admin AI is ready for advisory analysis. It cannot approve payments, create access, assign work, or clear launch gates.',
    prompts: [
      { label: 'War Room Summary', action: 'SUMMARIZE', payload: 'Summarize current admin bottlenecks and launch blockers.' },
      { label: 'Launch Gates', action: 'NAVIGATE', payload: '/ops/public-launch-command' },
      { label: 'HR Command', action: 'NAVIGATE', payload: '/hr' },
    ],
  },
  unknown: {
    greeting: 'BIN GROUP AI is ready for advisory product guidance. Provider status will be shown on every answer.',
    prompts: [
      { label: 'Platform Overview', action: 'MESSAGE', payload: 'Tell me what BIN GROUP does.' },
    ],
  },
};

function reviveMessages(value: string | null): Message[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp || Date.now()),
    }));
  } catch {
    return [];
  }
}

function deterministicSummary(role: SovereignAIChatProps['role'], pageContext: any) {
  if (!pageContext) return 'No page context is registered for this screen.';
  if (role === 'admin') {
    const pending = pageContext.pendingOnboardings?.length || 0;
    const orphans = pageContext.orphans?.length || 0;
    const openTickets = pageContext.stats?.openTickets || 0;
    return `Admin page scan: ${pending} pending onboarding item(s), ${orphans} orphan item(s), and ${openTickets} open mission(s).`;
  }
  if (role === 'owner') {
    const propertyCount = pageContext.properties?.length || 0;
    const risk = pageContext.riskAssets?.length || 0;
    return `Owner page scan: ${propertyCount} property record(s) and ${risk} risk item(s) found in the current client context.`;
  }
  if (role === 'tenant') {
    const active = pageContext.activeTickets?.length || 0;
    return `Tenant page scan: ${active} active service request(s) in the current client context.`;
  }
  if (role === 'technician') {
    const active = pageContext.activeDispatches?.length || 0;
    return `Technician page scan: ${active} active dispatch item(s) in the current client context.`;
  }
  if (role === 'broker') {
    const leads = pageContext.leads?.length || 0;
    return `Broker page scan: ${leads} active lead/referral item(s) in the current client context.`;
  }
  return 'Client context is registered, but this role does not have a mapped local page summary.';
}

function explainCallableError(error: any) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').trim();
  if (code.includes('unauthenticated') || /unauthenticated/i.test(message)) {
    return 'Firebase Auth is not attached to the AI callable. Refresh the portal and sign in again if the session is stale.';
  }
  if (code.includes('resource-exhausted') || /usage limit|quota/i.test(message)) {
    return 'The daily AI allocation is exhausted. Failed or degraded provider attempts are not charged.';
  }
  if (code.includes('failed-precondition') || /secret|configured|precondition/i.test(message)) {
    return 'The deployed live-provider configuration is incomplete.';
  }
  if (code.includes('permission-denied') || /permission|app check/i.test(message)) {
    return 'The request was denied by App Check, role, profile, or access policy.';
  }
  if (code.includes('unavailable')) {
    return 'The backend did not complete the request. No live AI answer was produced.';
  }
  return message || 'The live AI callable failed. No live AI answer was produced.';
}

function providerStatusLabel(message: Message) {
  if (message.operationalStatus === 'error') return 'SERVICE ERROR';
  if (message.live) return `LIVE · ${String(message.provider || 'PROVIDER').toUpperCase()}`;
  if (message.operationalStatus === 'degraded') return `DEGRADED · ${String(message.provider || 'FALLBACK').toUpperCase()}`;
  return String(message.provider || 'READY').toUpperCase();
}

function providerStatusColor(message: Message) {
  if (message.operationalStatus === 'error') return '#ef4444';
  if (message.live) return '#10b981';
  return '#f59e0b';
}

export const SovereignAIChat: React.FC<SovereignAIChatProps> = ({
  role,
  onNavigate,
  functionsOverride,
  isAuthenticated,
  authUserId,
}) => {
  const { pageContext } = useAI();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeRole = roleData[role] || roleData.unknown;
  const callableFunctions = functionsOverride || defaultFunctions;
  const sessionBound = isAuthenticated !== false && (role !== 'admin' || Boolean(authUserId));

  useEffect(() => {
    setMessages(reviveMessages(sessionStorage.getItem(`bin_chat_history_${role}`)));
  }, [role]);

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem(`bin_chat_history_${role}`, JSON.stringify(messages));
    }
  }, [messages, role]);

  useEffect(() => {
    if (messages.length === 0 && open) {
      setMessages([{
        id: 'initial',
        type: 'ai',
        text: activeRole.greeting,
        timestamp: new Date(),
        live: false,
        provider: sessionBound ? 'provider not called' : 'auth waiting',
        operationalStatus: 'ready',
      }]);
    }
  }, [open, messages.length, activeRole.greeting, sessionBound]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text: string, isAutoSummary = false) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;

    const localSummary = isAutoSummary ? deterministicSummary(role, pageContext) : '';
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      type: 'user',
      text: cleanText,
      timestamp: new Date(),
    };

    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    setLoading(true);

    try {
      if (!sessionBound) {
        throw new Error('The Firebase Auth session is not ready for the AI launcher. Refresh or sign in again.');
      }
      const runSovereignAI = httpsCallable(callableFunctions, 'runSovereignAI');
      const result: any = await runSovereignAI({
        text: isAutoSummary ? localSummary || cleanText : cleanText,
        pageContext,
        fallbackSummary: localSummary,
      });
      const data = result.data || {};
      const aiText = String(data.text || '').trim();
      if (!aiText) throw new Error('The AI backend returned an empty response.');
      setMessages((previous) => [...previous, {
        id: `ai_${Date.now()}`,
        type: 'ai',
        text: aiText,
        timestamp: new Date(),
        live: data.live === true,
        provider: data.provider || 'unknown',
        operationalStatus: data.operationalStatus === 'healthy' ? 'healthy' : 'degraded',
      }]);
    } catch (error: any) {
      const message = explainCallableError(error);
      const localContext = localSummary
        ? `LOCAL PAGE SUMMARY — NOT AI OR AUTHORITATIVE\n${localSummary}\n\n`
        : '';
      setMessages((previous) => [...previous, {
        id: `ai_${Date.now()}`,
        type: 'ai',
        text: `${localContext}AI SERVICE ERROR — NO LIVE ANSWER\n${message}`,
        timestamp: new Date(),
        live: false,
        provider: 'function-error',
        operationalStatus: 'error',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrompt = (prompt: Prompt) => {
    if (prompt.action === 'NAVIGATE' && onNavigate) {
      onNavigate(prompt.payload);
      setOpen(false);
      return;
    }
    if (prompt.action === 'SUMMARIZE') {
      void handleSend(prompt.payload, true);
      return;
    }
    void handleSend(prompt.payload);
  };

  const renderContent = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0B0B0C', color: '#FFF' }}>
      <Box sx={{ p: 3, borderBottom: '1px solid rgba(198,167,94,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #000, #111)' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: binThemeTokens.gold, width: 40, height: 40 }}>
            <Sparkles color="#000" size={24} />
          </Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight="950" sx={{ color: binThemeTokens.gold }}>SOVEREIGN AI</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>ADVISORY ASSISTANT · PROVIDER STATUS SHOWN</Typography>
          </Box>
        </Stack>
        <IconButton onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)' }}>
          <X size={20} />
        </IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {messages.map((message) => (
          <Box key={message.id} sx={{ alignSelf: message.type === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flexDirection: message.type === 'user' ? 'row-reverse' : 'row' }}>
              <Avatar sx={{ width: 28, height: 28, bgcolor: message.type === 'user' ? '#333' : binThemeTokens.gold, mt: 0.5 }}>
                {message.type === 'user' ? <User size={16} color="#FFF" /> : <Bot size={16} color="#000" />}
              </Avatar>
              <Paper sx={{ p: 2, bgcolor: message.type === 'user' ? 'rgba(255,255,255,0.05)' : 'rgba(198,167,94,0.05)', border: `1px solid ${message.type === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(198,167,94,0.2)'}`, borderRadius: message.type === 'user' ? '20px 4px 20px 20px' : '4px 20px 20px 20px' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#FFF' }}>{message.text}</Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, opacity: 0.7 }}>
                  <Typography variant="caption">{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>
                  {message.provider && (
                    <Chip
                      size="small"
                      label={providerStatusLabel(message)}
                      sx={{ height: 18, fontSize: 9, color: providerStatusColor(message), bgcolor: 'rgba(255,255,255,0.04)' }}
                    />
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Box>
        ))}
        {loading && (
          <Box sx={{ alignSelf: 'flex-start', ml: 5 }}>
            <CircularProgress size={20} sx={{ color: binThemeTokens.gold }} />
          </Box>
        )}
        <div ref={chatEndRef} />
      </Box>

      <Box sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Box sx={{ mb: 2, display: 'flex', gap: 1, overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
          {activeRole.prompts.map((prompt) => (
            <Chip
              key={`${prompt.action}_${prompt.label}`}
              label={prompt.label}
              onClick={() => handlePrompt(prompt)}
              sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.3)', color: binThemeTokens.gold, fontWeight: 700, fontSize: '0.7rem', '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1) } }}
            />
          ))}
        </Box>

        <TextField
          fullWidth
          placeholder={sessionBound ? 'Send a secure advisory question...' : 'Auth session is loading. Refresh if this does not clear.'}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSend(input);
            }
          }}
          autoComplete="off"
          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, '& fieldset': { borderColor: sessionBound ? 'rgba(255,255,255,0.1)' : 'rgba(245,158,11,0.5)' }, '&:hover fieldset': { borderColor: binThemeTokens.gold } } }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton disabled={loading || !sessionBound} onClick={() => void handleSend(input)} sx={{ color: binThemeTokens.gold }}>
                  <Send size={18} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Stack spacing={0.5} sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: sessionBound ? 'rgba(255,255,255,0.35)' : '#f59e0b', fontWeight: 900 }}>
            <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} />
            {sessionBound ? 'FIREBASE CALLABLE AI SESSION' : 'AUTH SESSION NOT YET BOUND'}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.28)', fontWeight: 800, lineHeight: 1.4 }}>
            ADVISORY ONLY · APPROVALS, PAYMENTS, ASSIGNMENTS, QUOTATIONS AND COMPLIANCE REMAIN SERVER-AUTHORITATIVE
          </Typography>
        </Stack>
      </Box>
    </Box>
  );

  return (
    <>
      <Fab
        onClick={() => setOpen(true)}
        sx={{ position: 'fixed', bottom: 30, right: 30, bgcolor: binThemeTokens.gold, color: '#000', boxShadow: `0 0 30px ${alpha(binThemeTokens.gold, 0.4)}`, '&:hover': { bgcolor: binThemeTokens.goldLight, transform: 'scale(1.05)' }, zIndex: 2000, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <Sparkles size={24} />
      </Fab>

      {isMobile ? (
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={() => setOpen(false)}
          onOpen={() => setOpen(true)}
          PaperProps={{ sx: { height: '80vh', borderTopLeftRadius: 24, borderTopRightRadius: 24, bgcolor: '#0B0B0C', overflow: 'hidden' } }}
        >
          {renderContent()}
        </SwipeableDrawer>
      ) : (
        <Drawer
          anchor="right"
          open={open}
          onClose={() => setOpen(false)}
          PaperProps={{ sx: { width: 400, borderLeft: '1px solid rgba(198,167,94,0.2)', bgcolor: '#0B0B0C', overflow: 'hidden' } }}
        >
          {renderContent()}
        </Drawer>
      )}
    </>
  );
};
