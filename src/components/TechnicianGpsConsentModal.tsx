import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, FormControlLabel, Checkbox, CircularProgress } from '@mui/material';
import { functions, httpsCallable } from '../lib/firebase';

export default function TechnicianGpsConsentModal({ onAccepted }: { onAccepted: () => void }) {
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAgree = async () => {
    if (!consent || loading) return;
    setLoading(true);
    setError('');
    try {
      const callable = httpsCallable(functions, 'recordTechnicianGpsConsent');
      await callable({ consentActiveDutyOnly: true, deviceId: 'not_provided' });
      try { localStorage.setItem('bin_technician_gps_active_duty_consent', 'true'); } catch { /* ignore */ }
      onAccepted();
    } catch (err: any) {
      setError(err?.message || 'Could not record GPS consent.');
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return (
    <Dialog open maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 4, bgcolor: '#0B0B0C', color: '#fff', border: '1px solid #D4AF37' } }}>
      <DialogTitle>
        <Typography variant="h6" sx={{ fontWeight: 900, color: '#D4AF37' }}>Technician location consent / موافقة موقع الفني</Typography>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: '#ccc', mb: 2 }}>
          BIN GROUP collects your location only while you are on active duty (an active shift or assigned job). Tracking stops when the shift or active job ends. Location is not collected off duty. This consent is also part of the technician contract. Legal citations are for counsel to confirm.
        </Typography>
        <Typography variant="body2" sx={{ color: '#ccc', mb: 2, direction: 'rtl', textAlign: 'right' }}>
          تجمع BIN GROUP موقعك أثناء مباشرة العمل فقط (خلال وردية أو مهمة مُسندة). ويتوقف التتبع عند انتهاء الوردية أو المهمة النشطة. ولا يُجمع الموقع خارج أوقات العمل. وهذه الموافقة جزء من عقد الفني. والاستشهادات القانونية للتأكيد من المستشار القانوني.
        </Typography>
        <FormControlLabel
          control={<Checkbox data-testid="technician-gps-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} sx={{ color: '#D4AF37' }} />}
          label={<Typography variant="caption">I explicitly consent to location tracking only while I am on active duty. / أوافق موافقة صريحة على تتبع الموقع أثناء مباشرة العمل فقط.</Typography>}
        />
        {error ? <Typography variant="caption" sx={{ color: '#f87171', display: 'block', mt: 1 }}>{error}</Typography> : null}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button data-testid="technician-gps-consent-accept" variant="contained" disabled={!consent || loading} onClick={handleAgree} sx={{ bgcolor: '#D4AF37', color: '#000', fontWeight: 900 }}>
          {loading ? <CircularProgress size={22} color="inherit" /> : 'I agree / أوافق'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
