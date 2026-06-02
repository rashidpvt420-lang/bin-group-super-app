import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Bug, CheckCircle2, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { addDoc, collection, db, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

const inputSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    bgcolor: 'rgba(255,255,255,0.035)',
    borderRadius: 3,
    '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
    '&:hover fieldset': { borderColor: alpha(binThemeTokens.gold, 0.7) },
    '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.35)' },
};

export default function PilotFeedbackPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('owner');
  const [area, setArea] = useState('login');
  const [rating, setRating] = useState('4');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const deviceInfo = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Unknown device';
    return navigator.userAgent;
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      setNotice({ type: 'warning', text: 'Please describe what worked or what failed.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      await addDoc(collection(db, 'pilotFeedback'), {
        name: name.trim(),
        phone: phone.trim(),
        role,
        area,
        rating: Number(rating),
        message: message.trim(),
        pageUrl: window.location.href,
        deviceInfo,
        status: 'new',
        source: 'whatsapp_pilot',
        createdAt: serverTimestamp(),
      });
      setNotice({ type: 'success', text: 'Thank you. Your feedback was sent to BIN GROUP pilot testing.' });
      setMessage('');
    } catch (error: any) {
      console.error('[PilotFeedback] submit failed:', error);
      setNotice({ type: 'error', text: error?.message || 'Could not submit feedback. Please send Rashid a screenshot on WhatsApp.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#050505', color: '#fff', py: { xs: 4, md: 8 }, backgroundImage: 'radial-gradient(circle at top left, rgba(198,167,94,0.12), transparent 35%), radial-gradient(circle at bottom right, rgba(198,167,94,0.08), transparent 35%)' }}>
      <Container maxWidth="md">
        <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', mb: 5 }}>
          <ShieldCheck color={binThemeTokens.gold} size={42} />
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>BIN GROUP PILOT TEST</Typography>
          <Typography variant="h3" fontWeight="950" sx={{ fontSize: { xs: '2rem', md: '3rem' } }}>Send App Feedback</Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 680 }}>
            Use this page during the private WhatsApp pilot. Tell us what worked, what failed, and which screen needs improvement. Please use test/sample property data only.
          </Typography>
        </Stack>

        <Paper component="form" onSubmit={handleSubmit} sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, bgcolor: 'rgba(18,18,20,0.86)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 90px rgba(0,0,0,0.55)' }}>
          {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Your name" value={name} onChange={(e) => setName(e.target.value)} sx={inputSx} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="WhatsApp / phone" value={phone} onChange={(e) => setPhone(e.target.value)} sx={inputSx} />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth sx={inputSx}>
                <InputLabel>Testing as</InputLabel>
                <Select label="Testing as" value={role} onChange={(e) => setRole(e.target.value)}>
                  <MenuItem value="owner">Owner</MenuItem>
                  <MenuItem value="tenant">Tenant</MenuItem>
                  <MenuItem value="technician">Technician</MenuItem>
                  <MenuItem value="broker">Broker</MenuItem>
                  <MenuItem value="visitor">Visitor</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth sx={inputSx}>
                <InputLabel>Area tested</InputLabel>
                <Select label="Area tested" value={area} onChange={(e) => setArea(e.target.value)}>
                  <MenuItem value="home">Home page</MenuItem>
                  <MenuItem value="login">Login / password reset</MenuItem>
                  <MenuItem value="owner_onboarding">Owner onboarding</MenuItem>
                  <MenuItem value="dashboard">Dashboard</MenuItem>
                  <MenuItem value="documents">Documents / PDF download</MenuItem>
                  <MenuItem value="profile">Profile</MenuItem>
                  <MenuItem value="tickets">Tickets / complaints</MenuItem>
                  <MenuItem value="arabic">Arabic / English</MenuItem>
                  <MenuItem value="mobile_layout">Mobile layout</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth sx={inputSx}>
                <InputLabel>Rating</InputLabel>
                <Select label="Rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                  <MenuItem value="5">5 - Excellent</MenuItem>
                  <MenuItem value="4">4 - Good</MenuItem>
                  <MenuItem value="3">3 - Needs work</MenuItem>
                  <MenuItem value="2">2 - Problem</MenuItem>
                  <MenuItem value="1">1 - Broken</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={6}
                required
                label="What happened?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Example: I clicked Forgot Password, but no email arrived. I tested on Samsung Chrome."
                sx={inputSx}
              />
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" sx={{ mt: 4 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'rgba(255,255,255,0.52)' }}>
              <Bug size={18} color={binThemeTokens.gold} />
              <Typography variant="caption" fontWeight="800">Screenshots can still be sent by WhatsApp if needed.</Typography>
            </Stack>
            <Button type="submit" variant="contained" disabled={saving} endIcon={saving ? <MessageSquare size={18} /> : <Send size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.6, borderRadius: 3 }}>
              {saving ? 'Sending...' : 'Send Feedback'}
            </Button>
          </Stack>
        </Paper>

        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ mt: 4, color: 'rgba(255,255,255,0.45)' }}>
          <CheckCircle2 size={18} color={binThemeTokens.gold} />
          <Typography variant="caption" fontWeight="800">Private testing only. Not final public launch.</Typography>
        </Stack>
      </Container>
    </Box>
  );
}
