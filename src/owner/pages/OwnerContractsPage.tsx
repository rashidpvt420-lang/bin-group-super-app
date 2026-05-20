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
const money = (value: any) => `AED ${Number(value || 0).toLocaleString()}`;
const readable = (value: any, fallback: string) => {
  const text = String(value || '').trim();
  return !text || ['title', 'desc', 'description', 'undefined', 'null'].includes(text.toLowerCase()) ? fallback : text;
};
const isSignable = (contract: any) => SIGNABLE_STATUSES.includes(String(contract?.status || '').toUpperCase()) || contract?.contractStatus === 'awaiting_owner_signature' || contract?.signatureState?.ownerSigned === false;
const contractPdfUrl = (contract: any) => contract.finalPdfUrl || contract.pdfUrl || `${typeof window !== 'undefined' ? window.location.origin : 'https://bin-groups.com'}/owner/contracts?contract=${encodeURIComponent(contract.id || contract.contractId || '')}`;

export default function OwnerContractsPage() {
  const { user, refreshRole } = useRole();
  const { t, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<'PM_ONLY' | 'BOTH' | null>(null);
  const [signatureName, setSignatureName] = useState('');
  const [signingId, setSigningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const rows = Array.from(seen.values()).sort((a, b) => Number(b.updatedAt?.seconds || 0) - Number(a.updatedAt?.seconds || 0));
      setContracts(rows);
      const scope = rows[0]?.managementScope || rows[0]?.contractType || rows[0]?.planType;
      if (scope === 'pm_only' || scope === 'PM_ONLY') setSelectedService('PM_ONLY');
      if (scope === 'hybrid' || scope === 'both' || scope === 'BOTH') setSelectedService('BOTH');
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

  const hasSignatureRequired = useMemo(() => contracts.some(isSignable), [contracts]);

  const handleSignContract = async (contract: any) => {
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
      const data = result.data as { status?: string };
      setNotice({ type: 'success', text: `Contract signed successfully. Status: ${data?.status || 'READY_FOR_ACTIVATION'}.` });
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
        <Button variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }} onClick={() => contracts[0] && window.open(contractPdfUrl(contracts[0]), '_blank')}>
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

      <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>{t('gov.active_scope') || 'ACTIVE MANAGEMENT SCOPE'}</Typography>
      <Grid container spacing={3} sx={{ mb: 6 }}>
        <Grid item xs={12} md={6}>
          <Paper onClick={() => setSelectedService('PM_ONLY')} sx={{ p: 4, cursor: 'pointer', bgcolor: selectedService === 'PM_ONLY' ? alpha(binThemeTokens.gold, 0.05) : 'rgba(15, 23, 42, 0.4)', border: `2px solid ${selectedService === 'PM_ONLY' ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, borderRadius: 8 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><Briefcase size={24} /></Box>{selectedService === 'PM_ONLY' && <CheckCircle2 color={binThemeTokens.gold} />}</Box>
              <Box><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{readable(t('plan.pm_only.title'), 'Property Management Only')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{readable(t('plan.pm_only.desc'), 'Tenant relations, rent collection, reporting and legal coordination')}</Typography></Box>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
              {['Tenant Relations', 'Rent Collection', 'Legal Compliance'].map((feature) => <Typography key={feature} variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}><Zap size={12} color={binThemeTokens.gold} /> {feature}</Typography>)}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper onClick={() => setSelectedService('BOTH')} sx={{ p: 4, cursor: 'pointer', bgcolor: selectedService === 'BOTH' ? alpha(binThemeTokens.gold, 0.05) : 'rgba(15, 23, 42, 0.4)', border: `2px solid ${selectedService === 'BOTH' ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, borderRadius: 8 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><Award size={24} /></Box>{selectedService === 'BOTH' && <CheckCircle2 color={binThemeTokens.gold} />}</Box>
              <Box><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{readable(t('plan.hybrid.title'), 'Property Management + Facility Maintenance')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{readable(t('plan.hybrid.desc'), 'Full property operations with maintenance, preventive scheduling and service governance')}</Typography></Box>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
              {['PM Core Features', '24/7 Facility Maintenance', 'Preventive Scheduling'].map((feature) => <Typography key={feature} variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}><Zap size={12} color={binThemeTokens.gold} /> {feature}</Typography>)}
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
                const color = STATUS_COLOR[contract.status] || '#10b981';
                return (
                  <TableRow key={contract.id} hover>
                    <TableCell><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>{contract.propertyName || contract.companyProfile?.name || 'Portfolio Contract'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>Ref: #{String(contract.id).slice(0, 8)}</Typography></TableCell>
                    <TableCell><Chip label={contract.packageName || contract.selectedPlan?.name || contract.serviceDetails?.selectedPlan || contract.contractType?.replace('_', ' ') || 'Institutional Package'} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} /></TableCell>
                    <TableCell><Stack direction="row" spacing={1} alignItems="center"><Calendar size={12} color="rgba(255,255,255,0.3)" /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>Active — Continuous</Typography></Stack></TableCell>
                    <TableCell><Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{money(contract.annualValue || contract.annualContractValue || contract.pricing?.annualContractValue || contract.amount)}</Typography></TableCell>
                    <TableCell align="right"><Stack direction="row" justifyContent="flex-end" spacing={1} flexWrap="wrap"><Chip label={needsSignature ? 'SIGNATURE REQUIRED' : (contract.status || 'ACTIVE')} size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(color, 0.1), color }} />{needsSignature ? <Button disabled={signingId === contract.id} size="small" startIcon={<PenLine size={14} />} onClick={() => handleSignContract(contract)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{signingId === contract.id ? 'Signing...' : 'Sign Contract'}</Button> : <Button size="small" startIcon={<ExternalLink size={14} />} onClick={() => window.open(contractPdfUrl(contract), '_blank')} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>PDF</Button>}</Stack></TableCell>
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
