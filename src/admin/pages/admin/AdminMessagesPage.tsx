import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { MailCheck, MessageSquare, Send, ShieldCheck, Bell, FileText } from 'lucide-react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

const safeDate = (value: any) => {
  if (!value) return 'Recent';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : 'Recent';
};

export default function AdminMessagesPage() {
  const [mailQueue, setMailQueue] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('BIN GROUP Update');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsubMail = onSnapshot(query(collection(db, 'mail'), orderBy('createdAt', 'desc')), (snap) => {
      setMailQueue(snap.docs.slice(0, 40).map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubNotifications = onSnapshot(query(collection(db, 'notifications'), orderBy('createdAt', 'desc')), (snap) => {
      setNotifications(snap.docs.slice(0, 40).map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubContracts = onSnapshot(query(collection(db, 'contracts'), orderBy('updatedAt', 'desc')), (snap) => {
      setContracts(snap.docs.slice(0, 40).map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubMail();
      unsubNotifications();
      unsubContracts();
    };
  }, []);

  const metrics = useMemo(() => {
    const pendingSignatures = contracts.filter((c) => c.status === 'PENDING_OWNER_SIGNATURE' || c.contractStatus === 'awaiting_owner_signature').length;
    const activeSigned = contracts.filter((c) => c.status === 'ACTIVE' || c.signatureState?.ownerSigned === true).length;
    const emailErrors = mailQueue.filter((m) => m.delivery?.state === 'ERROR').length;
    const unreadNotifications = notifications.filter((n) => n.read === false).length;
    return { pendingSignatures, activeSigned, emailErrors, unreadNotifications };
  }, [contracts, mailQueue, notifications]);

  const sendAdminMessage = async () => {
    const email = to.trim().toLowerCase();
    const body = message.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      alert('Enter a valid recipient email.');
      return;
    }
    if (!body) {
      alert('Enter a message body.');
      return;
    }
    setSending(true);
    try {
      await addDoc(collection(db, 'mail'), {
        to: email,
        message: {
          subject: subject.trim() || 'BIN GROUP Update',
          html: `<p>${body.replace(/\n/g, '<br/>')}</p>`
        },
        source: 'ADMIN_COMMUNICATION_CENTER',
        createdBy: auth.currentUser?.uid || 'ADMIN_HUB',
        createdAt: serverTimestamp()
      });
      await addDoc(collection(db, 'audit_logs'), {
        actorId: auth.currentUser?.uid || 'ADMIN_HUB',
        actorRole: 'admin',
        action: 'ADMIN_SEND_EMAIL_MESSAGE',
        targetType: 'mail',
        targetId: email,
        metadata: { subject },
        createdAt: serverTimestamp()
      });
      setMessage('');
      alert('Message queued for email delivery.');
    } catch (error) {
      console.error('Admin message failed:', error);
      alert('Message queue failed. Check Firestore rules or mail function.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminPageFrame
      title="COMMUNICATION COMMAND CENTER"
      subtitle="Admin messaging, email queue, owner notifications, and contract-signature monitoring"
      loading={false}
      breadcrumbs={[{ label: 'Communication Command Center' }]}
    >
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {[
          ['Pending Signatures', metrics.pendingSignatures, <FileText size={22} />],
          ['Signed Contracts', metrics.activeSigned, <ShieldCheck size={22} />],
          ['Email Delivery Errors', metrics.emailErrors, <MailCheck size={22} />],
          ['Open Notifications', metrics.unreadNotifications, <Bell size={22} />],
        ].map(([label, value, icon]: any) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.035), border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}` }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>{label}</Typography>
                  <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 950 }}>{value}</Typography>
                </Box>
                <Box sx={{ color: binThemeTokens.gold }}>{icon}</Box>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
              <Send color={binThemeTokens.gold} /> Send Message / Email
            </Typography>
            <Stack spacing={2}>
              <TextField label="Recipient email" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#FFF' } }} />
              <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#FFF' } }} />
              <TextField label="Message" multiline minRows={6} value={message} onChange={(e) => setMessage(e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#FFF' } }} />
              <Button disabled={sending} onClick={sendAdminMessage} startIcon={<Send />} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5 }}>
                Queue Email
              </Button>
              <Alert severity="info">This uses the existing Firestore <b>mail</b> queue and SMTP Cloud Function. It keeps a full audit record.</Alert>
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          <Stack spacing={3}>
            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, mb: 2 }}>Contract Signature Watch</Typography>
              <Stack spacing={1.25}>
                {contracts.slice(0, 10).map((contract) => {
                  const pending = contract.status === 'PENDING_OWNER_SIGNATURE' || contract.contractStatus === 'awaiting_owner_signature';
                  return (
                    <Paper key={contract.id} sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.025), display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                      <Box>
                        <Typography sx={{ color: '#FFF', fontWeight: 900 }}>{contract.ownerName || contract.ownerEmail || 'Owner'} · {contract.packageName || 'Contract'}</Typography>
                        <Typography variant="caption" color="textSecondary">{contract.id} · {safeDate(contract.updatedAt)}</Typography>
                      </Box>
                      <Chip label={pending ? 'WAITING SIGNATURE' : (contract.status || 'ACTIVE')} sx={{ fontWeight: 950, color: pending ? binThemeTokens.gold : '#10b981', borderColor: pending ? binThemeTokens.gold : '#10b981' }} variant="outlined" />
                    </Paper>
                  );
                })}
              </Stack>
            </Paper>

            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, mb: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                <MessageSquare color={binThemeTokens.gold} /> Latest Email Queue
              </Typography>
              <Stack spacing={1.25}>
                {mailQueue.slice(0, 10).map((mail) => (
                  <Paper key={mail.id} sx={{ p: 2, bgcolor: alpha('#fff', 0.02), display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                    <Box>
                      <Typography sx={{ color: '#FFF', fontWeight: 900 }}>{mail.to}</Typography>
                      <Typography variant="caption" color="textSecondary">{mail.message?.subject || 'Email'} · {safeDate(mail.createdAt)}</Typography>
                    </Box>
                    <Chip label={mail.delivery?.state || 'QUEUED'} size="small" sx={{ fontWeight: 950 }} />
                  </Paper>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>
    </AdminPageFrame>
  );
}
