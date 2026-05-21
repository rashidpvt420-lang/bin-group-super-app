import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Award, Briefcase, Calendar, CheckCircle2, Download, ExternalLink, FileText, MailCheck, PenLine, Shield, Zap } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, query, type DocumentData, type QuerySnapshot, type Unsubscribe, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ContractScope = 'FM_ONLY' | 'PM_ONLY' | 'BOTH';

type NoticeState = {
  type: 'success' | 'error' | 'info';
  text: string;
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#10b981',
  SIGNED: '#10b981',
  READY_FOR_ACTIVATION: '#10b981',
  APPROVED_PENDING_OWNER_SIGNATURE: '#f59e0b',
  PENDING_OWNER_SIGNATURE: '#f59e0b',
  PENDING: '#f59e0b',
  PENDING_APPROVAL: '#f59e0b',
  EXPIRED: '#ef4444',
  SUSPENDED: '#f97316',
};

const SIGNABLE_STATUSES = ['PENDING_OWNER_SIGNATURE', 'APPROVED_PENDING_OWNER_SIGNATURE', 'PENDING_SIGNATURE', 'DRAFT', 'PENDING'];
const POST_SIGNATURE_STATUSES = ['READY_FOR_ACTIVATION', 'ACTIVE', 'SIGNED'];

const firstPositiveNumber = (...values: any[]) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
};

const money = (value: any) => {
  const numeric = Number(value || 0);
  return numeric > 0 ? `AED ${numeric.toLocaleString()}` : 'Pending Admin Confirmation';
};

