import React, { useState, useEffect, useRef } from 'react';
import { Container, Typography, Paper, Stack, TextField, IconButton, CircularProgress, Grid, List, ListItem, ListItemText, Divider, Box, alpha } from '@mui/material';
import { Send, ArrowLeft } from 'lucide-react';
import { db, doc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, updateDoc } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import SafeIcon from '../../components/SafeIcon';
import { useAuth } from '../../context/AuthContext';

export default function MessagesPage() {
    const { isRTL } = useLanguage();
    const { user } = useAuth();
    const [conversations, setConversations] = useState<any[]>([]);
    const [selectedConv, setSelectedConv] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Listen to all active conversations
        const q = query(collection(db, 'conversations'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            list.sort((a: any, b: any) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
            setConversations(list);
            setLoading(false);
        }, (err) => {
            console.warn('Conversations listener error:', err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!selectedConv?.id) {
            setMessages([]);
            return;
        }

        const q = query(
            collection(db, `conversations/${selectedConv.id}/messages`),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (err) => {
            console.warn('Messages listener error:', err);
        });

        return () => unsubscribe();
    }, [selectedConv?.id]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConv?.id || !user?.uid) return;
        const body = newMessage;
        setNewMessage('');
        try {
            await addDoc(collection(db, `conversations/${selectedConv.id}/messages`), {
                senderUid: user.uid,
                senderRole: 'admin',
                senderEmail: user.email || '',
                body,
                createdAt: serverTimestamp()
            });

            await updateDoc(doc(db, 'conversations', selectedConv.id), {
                lastMessageAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr', height: 'calc(100vh - 120px)' }}>
            <Grid container spacing={3} sx={{ height: '100%' }}>
                {/* Inbox Sidebar */}
                {(!selectedConv || !isMobileView()) && (
                    <Grid item xs={12} md={4} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="h6" color="#FFF" fontWeight="black" sx={{ mb: 3 }}>OPERATIONS INBOX</Typography>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 2 }} />
                            <List sx={{ flex: 1, overflowY: 'auto' }}>
                                {conversations.map(conv => (
                                    <ListItem
                                        button
                                        key={conv.id}
                                        onClick={() => setSelectedConv(conv)}
                                        sx={{
                                            borderRadius: 2,
                                            mb: 1,
                                            bgcolor: selectedConv?.id === conv.id ? alpha(binThemeTokens.gold, 0.08) : 'transparent',
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }
                                        }}
                                    >
                                        <ListItemText
                                            primary={`Thread ${conv.id.substring(0, 6)}`}
                                            primaryTypographyProps={{ fontWeight: 900, color: selectedConv?.id === conv.id ? binThemeTokens.gold : '#FFF' }}
                                            secondary={`Property: ${conv.propertyId} (${conv.type})`}
                                            secondaryTypographyProps={{ color: 'textSecondary', fontSize: '0.75rem' }}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Paper>
                    </Grid>
                )}

                {/* Chat Details */}
                {selectedConv && (
                    <Grid item xs={12} md={8} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                                {isMobileView() && (
                                    <IconButton onClick={() => setSelectedConv(null)} sx={{ color: '#FFF' }}>
                                        <SafeIcon icon={ArrowLeft} size={20} />
                                    </IconButton>
                                )}
                                <Typography variant="h6" fontWeight="black" color="#FFF">
                                    Conversation Details · {selectedConv.propertyId}
                                </Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)', mb: 3 }} />

                            <Box sx={{ flex: 1, overflowY: 'auto', mb: 3, pr: 1 }}>
                                <Stack spacing={2}>
                                    {messages.map(msg => {
                                        const isMe = msg.senderRole === 'admin';
                                        return (
                                            <Box key={msg.id} sx={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                                                <Paper sx={{
                                                    p: 2,
                                                    bgcolor: isMe ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                                    color: isMe ? '#000' : '#FFF',
                                                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
                                                }}>
                                                    <Typography variant="body1">{msg.body}</Typography>
                                                </Paper>
                                            </Box>
                                        );
                                    })}
                                    <div ref={messagesEndRef} />
                                </Stack>
                            </Box>

                            <form onSubmit={handleSendMessage}>
                                <Paper sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                                    <TextField
                                        fullWidth
                                        placeholder="Type your reply..."
                                        variant="standard"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        sx={{ px: 2, '& .MuiInput-root': { color: '#FFF' }, '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' } }}
                                    />
                                    <IconButton type="submit" disabled={!newMessage.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', '&:hover': { bgcolor: '#b4954e' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                        <SafeIcon icon={Send} size={20} />
                                    </IconButton>
                                </Paper>
                            </form>
                        </Paper>
                    </Grid>
                )}
            </Grid>
        </Container>
    );
}

function isMobileView() {
    return window.innerWidth < 900;
}
