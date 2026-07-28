import React, { useState, useEffect, useRef } from 'react';
import { Alert, Box, Typography, Paper, Stack, TextField, IconButton, CircularProgress, Button } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { db, doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const technicianOwnsTicket = (ticket: any, uid?: string) => {
    if (!ticket || !uid) return false;
    return [ticket.assignedTechnicianId, ticket.technicianId, ticket.techId, ticket.technicianUid, ticket.assignedTechId]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .includes(uid);
};

export default function TechnicianChatPage() {
    const { ticketId } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [accessError, setAccessError] = useState('');
    const [messageError, setMessageError] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchTicket = async () => {
            if (!ticketId || !user?.uid) return;
            setLoading(true);
            setAccessError('');
            try {
                const docRef = doc(db, 'maintenanceTickets', ticketId);
                const snap = await getDoc(docRef);
                if (!snap.exists()) throw new Error('Assigned mission not found.');
                const row = { id: snap.id, ...snap.data() };
                if (!technicianOwnsTicket(row, user.uid)) throw new Error('This maintenance chat is not assigned to your Technician account.');
                if (!cancelled) setTicket(row);
            } catch (error: any) {
                console.warn('[TechnicianChat] Ticket access refused:', { code: error?.code, message: error?.message });
                if (!cancelled) {
                    setTicket(null);
                    setAccessError(error?.message || 'This mission chat is unavailable.');
                    setLoading(false);
                }
            }
        };
        void fetchTicket();
        return () => { cancelled = true; };
    }, [ticketId, user?.uid]);

    useEffect(() => {
        if (!ticket?.id) return undefined;
        const q = query(collection(db, `maintenanceTickets/${ticket.id}/messages`), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() })));
            setMessageError('');
            setLoading(false);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (error) => {
            console.warn('[TechnicianChat] Message stream unavailable:', error);
            setMessages([]);
            setMessageError('Messages could not be loaded. Check your connection or ask dispatch to verify the mission assignment.');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [ticket?.id]);

    const handleSendMessage = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newMessage.trim() || !ticket?.id || !user) return;
        const text = newMessage.trim();
        setNewMessage('');
        setMessageError('');
        try {
            await addDoc(collection(db, `maintenanceTickets/${ticket.id}/messages`), {
                senderUid: user.uid,
                senderRole: 'technician',
                senderName: user.displayName || 'Technician',
                message: text,
                createdAt: serverTimestamp(),
            });
        } catch (error) {
            console.error('[TechnicianChat] Send failed:', error);
            setNewMessage(text);
            setMessageError('Message was not sent. Retry after the connection or mission permissions recover.');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (accessError) return (
        <Stack spacing={2} sx={{ py: 5 }}>
            <Alert severity="error">{accessError}</Alert>
            <Button variant="outlined" onClick={() => navigate('/technician/jobs')} sx={{ alignSelf: 'flex-start', color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>Back to assigned jobs</Button>
        </Stack>
    );

    return (
        <Box sx={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                Chat: {ticket?.tenantName || 'Tenant'}
            </Typography>
            {messageError && <Alert severity="warning" sx={{ mb: 2 }}>{messageError}</Alert>}

            <Paper sx={{ flex: 1, p: 3, mb: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflowY: 'auto' }}>
                <Stack spacing={2}>
                    {messages.map((message) => {
                        const isMe = message.senderUid === user?.uid;
                        return (
                            <Box key={message.id} sx={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                {!isMe && <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>{message.senderName}</Typography>}
                                <Paper sx={{
                                    p: 2,
                                    bgcolor: isMe ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                    color: isMe ? '#000' : '#FFF',
                                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                }}>
                                    <Typography variant="body1">{message.message}</Typography>
                                </Paper>
                            </Box>
                        );
                    })}
                    {messages.length === 0 && !messageError && (
                        <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 10 }}>
                            Send a message to the tenant.
                        </Typography>
                    )}
                    <div ref={messagesEndRef} />
                </Stack>
            </Paper>

            <form onSubmit={handleSendMessage}>
                <Paper sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                    <TextField
                        fullWidth
                        placeholder="Type your message..."
                        variant="standard"
                        value={newMessage}
                        onChange={(event) => setNewMessage(event.target.value)}
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
