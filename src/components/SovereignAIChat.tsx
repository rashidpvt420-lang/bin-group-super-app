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
import { Bot, Grip, Send, ShieldCheck, Sparkles, User, X } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useAI } from '../context/AIContext';
import { functions, httpsCallable } from '../lib/firebase';
import { generateSovereignAIResponse, type SovereignRole } from '../utils/propertyTruthIntelligence';

export interface SovereignAIChatProps {
  role: SovereignRole;
  onNavigate?: (path: string) => void;
  /** Public marketing routes must not imply that an unauthenticated callable is live. */
  allowLiveProvider?: boolean;
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

type Prompt = { label: string; action: 'SUMMARIZE' | 'NAVIGATE' | 'MESSAGE'; payload: string };
type FabPosition = { x: number; y: number };

const CHAT_POSITION_KEY = 'bin_sovereign_ai_chat_position_v1';
const FAB_SIZE = 56;
const EDGE_PADDING = 14;

const getDefaultFabPosition = (): FabPosition => {
  if (typeof window === 'undefined') return { x: 30, y: 30 };
  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - FAB_SIZE - 30),
    y: Math.max(EDGE_PADDING, window.innerHeight - FAB_SIZE - 30),
  };
};

const clampFabPosition = (position: FabPosition): FabPosition => {
  if (typeof window === 'undefined') return position;
  return {
    x: Math.min(Math.max(EDGE_PADDING, position.x), Math.max(EDGE_PADDING, window.innerWidth - FAB_SIZE - EDGE_PADDING)),
    y: Math.min(Math.max(EDGE_PADDING, position.y), Math.max(EDGE_PADDING, window.innerHeight - FAB_SIZE - EDGE_PADDING)),
  };
};

