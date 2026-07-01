import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, Stack, TextField, IconButton, CircularProgress, Button } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ChevronLeft, AlertCircle } from 'lucide-react';
import { db, doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerChatPage() {
    const { ticketId } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();
    const { tx } = useLanguage();
    const [ticket, setTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [unauthorized, setUnauthorized] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchTicket = async () => {
            if (!ticketId || !user?.uid) return;
            try {
                const snap = await getDoc(doc(db, 'maintenanceTickets', ticketId));
                if (
                    snap.exists() &&
                    (snap.data().ownerId === user.uid ||
                        snap.data().ownerUid === user.uid ||
                        snap.data().ownerEmail === user.email)
                ) {
                    setTicket({ id: snap.id, ...snap.data() });
                } else {
                    setUnauthorized(true);
                }
            } catch (err) {
                console.error('[OwnerChat] ticket load failed:', err);
                setUnauthorized(true);
            } finally {
                setLoading(false);
            }
        };
        fetchTicket();
    }, [ticketId, user]);

    useEffect(() => {
        // Only subscribe to messages after the ticket is confirmed to belong to this owner.
        if (!ticketId || !ticket) return;
        const q = query(collection(db, `maintenanceTickets/${ticketId}/messages`), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            },
            (err) => {
                console.error('[OwnerChat] messages listener error:', err);
            }
        );
        return () => unsubscribe();
    }, [ticketId, ticket]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !ticketId || !user) return;
        const text = newMessage;
        setNewMessage('');
        try {
            await addDoc(collection(db, `maintenanceTickets/${ticketId}/messages`), {
                senderUid: user.uid,
                senderRole: 'owner',
                senderName: user.displayName || 'Owner',
                message: text,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            console.error('[OwnerChat] send failed:', err);
        }
    };

    if (loading) return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    if (unauthorized) return (
        <Box sx={{ textAlign: 'center', py: 10 }}>
            <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
            <Typography variant="h6" color="#FFF" fontWeight="950">{tx('owner.chat.unauthorized', 'Unauthorized')}</Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                {tx('owner.chat.unauthorized_desc', 'This conversation does not belong to your account.')}
            </Typography>
            <Button onClick={() => navigate('/owner/tickets')} variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#FFF', fontWeight: 950 }}>
                {tx('owner.chat.back_to_tickets', 'Back to Tickets')}
            </Button>
        </Box>
    );

    return (
        <Box sx={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <IconButton onClick={() => navigate(`/owner/ticket/${ticketId}`)} sx={{ color: '#FFF' }}>
                    <ChevronLeft />
                </IconButton>
                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>
                    {tx('owner.chat.title', 'Chat')}: {ticket?.assignedTechnicianName || tx('owner.chat.technician', 'Technician')}
                </Typography>
            </Stack>

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
                            {tx('owner.chat.empty', 'Send a message to the technician.')}
                        </Typography>
                    )}
                    <div ref={messagesEndRef} />
                </Stack>
            </Paper>

            <form onSubmit={handleSendMessage}>
                <Paper sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                    <TextField
                        fullWidth
                        placeholder={tx('owner.chat.placeholder', 'Type your message...')}
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
