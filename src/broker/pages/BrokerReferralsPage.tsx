import React, { useEffect, useMemo, useState } from 'react';
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
  Grid,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Building2, CheckCircle2, Clock, FileText, Plus } from 'lucide-react';
import { db, collection, addDoc, serverTimestamp, query, where, onSnapshot, orderBy, limit } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

type PropertyOption = { id: string; [key: string]: any };

type ReferralForm = {
  referralType: string;
  clientName: string;
  phone: string;
  email: string;
  propertyName: string;
  propertyType: string;
  location: string;
  units: string;
  estimatedValue: string;
  notes: string;
  selectedPropertyId: string;
  contractType: string;
  signedDate: string;
};

const initialForm = (): ReferralForm => ({
  referralType: 'property',
  clientName: '',
  phone: '',
  email: '',
  propertyName: '',
  propertyType: '',
  location: '',
  units: '',
  estimatedValue: '',
  notes: '',
  selectedPropertyId: '',
  contractType: 'annual_lease',
  signedDate: new Date().toISOString().split('T')[0],
});

const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

const commissionRateFor = (referralType: string, contractType: string) => {
  if (referralType !== 'contract') return 0;
  if (contractType === 'property_management') return 0.05;
  if (contractType === 'commercial_lease') return 0.03;
  return 0.02;
};

const attributionCode = (uid: string, time = Date.now()) => `BRK-${uid.slice(0, 6).toUpperCase()}-${time.toString(36).toUpperCase()}`;

