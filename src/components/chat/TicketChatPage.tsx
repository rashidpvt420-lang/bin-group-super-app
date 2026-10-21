import React, { useState, useEffect, useRef } from 'react';
import { Alert, Box, Typography, Paper, Stack, TextField, IconButton, CircularProgress, Button } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import { db, doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export type TicketChatRole = 'tenant' | 'owner' | 'technician';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const ids = (values: unknown[]) => values.map((value) => String(value || '').trim()).filter(Boolean);

// Client-side participant check (Firestore rules remain the authority).
export const participantOwnsTicket = (role: TicketChatRole, ticket: any, user: any) => {
    if (!ticket || !user?.uid) return false;
    const email = normalizeEmail(user.email);
    if (role === 'technician') {
        return ids([ticket.assignedTechnicianId, ticket.technicianId, ticket.techId, ticket.technicianUid, ticket.assignedTechId]).includes(user.uid);
    }
    if (role === 'owner') {
        if (ids([ticket.ownerId, ticket.ownerUid]).includes(user.uid)) return true;
        return Boolean(email && normalizeEmail(ticket.ownerEmail) === email);
    }
    if (ids([ticket.tenantId, ticket.tenantUid, ticket.userId, ticket.authUid, ticket.createdByUid]).includes(user.uid)) return true;
    return Boolean(email && normalizeEmail(ticket.tenantEmail) === email);
};

const COPY = {
    en: {
        notFound: 'Maintenance request not found.',
        notLinked: 'This maintenance chat is not linked to your account.',
        unavailable: 'This maintenance chat is unavailable.',
        loadFailed: 'Messages could not be loaded. Check your connection and try again.',
        sendFailed: 'Message was not sent. Please retry.',
        empty: 'No messages yet. Send the first message.',
        placeholder: 'Type your message...',
        send: 'Send message',
        back: 'Back',
        chat: 'Chat',
        technician: 'Technician', tenant: 'Tenant', team: 'BIN GROUP team',
    },
    ar: {
        notFound: 'لم يتم العثور على طلب الصيانة.',
        notLinked: 'هذه المحادثة غير مرتبطة بحسابك.',
        unavailable: 'هذه المحادثة غير متاحة.',
        loadFailed: 'تعذر تحميل الرسائل. تحقق من الاتصال وحاول مرة أخرى.',
        sendFailed: 'لم يتم إرسال الرسالة. يرجى المحاولة مرة أخرى.',
        empty: 'لا توجد رسائل بعد. أرسل أول رسالة.',
        placeholder: 'اكتب رسالتك...',
        send: 'إرسال الرسالة',
        back: 'رجوع',
        chat: 'محادثة',
        technician: 'الفني', tenant: 'المستأجر', team: 'فريق BIN GROUP',
    },
};

const BACK_ROUTE: Record<TicketChatRole, (id: string) => string> = {
    tenant: (id) => `/tenant/ticket/${id}`,
    owner: (id) => `/owner/ticket/${id}`,
    technician: (id) => `/technician/job/${id}`,
};

export default function TicketChatPage({ role }: { role: TicketChatRole }) {
    const { ticketId } = useParams();
    const { user } = useRole();
    const { language, isRTL } = useLanguage();
    const c = language === 'ar' ? COPY.ar : COPY.en;
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
                const snap = await getDoc(doc(db, 'maintenanceTickets', ticketId));
                if (!snap.exists()) throw new Error(c.notFound);
                const row = { id: snap.id, ...snap.data() };
                if (!participantOwnsTicket(role, row, user)) throw new Error(c.notLinked);
                if (!cancelled) setTicket(row);
            } catch (error: any) {
                console.warn('[TicketChat] Ticket access refused:', { role, code: error?.code, message: error?.message });
                if (!cancelled) {
                    setTicket(null);
                    setAccessError(error?.message || c.unavailable);
                    setLoading(false);
                }
            }
        };
        void fetchTicket();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticketId, user?.uid, user?.email, role]);

    useEffect(() => {
        if (!ticket?.id) return undefined;
        const q = query(collection(db, `maintenanceTickets/${ticket.id}/messages`), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() })));
            setMessageError('');
            setLoading(false);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (error) => {
            console.warn('[TicketChat] Message stream unavailable:', error);
            setMessages([]);
            setMessageError(c.loadFailed);
            setLoading(false);
        });
        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticket?.id]);

    const handleSendMessage = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newMessage.trim() || !ticket?.id || !user) return;
        const text = newMessage.trim().slice(0, 2000);
        setNewMessage('');
        setMessageError('');
        try {
            await addDoc(collection(db, `maintenanceTickets/${ticket.id}/messages`), {
                senderUid: user.uid,
                senderRole: role,
                senderName: String(user.displayName || (role === 'technician' ? 'Technician' : role === 'owner' ? 'Owner' : 'Resident')).slice(0, 80),
                message: text,
                createdAt: serverTimestamp(),
            });
        } catch (error) {
            console.error('[TicketChat] Send failed:', error);
            setNewMessage(text);
            setMessageError(c.sendFailed);
        }
    };

    const backTo = ticketId ? BACK_ROUTE[role](ticketId) : `/${role}`;
    if (loading && !accessError) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.goldText }} /></Box>;
    if (accessError) return (
        <Stack spacing={2} sx={{ py: 5 }}>
            <Alert severity="error">{accessError}</Alert>
            <Button variant="outlined" onClick={() => navigate(backTo)} sx={{ alignSelf: 'flex-start', color: binThemeTokens.goldText, borderColor: binThemeTokens.gold }}>{c.back}</Button>
        </Stack>
    );

    const counterpart = role === 'technician'
        ? (ticket?.tenantName || c.tenant)
        : (ticket?.assignedTechnicianName || c.technician);

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Button size="small" onClick={() => navigate(backTo)} sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}>{c.back}</Button>
                <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.textPrimary }}>
                    {c.chat}: {counterpart}
                </Typography>
            </Stack>
            {messageError && <Alert severity="warning" sx={{ mb: 2 }}>{messageError}</Alert>}

            <Paper sx={{ flex: 1, p: 3, mb: 3, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 6, overflowY: 'auto' }}>
                <Stack spacing={2}>
                    {messages.map((message) => {
                        const isMe = message.senderUid === user?.uid;
                        return (
                            <Box key={message.id} sx={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                {!isMe && <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, marginInlineStart: 1 }}>{message.senderName || c.team}</Typography>}
                                <Paper elevation={0} sx={{
                                    p: 2,
                                    bgcolor: isMe ? binThemeTokens.gold : '#F3F4F6',
                                    color: binThemeTokens.textPrimary,
                                    borderRadius: 4,
                                    borderEndEndRadius: isMe ? 4 : 16,
                                    borderEndStartRadius: isMe ? 16 : 4,
                                }}>
                                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.message || message.text}</Typography>
                                </Paper>
                            </Box>
                        );
                    })}
                    {messages.length === 0 && !messageError && (
                        <Typography variant="body2" align="center" sx={{ mt: 10, color: binThemeTokens.textSecondary }}>{c.empty}</Typography>
                    )}
                    <div ref={messagesEndRef} />
                </Stack>
            </Paper>

            <form onSubmit={handleSendMessage}>
                <Paper sx={{ p: 1, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                    <TextField
                        fullWidth
                        placeholder={c.placeholder}
                        variant="standard"
                        value={newMessage}
                        inputProps={{ maxLength: 2000, 'aria-label': c.placeholder, dir: 'auto' }}
                        onChange={(event) => setNewMessage(event.target.value)}
                        sx={{ px: 2, '& .MuiInput-root': { color: binThemeTokens.textPrimary }, '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' } }}
                    />
                    <IconButton type="submit" aria-label={c.send} disabled={!newMessage.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', '&:hover': { bgcolor: '#b4954e' }, '&.Mui-disabled': { bgcolor: '#E5E7EB' }, transform: isRTL ? 'scaleX(-1)' : undefined }}>
                        <Send size={20} />
                    </IconButton>
                </Paper>
            </form>
        </Box>
    );
}
