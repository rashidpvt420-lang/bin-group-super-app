import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Grid, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { CreditCard, FileSignature, LockKeyhole, PenLine, ShieldCheck, WalletCards } from 'lucide-react';
import { collection, db, functions, getDocs, httpsCallable, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const fmtAED = (value: number) => `AED ${Math.round(value || 0).toLocaleString()}`;

const SIGNABLE_STATUSES = [
  'PENDING_OWNER_SIGNATURE',
  'APPROVED_PENDING_OWNER_SIGNATURE',
  'PENDING_SIGNATURE',
  'DRAFT',
  'PENDING',
];

const READY_STATUSES = ['READY_FOR_ACTIVATION', 'OWNER_SIGNED', 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'SIGNED'];
const VERIFIED_PAYMENT_STATUSES = ['PAID', 'VERIFIED', 'ADMIN_VERIFIED', 'APPROVED', 'SETTLED', 'RECONCILED'];
const PENDING_PAYMENT_STATUSES = ['PENDING', 'PENDING_VERIFICATION', 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'ADMIN_VERIFICATION_REQUIRED', 'ADMIN_REVIEW'];

type ActivationGate = {
  label: string;
  status: string;
  detail: string;
  tone: string;
};

const firstNumber = (...values: any[]) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
};

const contractValue = (contract: any) => firstNumber(
  contract?.commercialSchedule?.annualContractValue,
  contract?.paymentSchedule?.annualContractValue,
  contract?.annualContractValue,
  contract?.annualValue,
  contract?.estimatedAnnualValue,
  contract?.totalAnnual,
  contract?.quoteTotal,
  contract?.contractValue,
  contract?.serviceValue,
  contract?.pricing?.annualContractValue,
  contract?.pricing?.annualValue,
  contract?.quote?.annualContractValue,
  contract?.quote?.totalAnnual,
  contract?.payment?.annualValue,
  contract?.amount
);

const contractMobilization = (contract: any, annualValue: number) => firstNumber(
  contract?.commercialSchedule?.mobilizationAmount,
  contract?.paymentSchedule?.mobilizationAmount,
  contract?.mobilizationAmount,
  contract?.depositAmount,
  contract?.mobilizationFee,
  contract?.upfrontAmount,
  contract?.pricing?.mobilizationAmount,
  contract?.pricing?.upfrontAmount,
  contract?.quote?.mobilizationAmount,
  contract?.payment?.amount,
  contract?.paymentAmount,
  annualValue > 0 ? annualValue * 0.15 : 0
);

const hasCommercialSchedule = (contract: any) =>
  Boolean(contract?.commercialSchedule || contract?.paymentSchedule || contract?.commercialScheduleLocked);

const normalizeGateStatus = (value: unknown) => String(value || '').trim().replace(/\s+/g, '_').toUpperCase();

const isTruthyVerified = (...values: any[]) => values.some((value) => value === true || ['TRUE', 'YES', 'VERIFIED', 'APPROVED', 'ACTIVE', 'SIGNED', 'DONE', 'COMPLETE', 'COMPLETED'].includes(normalizeGateStatus(value)));

const hasTitleEvidence = (contract: any) => {
  const properties = Array.isArray(contract?.properties) ? contract.properties : [];
  return isTruthyVerified(contract?.titleDeedVerified, contract?.ownershipVerified, contract?.ownershipVerificationStatus, contract?.titleDeedStatus) ||
    Boolean(contract?.titleDeedUrl || contract?.titleDeedFileUrl || contract?.ownershipDocumentUrl || contract?.proofDocuments?.propertyProof) ||
    properties.some((property: any) => Boolean(property?.titleDeedUrl || property?.titleDeedFileUrl || property?.ownershipDocumentUrl || isTruthyVerified(property?.titleDeedStatus, property?.ownershipVerificationStatus)));
};

const hasPropertyDetails = (contract: any) => {
  const properties = Array.isArray(contract?.properties) ? contract.properties : [];
  return properties.length > 0 || Boolean(contract?.propertyId || contract?.propertyName || contract?.propertyDetails || contract?.assetProfile);
};

const totalContractUnits = (contract: any) => {
  const properties = Array.isArray(contract?.properties) ? contract.properties : [];
  const direct = firstNumber(contract?.totalUnits, contract?.units, contract?.unitCount, contract?.propertyDetails?.units);
  if (direct > 0) return direct;
  return properties.reduce((sum: number, property: any) => sum + firstNumber(property?.totalUnits, property?.units, property?.unitCount, property?.numberOfUnits), 0);
};

