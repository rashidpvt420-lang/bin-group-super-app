import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import { AlertCircle, Building, Building2, CheckCircle2, Clock, DollarSign, FileText, Info, Plus } from 'lucide-react';
import { addDoc, collection, db, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const clean = (value: unknown) => String(value || '').trim();
const amountOf = (value: unknown) => {
  const parsed = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const BROKER_COMMISSION_RATE = 0.10;
const uniqueRows = (rows: any[]) => Array.from(new Map(rows.map((row) => [String(row.id), row])).values());
const rowTime = (row: any) => row?.createdAt?.toDate ? row.createdAt.toDate().getTime() : row?.createdAt?.seconds ? row.createdAt.seconds * 1000 : 0;

export default function BrokerReferralsPage({ openFormByDefault = false }: { openFormByDefault?: boolean }) {
  const { user } = useRole();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');

  const [openAdd, setOpenAdd] = useState(openFormByDefault);
  const [submitting, setSubmitting] = useState(false);
  const [referralType, setReferralType] = useState('property');
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [location, setLocation] = useState('');
  const [units, setUnits] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [notes, setNotes] = useState('');
  const [propertiesList, setPropertiesList] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [contractType, setContractType] = useState('annual_lease');
  const [signedDate, setSignedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (openFormByDefault) setOpenAdd(true);
  }, [openFormByDefault]);

  useEffect(() => {
    if (!user?.uid) return;
    const buckets: Record<string, any[]> = {};
    const unsubs: Array<() => void> = [];
    const identitySources = [
      { field: 'brokerId', value: user.uid },
      { field: 'brokerUid', value: user.uid },
      { field: 'createdByUid', value: user.uid },
      { field: 'brokerEmail', value: normalizeEmail(user.email) },
    ].filter((source) => source.value);

    const refresh = () => {
      const rows = uniqueRows(Object.values(buckets).flat()).sort((a, b) => rowTime(b) - rowTime(a));
      setReferrals(rows);
      setLoading(false);
    };

    identitySources.forEach((source) => {
      const key = `${source.field}:${source.value}`;
      const q = query(collection(db, 'referrals'), where(source.field, '==', source.value), orderBy('createdAt', 'desc'));
      unsubs.push(onSnapshot(q, (snap) => {
        buckets[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        refresh();
      }, (err) => {
        console.warn(`[BrokerReferrals] ${source.field} listener failed:`, err);
        setWarning('Some referral records could not load. Check Firestore access if this persists.');
        setLoading(false);
      }));
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid, user?.email]);

  useEffect(() => {
    const q = query(collection(db, 'properties'));
    const unsub = onSnapshot(q, (snap) => {
      setPropertiesList(snap.docs.map((propertyDoc) => ({ id: propertyDoc.id, ...propertyDoc.data() })));
    }, (err) => console.warn('[BrokerReferrals] properties listener failed:', err));
    return () => unsub();
  }, []);

  const resetForm = () => {
    setClientName('');
    setPhone('');
    setEmail('');
    setPropertyName('');
    setPropertyType('');
    setLocation('');
    setUnits('');
    setEstimatedValue('');
    setNotes('');
    setSelectedPropertyId('');
    setContractType('annual_lease');
    setSignedDate(new Date().toISOString().split('T')[0]);
  };

  const handleAddReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !clientName.trim()) return;
    setSubmitting(true);
    setWarning('');
    try {
      let finalPropertyName = clean(propertyName);
      let finalLocation = clean(location);
      let matchedProp: any = null;
      if (referralType === 'contract' && selectedPropertyId) {
        matchedProp = propertiesList.find((p) => p.id === selectedPropertyId) || null;
        if (matchedProp) {
          finalPropertyName = clean(matchedProp.propertyName || matchedProp.name || '');
          finalLocation = clean(matchedProp.location || matchedProp.emirate || '');
        }
      }

      const brokerId = String(user.uid);
      const brokerEmail = normalizeEmail(user.email);
      const brokerName = clean(user.displayName || user.email || 'Broker Partner');
      const estimatedAmount = amountOf(estimatedValue);
      const baseAttribution = {
        attributionSource: 'BROKER_PORTAL_REFERRAL',
        sourceChannel: 'broker_portal',
        brokerId,
        brokerUid: brokerId,
        brokerEmail,
        brokerName,
        brokerDisplayName: brokerName,
        createdByUid: brokerId,
        broughtByRole: 'broker',
        broughtByUid: brokerId,
        broughtByEmail: brokerEmail,
        attributionProof: {
          clientName: clean(clientName),
          phone: clean(phone),
          email: normalizeEmail(email),
          propertyName: finalPropertyName,
          location: finalLocation,
          estimatedValue: estimatedAmount,
          referralType,
          capturedFrom: 'broker_referrals_page',
        },
      };

      const refRef = doc(collection(db, 'referrals'));
      const attributionId = `broker_referral_${brokerId}_${refRef.id}`;
      const referralData: any = {
        ...baseAttribution,
        attributionId,
        sourceReferralId: refRef.id,
        referralType,
        clientName: clean(clientName),
        phone: clean(phone),
        email: normalizeEmail(email),
        notes: clean(notes),
        status: 'submitted',
        lifecycleStatus: 'REFERRAL_SUBMITTED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (referralType === 'contract') {
        referralData.propertyId = selectedPropertyId;
        referralData.propertyName = finalPropertyName;
        referralData.location = finalLocation;
        referralData.ownerId = matchedProp?.ownerId || matchedProp?.ownerUid || '';
        referralData.ownerUid = matchedProp?.ownerUid || matchedProp?.ownerId || '';
        referralData.ownerEmail = normalizeEmail(matchedProp?.ownerEmail);
        referralData.contractType = contractType;
        referralData.estimatedValue = estimatedAmount;
        referralData.signedDate = signedDate;
        referralData.commissionStatus = 'PENDING';
        referralData.commissionRate = BROKER_COMMISSION_RATE;
        referralData.commissionAmount = Math.round(estimatedAmount * BROKER_COMMISSION_RATE);
        referralData.commissionCreationStatus = 'PENDING_ADMIN_CONTRACT_MATCH';
      } else {
        referralData.propertyName = clean(propertyName);
        referralData.propertyType = clean(propertyType);
        referralData.location = clean(location);
        referralData.units = clean(units);
        referralData.estimatedValue = estimatedAmount;
      }

      await setDoc(refRef, referralData);

      const auditPayload = {
        actorId: brokerId,
        actorRole: 'broker',
        action: 'BROKER_REFERRAL_SUBMITTED',
        targetType: 'BROKER_REFERRAL',
        targetId: refRef.id,
        module: 'broker_referrals',
        status: 'RECORDED',
        brokerId,
        brokerUid: brokerId,
        brokerEmail,
        attributionId,
        metadata: {
          referralType,
          clientName: clean(clientName),
          propertyId: selectedPropertyId,
          propertyName: finalPropertyName,
          estimatedAmount,
          contractType: referralType === 'contract' ? contractType : null,
        },
        createdAt: serverTimestamp(),
      };

      await Promise.all([
        addDoc(collection(db, 'audit_logs'), auditPayload),
        addDoc(collection(db, 'auditLogs'), { ...auditPayload, referralId: refRef.id, timestamp: serverTimestamp() }),
      ]);

      setOpenAdd(false);
      resetForm();
    } catch (err) {
      console.error('Failed to add referral', err);
      setWarning('Referral could not be submitted. Check access or try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved': return { color: '#10b981', icon: <CheckCircle2 size={14} />, label: 'APPROVED' };
      case 'rejected': return { color: '#ef4444', icon: <AlertCircle size={14} />, label: 'REJECTED' };
      case 'under_review': return { color: binThemeTokens.gold, icon: <Clock size={14} />, label: 'UNDER REVIEW' };
      default: return { color: '#3b82f6', icon: <Clock size={14} />, label: 'SUBMITTED' };
    }
  };

  return (
    <BrokerPageFrame
      title="Referral Network"
      subtitle="Submit and monitor owner, property, and contract referrals with attribution proof"
      loading={loading}
      actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3, boxShadow: `0 10px 20px -5px ${alpha(binThemeTokens.gold, 0.4)}` }}>SUBMIT REFERRAL</Button>}
    >
      {warning && <Alert severity="warning" sx={{ mb: 3 }}>{warning}</Alert>}
      {referrals.length === 0 ? (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: binThemeTokens.softCanvas, borderRadius: 6, border: '1px dashed #E5E7EB' }}>
          <Building2 size={48} color="#9CA3AF" />
          <Typography variant="h6" sx={{ color: '#9CA3AF', fontWeight: 900, mt: 2 }}>NO REFERRALS RECORDED</Typography>
          <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>Start by clicking the "Submit Referral" button above.</Typography>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {referrals.map((ref) => {
            const status = getStatusConfig(ref.status);
            return (
              <Paper key={ref.id} sx={{ p: 0, bgcolor: binThemeTokens.softCanvas, borderRadius: 6, border: '1px solid #E5E7EB', overflow: 'hidden', transition: 'all 0.3s ease', '&:hover': { borderColor: alpha(status.color, 0.3), bgcolor: '#FFFFFF' } }}>
                <Grid container>
                  <Grid item xs={1} md={0.5} sx={{ bgcolor: alpha(status.color, 0.1), borderRight: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Box sx={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap', color: status.color, fontWeight: 950, fontSize: '0.6rem', letterSpacing: 2 }}>{status.label}</Box>
                  </Grid>
                  <Grid item xs={11} md={11.5} sx={{ p: 4 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                          <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary}>{ref.clientName}</Typography>
                          <Chip label={String(ref.referralType || 'referral').toUpperCase()} size="small" sx={{ bgcolor: '#F3F4F6', color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.6rem' }} />
                          <Chip label={ref.attributionId ? 'ATTRIBUTED' : 'ATTRIBUTION PENDING'} size="small" sx={{ bgcolor: alpha(ref.attributionId ? '#10b981' : '#f59e0b', 0.1), color: ref.attributionId ? '#10b981' : '#f59e0b', fontWeight: 900, fontSize: '0.6rem' }} />
                        </Stack>
                        <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}><Building size={14} /> {ref.propertyName || 'Unnamed Asset'} • {ref.location || 'Unknown Location'}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mt: 1, wordBreak: 'break-all' }}>ATTRIBUTION: {ref.attributionId || `broker_referral_${user?.uid}_${ref.id}`}</Typography>
                      </Box>
                      <Stack direction="row" spacing={4} sx={{ minWidth: { md: 400 } }}>
                        <Box><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1 }}>EST. VALUE</Typography><Typography variant="body1" fontWeight="950" color={binThemeTokens.textPrimary}>{ref.estimatedValue ? `AED ${Number(ref.estimatedValue).toLocaleString()}` : 'N/A'}</Typography></Box>
                        <Box><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1 }}>COMMISSION</Typography><Typography variant="body1" fontWeight="950" color={binThemeTokens.textPrimary}>{ref.commissionAmount ? `AED ${Number(ref.commissionAmount).toLocaleString()}` : ref.commissionStatus || 'N/A'}</Typography></Box>
                        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}><Tooltip title="View Referral Audit"><IconButton sx={{ bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 3, color: binThemeTokens.textSecondary }}><FileText size={20} /></IconButton></Tooltip></Box>
                      </Stack>
                    </Stack>
                    {ref.notes && <Box sx={{ mt: 3, p: 2, bgcolor: '#F3F4F6', borderRadius: 3, border: '1px solid #E5E7EB' }}><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>NOTES</Typography><Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, mt: 0.5 }}>{ref.notes}</Typography></Box>}
                    <Divider sx={{ my: 3 }} />
                    <Stack direction="row" spacing={2} alignItems="center"><Info size={16} color={binThemeTokens.gold} /><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{ref.commissionStatus ? `Commission: ${ref.commissionStatus}` : 'Awaiting Admin Review'}</Typography></Stack>
                  </Grid>
                </Grid>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 950 }}>Submit New Referral</DialogTitle>
        <form onSubmit={handleAddReferral}>
          <DialogContent>
            <Stack spacing={3} sx={{ mt: 1 }}>
              <TextField select label="Referral Type" value={referralType} onChange={(e) => setReferralType(e.target.value)} fullWidth><MenuItem value="property">Property Owner / Asset</MenuItem><MenuItem value="contract">Contract / Lease Opportunity</MenuItem></TextField>
              <Grid container spacing={2}><Grid item xs={12} md={6}><TextField required label="Client / Owner Name" value={clientName} onChange={(e) => setClientName(e.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth /></Grid><Grid item xs={12}><TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth /></Grid></Grid>
              {referralType === 'contract' ? <><TextField select label="Select BIN GROUP Property" value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} fullWidth>{propertiesList.map((prop) => <MenuItem key={prop.id} value={prop.id}>{prop.propertyName || prop.name || prop.id}</MenuItem>)}</TextField><Grid container spacing={2}><Grid item xs={12} md={6}><TextField select label="Contract Type" value={contractType} onChange={(e) => setContractType(e.target.value)} fullWidth><MenuItem value="annual_lease">Annual Lease</MenuItem><MenuItem value="maintenance_contract">Maintenance Contract</MenuItem><MenuItem value="property_management">Property Management</MenuItem></TextField></Grid><Grid item xs={12} md={6}><TextField type="date" label="Signed / Expected Date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid></Grid></> : <Grid container spacing={2}><Grid item xs={12} md={6}><TextField label="Property Name" value={propertyName} onChange={(e) => setPropertyName(e.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label="Property Type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label="Location" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth /></Grid><Grid item xs={12} md={6}><TextField label="Number of Units" value={units} onChange={(e) => setUnits(e.target.value)} fullWidth /></Grid></Grid>}
              <TextField label="Estimated Contract / Asset Value (AED)" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} fullWidth InputProps={{ startAdornment: <DollarSign size={18} /> as any }} />
              <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={3} fullWidth />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}><Button onClick={() => setOpenAdd(false)}>Cancel</Button><Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{submitting ? <CircularProgress size={20} /> : 'Submit Referral'}</Button></DialogActions>
        </form>
      </Dialog>
    </BrokerPageFrame>
  );
}
