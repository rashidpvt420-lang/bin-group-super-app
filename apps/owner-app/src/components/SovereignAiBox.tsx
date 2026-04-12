import React, { useState, useRef, useEffect } from 'react';
import { 
    Box, 
    Paper, 
    Typography, 
    IconButton, 
    TextField, 
    Stack, 
    Avatar, 
    alpha, 
    CircularProgress, 
    Fab,
    Tooltip,
    Zoom,
    Fade,
    Chip
} from '@mui/material';
import { 
    MessageSquare, 
    X, 
    Send, 
    Bot, 
    Sparkles, 
    Wrench, 
    ShieldCheck, 
    TrendingUp, 
    User,
    AlertCircle,
    Building2,
    Calendar,
    Phone
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'ai';
    timestamp: Date;
}

const SovereignAiBox: React.FC = () => {
    const { user, role } = useRole();
    const { t, isRTL } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const getInitialMessage = () => {
        switch (role?.toUpperCase()) {
            case 'TENANT':
                return t('ai.init.tenant') || "Sovereign Assistant Online. How is your residence today? I can help with ticket status or basic maintenance troubleshooting.";
            case 'TECHNICIAN':
                return t('ai.init.tech') || "Mission Guidance Node Active. Provide a Ticket ID or ask about part availability for your current assignment.";
            case 'OWNER':
            case 'ADMIN':
                return t('ai.init.owner') || "Strategic Terminal Active. Analysis of financial velocity and system health is available. What do you wish to audit?";
            default:
                return t('ai.init.default') || "BIN GROUP Sovereign AI Initialized. How can I assist you today?";
        }
    };

    const getQuickActions = () => {
        const actions = [];
        switch (role?.toUpperCase()) {
            case 'TENANT':
                actions.push({ label: 'Check SOS Status', icon: <AlertCircle size={14} /> });
                actions.push({ label: 'Maintenance Tips', icon: <Wrench size={14} /> });
                break;
            case 'TECHNICIAN':
                actions.push({ label: 'Mission Guidance', icon: <ShieldCheck size={14} /> });
                actions.push({ label: 'Route Help', icon: <Navigation size={14} /> });
                break;
            case 'OWNER':
                actions.push({ label: 'Audit ROI', icon: <TrendingUp size={14} /> });
                actions.push({ label: 'Property Health', icon: <Building2 size={14} /> });
                break;
            case 'ADMIN':
                actions.push({ label: 'Queue Summary', icon: <Calendar size={14} /> });
                actions.push({ label: 'System Alerts', icon: <ShieldCheck size={14} /> });
                break;
        }
        return actions;
    };

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{ id: '1', text: getInitialMessage(), sender: 'ai', timestamp: new Date() }]);
        }
    }, [isOpen]);

    const handleSend = async (textOverride?: string) => {
        const text = textOverride || inputValue;
        if (!text.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsTyping(true);

        try {
            const getAiGuidance = httpsCallable(functions, 'getMissionGuidance');
            const result = await getAiGuidance({ input: text, role });
            const data = result.data as { guidance: string };
            
            const aiMsg: Message = { id: Date.now().toString(), text: data.guidance, sender: 'ai', timestamp: new Date() };
            setMessages(prev => [...prev, aiMsg]);
        } catch (err: any) {
            let errorText = "The Sovereign Engine is momentarily offline. Synchronizing with headquarters...";
            if (err.code === 'resource-exhausted' || err.message?.includes('Limit Reached')) {
                errorText = "AI Operational Limit Reached (20/24h). Please contact BIN GROUP Admin for credential escalation.";
            }
            
            const aiMsg: Message = { id: Date.now().toString(), text: errorText, sender: 'ai', timestamp: new Date() };
            setMessages(prev => [...prev, aiMsg]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <>
            <Zoom in={true}>
                <Fab 
                    onClick={() => setIsOpen(!isOpen)}
                    sx={{ 
                        position: 'fixed', bottom: 32, right: isRTL ? 'auto' : 32, left: isRTL ? 32 : 'auto',
                        bgcolor: binThemeTokens.gold, color: '#000', '&:hover': { bgcolor: '#E6C77A' },
                        boxShadow: `0 10px 30px ${alpha(binThemeTokens.gold, 0.4)}`, zIndex: 2000
                    }}
                >
                    {isOpen ? <X /> : <Sparkles />}
                </Fab>
            </Zoom>

            <Fade in={isOpen}>
                <Paper sx={{ 
                    position: 'fixed', bottom: 100, right: isRTL ? 'auto' : 32, left: isRTL ? 32 : 'auto',
                    width: { xs: 'calc(100vw - 64px)', sm: 400 }, height: 550, zIndex: 2000,
                    bgcolor: '#0B0B0C', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6,
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    boxShadow: '0 40px 100px rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)',
                    direction: isRTL ? 'rtl' : 'ltr'
                }}>
                    {/* Header */}
                    <Box sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.05), borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: binThemeTokens.gold, color: '#000' }}><Bot size={20} /></Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle1" fontWeight="950" color="#FFF">SOVEREIGN AI</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 800 }}>{role?.toUpperCase()} ASSISTANT</Typography>
                        </Box>
                        <IconButton size="small" onClick={() => setIsOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)' }}><X /></IconButton>
                    </Box>

                    {/* Messages Area */}
                    <Box ref={scrollRef} sx={{ flexGrow: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        {messages.map((msg) => (
                            <Box key={msg.id} sx={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                                <Paper sx={{ 
                                    p: 2, borderRadius: 4, 
                                    bgcolor: msg.sender === 'user' ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                    color: msg.sender === 'user' ? '#000' : '#FFF',
                                    border: msg.sender === 'user' ? 'none' : '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.6 }}>{msg.text}</Typography>
                                </Paper>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', mt: 0.5, display: 'block', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            </Box>
                        ))}
                        {isTyping && (
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <CircularProgress size={12} sx={{ color: binThemeTokens.gold }} />
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>Sovereign AI Thinking...</Typography>
                            </Box>
                        )}
                    </Box>

                    {/* Quick Actions */}
                    <Box sx={{ p: 1.5, display: 'flex', gap: 1, overflowX: 'auto', bgcolor: 'rgba(255,255,255,0.02)', '&::-webkit-scrollbar': { display: 'none' } }}>
                        {getQuickActions().map((action, i) => (
                            <Chip 
                                key={i} 
                                label={action.label} 
                                icon={action.icon}
                                onClick={() => handleSend(action.label)}
                                sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF', borderColor: 'rgba(198,167,94,0.2)', border: '1px solid', '&:hover': { bgcolor: 'rgba(198,167,94,0.1)' } }} 
                            />
                        ))}
                    </Box>

                    {/* Input Area */}
                    <Box sx={{ p: 2, borderTop: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, bgcolor: 'rgba(255,255,255,0.02)' }}>
                        <Stack direction="row" spacing={1}>
                            <TextField 
                                fullWidth 
                                size="small" 
                                placeholder={t('ai.directive_placeholder') || "Type your directive..."} 
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                sx={{ 
                                    '& .MuiOutlinedInput-root': { borderRadius: 100, bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' },
                                    '& fieldset': { borderColor: 'rgba(198,167,94,0.2)' },
                                    '& input': { textAlign: isRTL ? 'right' : 'left' }
                                }}
                            />
                            <IconButton onClick={() => handleSend()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', '&:hover': { bgcolor: '#E6C77A' } }}>
                                <Send size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        </Stack>
                    </Box>
                </Paper>
            </Fade>
        </>
    );
};

export default SovereignAiBox;