const annualValueOf = (contract: any) => firstPositiveNumber(
  contract?.annualValue,
  contract?.annualContractValue,
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

const mobilizationOf = (contract: any) => {
  const annual = annualValueOf(contract);
  return firstPositiveNumber(
    contract?.mobilizationAmount,
    contract?.mobilizationFee,
    contract?.upfrontAmount,
    contract?.depositAmount,
    contract?.pricing?.mobilizationAmount,
    contract?.pricing?.upfrontAmount,
    contract?.quote?.mobilizationAmount,
    contract?.payment?.amount,
    contract?.paymentAmount,
    annual > 0 ? annual * 0.15 : 0
  );
};

const normalizeScope = (contract: any): ContractScope => {
  const raw = String(
    contract?.serviceType ||
      contract?.selectedContractType ||
      contract?.contractType ||
      contract?.managementScope ||
      contract?.planType ||
      contract?.selectedPlan?.type ||
      contract?.selectedPlan?.name ||
      contract?.serviceDetails?.selectedPlan ||
      contract?.packageName ||
      ''
  ).toLowerCase();

  if (raw.includes('pm_only') || raw.includes('property management only')) return 'PM_ONLY';
  if (raw.includes('hybrid') || raw.includes('both') || raw.includes('pm + fm') || raw.includes('property management +')) return 'BOTH';
  if (raw.includes('maintenance') || raw.includes('fm_only') || raw.includes('facility')) return 'FM_ONLY';
  return 'FM_ONLY';
};

const scopeCopy = (scope: ContractScope) => {
  if (scope === 'PM_ONLY') {
    return {
      title: 'Property Management Only',
      desc: 'Tenant relations, rent collection, reporting and legal coordination',
      features: ['Tenant Relations', 'Rent Collection', 'Legal Compliance'],
      icon: Briefcase,
    };
  }
  if (scope === 'BOTH') {
    return {
      title: 'Property Management + Facility Maintenance',
      desc: 'Full property operations with maintenance, preventive scheduling and service governance',
      features: ['PM Core Features', '24/7 Facility Maintenance', 'Preventive Scheduling'],
      icon: Award,
    };
  }
  return {
    title: 'Maintenance Contract Only',
    desc: 'Facility maintenance, emergency repairs, preventive scheduling and service governance',
    features: ['24/7 Facility Maintenance', 'Emergency Repairs', 'Preventive Scheduling'],
    icon: Shield,
  };
};

const isPostSignature = (contract: any) => {
  const status = String(contract?.status || '').toUpperCase();
  return POST_SIGNATURE_STATUSES.includes(status) || contract?.ownerSigned === true || contract?.signatureStatus === 'OWNER_SIGNED';
};

const isSignable = (contract: any) => {
  if (isPostSignature(contract)) return false;
  const status = String(contract?.status || '').toUpperCase();
  return SIGNABLE_STATUSES.includes(status) || contract?.contractStatus === 'awaiting_owner_signature';
};

const storedContractUrl = (contract: any) => contract?.finalPdfUrl || contract?.pdfUrl || contract?.downloadUrl || contract?.contractUrl || contract?.signedPdfUrl || '';

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const contractHtml = (contract: any) => {
  const scope = scopeCopy(normalizeScope(contract));
  const annual = annualValueOf(contract);
  const mobilization = mobilizationOf(contract);
  const createdAt = contract?.createdAt?.toDate?.()?.toLocaleString?.() || contract?.createdAt || 'N/A';
  const signedAt = contract?.signedAt?.toDate?.()?.toLocaleString?.() || contract?.ownerSignedAt?.toDate?.()?.toLocaleString?.() || 'Pending/Not recorded';
  const features = scope.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BIN GROUP Contract ${escapeHtml(contract?.id || '')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #111827; line-height: 1.5; }
    .header { border-bottom: 3px solid #c8a95b; padding-bottom: 18px; margin-bottom: 28px; }
    .brand { letter-spacing: 4px; color: #9f7e2f; font-weight: 900; font-size: 22px; }
    .title { font-size: 30px; font-weight: 900; margin: 12px 0 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 24px 0; }
    .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px; background: #f9fafb; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #6b7280; font-weight: 800; }
    .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .section { margin-top: 28px; }
    .section h2 { font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    .warning { background: #fff7ed; border: 1px solid #f59e0b; border-radius: 12px; padding: 14px; margin-top: 18px; }
    .sign { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
    .line { border-top: 1px solid #111827; padding-top: 10px; font-size: 12px; color: #374151; }
    @media print { button { display: none; } body { margin: 24px; } }
  </style>
</head>
<body>
  <button onclick="window.print()" style="float:right;padding:10px 16px;border-radius:8px;border:1px solid #c8a95b;background:#c8a95b;font-weight:800;">Print / Save as PDF</button>
  <div class="header">
    <div class="brand">BIN GROUP</div>
    <div class="title">Owner Service Agreement</div>
    <p>Institutional property management and facility maintenance contract record.</p>
  </div>

  <div class="grid">
    <div class="card"><div class="label">Contract Reference</div><div class="value">${escapeHtml(contract?.id || contract?.contractId || 'N/A')}</div></div>
    <div class="card"><div class="label">Status</div><div class="value">${escapeHtml(contract?.status || 'N/A')}</div></div>
    <div class="card"><div class="label">Property / Portfolio</div><div class="value">${escapeHtml(contract?.propertyName || contract?.companyProfile?.name || 'Portfolio')}</div></div>
    <div class="card"><div class="label">Owner</div><div class="value">${escapeHtml(contract?.ownerEmail || contract?.companyProfile?.email || 'N/A')}</div></div>
    <div class="card"><div class="label">Annual Value</div><div class="value">${escapeHtml(money(annual))}</div></div>
    <div class="card"><div class="label">15% Mobilization</div><div class="value">${escapeHtml(money(mobilization))}</div></div>
  </div>

  <div class="section">
    <h2>Contract Scope</h2>
    <p><strong>${escapeHtml(scope.title)}</strong></p>
    <p>${escapeHtml(scope.desc)}</p>
    <ul>${features}</ul>
  </div>

  <div class="section">
    <h2>Governance Terms</h2>
    <p>Dashboard access is controlled by verified payment status and active contract status. Owner signature alone does not unlock the dashboard.</p>
    <p>Admin must verify payment before contract activation and full access.</p>
    ${annual <= 0 || mobilization <= 0 ? '<div class="warning"><strong>Amount pending admin confirmation.</strong> This generated copy reflects the current record. Admin must confirm the contract amount before final dashboard unlock.</div>' : ''}
  </div>

  <div class="section">
    <h2>Audit Trail</h2>
    <p><strong>Created:</strong> ${escapeHtml(createdAt)}</p>
    <p><strong>Signed:</strong> ${escapeHtml(signedAt)}</p>
    <p><strong>Signature Status:</strong> ${escapeHtml(contract?.signatureStatus || (contract?.ownerSigned ? 'OWNER_SIGNED' : 'PENDING'))}</p>
  </div>

  <div class="sign">
    <div class="line">Owner Signature / Electronic Acceptance</div>
    <div class="line">BIN GROUP Admin Verification</div>
  </div>
</body>
</html>`;
};

const downloadGeneratedContract = (contract: any) => {
  const blob = new Blob([contractHtml(contract)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeRef = String(contract?.id || contract?.contractId || 'contract').replace(/[^a-z0-9_-]/gi, '_');
  a.href = url;
  a.download = `BIN-GROUP-contract-${safeRef}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const openOrDownloadContract = (contract: any) => {
  if (!contract) return;
  const url = storedContractUrl(contract);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  downloadGeneratedContract(contract);
};

export default function OwnerContractsPage() {
  const { user, refreshRole } = useRole();
  const { t, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  const [signatureName, setSignatureName] = useState('');
  const [signingId, setSigningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    if (!user?.email && !user?.uid) {
      setContracts([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const seen = new Map<string, any>();
    const email = String(user?.email || '').toLowerCase();

    const apply = (snap: QuerySnapshot<DocumentData>) => {
      snap.docs.forEach((doc) => seen.set(doc.id, { id: doc.id, ...doc.data() }));
      setContracts(Array.from(seen.values()).sort((a, b) => Number(b.updatedAt?.seconds || 0) - Number(a.updatedAt?.seconds || 0)));
      setLoading(false);
    };

    const fail = (err: any) => {
      console.error('Owner contracts query failed:', err);
      setNotice({ type: 'error', text: err?.message || 'Unable to load contracts.' });
      setLoading(false);
    };

    const unsubs: Unsubscribe[] = [];
    if (user?.uid) {
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerUid', '==', user.uid)), apply, fail));
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerId', '==', user.uid)), apply, fail));
    }
    if (email) {
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerEmail', '==', email)), apply, fail));
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerEmail', '==', user?.email || email)), apply, fail));
    }
    setSignatureName(user?.displayName || user?.email || '');
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user?.displayName, user?.email, user?.uid]);

  const primaryContract = useMemo(() => contracts.find(isSignable) || contracts.find(isPostSignature) || contracts[0], [contracts]);
  const selectedScope = normalizeScope(primaryContract);
  const selectedScopeCopy = scopeCopy(selectedScope);
  const ScopeIcon = selectedScopeCopy.icon;
  const hasSignatureRequired = useMemo(() => contracts.some(isSignable), [contracts]);

  const handleSignContract = async (contract: any) => {
    if (isPostSignature(contract)) {
      setNotice({ type: 'info', text: 'This contract is already signed and ready for activation/payment verification.' });
      return;
    }

    const name = signatureName.trim() || user?.displayName || user?.email || '';
    if (!name) {
      setNotice({ type: 'error', text: 'Enter your full legal name before signing.' });
      return;
    }
    if (!contract?.id) {
      setNotice({ type: 'error', text: 'No contract ID found for signing.' });
      return;
    }
    if (!window.confirm('Sign this contract electronically?')) return;

    setSigningId(contract.id);
    setNotice(null);
    try {
      const signContract = httpsCallable(functions, 'ownerSignContract');
      const result = await signContract({ contractId: contract.id, signatureName: name, acceptedTerms: true });
      const data = result.data as { status?: string; idempotent?: boolean };
      setNotice({ type: 'success', text: data?.idempotent ? 'Contract is already signed and ready for activation/payment verification.' : `Contract signed successfully. Status: ${data?.status || 'READY_FOR_ACTIVATION'}.` });
      setSignatureName('');
      await refreshRole?.();
    } catch (err: any) {
      console.error('Contract signature failed:', err);
      setNotice({ type: 'error', text: err?.message || 'Contract signature failed. Please try again or contact BIN GROUP admin.' });
    } finally {
      setSigningId(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ height: '60vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('gov.institutional_governance') || 'INSTITUTIONAL GOVERNANCE'}</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{t('nav.contracts') || 'Contracts'}</Typography>
        </Box>
        <Button variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }} onClick={() => openOrDownloadContract(contracts[0])}>
          Download Master
        </Button>
      </Box>

      {notice && <Alert severity={notice.type} sx={{ mb: 3 }}>{notice.text}</Alert>}

      {hasSignatureRequired && (
        <Paper sx={{ p: 4, mb: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}`, borderRadius: 5 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', display: 'flex', gap: 1, alignItems: 'center' }}><PenLine color={binThemeTokens.gold} /> Contract Signature Required</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>Type your full legal name and sign. The backend verifies ownership and records the signature. Dashboard unlock still requires payment verification.</Typography>
            <TextField label="Full legal name for e-signature" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#FFF' } }} />
          </Stack>
        </Paper>
      )}

      <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>
        {isPostSignature(primaryContract) ? 'LOCKED CONTRACT SCOPE' : 'SELECTED CONTRACT SCOPE'}
      </Typography>
      <Grid container spacing={3} sx={{ mb: 6 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `2px solid ${binThemeTokens.gold}`, borderRadius: 8 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><ScopeIcon size={24} /></Box>
                <CheckCircle2 color={binThemeTokens.gold} />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{selectedScopeCopy.title}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{selectedScopeCopy.desc}</Typography>
              </Box>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
              {selectedScopeCopy.features.map((feature) => <Typography key={feature} variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}><Zap size={12} color={binThemeTokens.gold} /> {feature}</Typography>)}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>{t('gov.active_agreements') || 'ACTIVE SERVICE AGREEMENTS'}</Typography>
      {contracts.length === 0 ? (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}><FileText size={48} color="rgba(255,255,255,0.08)" /><Typography sx={{ color: 'rgba(255,255,255,0.25)', fontWeight: 800 }}>NO CONTRACTS ON RECORD</Typography></Paper>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
          <Table>
            <TableHead><TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}><TableCell>PROPERTY / ASSET</TableCell><TableCell>SERVICE LEVEL</TableCell><TableCell>VALIDITY</TableCell><TableCell>ANNUAL VALUE</TableCell><TableCell align="right">GOVERNANCE</TableCell></TableRow></TableHead>
            <TableBody>
              {contracts.map((contract) => {
                const needsSignature = isSignable(contract);
                const contractScope = scopeCopy(normalizeScope(contract));
                const color = STATUS_COLOR[contract.status] || '#10b981';
                const annual = annualValueOf(contract);
                return (
                  <TableRow key={contract.id} hover>
                    <TableCell><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>{contract.propertyName || contract.companyProfile?.name || 'Portfolio Contract'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>Ref: #{String(contract.id).slice(0, 8)}</Typography></TableCell>
                    <TableCell><Chip label={contract.packageName || contract.selectedPlan?.name || contract.serviceDetails?.selectedPlan || contract.contractType?.replace('_', ' ') || contractScope.title} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} /></TableCell>
                    <TableCell><Stack direction="row" spacing={1} alignItems="center"><Calendar size={12} color="rgba(255,255,255,0.3)" /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>Active — Continuous</Typography></Stack></TableCell>
                    <TableCell><Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{money(annual)}</Typography></TableCell>
                    <TableCell align="right"><Stack direction="row" justifyContent="flex-end" spacing={1} flexWrap="wrap"><Chip label={needsSignature ? 'SIGNATURE REQUIRED' : (contract.status || 'ACTIVE')} size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(color, 0.1), color }} />{needsSignature ? <Button disabled={signingId === contract.id} size="small" startIcon={<PenLine size={14} />} onClick={() => handleSignContract(contract)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{signingId === contract.id ? 'Signing...' : 'Sign Contract'}</Button> : <Button size="small" startIcon={<Download size={14} />} onClick={() => openOrDownloadContract(contract)} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{storedContractUrl(contract) ? 'PDF' : 'Download'}</Button>}</Stack></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
        <Grid container spacing={4} alignItems="center"><Grid item xs={12} md={9}><Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Shield size={16} /> SERVICE LEVEL ASSURANCE</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>Owner signature moves the agreement to activation readiness; payment verification still controls dashboard unlock.</Typography></Grid><Grid item xs={12} md={3} sx={{ textAlign: 'right' }}><Button variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, px: 3, borderRadius: 3 }} startIcon={<MailCheck size={16} />}>Email Enabled</Button></Grid></Grid>
      </Paper>
    </Box>
  );
}
