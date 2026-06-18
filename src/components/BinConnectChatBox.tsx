import React from 'react';
import { Alert, Badge, Box, Button, Chip, Divider, Fab, MenuItem, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { MessageSquare, Send, X } from 'lucide-react';
import { addDoc, auth, collection, db, limit, onSnapshot, query, serverTimestamp, where } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';

type PortalRole = 'owner' | 'tenant' | 'technician' | 'broker' | 'admin' | 'staff';

type Conversation = {
  id: string;
  channel?: string;
  title?: string;
  status?: string;
  createdAt?: any;
  lastMessage?: string;
};

const CHANNELS = [
  { value: 'company_ceo', label: 'Company CEO / Founder' },
  { value: 'admin_support', label: 'Admin Support' },
  { value: 'owner_to_tenant', label: 'Owner ⇄ Tenant' },
  { value: 'owner_to_technician', label: 'Owner ⇄ Technician' },
  { value: 'majlis_staff', label: 'Government Property / Majlis Staff' },
  { value: 'maintenance_chat', label: 'Maintenance / Ticket Chat' },
  { value: 'feature_suggestion', label: 'Suggest a New Feature' },
  { value: 'dashboard_issue', label: 'Something is Wrong / Not Working' },
];

const roleDefaults: Record<PortalRole, string> = {
  owner: 'company_ceo',
  tenant: 'admin_support',
  technician: 'admin_support',
  broker: 'admin_support',
  admin: 'admin_support',
  staff: 'admin_support',
};

export default function BinConnectChatBox({ role, dark = false }: { role: PortalRole; dark?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [channel, setChannel] = React.useState(roleDefaults[role]);
  const [title, setTitle] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [recipient, setRecipient] = React.useState('');
  const [context, setContext] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [threads, setThreads] = React.useState<Conversation[]>([]);
  const uid = auth.currentUser?.uid || '';
  const email = auth.currentUser?.email || '';
  const displayName = auth.currentUser?.displayName || email || role;

  React.useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'binConnectThreads'), where('participantIds', 'array-contains', uid), limit(12));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
      rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setThreads(rows);
    }, () => setThreads([]));
  }, [uid]);

  const send = async () => {
    if (!uid) {
      setNotice('Sign in is required before sending a BIN Connect message.');
      return;
    }
    if (!message.trim()) {
      setNotice('Write a message first.');
      return;
    }
    try {
      setBusy(true);
      setNotice('');
      const participantIds = [uid];
      const thread = await addDoc(collection(db, 'binConnectThreads'), {
        title: title.trim() || CHANNELS.find((item) => item.value === channel)?.label || 'BIN Connect',
        channel,
        status: 'open',
        sourceRole: role,
        createdBy: uid,
        createdByEmail: email,
        createdByName: displayName,
        participantIds,
        recipientHint: recipient.trim(),
        context: context.trim(),
        lastMessage: message.trim().slice(0, 240),
        priority: channel === 'dashboard_issue' ? 'high' : channel === 'majlis_staff' ? 'high' : 'normal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'binConnectThreads', thread.id, 'messages'), {
        body: message.trim(),
        senderId: uid,
        senderRole: role,
        senderEmail: email,
        senderName: displayName,
        createdAt: serverTimestamp(),
        system: false,
      });
      setMessage('');
      setTitle('');
      setRecipient('');
      setContext('');
      setNotice('Message sent to BIN Connect. Admin/CEO can review and reply from the thread record.');
    } catch (error: any) {
      setNotice(error?.message || 'Message could not be sent. Check Firestore rules or connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ position: 'fixed', right: { xs: 16, md: 26 }, bottom: { xs: 74, md: 28 }, zIndex: 1500 }}>
      {open && (
        <Paper elevation={14} sx={{ width: { xs: 'calc(100vw - 32px)', sm: 420 }, maxHeight: '78vh', overflow: 'auto', mb: 1.5, borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}`, bgcolor: dark ? '#111827' : '#FFFFFF', color: dark ? '#FFFFFF' : binThemeTokens.textPrimary }}>
          <Stack spacing={2} sx={{ p: 2.4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography fontWeight={950}>BIN Connect</Typography>
                <Typography variant="caption" sx={{ color: dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary, fontWeight: 800 }}>In-app chat, feedback, CEO/admin support, Majlis staff channel</Typography>
              </Box>
              <Button size="small" onClick={() => setOpen(false)} sx={{ minWidth: 0, color: binThemeTokens.goldHover }}><X size={18} /></Button>
            </Stack>
            {notice && <Alert severity={notice.includes('sent') ? 'success' : 'warning'}>{notice}</Alert>}
            <TextField select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)} size="small" fullWidth>{CHANNELS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</TextField>
            <TextField label="Subject" value={title} onChange={(e) => setTitle(e.target.value)} size="small" fullWidth placeholder="Example: Majlis AC issue, dashboard idea, payment question" />
            <TextField label="Recipient hint" value={recipient} onChange={(e) => setRecipient(e.target.value)} size="small" fullWidth placeholder="Optional: tenant name, technician, CEO, unit, email, Majlis staff" />
            <TextField label="Context" value={context} onChange={(e) => setContext(e.target.value)} size="small" fullWidth placeholder="Optional: property, unit, ticket, Majlis, building" />
            <TextField label="Message" value={message} onChange={(e) => setMessage(e.target.value)} fullWidth multiline minRows={3} placeholder="Write like WhatsApp: ask for help, send suggestion, report issue, request update..." />
            <Button onClick={send} disabled={busy} variant="contained" endIcon={<Send size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>{busy ? 'Sending...' : 'Send Message'}</Button>
            <Divider />
            <Typography variant="caption" sx={{ color: dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary, fontWeight: 900 }}>Recent BIN Connect threads</Typography>
            <Stack spacing={1}>{threads.length === 0 ? <Typography variant="body2" sx={{ color: dark ? 'rgba(255,255,255,.45)' : binThemeTokens.textSecondary }}>No recent threads yet.</Typography> : threads.slice(0, 4).map((thread) => <Box key={thread.id} sx={{ p: 1.2, borderRadius: 2, bgcolor: dark ? 'rgba(255,255,255,.05)' : alpha(binThemeTokens.gold, .06) }}><Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={thread.channel || 'chat'} /><Typography variant="body2" fontWeight={900}>{thread.title || 'BIN Connect'}</Typography></Stack><Typography variant="caption" sx={{ color: dark ? 'rgba(255,255,255,.55)' : binThemeTokens.textSecondary }}>{thread.lastMessage || 'Open thread'}</Typography></Box>)}</Stack>
          </Stack>
        </Paper>
      )}
      <Badge color="error" badgeContent={threads.length > 0 ? threads.length : 0} max={9}>
        <Fab onClick={() => setOpen((value) => !value)} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, '&:hover': { bgcolor: binThemeTokens.goldLight } }} aria-label="BIN Connect chat"><MessageSquare /></Fab>
      </Badge>
    </Box>
  );
}
