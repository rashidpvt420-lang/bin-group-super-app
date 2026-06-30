import React from 'react';
import { Alert, Box, Button, Chip, Divider, Grid, MenuItem, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { CheckCircle2, Inbox, MessageSquare, Send } from 'lucide-react';
import { addDoc, collection, db, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

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
  company_ceo: 'admin.bin_connect_inbox.channel_company_ceo',
  admin_support: 'admin.bin_connect_inbox.channel_admin_support',
  owner_to_tenant: 'admin.bin_connect_inbox.channel_owner_to_tenant',
  owner_to_technician: 'admin.bin_connect_inbox.channel_owner_to_technician',
  majlis_staff: 'admin.bin_connect_inbox.channel_majlis_staff',
  maintenance_chat: 'admin.bin_connect_inbox.channel_maintenance_chat',
  feature_suggestion: 'admin.bin_connect_inbox.channel_feature_suggestion',
  dashboard_issue: 'admin.bin_connect_inbox.channel_dashboard_issue',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  open: 'admin.bin_connect_inbox.status_open',
  in_review: 'admin.bin_connect_inbox.status_in_review',
  assigned: 'admin.bin_connect_inbox.status_assigned',
  resolved: 'admin.bin_connect_inbox.status_resolved',
};

const statusOptions = ['open', 'in_review', 'assigned', 'resolved'];

const ts = (value: any, t: (key: string) => string) => value?.toDate?.()?.toLocaleString?.() || t('admin.bin_connect_inbox.pending_timestamp');

export default function BinConnectInboxPage() {
  const { t, isRTL } = useLanguage();
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
    }, (error) => setNotice(error.message || t('admin.bin_connect_inbox.load_threads_failed')));
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
    }, (error) => setNotice(error.message || t('admin.bin_connect_inbox.load_messages_failed')));
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
      setNotice(t('admin.bin_connect_inbox.reply_sent'));
    } catch (error: any) {
      setNotice(error?.message || t('admin.bin_connect_inbox.reply_failed'));
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
      setNotice(t('admin.bin_connect_inbox.status_updated'));
    } catch (error: any) {
      setNotice(error?.message || t('admin.bin_connect_inbox.status_update_failed'));
    }
  };

  const channelLabel = (channel?: string, fallback?: string) => {
    const key = CHANNEL_LABELS[channel || ''];
    if (key) return t(key);
    return channel || fallback || '';
  };

  const statusLabel = (statusValue?: string) => {
    const value = statusValue || 'open';
    const key = STATUS_LABEL_KEYS[value];
    return key ? t(key) : value;
  };

  const openCount = threads.filter((thread) => (thread.status || 'open') === 'open').length;
  const highCount = threads.filter((thread) => thread.priority === 'high').length;
  const suggestionCount = threads.filter((thread) => thread.channel === 'feature_suggestion').length;
  const majlisCount = threads.filter((thread) => thread.channel === 'majlis_staff').length;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#FFFFFF', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{t('admin.bin_connect_inbox.overline')}</Typography>
          <Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: -1 }}>{t('admin.bin_connect_inbox.page_title')}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 820, mt: 1 }}>{t('admin.bin_connect_inbox.page_subtitle')}</Typography>
        </Box>
        <Chip icon={<Inbox size={16} />} label={t('admin.bin_connect_inbox.total_threads_chip', { count: threads.length })} sx={{ bgcolor: alpha(binThemeTokens.gold, .12), color: binThemeTokens.gold, fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      {notice && <Alert severity={notice === t('admin.bin_connect_inbox.reply_sent') || notice === t('admin.bin_connect_inbox.status_updated') ? 'success' : 'warning'} sx={{ mb: 3 }}>{notice}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          [t('admin.bin_connect_inbox.stat_open'), openCount],
          [t('admin.bin_connect_inbox.stat_high_priority'), highCount],
          [t('admin.bin_connect_inbox.stat_feature_ideas'), suggestionCount],
          [t('admin.bin_connect_inbox.stat_majlis_gov'), majlisCount],
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
              <TextField select fullWidth size="small" label={t('admin.bin_connect_inbox.filter_channel_label')} value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,.55)' } }}>
                <MenuItem value="all">{t('admin.bin_connect_inbox.all_channels_option')}</MenuItem>
                {Object.entries(CHANNEL_LABELS).map(([value, key]) => <MenuItem key={value} value={value}>{t(key)}</MenuItem>)}
              </TextField>
            </Box>
            <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
            <Stack sx={{ maxHeight: '64vh', overflow: 'auto' }}>
              {filteredThreads.length === 0 ? (
                <Typography sx={{ p: 3, color: 'rgba(255,255,255,.55)' }}>{t('admin.bin_connect_inbox.no_threads_empty')}</Typography>
              ) : filteredThreads.map((thread) => {
                const active = thread.id === selectedId;
                return (
                  <Box key={thread.id} onClick={() => setSelectedId(thread.id)} sx={{ p: 2, cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.06)', bgcolor: active ? alpha(binThemeTokens.gold, .14) : 'transparent' }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography fontWeight={950} sx={{ color: '#fff' }}>{thread.title || t('admin.bin_connect_inbox.default_thread_title')}</Typography>
                      <Chip size="small" label={statusLabel(thread.status)} sx={{ bgcolor: alpha(binThemeTokens.gold, .16), color: binThemeTokens.gold, fontWeight: 900 }} />
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.54)' }}>{channelLabel(thread.channel, t('admin.bin_connect_inbox.channel_chat_fallback'))} · {thread.sourceRole || t('admin.bin_connect_inbox.role_fallback')} · {ts(thread.createdAt, t)}</Typography>
                    <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,.72)' }}>{thread.lastMessage || t('admin.bin_connect_inbox.no_preview')}</Typography>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, borderRadius: 4, minHeight: '68vh', bgcolor: 'rgba(15,23,42,.94)', border: '1px solid rgba(255,255,255,.08)' }}>
            {!selected ? (
              <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 420, color: 'rgba(255,255,255,.5)' }}><MessageSquare size={44} /><Typography sx={{ mt: 2 }}>{t('admin.bin_connect_inbox.select_thread_prompt')}</Typography></Stack>
            ) : (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="h5" fontWeight={950}>{selected.title || t('admin.bin_connect_inbox.default_thread_title')}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)' }}>{selected.createdByName || selected.createdByEmail || t('admin.bin_connect_inbox.unknown_sender')} · {selected.sourceRole || t('admin.bin_connect_inbox.role_fallback')} · {channelLabel(selected.channel)}</Typography>
                    {selected.context && <Typography variant="body2" sx={{ color: binThemeTokens.gold, mt: .6 }}>{t('admin.bin_connect_inbox.context_label')} {selected.context}</Typography>}
                    {selected.recipientHint && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.62)' }}>{t('admin.bin_connect_inbox.recipient_hint_label')} {selected.recipientHint}</Typography>}
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField select size="small" value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 140, '& .MuiInputBase-root': { color: '#fff' }, '& fieldset': { borderColor: 'rgba(255,255,255,.22)' } }}>{statusOptions.map((value) => <MenuItem key={value} value={value}>{t(STATUS_LABEL_KEYS[value])}</MenuItem>)}</TextField>
                    <Button onClick={updateStatus} startIcon={<CheckCircle2 size={16} />} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('admin.bin_connect_inbox.update_button')}</Button>
                  </Stack>
                </Stack>

                <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />

                <Stack spacing={1.4} sx={{ maxHeight: 360, overflow: 'auto', pr: 1 }}>
                  {messages.map((item) => {
                    const admin = item.senderRole && item.senderRole !== selected.sourceRole;
                    return (
                      <Box key={item.id} sx={{ alignSelf: admin ? 'flex-end' : 'flex-start', maxWidth: '82%', p: 1.6, borderRadius: 3, bgcolor: admin ? alpha(binThemeTokens.gold, .16) : 'rgba(255,255,255,.06)', border: admin ? `1px solid ${alpha(binThemeTokens.gold, .28)}` : '1px solid rgba(255,255,255,.08)' }}>
                        <Typography variant="caption" sx={{ color: admin ? binThemeTokens.gold : 'rgba(255,255,255,.55)', fontWeight: 900 }}>{item.senderName || item.senderEmail || item.senderRole || t('admin.bin_connect_inbox.sender_fallback')} · {ts(item.createdAt, t)}</Typography>
                        <Typography sx={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{item.body}</Typography>
                      </Box>
                    );
                  })}
                </Stack>

                <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
                <TextField fullWidth multiline minRows={3} value={reply} onChange={(event) => setReply(event.target.value)} label={t('admin.bin_connect_inbox.admin_reply_label')} placeholder={t('admin.bin_connect_inbox.admin_reply_placeholder')} sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,.55)' } }} />
                <Button disabled={busy || !reply.trim()} onClick={sendReply} variant="contained" endIcon={<Send size={16} />} sx={{ alignSelf: 'flex-end', bgcolor: binThemeTokens.gold, color: '#020617', fontWeight: 950 }}>{busy ? t('admin.bin_connect_inbox.sending_button') : t('admin.bin_connect_inbox.send_reply_button')}</Button>
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