const roleData: Record<SovereignRole, { greeting: string; prompts: Prompt[] }> = {
  owner: {
    greeting: 'Owner AI is ready for advisory guidance. Authoritative approvals, payments, and property records remain in the dashboard.',
    prompts: [
      { label: 'Truth Ledger', action: 'MESSAGE', payload: 'Show my Property Truth Ledger' },
      { label: 'Maintenance Score', action: 'MESSAGE', payload: 'Explain the Maintenance Credit Score' },
      { label: 'Autopilot Mode', action: 'MESSAGE', payload: 'Explain AI Property Autopilot and Owner Silent Mode' },
      { label: 'Summarize Page', action: 'SUMMARIZE', payload: 'Analyze current page context.' },
    ],
  },
  tenant: {
    greeting: 'Tenant AI is ready for advisory guidance. Repair status and service records remain authoritative in the tenant portal.',
    prompts: [
      { label: 'Report Issue', action: 'NAVIGATE', payload: '/tenant' },
      { label: 'Evidence Rules', action: 'MESSAGE', payload: 'What proof is needed for a maintenance dispute?' },
      { label: 'Check Status', action: 'SUMMARIZE', payload: 'Summarize my active services.' },
    ],
  },
  technician: {
    greeting: 'Technician AI is ready for advisory guidance. Assigned missions, safety controls, and completion authority remain in operations.',
    prompts: [
      { label: 'Mission Summary', action: 'SUMMARIZE', payload: 'Analyze my current assignment.' },
      { label: 'Proof Protocol', action: 'MESSAGE', payload: 'Explain No-Photo No-GPS No-Close' },
      { label: 'Repeat Defect', action: 'MESSAGE', payload: 'What is Repair Memory?' },
    ],
  },
  broker: {
    greeting: 'Broker AI is ready for advisory guidance. KYC, attribution, commission, and payout decisions remain server-authoritative.',
    prompts: [
      { label: 'Property Passport', action: 'MESSAGE', payload: 'Explain BIN Verified Property Passport for brokers' },
      { label: 'Trust Score', action: 'MESSAGE', payload: 'Explain Maintenance Credit Score for resale and rental confidence' },
      { label: 'Pipeline Summary', action: 'SUMMARIZE', payload: 'Summarize my live leads.' },
    ],
  },
  admin: {
    greeting: 'Admin AI is ready for advisory analysis. It cannot approve payments, create access, assign work, or clear launch gates.',
    prompts: [
      { label: 'War Room Summary', action: 'SUMMARIZE', payload: 'Summarize current bottlenecks.' },
      { label: 'Truth Ledger', action: 'MESSAGE', payload: 'Show Property Truth Ledger risk' },
      { label: 'Launch Risk', action: 'MESSAGE', payload: 'Is the AI-powered layer working?' },
    ],
  },
  unknown: {
    greeting: 'BIN GROUP local product guidance is available. Sign in to a role portal for authenticated live-provider assistance.',
    prompts: [
      { label: 'Platform Overview', action: 'MESSAGE', payload: 'Tell me about BIN GROUP Property Truth Infrastructure.' },
    ],
  },
};

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
  if (code.includes('unavailable')) return 'The backend did not complete the request. No live AI answer was produced.';
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
  allowLiveProvider = true,
  isAuthenticated = true,
  authUserId,
}) => {
  const { pageContext } = useAI();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [fabPosition, setFabPosition] = useState<FabPosition>(getDefaultFabPosition);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ dragging: false, moved: false, pointerId: -1, offsetX: 0, offsetY: 0, startX: 0, startY: 0 });
  const activeRole = roleData[role] || roleData.unknown;
  const sessionBound = allowLiveProvider && isAuthenticated && (role !== 'admin' || Boolean(authUserId));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_POSITION_KEY);
      if (saved) setFabPosition(clampFabPosition(JSON.parse(saved)));
    } catch {
      setFabPosition(getDefaultFabPosition());
    }

    const handleResize = () => setFabPosition((current) => {
      const next = clampFabPosition(current);
      try { localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(next)); } catch { /* restricted storage */ }
      return next;
    });

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (messages.length === 0 && open) {
      setMessages([{
        id: 'initial',
        type: 'ai',
        text: activeRole.greeting,
        timestamp: new Date(),
        live: false,
        provider: sessionBound ? 'provider not called' : 'local guidance',
        operationalStatus: 'ready',
      }]);
    }
  }, [open, activeRole.greeting, messages.length, sessionBound]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const generateSummary = (): string => {
    if (!pageContext) return 'No dashboard context is visible yet. Open a specific module so the local summary can read the available client signals.';

    const normalizedRole = role.toLowerCase();
    if (normalizedRole === 'owner') {
      const propCount = pageContext.properties?.length || 0;
      const bpi = pageContext.bpiAverage || 0;
      const risk = pageContext.riskAssets?.length || 0;
      return `Institutional scan: ${propCount} asset nodes, BPI ${bpi}%, high-risk assets ${risk}.`;
    }
    if (normalizedRole === 'tenant') {
      const active = pageContext.activeTickets?.length || 0;
      const latest = pageContext.activeTickets?.[0];
      return active > 0
        ? `Residency alert: ${active} active mission(s). Latest request: ${latest?.description || 'maintenance request'} - ${String(latest?.status || 'open').replace('_', ' ')}.`
        : 'Residency status: no active maintenance dispatches found.';
    }
    if (normalizedRole === 'technician') {
      const active = pageContext.activeDispatches?.length || 0;
      const mission = pageContext.activeDispatches?.[0];
      return active > 0
        ? `Mission briefing: ${active} active assignment(s). Primary mission: ${mission?.description || 'service request'} at ${mission?.propertyName || 'assigned property'}.`
        : 'Duty status: no active assignments locked to your UID.';
    }
    if (normalizedRole === 'broker') {
      const leadCount = pageContext.leads?.length || 0;
      const pendingPay = pageContext.stats?.pending || 0;
      return `Pipeline scan: ${leadCount} referral nodes active. Pending commission float: AED ${Number(pendingPay).toLocaleString()}.`;
    }
    if (normalizedRole === 'admin') {
      const onboards = pageContext.pendingOnboardings?.length || 0;
      const orphans = pageContext.orphans?.length || 0;
      const tickets = pageContext.stats?.openTickets || 0;
      return `Command audit: ${onboards} pending intakes, ${orphans} orphan records, ${tickets} active missions.`;
    }
    return 'Platform guidance is available, but no authenticated role context is attached.';
  };

  const handleSend = async (text: string, isAutoSummary = false) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;
    const userMsg: Message = { id: `user_${Date.now()}`, type: 'user', text: cleanText, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const fallbackSummary = isAutoSummary ? generateSummary() : undefined;
    try {
      if (!allowLiveProvider) {
        const localText = generateSovereignAIResponse({ role, text: cleanText, pageContext, isAutoSummary, fallbackSummary });
        setMessages((prev) => [...prev, {
          id: `ai_${Date.now()}`,
          type: 'ai',
          text: `LOCAL GUIDANCE — NOT LIVE AI OR AUTHORITATIVE\n${localText}`,
          timestamp: new Date(),
          live: false,
          provider: 'local-guidance',
          operationalStatus: 'degraded',
        }]);
        return;
      }
      if (!sessionBound) throw new Error('The Firebase Auth session is not ready for the AI launcher. Refresh or sign in again.');

      const runSovereignAI = httpsCallable(functions, 'runSovereignAI');
      const result: any = await runSovereignAI({ role, text: cleanText, pageContext, isAutoSummary, fallbackSummary, provider: 'gemini' });
      const data = result?.data || {};
      const responseText = String(data.text || '').trim();
      if (!responseText) throw new Error('Sovereign AI returned an empty response.');
      const live = data.live === true;
      const visibleStatus = live ? '' : 'DEGRADED AI - LOCAL RULE GUIDANCE ONLY\n\n';
      setMessages((prev) => [...prev, {
        id: `ai_${Date.now()}`,
        type: 'ai',
        text: `${visibleStatus}${responseText}`,
        timestamp: new Date(),
        live,
        provider: String(data.provider || (live ? 'unknown-provider' : 'server-fallback')),
        operationalStatus: live && data.operationalStatus === 'healthy' ? 'healthy' : 'degraded',
      }]);
    } catch (error) {
      console.warn('[SovereignAI] Live callable failed; local rules are clearly labelled:', error);
      const localText = generateSovereignAIResponse({ role, text: cleanText, pageContext, isAutoSummary, fallbackSummary });
      setMessages((prev) => [...prev, {
        id: `ai_${Date.now()}`,
        type: 'ai',
        text: `AI SERVICE ERROR — NO LIVE ANSWER\n${explainCallableError(error)}\n\nLOCAL GUIDANCE — NOT AI OR AUTHORITATIVE\n${localText}`,
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
    } else if (prompt.action === 'MESSAGE') {
      void handleSend(prompt.payload);
    } else if (prompt.action === 'SUMMARIZE') {
      void handleSend(prompt.label, true);
    }
  };

  const handleFabPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      dragging: true,
      moved: false,
      pointerId: event.pointerId,
      offsetX: event.clientX - fabPosition.x,
      offsetY: event.clientY - fabPosition.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFabPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.dragging || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
    setFabPosition(clampFabPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }));
  };

  const finishFabDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.dragging || drag.pointerId !== event.pointerId) return;
    dragRef.current = { ...drag, dragging: false };
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    setFabPosition((current) => {
      const next = clampFabPosition(current);
      try { localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(next)); } catch { /* restricted storage */ }
      return next;
    });
    if (!drag.moved) setOpen(true);
  };

  const renderContent = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0B0B0C', color: '#FFF' }}>
      <Box sx={{ p: 3, borderBottom: '1px solid rgba(198,167,94,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #000, #111)' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: binThemeTokens.gold, width: 40, height: 40 }}><Sparkles color="#000" size={24} /></Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight="950" sx={{ color: binThemeTokens.gold }}>SOVEREIGN AI</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>ADVISORY ASSISTANT · PROVIDER STATUS SHOWN</Typography>
          </Box>
        </Stack>
        <IconButton onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)' }}><X size={20} /></IconButton>
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {messages.map((msg) => (
          <Box key={msg.id} sx={{ alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flexDirection: msg.type === 'user' ? 'row-reverse' : 'row' }}>
              <Avatar sx={{ width: 28, height: 28, bgcolor: msg.type === 'user' ? '#333' : binThemeTokens.gold, mt: 0.5 }}>
                {msg.type === 'user' ? <User size={16} color="#FFF" /> : <Bot size={16} color="#000" />}
              </Avatar>
              <Paper sx={{ p: 2, bgcolor: msg.type === 'user' ? 'rgba(255,255,255,0.05)' : 'rgba(198,167,94,0.05)', border: `1px solid ${msg.type === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(198,167,94,0.2)'}`, borderRadius: msg.type === 'user' ? '20px 4px 20px 20px' : '4px 20px 20px 20px' }}>
                {msg.type === 'ai' && (
                  <Chip
                    size="small"
                    label={providerStatusLabel(msg)}
                    sx={{ mb: 1.2, height: 20, bgcolor: alpha(providerStatusColor(msg), 0.14), color: providerStatusColor(msg), fontWeight: 950, fontSize: '0.62rem' }}
                  />
                )}
                <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: 'pre-line', color: msg.type === 'user' ? 'rgba(255,255,255,0.9)' : '#FFF' }}>{msg.text}</Typography>
                <Typography variant="caption" sx={{ mt: 1, display: 'block', opacity: 0.3, textAlign: msg.type === 'user' ? 'right' : 'left' }}>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>
              </Paper>
            </Stack>
          </Box>
        ))}
        {loading && <Box sx={{ alignSelf: 'flex-start', ml: 5 }}><CircularProgress size={20} sx={{ color: binThemeTokens.gold }} /></Box>}
        <div ref={chatEndRef} />
      </Box>

      <Box sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Box sx={{ mb: 2, display: 'flex', gap: 1, overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
          {activeRole.prompts.map((prompt) => (
            <Chip key={prompt.label} label={prompt.label} onClick={() => handlePrompt(prompt)} sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(198,167,94,0.3)', color: binThemeTokens.gold, fontWeight: 700, fontSize: '0.7rem', '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1) } }} />
          ))}
        </Box>
        <TextField
          fullWidth
          placeholder={allowLiveProvider ? 'Ask the authenticated AI assistant...' : 'Ask for local product guidance...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSend(input)}
          autoComplete="off"
          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: binThemeTokens.gold } } }}
          InputProps={{ endAdornment: <InputAdornment position="end"><IconButton disabled={loading || !input.trim()} onClick={() => void handleSend(input)} sx={{ color: binThemeTokens.gold }}><Send size={18} /></IconButton></InputAdornment> }}
        />
        <Typography variant="caption" sx={{ mt: 2, display: 'block', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>
          <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} /> {allowLiveProvider ? 'AUTHENTICATED SESSION · STATUS SHOWN' : 'LOCAL GUIDANCE ONLY · SIGN IN FOR LIVE AI'}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
      <Fab
        aria-label="Move or open Sovereign AI chat"
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={finishFabDrag}
        onPointerCancel={finishFabDrag}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        sx={{ position: 'fixed', left: fabPosition.x, top: fabPosition.y, width: FAB_SIZE, height: FAB_SIZE, bgcolor: binThemeTokens.gold, color: '#000', boxShadow: `0 0 30px ${alpha(binThemeTokens.gold, 0.4)}`, '&:hover': { bgcolor: binThemeTokens.goldLight, transform: dragRef.current.dragging ? 'none' : 'scale(1.05)' }, zIndex: 2500, touchAction: 'none', cursor: dragRef.current.dragging ? 'grabbing' : 'grab', transition: dragRef.current.dragging ? 'none' : 'transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease' }}
      >
        <Stack alignItems="center" spacing={0} sx={{ lineHeight: 1 }}><Sparkles size={22} /><Grip size={11} /></Stack>
      </Fab>

      {isMobile ? (
        <SwipeableDrawer anchor="bottom" open={open} onClose={() => setOpen(false)} onOpen={() => setOpen(true)} PaperProps={{ sx: { height: '80vh', borderTopLeftRadius: 24, borderTopRightRadius: 24, bgcolor: '#0B0B0C', overflow: 'hidden' } }}>
          {renderContent()}
        </SwipeableDrawer>
      ) : (
        <Drawer anchor="right" open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: 400, borderLeft: '1px solid rgba(198,167,94,0.2)', bgcolor: '#0B0B0C', overflow: 'hidden' } }}>
          {renderContent()}
        </Drawer>
      )}
    </>
  );
};
