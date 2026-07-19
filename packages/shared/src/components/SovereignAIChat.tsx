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
import { binThemeTokens } from '../theme/binGroupTheme';
import { useAI } from '../context/AIContext';
import { functions, httpsCallable } from '../lib/firebase';

export interface SovereignAIChatProps {
  role: 'owner' | 'tenant' | 'technician' | 'broker' | 'admin' | 'unknown';
  onNavigate?: (path: string) => void;
}

interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
  live?: boolean;
  provider?: string;
}

type PromptAction = 'SUMMARIZE' | 'NAVIGATE' | 'MESSAGE';

type Prompt = {
  label: string;
  action: PromptAction;
  payload: string;
};

const roleData: Record<SovereignAIChatProps['role'], { greeting: string; prompts: Prompt[] }> = {
  owner: {
    greeting: 'Owner AI is live. Ask about portfolio risk, contract status, payment approval, property health, or maintenance proof.',
    prompts: [
      { label: 'Summarize Page', action: 'SUMMARIZE', payload: 'Summarize my current owner dashboard and identify missing actions.' },
      { label: 'Pending Approvals', action: 'NAVIGATE', payload: '/dashboard' },
      { label: 'Explain Property Score', action: 'MESSAGE', payload: 'Explain the property health and maintenance credit score.' },
    ],
  },
  tenant: {
    greeting: 'Tenant AI is live. Ask about repair status, room-rent onboarding, move-in readiness, or maintenance history.',
    prompts: [
      { label: 'Summarize Page', action: 'SUMMARIZE', payload: 'Summarize my tenant services and active requests.' },
      { label: 'Report Issue', action: 'NAVIGATE', payload: '/tenant' },
      { label: 'Move-In Ready?', action: 'MESSAGE', payload: 'How do I know a room is ready and repairs are completed?' },
    ],
  },
  technician: {
    greeting: 'Technician AI is live. Ask for mission briefing, SLA priority, proof requirements, or troubleshooting guidance.',
    prompts: [
      { label: 'Mission Summary', action: 'SUMMARIZE', payload: 'Summarize my current technician assignment and proof requirements.' },
      { label: 'View Missions', action: 'NAVIGATE', payload: '/tech' },
      { label: 'SLA Rules', action: 'MESSAGE', payload: 'Explain the SLA and before-after evidence rules.' },
    ],
  },
  broker: {
    greeting: 'Broker AI is live. Ask about referral status, KYC, attribution, commission lock, or payout flow.',
    prompts: [
      { label: 'Pipeline Summary', action: 'SUMMARIZE', payload: 'Summarize my broker pipeline and commission status.' },
      { label: 'Submit Lead', action: 'NAVIGATE', payload: '/broker' },
      { label: 'Commission Status', action: 'MESSAGE', payload: 'Explain how broker commission is locked and paid.' },
    ],
  },
  admin: {
    greeting: 'Admin AI is live. Ask about launch gates, HR, owners, tenants, technicians, payments, room-rent ops, or audit gaps.',
    prompts: [
      { label: 'War Room Summary', action: 'SUMMARIZE', payload: 'Summarize current admin bottlenecks and launch blockers.' },
      { label: 'Launch Gates', action: 'NAVIGATE', payload: '/ops/public-launch-command' },
      { label: 'HR Command', action: 'NAVIGATE', payload: '/hr' },
    ],
  },
  unknown: {
    greeting: 'BIN GROUP AI is live. Ask about the platform, maintenance, property management, or onboarding.',
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
  if (!pageContext) return 'No live page context is registered for this screen yet.';
  if (role === 'admin') {
    const pending = pageContext.pendingOnboardings?.length || 0;
    const orphans = pageContext.orphans?.length || 0;
    const openTickets = pageContext.stats?.openTickets || 0;
    return `Admin scan: ${pending} pending onboarding item(s), ${orphans} orphan item(s), and ${openTickets} open mission(s).`;
  }
  if (role === 'owner') {
    const propertyCount = pageContext.properties?.length || 0;
    const risk = pageContext.riskAssets?.length || 0;
    return `Owner scan: ${propertyCount} property record(s) and ${risk} risk item(s) found in the current context.`;
  }
  if (role === 'tenant') {
    const active = pageContext.activeTickets?.length || 0;
    return `Tenant scan: ${active} active service request(s) in the current context.`;
  }
  if (role === 'technician') {
    const active = pageContext.activeDispatches?.length || 0;
    return `Technician scan: ${active} active dispatch item(s) in the current context.`;
  }
  if (role === 'broker') {
    const leads = pageContext.leads?.length || 0;
    return `Broker scan: ${leads} active lead/referral item(s) in the current context.`;
  }
  return 'Context registered, but this role does not have a mapped deterministic summary yet.';
}

export const SovereignAIChat: React.FC<SovereignAIChatProps> = ({ role, onNavigate }) => {
  const { pageContext } = useAI();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeRole = roleData[role] || roleData.unknown;

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
      setMessages([{ id: 'initial', type: 'ai', text: activeRole.greeting, timestamp: new Date(), live: true, provider: 'system' }]);
    }
  }, [open, messages.length, activeRole.greeting]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (text: string, isAutoSummary = false) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;

    const fallbackSummary = isAutoSummary ? deterministicSummary(role, pageContext) : '';
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
      const runSovereignAI = httpsCallable(functions, 'runSovereignAI');
      const result: any = await runSovereignAI({
        role,
        text: isAutoSummary ? fallbackSummary || cleanText : cleanText,
        pageContext,
        fallbackSummary,
      });
      const data = result.data || {};
      const aiText = String(data.text || '').trim() || fallbackSummary || 'AI returned an empty response.';
      setMessages((previous) => [...previous, {
        id: `ai_${Date.now()}`,
        type: 'ai',
        text: aiText,
        timestamp: new Date(),
        live: data.live === true,
        provider: data.provider || 'unknown',
      }]);
    } catch (error: any) {
      const message = error?.message || 'Live AI callable failed.';
      setMessages((previous) => [...previous, {
        id: `ai_${Date.now()}`,
        type: 'ai',
        text: `${fallbackSummary || 'I can still guide you with deterministic platform rules.'}\n\nLive AI status: ${message}`,
        timestamp: new Date(),
        live: false,
        provider: 'fallback',
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
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>LIVE EXECUTIVE ASSISTANT</Typography>
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
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, opacity: 0.45 }}>
                  <Typography variant="caption">{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>
                  {message.provider && <Chip size="small" label={message.live ? `LIVE ${message.provider}` : message.provider.toUpperCase()} sx={{ height: 18, fontSize: 9, color: message.live ? '#10b981' : '#f59e0b', bgcolor: 'rgba(255,255,255,0.04)' }} />}
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
          placeholder="Send a secure message..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSend(input);
            }
          }}
          autoComplete="off"
          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: binThemeTokens.gold } } }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton disabled={loading} onClick={() => void handleSend(input)} sx={{ color: binThemeTokens.gold }}>
                  <Send size={18} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="caption" sx={{ mt: 2, display: 'block', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontWeight: 900 }}>
          <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} />
          FIREBASE CALLABLE AI SESSION
        </Typography>
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
