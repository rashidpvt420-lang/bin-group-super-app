import React from 'react';
import { Alert, Box, Button, Chip, Divider, Grid, MenuItem, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { CheckCircle2, Inbox, MessageSquare, Send } from 'lucide-react';
import { addDoc, collection, db, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';

type BinConnectThread = {
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
  lastMessage?: string;
  createdAt?: any;
};

type BinConnectMessage = {
  id: string;
  body?: string;
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

const statusOptions = ['open', 'in_review', 'assigned', 'resolved'];

const ts = (value: any) => value?.toDate?.()?.toLocaleString?.() || 'Pending timestamp';

export default function BinConnectInboxPage() {
  const { user } = useAuth();
  const [threads, setThreads] = React.useState<BinConnectThread[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [messages, setMessages] = React.useState<BinConnectMessage[]>([]);
  const [reply, setReply] = React.useState('');
  const [status, setStatus] = React.useState('open');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [notice, setNotice] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const q = query(collection(db, 'binConnectThreads'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((item) => ({ id: item.id, ...(item.data() as any) }));
      setThreads(rows);
      if (!selectedId && rows[0]) {
        setSelectedId(rows[0].id);
        setStatus(rows[0].status || 'open');
      }
    }, (error) => setNotice(error.message || 'Could not load BIN Connect threads.'));
  }, [selectedId]);

  const selected = React.useMemo(() => threads.find((thread) => thread.id === selectedId), [threads, selectedId]);

  React.useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return undefined;
    }
    const q = query(collection(db, 'binConnectThreads', selectedId, 'messages'), orderBy('createdAt', 'asc'), limit(100));
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((item) => ({ id: item.id, ...(item.data() as any) })));
    }, (error) => setNotice(error.message || 'Could not load BIN Connect messages.'));
  }, [selectedId]);

  React.useEffect(() => {
    setStatus(selected?.status || 'open');
  }, [selected?.id, selected?.status]);

  const filteredThreads = React.useMemo(() => {
    if (channelFilter === 'all') return threads;
    return threads.filter((thread) => thread.channel === channelFilter);
  }, [threads, channelFilter]);

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    try {
      setBusy(true);
      setNotice('');
      const text = reply.trim();
      await addDoc(collection(db, 'binConnectThreads', selectedId, 'messages'), {
        body: text,
        senderId: user?.uid,
        senderRole: user?.role || 'admin',
        senderEmail: user?.email || 'admin',
        senderName: user?.displayName || user?.email || 'BIN GROUP Admin',
        createdAt: serverTimestamp(),
        system: false,
      });
      await updateDoc(doc(db, 'binConnectThreads', selectedId), {
        lastMessage: text.slice(0, 240),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status,
        assignedAdminId: user?.uid || null,
      });
      setReply('');
      setNotice('Admin reply sent.');
    } catch (error: any) {
      setNotice(error?.message || 'Reply failed.');
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async () => {
    if (!selectedId) return;
    try {
      await updateDoc(doc(db, 'binConnectThreads', selectedId), {
        status,
        updatedAt: serverTimestamp(),
        assignedAdminId: user?.uid || null,
      });
      setNotice('Thread status updated.');
    } catch (error: any) {
      setNotice(error?.message || 'Status update failed.');
    }
  };

  const openCount = threads.filter((thread) => (thread.status || 'open') === 'open').length;
  const highCount = threads.filter((thread) => thread.priority === 'high').length;
  const suggestionCount = threads.filter((thread) => thread.channel === 'feature_suggestion').length;
  const majlisCount = threads.filter((thread) => thread.channel === 'majlis_staff').length;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#FFFFFF' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>BIN CONNECT</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: -1 }}>Admin Inbox</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 820, mt: 1 }}>Central command inbox for owner, tenant, technician, broker, Majlis/government-property staff, feature suggestion, and dashboard issue messages.</Typography>
        </Box>
        <Chip icon={<Inbox size={16} />} label={`${threads.length} total threads`} sx={{ bgcolor: alpha(binThemeTokens.gold, .12), color: binThemeTokens.gold, fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      {notice && <Alert severity={notice.includes('sent') || notice.includes('updated') ? 'success' : 'warning'} sx={{ mb: 3 }}>{notice}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          ['Open', openCount],
          ['High Priority', highCount],
          ['Feature Ideas', suggestionCount],
          ['Majlis / Gov', majlisCount],
        ].map(([label, count]) => (
          <Grid item xs={6} md={3} key={label as string}>
            <Paper sx={{ p: 2.4, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.045)', border: `1px solid ${alpha(binThemeTokens.gold, .16)}` }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)', fontWeight: 900 }}>{label}</Typography>
              <Typography variant="h4" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{count}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ borderRadius: 4, overflow: 'hidden', bgcolor: 'rgba(15,23,42,.94)', border: '1px solid rgba(255,255,255,.08)' }}>
            <Box sx={{ p: 2 }}>
              <TextField select fullWidth size="small" label="Filter channel" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,.55)' } }}>
                <MenuItem value="all">All channels</MenuItem>
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Box>
            <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
            <Stack sx={{ maxHeight: '64vh', overflow: 'auto' }}>
              {filteredThreads.length === 0 ? (
                <Typography sx={{ p: 3, color: 'rgba(255,255,255,.55)' }}>No BIN Connect threads yet.</Typography>
              ) : filteredThreads.map((thread) => {
                const active = thread.id === selectedId;
                return (
                  <Box key={thread.id} onClick={() => setSelectedId(thread.id)} sx={{ p: 2, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.06)', bgcolor: active ? alpha(binThemeTokens.gold, .14) : 'transparent' }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography fontWeight={950} sx={{ color: '#fff' }}>{thread.title || 'BIN Connect'}</Typography>
                      <Chip size="small" label={thread.status || 'open'} sx={{ bgcolor: alpha(binThemeTokens.gold, .16), color: binThemeTokens.gold, fontWeight: 900 }} />
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.54)' }}>{CHANNEL_LABELS[thread.channel || ''] || thread.channel || 'chat'} · {thread.sourceRole || 'user'} · {ts(thread.createdAt)}</Typography>
                    <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,.72)' }}>{thread.lastMessage || 'No preview'}</Typography>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, borderRadius: 4, minHeight: '68vh', bgcolor: 'rgba(15,23,42,.94)', border: '1px solid rgba(255,255,255,.08)' }}>
            {!selected ? (
              <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 420, color: 'rgba(255,255,255,.5)' }}><MessageSquare size={44} /><Typography sx={{ mt: 2 }}>Select a thread.</Typography></Stack>
            ) : (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="h5" fontWeight={950}>{selected.title || 'BIN Connect'}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)' }}>{selected.createdByName || selected.createdByEmail || 'Unknown'} · {selected.sourceRole || 'user'} · {CHANNEL_LABELS[selected.channel || ''] || selected.channel}</Typography>
                    {selected.context && <Typography variant="body2" sx={{ color: binThemeTokens.gold, mt: .6 }}>Context: {selected.context}</Typography>}
                    {selected.recipientHint && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.62)' }}>Recipient hint: {selected.recipientHint}</Typography>}
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField select size="small" value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 140, '& .MuiInputBase-root': { color: '#fff' }, '& fieldset': { borderColor: 'rgba(255,255,255,.22)' } }}>{statusOptions.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
                    <Button onClick={updateStatus} startIcon={<CheckCircle2 size={16} />} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Update</Button>
                  </Stack>
                </Stack>

                <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />

                <Stack spacing={1.4} sx={{ maxHeight: 360, overflow: 'auto', pr: 1 }}>
                  {messages.map((item) => {
                    const admin = item.senderRole && item.senderRole !== selected.sourceRole;
                    return (
                      <Box key={item.id} sx={{ alignSelf: admin ? 'flex-end' : 'flex-start', maxWidth: '82%', p: 1.6, borderRadius: 3, bgcolor: admin ? alpha(binThemeTokens.gold, .16) : 'rgba(255,255,255,.06)', border: admin ? `1px solid ${alpha(binThemeTokens.gold, .28)}` : '1px solid rgba(255,255,255,.08)' }}>
                        <Typography variant="caption" sx={{ color: admin ? binThemeTokens.gold : 'rgba(255,255,255,.55)', fontWeight: 900 }}>{item.senderName || item.senderEmail || item.senderRole || 'sender'} · {ts(item.createdAt)}</Typography>
                        <Typography sx={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{item.body}</Typography>
                      </Box>
                    );
                  })}
                </Stack>

                <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
                <TextField fullWidth multiline minRows={3} value={reply} onChange={(event) => setReply(event.target.value)} label="Admin reply" placeholder="Reply to owner, tenant, technician, broker, or Majlis staff..." sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,.55)' } }} />
                <Button disabled={busy || !reply.trim()} onClick={sendReply} variant="contained" endIcon={<Send size={16} />} sx={{ alignSelf: 'flex-end', bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}>{busy ? 'Sending...' : 'Send admin reply'}</Button>
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
