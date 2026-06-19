import React from 'react';
import { Alert, Box, Button, Chip, Divider, Grid, MenuItem, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { addDoc, auth, collection, db, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';

type PortalRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'staff';

type Thread = {
  id: string;
  title?: string;
  channel?: string;
  status?: string;
  priority?: string;
  sourceRole?: string;
  createdByEmail?: string;
  createdByName?: string;
  recipientHint?: string;
  context?: string;
  propertyId?: string;
  unitId?: string;
  ticketId?: string;
  lastMessage?: string;
  createdAt?: any;
  updatedAt?: any;
};

type Message = {
  id: string;
  body?: string;
  senderId?: string;
  senderRole?: string;
  senderEmail?: string;
  senderName?: string;
  createdAt?: any;
};

const CHANNEL_LABELS: Record<string, string> = {
  company_ceo: 'CEO / Founder',
  admin_support: 'Admin Support',
  owner_to_tenant: 'Owner ⇄ Tenant',
  owner_to_technician: 'Owner ⇄ Technician',
  majlis_staff: 'Government / Majlis Staff',
  maintenance_chat: 'Maintenance Chat',
  feature_suggestion: 'Feature Suggestion',
  dashboard_issue: 'Dashboard Issue',
};

const ts = (value: any) => value?.toDate?.()?.toLocaleString?.() || 'Pending timestamp';

export default function BinConnectInboxPage({ role, dark = false }: { role: PortalRole; dark?: boolean }) {
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [reply, setReply] = React.useState('');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const uid = auth.currentUser?.uid || '';
  const email = auth.currentUser?.email || '';
  const displayName = auth.currentUser?.displayName || email || role;

  React.useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'binConnectThreads'), where('participantIds', 'array-contains', uid), limit(100));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((item) => ({ id: item.id, ...(item.data() as any) }));
      rows.sort((a, b) => (b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0));
      setThreads(rows);
      if (!selectedId && rows[0]) setSelectedId(rows[0].id);
    }, (error) => setNotice(error.message || 'Could not load BIN Connect conversations.'));
  }, [uid, selectedId]);

  const selected = React.useMemo(() => threads.find((thread) => thread.id === selectedId), [threads, selectedId]);

  React.useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }
    const q = query(collection(db, 'binConnectThreads', selectedId, 'messages'), orderBy('createdAt', 'asc'), limit(120));
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((item) => ({ id: item.id, ...(item.data() as any) })));
    }, (error) => setNotice(error.message || 'Could not load messages.'));
  }, [selectedId]);

  const filteredThreads = React.useMemo(() => channelFilter === 'all' ? threads : threads.filter((thread) => thread.channel === channelFilter), [threads, channelFilter]);

  const sendReply = async () => {
    if (!uid || !selectedId || !reply.trim()) return;
    try {
      setBusy(true);
      setNotice('');
      const text = reply.trim();
      await addDoc(collection(db, 'binConnectThreads', selectedId, 'messages'), {
        body: text,
        senderId: uid,
        senderRole: role,
        senderEmail: email,
        senderName: displayName,
        createdAt: serverTimestamp(),
        system: false,
      });
      await updateDoc(doc(db, 'binConnectThreads', selectedId), {
        lastMessage: text.slice(0, 240),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: selected?.status === 'resolved' ? 'open' : (selected?.status || 'open'),
      });
      setReply('');
      setNotice('Reply sent.');
    } catch (error: any) {
      setNotice(error?.message || 'Reply failed.');
    } finally {
      setBusy(false);
    }
  };

  const closeThread = async () => {
    if (!selectedId) return;
    try {
      await updateDoc(doc(db, 'binConnectThreads', selectedId), { status: 'resolved', updatedAt: serverTimestamp() });
      setNotice('Conversation marked resolved.');
    } catch (error: any) {
      setNotice(error?.message || 'Could not update conversation.');
    }
  };

  return (
    <Box sx={{ color: dark ? '#fff' : binThemeTokens.textPrimary }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>BIN CONNECT</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950 }}>My Conversations</Typography>
          <Typography sx={{ color: dark ? 'rgba(255,255,255,.62)' : binThemeTokens.textSecondary, maxWidth: 880, mt: 1 }}>Continue your CEO/admin, Majlis staff, maintenance, feature suggestion, dashboard issue, owner, tenant, technician, or broker conversations from one inbox.</Typography>
        </Box>
        <Chip label={`${threads.length} conversations`} sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, bgcolor: alpha(binThemeTokens.gold, .12), color: binThemeTokens.goldHover, fontWeight: 950 }} />
      </Stack>

      {notice && <Alert severity={notice.includes('sent') || notice.includes('resolved') ? 'success' : 'warning'} sx={{ mb: 3 }}>{notice}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ borderRadius: 4, overflow: 'hidden', bgcolor: dark ? 'rgba(255,255,255,.045)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,.10)' : binThemeTokens.border}` }}>
            <Box sx={{ p: 2 }}>
              <TextField select fullWidth size="small" label="Filter" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                <MenuItem value="all">All channels</MenuItem>
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Box>
            <Divider />
            <Stack sx={{ maxHeight: '65vh', overflow: 'auto' }}>
              {filteredThreads.length === 0 ? <Typography sx={{ p: 3, color: dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary }}>No conversations yet. Use the floating BIN Connect button to start one.</Typography> : filteredThreads.map((thread) => {
                const active = thread.id === selectedId;
                return <Box key={thread.id} onClick={() => setSelectedId(thread.id)} sx={{ p: 2, cursor: 'pointer', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.08)' : binThemeTokens.border}`, bgcolor: active ? alpha(binThemeTokens.gold, .14) : 'transparent' }}>
                  <Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={950}>{thread.title || 'BIN Connect'}</Typography><Chip size="small" label={thread.status || 'open'} /></Stack>
                  <Typography variant="caption" sx={{ color: dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary }}>{CHANNEL_LABELS[thread.channel || ''] || thread.channel || 'chat'} · {ts(thread.updatedAt || thread.createdAt)}</Typography>
                  <Typography variant="body2" sx={{ mt: 1, color: dark ? 'rgba(255,255,255,.72)' : binThemeTokens.textSecondary }}>{thread.lastMessage || 'Open conversation'}</Typography>
                </Box>;
              })}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, borderRadius: 4, minHeight: '68vh', bgcolor: dark ? 'rgba(255,255,255,.045)' : '#fff', border: `1px solid ${dark ? 'rgba(255,255,255,.10)' : binThemeTokens.border}` }}>
            {!selected ? <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 420, color: dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary }}><MessageSquare size={44} /><Typography sx={{ mt: 2 }}>Select a conversation.</Typography></Stack> : <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography variant="h5" fontWeight={950}>{selected.title || 'BIN Connect'}</Typography>
                  <Typography variant="body2" sx={{ color: dark ? 'rgba(255,255,255,.58)' : binThemeTokens.textSecondary }}>{CHANNEL_LABELS[selected.channel || ''] || selected.channel} · {selected.status || 'open'}</Typography>
                  {selected.context && <Typography variant="body2" sx={{ color: binThemeTokens.goldHover, mt: .6 }}>Context: {selected.context}</Typography>}
                  {(selected.propertyId || selected.unitId || selected.ticketId) && <Typography variant="caption" sx={{ color: dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary }}>Property: {selected.propertyId || 'N/A'} · Unit: {selected.unitId || 'N/A'} · Ticket: {selected.ticketId || 'N/A'}</Typography>}
                </Box>
                <Button onClick={closeThread} startIcon={<CheckCircle2 size={16} />} sx={{ alignSelf: 'flex-start', color: binThemeTokens.goldHover, fontWeight: 950 }}>Mark resolved</Button>
              </Stack>
              <Divider />
              <Stack spacing={1.4} sx={{ maxHeight: 380, overflow: 'auto', pr: 1 }}>
                {messages.map((item) => {
                  const mine = item.senderId === uid;
                  return <Box key={item.id} sx={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%', p: 1.6, borderRadius: 3, bgcolor: mine ? alpha(binThemeTokens.gold, .16) : (dark ? 'rgba(255,255,255,.06)' : '#F8F9FB'), border: mine ? `1px solid ${alpha(binThemeTokens.gold, .28)}` : `1px solid ${dark ? 'rgba(255,255,255,.08)' : binThemeTokens.border}` }}>
                    <Typography variant="caption" sx={{ color: mine ? binThemeTokens.goldHover : (dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary), fontWeight: 900 }}>{item.senderName || item.senderEmail || item.senderRole || 'sender'} · {ts(item.createdAt)}</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{item.body}</Typography>
                  </Box>;
                })}
              </Stack>
              <Divider />
              <TextField fullWidth multiline minRows={3} value={reply} onChange={(event) => setReply(event.target.value)} label="Reply" placeholder="Continue this conversation..." />
              <Button disabled={busy || !reply.trim()} onClick={sendReply} variant="contained" endIcon={<Send size={16} />} sx={{ alignSelf: 'flex-end', bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>{busy ? 'Sending...' : 'Send reply'}</Button>
            </Stack>}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
