import React, { useState, useRef, useEffect } from 'react';
import {
  Box, IconButton, Typography, Paper, TextField, InputAdornment,
  Drawer, SwipeableDrawer, useMediaQuery, useTheme, Button,
  Stack, Avatar, Chip, alpha, CircularProgress, Fab
} from '@mui/material';
import { Send, X, MessageSquare, ShieldCheck, Sparkles, ChevronRight, User, Bot, LayoutDashboard } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useAI } from '../context/AIContext';

export interface SovereignAIChatProps {
  role: 'owner' | 'tenant' | 'technician' | 'broker' | 'admin' | 'unknown';
  onNavigate?: (path: string) => void;
}

interface Message {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

const roleData = {
  owner: {
    greeting: "Welcome to your Institutional Portfolio. How may I assist with your asset yields or pending approvals?",
    prompts: [
      { label: "Summarize Page", action: "SUMMARIZE", payload: "Analyze current page context." },
      { label: "Pending Approvals", action: "NAVIGATE", payload: "/dashboard" },
      { label: "Executive Report", action: "NAVIGATE", payload: "/analytics/executive" },
      { label: "Explain BPI Score", action: "MESSAGE", payload: "Can you explain the Building Performance Index (BPI)?" }
    ]
  },
  tenant: {
    greeting: "Welcome to your Residency Node. Do you need to report an issue or track an active dispatch?",
    prompts: [
      { label: "Check My Status", action: "SUMMARIZE", payload: "Summarize my active services." },
      { label: "Report Issue", action: "NAVIGATE", payload: "/tenant" },
      { label: "Move-Out Process", action: "MESSAGE", payload: "What is the move-out protocol?" }
    ]
  },
  technician: {
    greeting: "Service Node Active. Ready for mission briefing or troubleshooting assistance.",
    prompts: [
      { label: "Mission Summary", action: "SUMMARIZE", payload: "Analyze my current assignment." },
      { label: "View Missions", action: "NAVIGATE", payload: "/tech" },
      { label: "SLA Guidelines", action: "MESSAGE", payload: "What are the SLA guidelines?" }
    ]
  },
  broker: {
    greeting: "Sovereign Brokerage Network online. Do you need pipeline summaries or commission updates?",
    prompts: [
      { label: "Pipeline Summary", action: "SUMMARIZE", payload: "Summarize my live leads." },
      { label: "Submit Lead", action: "NAVIGATE", payload: "/broker" },
      { label: "Commission Status", action: "MESSAGE", payload: "When are commissions disbursed?" }
    ]
  },
  admin: {
    greeting: "Command Center AI ready. Monitoring approval queues and system integrity.",
    prompts: [
      { label: "War Room Summary", action: "SUMMARIZE", payload: "Summarize current bottlenecks." },
      { label: "Orphan War Room", action: "NAVIGATE", payload: "/admin/orphans" },
      { label: "SLA Breaches", action: "NAVIGATE", payload: "/reports" }
    ]
  },
  unknown: {
    greeting: "Sovereign Systems online. How may I assist you today?",
    prompts: [
      { label: "Platform Overview", action: "MESSAGE", payload: "Tell me about BIN GROUP." }
    ]
  }
};

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

