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
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Award, Briefcase, Calendar, CheckCircle2, Download, FileText, PenLine, Shield, Zap } from 'lucide-react';
import { collection, db, doc, functions, getDoc, getDocs, httpsCallable, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ContractScope = 'FM_ONLY' | 'PM_ONLY' | 'BOTH';
type NoticeState = { type: 'success' | 'error' | 'info' | 'warning'; text: string };

const SIGNABLE_STATUSES = ['PENDING_OWNER_SIGNATURE', 'APPROVED_PENDING_OWNER_SIGNATURE', 'PENDING_SIGNATURE', 'DRAFT', 'PENDING'];
const POST_SIGNATURE_STATUSES = ['READY_FOR_ACTIVATION', 'ACTIVE', 'SIGNED'];
const CONTRACT_TERM_MONTHS = 13;

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const compact = (values: unknown[]) => Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

const emailLookupCandidates = (value: unknown) => {
  const email = normalizeEmail(value);
  if (!email || !email.includes('@')) return [];
  const [local, domain] = email.split('@');
  if (!local || !domain) return [email];
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const variants = new Set<string>([email, `${local}@${normalizedDomain}`]);
  if (normalizedDomain === 'gmail.com') variants.add(`${local.split('+')[0].replace(/\./g, '')}@${normalizedDomain}`);
  return Array.from(variants);
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const firstPositiveNumber = (...values: unknown[]) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
};

const asDate = (...values: any[]) => {
  for (const value of values) {
    if (!value) continue;
    const candidate = value?.toDate?.() || value;
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) return candidate;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof candidate === 'object' && Number.isFinite(Number(candidate.seconds))) {
      const parsed = new Date(Number(candidate.seconds) * 1000);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
};

const addMonths = (date: Date, months: number) => {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

const termDates = (contract: any) => {
  const start = asDate(contract?.ownerSignature?.signedAt, contract?.ownerSignedAt, contract?.signedAt, contract?.effectiveFrom, contract?.validFrom, contract?.startedAt, contract?.createdAt) || new Date();
  const end = asDate(contract?.effectiveTo, contract?.validTo, contract?.expiresAt, contract?.endDate, contract?.expiryDate) || addMonths(start, Number(contract?.contractTermMonths || CONTRACT_TERM_MONTHS));
  const firstMonthEnd = asDate(contract?.firstMonthWindowEndsAt, contract?.ownerCanRequestPlanChangeUntil, contract?.ownerSignature?.firstMonthWindowEndsAt) || addMonths(start, 1);
  return { start, end, firstMonthEnd };
};

const termSummaryText = (contract: any) => {
  const term = termDates(contract);
  return `${CONTRACT_TERM_MONTHS} months: ${term.start.toLocaleDateString()} → ${term.end.toLocaleDateString()}`;
};

const annualValueOf = (contract: any) => firstPositiveNumber(
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
  contract?.quote?.annualContractValue,
  contract?.payment?.annualValue,
  contract?.amount
);

const mobilizationOf = (contract: any) => {
  const annual = annualValueOf(contract);
  return firstPositiveNumber(
    contract?.commercialSchedule?.mobilizationAmount,
    contract?.paymentSchedule?.mobilizationAmount,
    contract?.mobilizationAmount,
    contract?.depositAmount,
    contract?.mobilizationFee,
    contract?.upfrontAmount,
    contract?.pricing?.mobilizationAmount,
    contract?.quote?.mobilizationAmount,
    contract?.payment?.amount,
    contract?.paymentAmount,
    annual > 0 ? annual * 0.15 : 0
  );
};

const money = (value: unknown) => {
  const numeric = Number(value || 0);
  return numeric > 0 ? `AED ${Math.round(numeric).toLocaleString()}` : 'Pending admin confirmation';
};

const normalizeScope = (contract: any): ContractScope => {
  const raw = String(
    contract?.commercialSchedule?.selectedContractType ||
      contract?.serviceType ||
      contract?.selectedContractType ||
      contract?.contractType ||
      contract?.managementScope ||
      contract?.planType ||
      contract?.selectedPlan?.name ||
      contract?.serviceDetails?.selectedPlan ||
      contract?.packageName ||
      ''
  ).toLowerCase();

  if (raw.includes('pm_only') || raw.includes('property management only')) return 'PM_ONLY';
  if (raw.includes('hybrid') || raw.includes('both') || raw.includes('pm + fm') || raw.includes('property management +')) return 'BOTH';
  return 'FM_ONLY';
};

const scopeCopy = (scope: ContractScope) => {
  if (scope === 'PM_ONLY') return { title: 'Property Management Only', desc: 'Tenant relations, rent collection, reporting and legal coordination', features: ['Tenant Relations', 'Rent Collection', 'Legal Compliance'], icon: Briefcase };
  if (scope === 'BOTH') return { title: 'Property Management + Facility Maintenance', desc: 'Full property operations with maintenance, preventive scheduling and service governance', features: ['PM Core Features', '24/7 Facility Maintenance', 'Preventive Scheduling'], icon: Award };
  return { title: 'Maintenance Contract Only', desc: 'Facility maintenance, emergency repairs, preventive scheduling and service governance', features: ['24/7 Facility Maintenance', 'Emergency Repairs', 'Preventive Scheduling'], icon: Shield };
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

const openOrDownloadContract = (contract: any) => {
  if (!contract) return;
  const url = storedContractUrl(contract);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>BIN GROUP Contract</title></head><body style="font-family:Arial;padding:32px"><h1>BIN GROUP Owner Service Agreement</h1><p><b>Reference:</b> ${contract.id || contract.contractId || 'N/A'}</p><p><b>Owner:</b> ${firstText(contract.ownerName, contract.companyProfile?.name, 'Owner')}</p><p><b>Email:</b> ${firstText(contract.ownerEmail, contract.emailDelivery?.recipient, contract.companyProfile?.email, 'N/A')}</p><p><b>Status:</b> ${contract.status || contract.activationStatus || 'N/A'}</p><p><b>Package:</b> ${contract.packageName || contract.planType || normalizeScope(contract)}</p><p><b>Annual Value:</b> ${money(annualValueOf(contract))}</p><p><b>15% Mobilization:</b> ${money(mobilizationOf(contract))}</p></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `BIN-GROUP-contract-${String(contract.id || contract.contractId || 'contract').replace(/[^a-z0-9_-]/gi, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
};

async function safeQueryContracts(field: string, value: string) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, 'contracts'), where(field, '==', value)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn(`[OwnerContractsResolved] optional contracts lookup denied/skipped: ${field}`, error);
    return [] as any[];
  }
}

async function safeReadContract(contractId: string) {
  if (!contractId) return null;
  try {
    const snap = await getDoc(doc(db, 'contracts', contractId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn('[OwnerContractsResolved] direct contract lookup denied/skipped:', contractId, error);
    return null;
  }
}

export default function OwnerContractsResolvedPage() {
  const { user, refreshRole } = useRole();
  const { t, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  const [signatureName, setSignatureName] = useState('');
  const [signingId, setSigningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const contractIdFromUrl = useMemo(() => new URLSearchParams(window.location.search).get('contractId'), []);

  useEffect(() => {
    let alive = true;
    async function loadContracts() {
      if (!user?.email && !user?.uid) {
        setContracts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotice(null);
      const seen = new Map<string, any>();
      const ids = compact([
        contractIdFromUrl,
        (user as any)?.pendingContractId,
        (user as any)?.latestActivationContractId,
        (user as any)?.activeContractId,
        (user as any)?.contractId,
        (user as any)?.latestContractId,
      ]);

      for (const contractId of ids) {
        const contract = await safeReadContract(contractId);
        if (contract?.id) seen.set(contract.id, contract);
      }

      const ownerIds = compact([user?.uid, (user as any)?.ownerId, (user as any)?.ownerUid, ...((Array.isArray((user as any)?.linkedOwnerIds) ? (user as any).linkedOwnerIds : []) as unknown[])]);
      for (const ownerId of ownerIds) {
        for (const c of await safeQueryContracts('ownerUid', ownerId)) seen.set(c.id, c);
        for (const c of await safeQueryContracts('ownerId', ownerId)) seen.set(c.id, c);
      }

      const emails = compact([
        ...emailLookupCandidates(user?.email),
        ...emailLookupCandidates((user as any)?.ownerEmail),
      ]);
      for (const email of emails) {
        for (const c of await safeQueryContracts('ownerEmail', email)) seen.set(c.id, c);
        for (const c of await safeQueryContracts('emailDelivery.recipient', email)) seen.set(c.id, c);
        for (const c of await safeQueryContracts('companyProfile.email', email)) seen.set(c.id, c);
      }

      const sorted = Array.from(seen.values()).sort((a, b) => {
        const aSignable = isSignable(a);
        const bSignable = isSignable(b);
        if (aSignable && !bSignable) return -1;
        if (!aSignable && bSignable) return 1;
        const aPost = isPostSignature(a);
        const bPost = isPostSignature(b);
        if (aPost && !bPost) return -1;
        if (!aPost && bPost) return 1;
        const aTime = Number(a?.updatedAt?.seconds || a?.createdAt?.seconds || 0);
        const bTime = Number(b?.updatedAt?.seconds || b?.createdAt?.seconds || 0);
        return bTime - aTime;
      });

      if (!alive) return;
      setContracts(sorted);
      setSignatureName(user?.displayName || user?.email || '');
      if (sorted.length === 0) setNotice({ type: 'warning', text: 'No contracts were found for this owner identity yet.' });
      setLoading(false);
    }

    loadContracts();
    return () => { alive = false; };
  }, [user?.displayName, user?.email, user?.uid, contractIdFromUrl]);

  const primaryContract = useMemo(() => contracts.find(isSignable) || contracts.find(isPostSignature) || contracts[0], [contracts]);
  const selectedScope = normalizeScope(primaryContract);
  const selectedScopeCopy = scopeCopy(selectedScope);
  const ScopeIcon = selectedScopeCopy.icon;
  const hasSignatureRequired = useMemo(() => contracts.some(isSignable), [contracts]);
  const urlContractNotFound = useMemo(() => !!contractIdFromUrl && !contracts.some((c) => c.id === contractIdFromUrl), [contractIdFromUrl, contracts]);

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
      const data = result.data as { status?: string; idempotent?: boolean; termSummary?: any };
      setNotice({ type: 'success', text: data?.idempotent ? 'Contract is already signed and ready for activation/payment verification.' : `Contract signed successfully. Status: ${data?.status || 'READY_FOR_ACTIVATION'}.` });
      await refreshRole?.();
      window.location.reload();
    } catch (err: any) {
      console.error('Contract signature failed:', err);
      setNotice({ type: 'error', text: err?.message || 'Contract signature failed. Please try again or contact BIN GROUP admin.' });
    } finally {
      setSigningId(null);
    }
  };

  if (loading) {
    return <Box sx={{ height: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('gov.institutional_governance') || 'INSTITUTIONAL GOVERNANCE'}</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{t('nav.contracts') || 'Contracts'}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.5)', mt: 1 }}>Permission-safe contract lookup using linked UID, email and direct contract records.</Typography>
        </Box>
        <Button disabled={!contracts[0]} variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }} onClick={() => openOrDownloadContract(contracts[0])}>
          Download Master
        </Button>
      </Box>

      {urlContractNotFound && <Alert severity="warning" sx={{ mb: 3 }}>The contract link was not found by direct ID, but other linked agreements may still be shown below.</Alert>}
      {notice && <Alert severity={notice.type} sx={{ mb: 3 }}>{notice.text}</Alert>}

      {hasSignatureRequired && primaryContract && (
        <Paper sx={{ p: 4, mb: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}`, borderRadius: 5 }}>
          <Stack spacing={3}>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', display: 'flex', gap: 1, alignItems: 'center' }}><PenLine color={binThemeTokens.gold} /> Contract Signature Required</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>Type your full legal name and sign. Dashboard unlock still requires payment verification.</Typography>
            <TextField fullWidth label="Full legal name for e-signature" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#FFF' } }} />
            <Button variant="contained" disabled={signingId === primaryContract.id} onClick={() => handleSignContract(primaryContract)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3, alignSelf: 'flex-start' }}>
              {signingId === primaryContract.id ? 'Signing...' : 'Review & Sign Contract'}
            </Button>
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

      <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>ACTIVE AGREEMENTS</Typography>
      {contracts.length === 0 ? (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}><FileText size={48} color="rgba(255,255,255,0.08)" /><Typography sx={{ color: 'rgba(255,255,255,0.25)', fontWeight: 800 }}>NO CONTRACTS ON RECORD</Typography></Paper>
      ) : (
        <Grid container spacing={2}>
          {contracts.map((contract) => {
            const contractScope = scopeCopy(normalizeScope(contract));
            return (
              <Grid item xs={12} key={contract.id}>
                <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.55)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 5 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={4}>
                      <Typography variant="body1" sx={{ color: '#FFF', fontWeight: 950 }}>{contract.propertyName || contract.companyProfile?.name || 'Portfolio Contract'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.35)', fontWeight: 800 }}>Ref: #{String(contract.id).slice(0, 8)}</Typography>
                    </Grid>
                    <Grid item xs={12} md={3}><Chip label={contract.packageName || contract.selectedPlan?.name || contract.serviceDetails?.selectedPlan || contractScope.title} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} /></Grid>
                    <Grid item xs={12} md={3}><Stack direction="row" spacing={1} alignItems="center"><Calendar size={14} color="rgba(255,255,255,.45)" /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.65)', fontWeight: 800 }}>{termSummaryText(contract)}</Typography></Stack></Grid>
                    <Grid item xs={12} md={2}><Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}><Button size="small" startIcon={<Download size={14} />} onClick={() => openOrDownloadContract(contract)} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Download</Button></Stack></Grid>
                  </Grid>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
