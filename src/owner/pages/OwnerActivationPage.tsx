import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { CreditCard, FileSignature, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';
import { collection, db, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const fmtAED = (value: number) => `AED ${Math.round(value || 0).toLocaleString()}`;

export default function OwnerActivationPage() {
  const { user, refreshRole } = useRole();
  const { isRTL } = useLanguage();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, 'contracts'), where('ownerEmail', '==', user.email.toLowerCase()));
    return onSnapshot(q, (snap) => {
      setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [user?.email]);

  const primaryContract = useMemo(() => {
    return contracts.find((c) => ['PENDING_PAYMENT', 'PENDING', 'DRAFT', 'ACTIVE'].includes(String(c.status || '').toUpperCase())) || contracts[0];
  }, [contracts]);

  const annualValue = Number(primaryContract?.annualValue || primaryContract?.totalAnnual || primaryContract?.quoteTotal || 0);
  const mobilization = Number(primaryContract?.mobilizationAmount || primaryContract?.mobilizationFee || annualValue * 0.15);
  const profile = user as any;
  const activated = !!profile?.paymentVerified && (!!profile?.activeContractId || !!profile?.dashboardUnlocked);

  const handleManualVerificationBridge = async () => {
    if (!user?.uid || !primaryContract?.id) {
      setError('No owner profile or contract found. Create/select a contract first.');
      return;
    }

    setActivating(true);
    setError(null);
    setSuccess(null);
    try {
      await updateDoc(doc(db, 'contracts', primaryContract.id), {
        status: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
        paymentStatus: 'PENDING_VERIFICATION',
        mobilizationAmount: mobilization,
        mobilizationPercent: 15,
        activationRequestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'users', user.uid), {
        latestActivationContractId: primaryContract.id,
        dashboardLocked: true,
        activationStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
        updatedAt: serverTimestamp(),
      });

      setSuccess('Activation request submitted. Admin must verify payment before dashboard unlock.');
      await refreshRole();
    } catch (err: any) {
      setError(err.message || 'Activation request failed.');
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 6 }}>
      <Stack spacing={4}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>CONTRACT ACTIVATION</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>15% Mobilization Payment Gate</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', maxWidth: 820, mt: 1 }}>
            Full owner dashboard access is released only after the selected contract is tied to a verified mobilization payment and active service agreement.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        {activated && <Alert severity="success">Your owner profile already has verified payment and active contract access.</Alert>}

        <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.64)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6 }}>
              <Stack spacing={3}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center">
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                    <Box sx={{ width: 52, height: 52, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}>
                      <FileSignature />
                    </Box>
                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                      <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{primaryContract?.propertyName || 'Selected Property Contract'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 800 }}>REF: {primaryContract?.id?.slice(0, 8)?.toUpperCase() || 'NO-CONTRACT'}</Typography>
                    </Box>
                  </Stack>
                  <Chip label={primaryContract?.status || 'PENDING'} sx={{ bgcolor: alpha('#f59e0b', 0.12), color: '#f59e0b', fontWeight: 950 }} />
                </Stack>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)' }} />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>ANNUAL VALUE</Typography>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{fmtAED(annualValue)}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>MOBILIZATION</Typography>
                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{fmtAED(mobilization)}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>PAYMENT PLAN</Typography>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{primaryContract?.paymentPlan || 'Annual / Quarterly / Monthly'}</Typography>
                  </Grid>
                </Grid>

                <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: '#f8fafc', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
                  Stripe/UAE PSP checkout can call the same activation status fields after payment success. Until PSP keys are configured, this page creates the safe admin verification request without unlocking the dashboard.
                </Alert>

                <Button
                  disabled={activating || !primaryContract?.id || activated}
                  onClick={handleManualVerificationBridge}
                  variant="contained"
                  startIcon={<CreditCard size={18} />}
                  sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, py: 1.5 }}
                >
                  {activating ? 'Submitting...' : 'Submit Payment Verification Request'}
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(15,23,42,0.38)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
              <Stack spacing={2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                <Chip icon={<LockKeyhole size={14} />} label="NO ORPHAN CONTRACTS" sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 950 }} />
                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Activation rules</Typography>
                <Stack spacing={1.5}>
                  {[
                    'Contract must exist and be linked to owner email/UID.',
                    '15% mobilization must be requested and verified.',
                    'Admin approval unlocks full owner dashboard access.',
                    'Active contract ID must be written to the owner profile.',
                  ].map((item) => (
                    <Stack key={item} direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center">
                      <ShieldCheck size={16} color={binThemeTokens.gold} />
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>{item}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)', my: 1 }} />
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
                  <WalletCards size={18} color={binThemeTokens.gold} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 800 }}>
                    PSP-ready fields: paymentStatus, mobilizationAmount, activationRequestedAt, activeContractId, paymentVerified.
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
}
