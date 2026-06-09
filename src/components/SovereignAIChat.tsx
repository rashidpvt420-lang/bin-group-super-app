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
}

interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
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
    greeting: 'Welcome to BIN Property Truth Infrastructure. I can inspect your Property Passport, Maintenance Credit Score, AI Autopilot, proof gaps, and SLA risk.',
    prompts: [
      { label: 'Truth Ledger', action: 'MESSAGE', payload: 'Show my Property Truth Ledger' },
      { label: 'Maintenance Score', action: 'MESSAGE', payload: 'Explain the Maintenance Credit Score' },
      { label: 'Autopilot Mode', action: 'MESSAGE', payload: 'Explain AI Property Autopilot and Owner Silent Mode' },
      { label: 'Summarize Page', action: 'SUMMARIZE', payload: 'Analyze current page context.' },
    ],
  },
  tenant: {
    greeting: 'Residency node active. I can help submit issues with proof, track SLA status, and explain tenant verification.',
    prompts: [
      { label: 'Report Issue', action: 'NAVIGATE', payload: '/tenant' },
      { label: 'Evidence Rules', action: 'MESSAGE', payload: 'What proof is needed for a maintenance dispute?' },
      { label: 'Check Status', action: 'SUMMARIZE', payload: 'Summarize my active services.' },
    ],
  },
  technician: {
    greeting: 'Service node active. I can explain GPS check-in, No-Photo No-Close rules, SLA priority, and repeat-defect escalation.',
    prompts: [
      { label: 'Mission Summary', action: 'SUMMARIZE', payload: 'Analyze my current assignment.' },
      { label: 'Proof Protocol', action: 'MESSAGE', payload: 'Explain No-Photo No-GPS No-Close' },
      { label: 'Repeat Defect', action: 'MESSAGE', payload: 'What is Repair Memory?' },
    ],
  },
  broker: {
    greeting: 'Broker network online. I can explain verified maintenance history, Property Passport, and owner handover evidence.',
    prompts: [
      { label: 'Property Passport', action: 'MESSAGE', payload: 'Explain BIN Verified Property Passport for brokers' },
      { label: 'Trust Score', action: 'MESSAGE', payload: 'Explain Maintenance Credit Score for resale and rental confidence' },
      { label: 'Pipeline Summary', action: 'SUMMARIZE', payload: 'Summarize my live leads.' },
    ],
  },
  admin: {
    greeting: 'Command Center AI ready. I can inspect SLA breaches, orphan records, proof gaps, repeat defects, and public-launch risk.',
    prompts: [
      { label: 'War Room Summary', action: 'SUMMARIZE', payload: 'Summarize current bottlenecks.' },
      { label: 'Truth Ledger', action: 'MESSAGE', payload: 'Show Property Truth Ledger risk' },
      { label: 'Launch Risk', action: 'MESSAGE', payload: 'Is the AI-powered layer working?' },
    ],
  },
  unknown: {
    greeting: 'BIN GROUP AI online. Ask about Property Truth Ledger, Property Black Box, Property Autopilot, Maintenance Credit Score, or Property Passport.',
    prompts: [
      { label: 'Platform Overview', action: 'MESSAGE', payload: 'Tell me about BIN GROUP Property Truth Infrastructure.' },
    ],
  },
};

export const SovereignAIChat: React.FC<SovereignAIChatProps> = ({ role, onNavigate }) => {
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
    try {
      const saved = sessionStorage.getItem(`bin_chat_history_${role}`);
      if (saved) setMessages(JSON.parse(saved).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
    } catch {
      setMessages([]);
    }
  }, [role]);

  useEffect(() => {
    if (messages.length > 0) {
      try { sessionStorage.setItem(`bin_chat_history_${role}`, JSON.stringify(messages)); } catch { /* restricted storage */ }
    }
  }, [messages, role]);

  useEffect(() => {
    if (messages.length === 0 && open) {
      setMessages([{ id: 'initial', type: 'ai', text: activeRole.greeting, timestamp: new Date() }]);
    }
  }, [open, role, activeRole.greeting, messages.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateSummary = (): string => {
    if (!pageContext) return 'No live dashboard context is visible yet. Open a specific dashboard module so I can read operational signals.';

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
    return 'Summary protocol active, but context parameters are unmapped for this role.';
  };

  const handleSend = async (text: string, isAutoSummary = false) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), type: 'user', text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const fallbackSummary = isAutoSummary ? generateSummary() : undefined;
    try {
      const runSovereignAI = httpsCallable(functions, 'runSovereignAI');
      const result: any = await runSovereignAI({ role, text, pageContext, isAutoSummary, fallbackSummary, provider: 'gemini' });
      const responseText = String(result?.data?.text || '').trim();
      if (!responseText) throw new Error('Sovereign AI returned an empty response.');
      const liveBadge = result?.data?.live ? `\n\n— Live AI: ${String(result.data.provider || 'provider').toUpperCase()}` : '';
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), type: 'ai', text: `${responseText}${liveBadge}`, timestamp: new Date() }]);
    } catch (error) {
      console.warn('[SovereignAI] Live callable failed, using local fallback:', error);
      const aiText = generateSovereignAIResponse({ role, text, pageContext, isAutoSummary, fallbackSummary });
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), type: 'ai', text: `${aiText}\n\n— Local fallback active`, timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrompt = (prompt: Prompt) => {
    if (prompt.action === 'NAVIGATE' && onNavigate) {
      onNavigate(prompt.payload);
      setOpen(false);
    } else if (prompt.action === 'MESSAGE') {
      handleSend(prompt.payload);
    } else if (prompt.action === 'SUMMARIZE') {
      handleSend(prompt.label, true);
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
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>LIVE PROPERTY TRUTH ASSISTANT</Typography>
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
          placeholder="Ask live AI about Property Truth, Autopilot, SLA, Passport..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          autoComplete="off"
          sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' }, '&:hover fieldset': { borderColor: binThemeTokens.gold } } }}
          InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={() => handleSend(input)} sx={{ color: binThemeTokens.gold }}><Send size={18} /></IconButton></InputAdornment> }}
        />
        <Typography variant="caption" sx={{ mt: 2, display: 'block', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontWeight: 900 }}>
          <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} /> LIVE PROPERTY TRUTH SESSION
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