const gate = (label: string, done: boolean, review: boolean, doneDetail: string, reviewDetail: string, missingDetail: string): ActivationGate => {
  if (done) return { label, status: 'Done', detail: doneDetail, tone: '#10b981' };
  if (review) return { label, status: 'In Review', detail: reviewDetail, tone: '#f59e0b' };
  return { label, status: 'Missing', detail: missingDetail, tone: '#ef4444' };
};

function buildActivationGates(contract: any, profile: any, activated: boolean, mobilization: number): ActivationGate[] {
  const paymentStatus = normalizeGateStatus(contract?.paymentStatus || profile?.paymentStatus || contract?.status);
  const signatureStatus = normalizeGateStatus(contract?.signatureStatus || contract?.ownerSignatureStatus || profile?.signatureStatus);
  const approvalStatus = normalizeGateStatus(contract?.adminApprovalStatus || contract?.binApprovalStatus || contract?.approvalStatus || profile?.approvalStatus);
  const units = totalContractUnits(contract);
  const tenantInviteCount = firstNumber(contract?.tenantInvitationCount, contract?.tenantInvitationsSent, contract?.pendingTenantInvitations, profile?.tenantInvitationCount);
  const ibanPresent = Boolean(profile?.iban || profile?.bankDetails?.iban || profile?.payoutDetails?.iban || contract?.iban || contract?.bankDetails?.iban);
  const ibanVerified = isTruthyVerified(profile?.ibanVerified, profile?.payoutVerified, profile?.bankDetails?.verified, profile?.ibanStatus, contract?.ibanVerified, contract?.payoutVerified);
  const ownerSigned = contract?.ownerSigned === true || contract?.ownerSignature?.signed === true || signatureStatus === 'OWNER_SIGNED' || signatureStatus === 'SIGNED';
  const paymentVerified = contract?.paymentVerified === true || profile?.paymentVerified === true || VERIFIED_PAYMENT_STATUSES.includes(paymentStatus);
  const paymentInReview = PENDING_PAYMENT_STATUSES.includes(paymentStatus) || paymentStatus.includes('PENDING') || paymentStatus.includes('REVIEW') || mobilization > 0;
  const adminApproved = approvalStatus.includes('APPROVED') || normalizeGateStatus(contract?.activationStatus) === 'ACTIVE' || activated;

  return [
    gate('Property submitted', hasPropertyDetails(contract), Boolean(contract?.id), 'Property details are attached to the contract.', 'Contract exists; property details are under admin review.', 'Property details are not linked yet.'),
    gate('Title deed verified', hasTitleEvidence(contract), hasPropertyDetails(contract), 'Ownership evidence is present or verified.', 'Ownership evidence is under review.', 'Title deed or ownership proof still needs upload/review.'),
    gate('15% payment proof', paymentVerified, paymentInReview, 'Mobilization/payment proof is verified.', 'Payment proof is waiting for admin verification.', 'Payment proof has not been submitted.'),
    gate('Contract signed by owner', ownerSigned, Boolean(contract?.id), 'Owner signature is recorded.', 'Contract is ready for owner signature.', 'No signable contract found.'),
    gate('BIN GROUP approved', adminApproved, approvalStatus.includes('PENDING') || approvalStatus.includes('REVIEW') || Boolean(contract?.id), 'BIN GROUP/admin approval is complete.', 'BIN GROUP/admin approval is pending.', 'Admin approval has not started.'),
    gate('Dashboard unlocked', activated, paymentVerified || adminApproved, 'Owner dashboard access is active.', 'Dashboard unlock is waiting for final admin/payment closure.', 'Dashboard remains locked.'),
    gate('Properties copied to live records', hasPropertyDetails(contract), Boolean(contract?.id), 'Property records are visible from the contract.', 'Property copy/linkage is in review.', 'Property records are not live yet.'),
    gate('Units generated/imported', units > 0, hasPropertyDetails(contract), `${units} unit(s) resolved.`, 'Property is present; units still need generation or import.', 'Units are not configured.'),
    gate('Tenant invitations', tenantInviteCount > 0, units > 0, `${tenantInviteCount} tenant invitation(s) tracked.`, 'Units exist; tenant invitations can be sent next.', 'Tenant invitations are not ready until units exist.'),
    gate('Payout IBAN', ibanVerified, ibanPresent, 'Verified owner payout destination exists.', 'IBAN submitted and waiting for verification.', 'Owner payout IBAN is missing.'),
  ];
}

