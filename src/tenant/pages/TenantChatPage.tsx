import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, Stack, TextField, IconButton, CircularProgress } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { db, doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TenantChatPage() {
    const { ticketId } = useParams();
    const { user } = useRole();
    const { lang, isRTL } = useLanguage();
    const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
    const navigate = useNavigate();
    const [ticket, setTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchTicket = async () => {
            if (!ticketId || !user?.uid) return;
            const docRef = doc(db, 'maintenanceTickets', ticketId);
            const snap = await getDoc(docRef);
            if (snap.exists() && snap.data().tenantId === user.uid) {
                setTicket({ id: snap.id, ...snap.data() });
            } else {
                alert(label('Unauthorized', 'غير مصرّح'));
                navigate('/tenant/tickets');
            }
        };
        fetchTicket();
    }, [ticketId, user]);

    useEffect(() => {
        if (!ticketId) return;
        const q = query(collection(db, `maintenanceTickets/${ticketId}/messages`), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
        return () => unsubscribe();
    }, [ticketId]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !ticketId || !user) return;
        const text = newMessage;
        setNewMessage('');
        try {
            await addDoc(collection(db, `maintenanceTickets/${ticketId}/messages`), {
                senderUid: user.uid,
                senderRole: 'tenant',
                senderName: user.displayName || 'Resident',
                message: text,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box sx={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                {label('Chat', 'محادثة')}: {ticket?.assignedTechnicianName || label('Technician', 'الفني')}
            </Typography>

            <Paper sx={{ flex: 1, p: 3, mb: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflowY: 'auto' }}>
                <Stack spacing={2}>
                    {messages.map(msg => {
                        const isMe = msg.senderUid === user?.uid;
                        return (
                            <Box key={msg.id} sx={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                {!isMe && <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>{msg.senderName}</Typography>}
                                <Paper sx={{ 
                                    p: 2, 
                                    bgcolor: isMe ? binThemeTokens.gold : 'rgba(255,255,255,0.05)', 
                                    color: isMe ? '#000' : '#FFF',
                                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
                                }}>
                                    <Typography variant="body1">{msg.message}</Typography>
                                </Paper>
                            </Box>
                        );
                    })}
                    {messages.length === 0 && (
                        <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 10 }}>
                            {label('Send a message to the technician.', 'أرسل رسالة إلى الفني.')}
                        </Typography>
                    )}
                    <div ref={messagesEndRef} />
                </Stack>
            </Paper>

            <form onSubmit={handleSendMessage}>
                <Paper sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                    <TextField
                        fullWidth
                        placeholder={label('Type your message...', 'اكتب رسالتك...')}
                        variant="standard"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        sx={{ px: 2, '& .MuiInput-root': { color: '#FFF' }, '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' } }}
                    />
                    <IconButton type="submit" disabled={!newMessage.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', '&:hover': { bgcolor: '#b4954e' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                        <Send size={20} />
                    </IconButton>
                </Paper>
            </form>
        </Box>
    );
}