  // Persist session chat history
  useEffect(() => {
    const saved = sessionStorage.getItem(`bin_chat_history_${role}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
    }
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
        timestamp: new Date()
      }]);
    }
  }, [open, role]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateSummary = (): string => {
    if (!pageContext) return "I cannot see any operational data on this page. Please navigate to a specific dashboard or module.";

    const r = role.toLowerCase();
    
    if (r === 'owner') {
      const propCount = pageContext.properties?.length || 0;
      const bpi = pageContext.bpiAverage || 0;
      const risk = pageContext.riskAssets?.length || 0;
      return `Institutional Scan Complete: I detected ${propCount} asset nodes in your portfolio. The Building Performance Index (BPI) is currently at ${bpi}%. You have ${risk} assets flagged as HIGH RISK.`;
    }

    if (r === 'tenant') {
      const active = pageContext.activeTickets?.length || 0;
      const latest = pageContext.activeTickets?.[0];
      if (active > 0) {
        return `Residency Alert: You have ${active} mission(s) active. Your latest request for "${latest.description}" is currently ${latest.status.replace('_', ' ')}. If you need to change the timing, use the navigation prompt below.`;
      }
      return "Residency Status: No active maintenance dispatches found. Your residency node is operating within optimal parameters. If you have a new issue, I can guide you to the SOS reporting page.";
    }

    if (r === 'technician') {
      const active = pageContext.activeDispatches?.length || 0;
      const mission = pageContext.activeDispatches?.[0];
      if (active > 0) {
        return `Mission Briefing: You have ${active} active assignment(s). Primary mission: ${mission.description} at ${mission.propertyName}. Current status is ${mission.status}. Ensure GPS check-in upon arrival.`;
      }
      return "Duty Status: Monitoring mission pool. No active assignments locked to your UID.";
    }

    if (r === 'broker') {
      const leadCount = pageContext.leads?.length || 0;
      const pendingPay = pageContext.stats?.pending || 0;
      return `Pipeline Scan: ${leadCount} referral nodes active. Your current treasury float for pending commissions is AED ${pendingPay.toLocaleString()}.`;
    }

    if (r === 'admin') {
      const onboards = pageContext.pendingOnboardings?.length || 0;
      const orphans = pageContext.orphans?.length || 0;
      const tickets = pageContext.stats?.openTickets || 0;
      return `Command Audit: Approval queue contains ${onboards} intake submissions. I detected ${orphans} relational orphans in the War Room. Total active missions: ${tickets}.`;
    }

    return "Summary protocol active, but context parameters are unmapped for this role.";
  };

  const handleSend = async (text: string, isAutoSummary = false) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      let aiText = "I am processing your institutional request. Currently, I can guide you through the platform and explain core concepts like BPI and SLA protocols.";
      
      if (isAutoSummary) {
        aiText = generateSummary();
      } else if (text.toLowerCase().includes('bpi')) {
        aiText = "The Building Performance Index (BPI) is our proprietary real-time health score for assets. It analyzes age, maintenance frequency, and SOS history to predict integrity decay.";
      } else if (text.toLowerCase().includes('sla')) {
        aiText = "Our Service Level Agreements (SLA) prioritize safety. Emergency faults (AC, Flood, Fire) require a 4-hour response, while standard MEP issues are resolved within 24-48 hours.";
      } else if (text.toLowerCase().includes('move-out')) {
        aiText = "To move out, ensure all service tickets are closed and final clearance certificates are uploaded to the document vault. Your owner will then trigger the 'Vacate Node' protocol.";
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        text: aiText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
      setLoading(false);
    }, 1000);
  };

  const handlePrompt = (prompt: any) => {
    if (prompt.action === 'NAVIGATE' && onNavigate) {
      onNavigate(prompt.payload);
      setOpen(false);
    } else if (prompt.action === 'MESSAGE') {
      handleSend(prompt.payload);
    } else if (prompt.action === 'SUMMARIZE') {
      handleSend(prompt.label, true);
    }
  };

  const renderContent = () => (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0B0B0C', color: '#FFF' }}>
      {/* Header */}
      <Box sx={{ p: 3, borderBottom: '1px solid rgba(198,167,94,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #000, #111)' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: binThemeTokens.gold, width: 40, height: 40 }}>
            <Sparkles color="#000" size={24} />
          </Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight="950" sx={{ color: binThemeTokens.gold }}>SOVEREIGN AI</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>EXECUTIVE ASSISTANT</Typography>
          </Box>
        </Stack>
        <IconButton onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)' }}>
          <X size={20} />
        </IconButton>
      </Box>

      {/* Messages */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {messages.map((msg) => (
          <Box key={msg.id} sx={{ alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flexDirection: msg.type === 'user' ? 'row-reverse' : 'row' }}>
              <Avatar sx={{ width: 28, height: 28, bgcolor: msg.type === 'user' ? '#333' : binThemeTokens.gold, mt: 0.5 }}>
                {msg.type === 'user' ? <User size={16} color="#FFF" /> : <Bot size={16} color="#000" />}
              </Avatar>
              <Paper sx={{ 
                p: 2, 
                bgcolor: msg.type === 'user' ? 'rgba(255,255,255,0.05)' : 'rgba(198,167,94,0.05)',
                border: `1px solid ${msg.type === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(198,167,94,0.2)'}`,
                borderRadius: msg.type === 'user' ? '20px 4px 20px 20px' : '4px 20px 20px 20px'
              }}>
                <Typography variant="body2" sx={{ lineHeight: 1.6, color: msg.type === 'user' ? 'rgba(255,255,255,0.9)' : '#FFF' }}>
                  {msg.text}
                </Typography>
                <Typography variant="caption" sx={{ mt: 1, display: 'block', opacity: 0.3, textAlign: msg.type === 'user' ? 'right' : 'left' }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Typography>
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

      {/* Footer / Input */}
      <Box sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Suggested Prompts */}
        <Box sx={{ mb: 2, display: 'flex', gap: 1, overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { display: 'none' } }}>
          {activeRole.prompts.map((p, i) => (
            <Chip 
              key={i} 
              label={p.label} 
              onClick={() => handlePrompt(p)}
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.02)', 
                border: '1px solid rgba(198,167,94,0.3)',
                color: binThemeTokens.gold,
                fontWeight: 700,
                fontSize: '0.7rem',
                '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1) }
              }} 
            />
          ))}
        </Box>

        <TextField
          fullWidth
          placeholder="Send a secure message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
          autoComplete="off"
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'rgba(255,255,255,0.03)',
              borderRadius: 3,
              '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
              '&:hover fieldset': { borderColor: binThemeTokens.gold },
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => handleSend(input)} sx={{ color: binThemeTokens.gold }}>
                  <Send size={18} />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
        <Typography variant="caption" sx={{ mt: 2, display: 'block', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontWeight: 900 }}>
          <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} />
          SOVEREIGN ENCRYPTED SESSION
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
      <Fab
        onClick={() => setOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 30,
          right: 30,
          bgcolor: binThemeTokens.gold,
          color: '#000',
          boxShadow: `0 0 30px ${alpha(binThemeTokens.gold, 0.4)}`,
          '&:hover': { bgcolor: binThemeTokens.goldLight, transform: 'scale(1.05)' },
          zIndex: 2000,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <Sparkles size={24} />
      </Fab>

      {isMobile ? (
        <SwipeableDrawer
          anchor="bottom"
          open={open}
          onClose={() => setOpen(false)}
          onOpen={() => setOpen(true)}
          PaperProps={{
            sx: { height: '80vh', borderTopLeftRadius: 24, borderTopRightRadius: 24, bgcolor: '#0B0B0C', overflow: 'hidden' }
          }}
        >
          {renderContent()}
        </SwipeableDrawer>
      ) : (
        <Drawer
          anchor="right"
          open={open}
          onClose={() => setOpen(false)}
          PaperProps={{
            sx: { width: 400, borderLeft: '1px solid rgba(198,167,94,0.2)', bgcolor: '#0B0B0C', overflow: 'hidden' }
          }}
        >
          {renderContent()}
        </Drawer>
      )}
    </>
  );
};