export default function BrokerReferralsPage({ openFormByDefault = false }: { openFormByDefault?: boolean }) {
  const { user } = useRole();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [propertiesList, setPropertiesList] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(openFormByDefault);
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState('');
  const [form, setForm] = useState<ReferralForm>(initialForm);

  useEffect(() => {
    if (openFormByDefault) setOpenAdd(true);
  }, [openFormByDefault]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'referrals'), where('brokerId', '==', user.uid), orderBy('createdAt', 'desc')),
      (snap) => {
        setReferrals(snap.docs.map((row) => ({ id: row.id, ...row.data() })));
        setLoading(false);
      },
      (error) => {
        console.warn('[BrokerReferrals] referral listener failed', error);
        setWarning('Referral records could not fully load.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'properties'), where('assignedBrokerId', '==', user.uid), limit(50)),
      (snap) => setPropertiesList(snap.docs.map((row) => ({ id: row.id, ...row.data() }))),
      (error) => {
        console.warn('[BrokerReferrals] assigned properties listener failed', error);
        setPropertiesList([]);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  const selectedProperty = useMemo(() => propertiesList.find((property) => property.id === form.selectedPropertyId), [form.selectedPropertyId, propertiesList]);

  const updateForm = (key: keyof ReferralForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const handleAddReferral = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.uid || !form.clientName.trim()) return;
    setSubmitting(true);
    setWarning('');

    try {
      const nowCode = attributionCode(user.uid);
      const rate = commissionRateFor(form.referralType, form.contractType);
      const value = Number(form.estimatedValue || 0);
      const resolvedPropertyName = selectedProperty?.propertyName || selectedProperty?.name || form.propertyName;
      const resolvedLocation = selectedProperty?.location || selectedProperty?.emirate || selectedProperty?.area || form.location;
      const resolvedOwnerId = selectedProperty?.ownerId || selectedProperty?.ownerUid || null;
      const commissionAmount = Math.round(value * rate);

      const referralPayload: any = {
        brokerId: user.uid,
        brokerUid: user.uid,
        brokerEmail: user.email || null,
        brokerName: user.displayName || 'Broker Partner',
        attributionCode: nowCode,
        referralType: form.referralType,
        clientName: form.clientName.trim(),
        phone: form.phone,
        email: form.email,
        notes: form.notes,
        propertyId: form.selectedPropertyId || null,
        propertyName: resolvedPropertyName,
        propertyType: form.propertyType,
        location: resolvedLocation,
        units: form.units,
        estimatedValue: value,
        ownerId: resolvedOwnerId,
        status: 'submitted',
        commissionRate: rate,
        commissionAmount,
        commissionStatus: rate > 0 ? 'PENDING_ADMIN_APPROVAL' : 'NOT_APPLICABLE',
        source: 'BROKER_PORTAL',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (form.referralType === 'contract') {
        referralPayload.contractType = form.contractType;
        referralPayload.signedDate = form.signedDate;
      }

      const referralRef = await addDoc(collection(db, 'referrals'), referralPayload);

      await addDoc(collection(db, 'audit_logs'), {
        actorId: user.uid,
        actorRole: 'broker',
        action: 'BROKER_REFERRAL_SUBMITTED',
        targetType: 'referrals',
        targetId: referralRef.id,
        metadata: {
          attributionCode: nowCode,
          referralType: form.referralType,
          propertyId: form.selectedPropertyId || null,
          ownerId: resolvedOwnerId,
          commissionRate: rate,
          commissionAmount,
        },
        createdAt: serverTimestamp(),
      });

      if (rate > 0) {
        await addDoc(collection(db, 'broker_commissions'), {
          brokerId: user.uid,
          brokerUid: user.uid,
          brokerEmail: user.email || null,
          brokerName: user.displayName || 'Broker Partner',
          attributionCode: nowCode,
          amount: commissionAmount,
          commissionAmount,
          percentage: rate * 100,
          rate,
          status: 'PENDING_ADMIN_APPROVAL',
          linkedReferralId: referralRef.id,
          linkedReferralName: form.clientName.trim(),
          linkedProperty: resolvedPropertyName,
          propertyName: resolvedPropertyName,
          propertyId: form.selectedPropertyId || null,
          ownerId: resolvedOwnerId,
          contractType: form.contractType,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setOpenAdd(false);
      setForm(initialForm());
    } catch (error) {
      console.error('[BrokerReferrals] submit failed', error);
      setWarning('Referral submission failed. Check Firestore rules for referrals, audit_logs, and broker_commissions.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return '#10b981';
    if (normalized === 'rejected') return '#ef4444';
    if (normalized === 'under_review') return binThemeTokens.gold;
    return '#3b82f6';
  };

  return (
    <BrokerPageFrame
      title="Referral Network"
      subtitle="Submit owner, property, tenant, and contract referrals with broker attribution proof."
      loading={loading}
      actions={<Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3 }}>Submit Referral</Button>}
    >
      <Stack spacing={3}>
        {warning && <Alert severity="warning">{warning}</Alert>}

        {referrals.length === 0 ? (
          <Paper sx={{ p: 8, textAlign: 'center', bgcolor: binThemeTokens.softCanvas, borderRadius: 6, border: '1px dashed #E5E7EB' }}>
            <Building2 size={48} color="#9CA3AF" />
            <Typography variant="h6" sx={{ color: '#9CA3AF', fontWeight: 900, mt: 2 }}>No referrals recorded</Typography>
            <Typography variant="body2" sx={{ color: '#9CA3AF', mt: 1 }}>Use Submit Referral to create an attributed owner, tenant, property, or contract record.</Typography>
          </Paper>
        ) : referrals.map((referral) => {
          const color = statusColor(referral.status);
          return (
            <Paper key={referral.id} sx={{ p: 3, bgcolor: binThemeTokens.softCanvas, borderRadius: 5, border: '1px solid #E5E7EB' }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="h6" fontWeight={950} color={binThemeTokens.textPrimary}>{referral.clientName}</Typography>
                    <Chip size="small" label={String(referral.referralType || 'referral').toUpperCase()} sx={{ bgcolor: alpha(color, 0.12), color, fontWeight: 900 }} />
                  </Stack>
                  <Typography variant="body2" color="textSecondary">{referral.propertyName || 'Property not linked'} - {referral.location || 'Location pending'}</Typography>
                  <Typography variant="caption" color="textSecondary">Attribution: {referral.attributionCode || 'pending'} | Commission: {money(referral.commissionAmount)}</Typography>
                </Box>
                <Stack direction="row" spacing={3} alignItems="center">
                  <Box><Typography variant="caption" color="textSecondary" fontWeight={950}>VALUE</Typography><Typography fontWeight={950}>{money(referral.estimatedValue)}</Typography></Box>
                  <Box><Typography variant="caption" color="textSecondary" fontWeight={950}>STATUS</Typography><Typography fontWeight={950} sx={{ color }}>{String(referral.status || 'submitted').replace(/_/g, ' ').toUpperCase()}</Typography></Box>
                  <FileText size={20} color={binThemeTokens.gold} />
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </Stack>

      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: { xs: '92vw', md: 620 } } }}>
        <form onSubmit={handleAddReferral}>
          <DialogTitle sx={{ p: 4, pb: 0, fontWeight: 950, color: binThemeTokens.gold }}>Submit New Referral</DialogTitle>
          <DialogContent sx={{ p: 4 }}>
            <Stack spacing={3}>
              <Select fullWidth value={form.referralType} onChange={(e) => updateForm('referralType', String(e.target.value))} variant="filled" sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}>
                <MenuItem value="owner">Owner / Asset Holder</MenuItem>
                <MenuItem value="property">Direct Property Asset</MenuItem>
                <MenuItem value="client">Tenant / Client</MenuItem>
                <MenuItem value="contract">Contract Referral</MenuItem>
              </Select>

              {form.referralType === 'contract' && (
                <Select fullWidth value={form.selectedPropertyId} onChange={(e) => updateForm('selectedPropertyId', String(e.target.value))} displayEmpty variant="filled" sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}>
                  <MenuItem value="">Manual / not assigned yet</MenuItem>
                  {propertiesList.map((property) => <MenuItem key={property.id} value={property.id}>{property.propertyName || property.name || property.id}</MenuItem>)}
                </Select>
              )}

              <TextField fullWidth label="Client / Owner Full Name" required value={form.clientName} onChange={(e) => updateForm('clientName', e.target.value)} variant="filled" />
              <Grid container spacing={2}><Grid item xs={12} md={6}><TextField fullWidth label="Email" type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} variant="filled" /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Phone" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} variant="filled" /></Grid></Grid>
              <Grid container spacing={2}><Grid item xs={12} md={6}><TextField fullWidth label="Property Name / Asset" value={form.propertyName} onChange={(e) => updateForm('propertyName', e.target.value)} variant="filled" /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Location / Emirate" value={form.location} onChange={(e) => updateForm('location', e.target.value)} variant="filled" /></Grid></Grid>

              {form.referralType === 'contract' && <Grid container spacing={2}><Grid item xs={12} md={6}><Select fullWidth value={form.contractType} onChange={(e) => updateForm('contractType', String(e.target.value))} variant="filled"><MenuItem value="annual_lease">Annual Lease</MenuItem><MenuItem value="short_term">Short Term Lease</MenuItem><MenuItem value="commercial_lease">Commercial Lease</MenuItem><MenuItem value="property_management">Property Management</MenuItem></Select></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Signed Date" type="date" value={form.signedDate} onChange={(e) => updateForm('signedDate', e.target.value)} variant="filled" InputLabelProps={{ shrink: true }} /></Grid></Grid>}

              <Grid container spacing={2}><Grid item xs={12} md={6}><TextField fullWidth label="Estimated Value (AED)" type="number" value={form.estimatedValue} onChange={(e) => updateForm('estimatedValue', e.target.value)} variant="filled" /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Units" value={form.units} onChange={(e) => updateForm('units', e.target.value)} variant="filled" /></Grid></Grid>
              <TextField fullWidth label="Supporting Details / Notes" multiline rows={3} value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} variant="filled" />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{submitting ? <CircularProgress size={20} /> : 'Submit Referral'}</Button>
          </DialogActions>
        </form>
      </Dialog>
    </BrokerPageFrame>
  );
}