const moneyLabel = (value: number, contract: any) => {
  if (value > 0) return `AED ${Math.round(value).toLocaleString()}`;
  if (hasCommercialSchedule(contract)) return "AED 0 — legacy/admin amount missing";
  return "Pending Admin Confirmation";
};

function uniqueById(items: any[]) {
  const map = new Map<string, any>();
  for (const item of items) {
    if (item?.id) map.set(item.id, item);
  }
  return Array.from(map.values());
}

export default function OwnerActivationPage() {
  const { user, refreshRole } = useRole();
  const { isRTL } = useLanguage();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid && !user?.email) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadContracts = async () => {
      setLoading(true);
      setError(null);
      try {
        const reads: Promise<any>[] = [];
        if (user?.uid) {
          reads.push(getDocs(query(collection(db, 'contracts'), where('ownerUid', '==', user.uid))));
          reads.push(getDocs(query(collection(db, 'contracts'), where('ownerId', '==', user.uid))));
        }
        if (user?.email) {
          reads.push(getDocs(query(collection(db, 'contracts'), where('ownerEmail', '==', user.email.toLowerCase()))));
          reads.push(getDocs(query(collection(db, 'contracts'), where('ownerEmail', '==', user.email))));
        }

        const snapshots = await Promise.allSettled(reads);
        const loaded: any[] = [];
        const errors: string[] = [];

        snapshots.forEach((result) => {
          if (result.status === 'fulfilled') {
            result.value.docs.forEach((d: any) => loaded.push({ id: d.id, ...d.data() }));
          } else {
            errors.push(result.reason?.message || 'Contract query failed');
          }
        });

        if (cancelled) return;

        const unique = uniqueById(loaded).sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        setContracts(unique);
        if (unique.length === 0 && errors.length > 0) {
          setError(errors[0]);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Contract loading failed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadContracts();
    setSignatureName(user?.displayName || user?.email || '');

    return () => {
      cancelled = true;
    };
  }, [user?.displayName, user?.email, user?.uid]);

  const primaryContract = useMemo(() => {
    return contracts.find((c) => SIGNABLE_STATUSES.includes(String(c.status || '').toUpperCase()) && c.ownerSigned !== true) ||
      contracts.find((c) => READY_STATUSES.includes(String(c.status || '').toUpperCase()) || c.ownerSigned === true || c.signatureStatus === 'OWNER_SIGNED') ||
      contracts.find((c) => String(c.status || '').toUpperCase() === 'ACTIVE') ||
      contracts[0];
  }, [contracts]);

  const status = String(primaryContract?.status || '').toUpperCase();
  const annualValue = contractValue(primaryContract);
  const mobilization = contractMobilization(primaryContract, annualValue);
  const paymentPlanText = String(
    primaryContract?.commercialSchedule?.paymentPlan ||
    primaryContract?.paymentSchedule?.paymentPlan ||
    primaryContract?.paymentPlan ||
    primaryContract?.billingCycle ||
    'Annual / Quarterly / Monthly'
  );
  const profile = user as any;
  const activated = !!profile?.paymentVerified && (!!profile?.activeContractId || !!profile?.dashboardUnlocked);
  const canSign = !!primaryContract?.id && SIGNABLE_STATUSES.includes(status) && primaryContract?.ownerSigned !== true && primaryContract?.signatureStatus !== 'OWNER_SIGNED';
  const signedWaitingActivation = !!primaryContract?.id && (primaryContract?.ownerSigned || READY_STATUSES.includes(status) || primaryContract?.signatureStatus === 'OWNER_SIGNED');
  const amountPendingAdminConfirmation = signedWaitingActivation && mobilization <= 0 && !hasCommercialSchedule(primaryContract);
  const canSubmitPaymentRequest = !!primaryContract?.id && !activated && !canSign && signedWaitingActivation;
  const activationGates = buildActivationGates(primaryContract, profile, activated, mobilization);

  const refreshAfterAction = async () => {
    await refreshRole?.();
    if (!user?.uid && !user?.email) return;
    const reads: Promise<any>[] = [];
    if (user?.uid) {
      reads.push(getDocs(query(collection(db, 'contracts'), where('ownerUid', '==', user.uid))));
      reads.push(getDocs(query(collection(db, 'contracts'), where('ownerId', '==', user.uid))));
    }
    if (user?.email) {
      reads.push(getDocs(query(collection(db, 'contracts'), where('ownerEmail', '==', user.email.toLowerCase()))));
      reads.push(getDocs(query(collection(db, 'contracts'), where('ownerEmail', '==', user.email))));
    }
    const snapshots = await Promise.allSettled(reads);
    const loaded: any[] = [];
    snapshots.forEach((result) => {
      if (result.status === 'fulfilled') result.value.docs.forEach((d: any) => loaded.push({ id: d.id, ...d.data() }));
    });
    setContracts(uniqueById(loaded));
  };

  const handleOwnerSignContract = async () => {
    if (!primaryContract?.id) {
      setError('No contract found for signing. Ask admin to approve and email the selected contract first.');
      return;
    }
    if (!signatureName.trim()) {
      setError('Enter your legal name before signing the contract.');
      return;
    }

    setSigning(true);
    setError(null);
    setSuccess(null);
    try {
      const signContract = httpsCallable(functions, 'ownerSignContract');
      const result = await signContract({
        contractId: primaryContract.id,
        signatureName: signatureName.trim(),
        acceptedTerms: true,
      });
      const data = result.data as { status?: string; idempotent?: boolean };
      setSuccess(data?.idempotent ? 'Contract is already signed and ready for payment/admin activation.' : `Contract signed successfully. Status: ${data?.status || 'READY_FOR_ACTIVATION'}. Admin can now verify payment and activate your dashboard.`);
      await refreshAfterAction();
    } catch (err: any) {
      setError(err?.message || 'Contract signing failed.');
    } finally {
      setSigning(false);
    }
  };

  const handleManualVerificationBridge = async () => {
    if (!primaryContract?.id) {
      setError('No owner profile or contract found. Create/select a contract first.');
      return;
    }

    setActivating(true);
    setError(null);
    setSuccess(null);
    try {
      const ownerPaymentReference = `OWNER_PORTAL_${Date.now()}`;
      const createPayment = httpsCallable(functions, 'createOwnerPaymentTransaction');
      const result = await createPayment({
        contractId: primaryContract.id,
        method: 'BANK_TRANSFER',
        provider: 'MANUAL',
        amount: mobilization,
        amountSource: mobilization <= 0 ? 'OWNER_CONFIRMATION_FALLBACK' : 'CONTRACT_VALUE',
        currency: 'AED',
        reference: ownerPaymentReference,
        annualContractValue: annualValue,
        mobilizationAmount: mobilization,
        paymentPlan: paymentPlanText,
        paymentReferenceId: ownerPaymentReference,
        commercialScheduleLocked: hasCommercialSchedule(primaryContract),
      });
      const data = result.data as { paymentId?: string; amountPendingAdminConfirmation?: boolean; idempotent?: boolean };
      const requestLabel = data?.idempotent ? 'Existing payment verification request found' : 'Payment verification request submitted';
      setSuccess(data?.amountPendingAdminConfirmation
        ? `${requestLabel}${data?.paymentId ? ` (${data.paymentId})` : ''}. Admin must confirm the mobilization amount and verify payment before dashboard unlock.`
        : `${requestLabel}${data?.paymentId ? ` (${data.paymentId})` : ''}. Admin must verify payment before dashboard unlock.`);
      await refreshAfterAction();
    } catch (err: any) {
      setError(err?.message || 'Activation request failed.');
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

  const PaymentRequestButton = ({ fullWidth = false }: { fullWidth?: boolean }) => (
    <Button
      disabled={activating || !canSubmitPaymentRequest}
      onClick={handleManualVerificationBridge}
      variant="contained"
      startIcon={<CreditCard size={18} />}
      fullWidth={fullWidth}
      sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, py: 1.5, mt: fullWidth ? 1.5 : 0 }}
    >
      {activating ? 'Submitting...' : amountPendingAdminConfirmation ? 'Submit Verification Request — Amount Pending' : 'Submit Payment Verification Request'}
    </Button>
  );

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 6 }}>
      <Stack spacing={4}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>CONTRACT ACTIVATION</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>15% Mobilization Payment Gate</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', maxWidth: 820, mt: 1 }}>
            First sign the admin-approved contract. Then submit or complete the 15% mobilization payment request. Full dashboard access unlocks only after admin payment verification.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        {activated && <Alert severity="success">Your owner profile already has verified payment and active contract access.</Alert>}
        {signedWaitingActivation && !activated && <Alert severity="info">Contract is signed and ready for payment/admin activation.</Alert>}
        {amountPendingAdminConfirmation && !activated && (
          <Alert
            severity="warning"
            action={canSubmitPaymentRequest ? <PaymentRequestButton /> : undefined}
            sx={{ alignItems: 'center' }}
          >
            Mobilization amount is missing from this contract. Submit the verification request now; admin will confirm the amount and verify payment before dashboard unlock.
          </Alert>
        )}
        {!primaryContract?.id && <Alert severity="warning">No contract was found for this owner account. Ask admin to approve and email the selected contract for owner signature.</Alert>}

        <ActivationTimeline gates={activationGates} />

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
                      <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{primaryContract?.propertyName || primaryContract?.companyProfile?.name || 'Selected Property Contract'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 800 }}>REF: {primaryContract?.id?.slice(0, 8)?.toUpperCase() || 'NO-CONTRACT'}</Typography>
                    </Box>
                  </Stack>
                  <Chip label={primaryContract?.status || 'NO_CONTRACT'} sx={{ bgcolor: alpha(canSign ? '#10b981' : '#f59e0b', 0.12), color: canSign ? '#10b981' : '#f59e0b', fontWeight: 950 }} />
                </Stack>

                <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)' }} />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>ANNUAL VALUE</Typography>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{moneyLabel(annualValue, primaryContract)}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>MOBILIZATION</Typography>
                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{moneyLabel(mobilization, primaryContract)}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>PAYMENT PLAN</Typography>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{paymentPlanText}</Typography>
                  </Grid>
                </Grid>

                <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: '#f8fafc', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
                  Owner signature is processed through a secure backend callable. The client cannot unlock the dashboard or mark payment verified by itself.
                </Alert>

                {canSign && (
                  <Stack spacing={2}>
                    <TextField
                      label="Legal name for signature"
                      value={signatureName}
                      onChange={(event) => setSignatureName(event.target.value)}
                      fullWidth
                    />
                    <Button
                      disabled={signing || !primaryContract?.id}
                      onClick={handleOwnerSignContract}
                      variant="contained"
                      startIcon={<PenLine size={18} />}
                      sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, borderRadius: 3, py: 1.5 }}
                    >
                      {signing ? 'Signing...' : 'Sign Contract'}
                    </Button>
                  </Stack>
                )}

                <PaymentRequestButton fullWidth />
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
                    'Owner must sign the selected contract.',
                    '15% mobilization must be submitted and verified.',
                    'Admin payment verification unlocks full owner dashboard access.',
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
                    PSP-ready fields: ownerSigned, signedAt, paymentStatus, mobilizationAmount, activeContractId, paymentVerified.
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

