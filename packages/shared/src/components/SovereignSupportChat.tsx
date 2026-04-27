import React, { useState, useEffect, useRef } from 'react';
import { 
    Box, Paper, Typography, TextField, IconButton, Stack, 
    Avatar, alpha, CircularProgress, Divider, Drawer, Fab
} from '@mui/material';
import { Send, X, MessageCircle, ShieldCheck, User, Paperclip, Search } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { binThemeTokens } from '../theme/binGroupTheme';

export interface SovereignSupportChatProps {
    role: 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';
    userId?: string; // If admin, which user to chat with
}

export const SovereignSupportChat: React.FC<SovereignSupportChatProps> = ({ role, userId }) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const currentUser = auth.currentUser;
    const targetUserId = role === 'admin' ? userId : currentUser?.uid;

    useEffect(() => {
        if (!targetUserId || !open) return;

        const q = query(
            collection(db, 'support_chats'),
            where('chatId', '==', targetUserId),
            orderBy('createdAt', 'asc'),
            limit(100)
        );

        const unsub = onSnapshot(q, (snap) => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => unsub();
    }, [targetUserId, open]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !targetUserId || !currentUser) return;

        const text = input;
        setInput('');

        try {
            await addDoc(collection(db, 'support_chats'), {
                chatId: targetUserId,
                senderId: currentUser.uid,
                senderRole: role,
                text,
                createdAt: serverTimestamp(),
                read: false
            });
        } catch (err) {
            console.error("Chat failure:", err);
        }
    };

    const renderContent = () => (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0B0B0C' }}>
            <Box sx={{ p: 3, borderBottom: '1px solid rgba(198,167,94,0.2)', bgcolor: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar sx={{ bgcolor: binThemeTokens.gold }}>
                        <ShieldCheck color="#000" size={20} />
                    </Avatar>
                    <Box>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold }}>
                            {role === 'admin' ? 'USER SUPPORT' : 'SOVEREIGN SUPPORT'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                            REAL-TIME COMMAND LINK
                        </Typography>
                    </Box>
                </Stack>
                <IconButton onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)' }}>
                    <X size={20} />
                </IconButton>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {messages.map((msg) => (
                    <Box key={msg.id} sx={{ alignSelf: msg.senderId === currentUser?.uid ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                        <Paper sx={{ 
                            p: 2, 
                            bgcolor: msg.senderId === currentUser?.uid ? 'rgba(198,167,94,0.1)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${msg.senderId === currentUser?.uid ? binThemeTokens.gold : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: msg.senderId === currentUser?.uid ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
                        }}>
                            <Typography variant="body2" sx={{ color: '#FFF' }}>{msg.text}</Typography>
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.3, fontSize: '0.6rem' }}>
                                {msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Typography>
                        </Paper>
                    </Box>
                ))}
                <div ref={scrollRef} />
            </Box>

            <Box sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <TextField
                    fullWidth
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    InputProps={{
                        endAdornment: (
                            <IconButton onClick={handleSend} sx={{ color: binThemeTokens.gold }}>
                                <Send size={18} />
                            </IconButton>
                        )
                    }}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            bgcolor: 'rgba(255,255,255,0.02)',
                            borderRadius: 2
                        }
                    }}
                />
            </Box>
        </Box>
    );

    return (
        <>
            <Fab 
                onClick={() => setOpen(true)}
                sx={{ 
                    position: 'fixed', bottom: 30, right: role === 'admin' ? 30 : 100, 
                    bgcolor: '#FFF', color: '#000',
                    '&:hover': { bgcolor: binThemeTokens.gold }
                }}
            >
                <MessageCircle />
            </Fab>
            <Drawer anchor="right" open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: 350, borderLeft: '1px solid rgba(255,255,255,0.05)' } }}>
                {renderContent()}
            </Drawer>
        </>
    );
};