function ActivationTimeline({ gates }: { gates: ActivationGate[] }) {
  const doneCount = gates.filter((step) => step.status === 'Done').length;

  return (
    <Paper sx={{ p: { xs: 2.25, md: 3 }, bgcolor: 'rgba(15,23,42,0.52)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>
            OWNER ACTIVATION TIMELINE
          </Typography>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>
            {doneCount}/{gates.length} gates complete
          </Typography>
        </Box>
        <Chip
          label={doneCount === gates.length ? 'READY' : 'ACTION NEEDED'}
          sx={{ bgcolor: alpha(doneCount === gates.length ? '#10b981' : '#f59e0b', 0.12), color: doneCount === gates.length ? '#10b981' : '#f59e0b', fontWeight: 950 }}
        />
      </Stack>
      <Grid container spacing={1.5}>
        {gates.map((step) => (
          <Grid item xs={12} sm={6} md={4} key={step.label}>
            <Paper sx={{ p: 1.75, height: '100%', bgcolor: alpha(step.tone, 0.07), border: `1px solid ${alpha(step.tone, 0.22)}`, borderRadius: 3 }}>
              <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 900 }}>{step.label}</Typography>
                <Chip size="small" label={step.status} sx={{ height: 20, bgcolor: alpha(step.tone, 0.16), color: step.tone, fontWeight: 950, fontSize: '0.62rem' }} />
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'rgba(255,255,255,0.58)', fontWeight: 700 }}>
                {step.detail}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}
