import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from '../../lib/firebase';

type Vendor = { id: string; name?: string; trade?: string; emirate?: string; status?: string; licenseNumber?: string; insuranceStatus?: string; slaRatePct?: number; repeatFaultRatePct?: number; proofCoveragePct?: number };
const trades = ['AC', 'Plumbing', 'Electrical', 'Handyman', 'Pest control', 'Civil works', 'General maintenance'];
const emirates = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

export default function VendorCommandCenterPage() {
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [notice, setNotice] = React.useState('');
  const [form, setForm] = React.useState({ name: '', trade: 'General maintenance', emirate: 'Dubai', licenseNumber: '', insuranceStatus: 'pending', serviceAreas: '', warrantyObligationDays: '30' });

  React.useEffect(() => {
    const q = query(collection(db, 'vendors'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (snap) => setVendors(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vendor, 'id'>) }))));
  }, []);

  const addVendor = async () => {
    if (!form.name || !form.licenseNumber) return setNotice('Vendor name and trade license number are required.');
    const ref = await addDoc(collection(db, 'vendors'), {
      ...form,
      serviceAreas: form.serviceAreas.split(',').map((x) => x.trim()).filter(Boolean),
      warrantyObligationDays: Number(form.warrantyObligationDays || 0),
      status: 'pending_verification',
      slaRatePct: 0,
      repeatFaultRatePct: 0,
      proofCoveragePct: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'maintenance_ledger'), { source: 'vendor_command_center', ledgerEvent: 'VENDOR_ONBOARDED_FOR_VERIFICATION', vendorId: ref.id, vendorName: form.name, trade: form.trade, createdAt: serverTimestamp() });
    setNotice(`Vendor profile created: ${ref.id}`);
    setForm({ name: '', trade: 'General maintenance', emirate: 'Dubai', licenseNumber: '', insuranceStatus: 'pending', serviceAreas: '', warrantyObligationDays: '30' });
  };

  const setVendorStatus = async (vendor: Vendor, status: string) => {
    await updateDoc(doc(db, 'vendors', vendor.id), { status, updatedAt: serverTimestamp() });
    await addDoc(collection(db, 'maintenance_ledger'), { source: 'vendor_command_center', ledgerEvent: 'VENDOR_STATUS_UPDATED', vendorId: vendor.id, status, createdAt: serverTimestamp() });
  };

  return (
    <Box sx={{ p: 4, color: '#fff' }}>
      <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>VENDOR GOVERNANCE</Typography>
      <Typography variant="h4" sx={{ fontWeight: 950, mb: 1 }}>Vendor Command Center</Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.65)', mb: 3 }}>Control trade license, insurance, service areas, warranty obligations, SLA score, repeat faults, and proof coverage before contractors receive work.</Typography>
      {notice && <Alert sx={{ mb: 3 }} severity={notice.includes('required') ? 'warning' : 'success'}>{notice}</Alert>}
      <Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(218,165,32,0.22)', mb: 3 }}><CardContent><Grid container spacing={2}>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Vendor name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Grid>
        <Grid item xs={12} md={2}><TextField select fullWidth size="small" label="Trade" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })}>{trades.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12} md={2}><TextField select fullWidth size="small" label="Emirate" value={form.emirate} onChange={(e) => setForm({ ...form, emirate: e.target.value })}>{emirates.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12} md={2}><TextField fullWidth size="small" label="Trade license" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Service areas comma-separated" value={form.serviceAreas} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} /></Grid>
        <Grid item xs={12}><Button variant="contained" onClick={addVendor} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>Create Vendor Verification File</Button></Grid>
      </Grid></CardContent></Card>
      <Grid container spacing={2}>{vendors.map((vendor) => <Grid item xs={12} md={6} key={vendor.id}><Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}><CardContent>
        <Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography variant="h6" sx={{ fontWeight: 950 }}>{vendor.name}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.6)' }}>{vendor.trade} · {vendor.emirate} · License {vendor.licenseNumber}</Typography></Box><Chip label={vendor.status || 'pending'} /></Stack>
        <Grid container spacing={1.5} sx={{ mt: 2 }}><Grid item xs={4}><Chip label={`SLA ${vendor.slaRatePct || 0}%`} variant="outlined" sx={{ color: '#fff' }} /></Grid><Grid item xs={4}><Chip label={`Repeat ${vendor.repeatFaultRatePct || 0}%`} variant="outlined" sx={{ color: '#fff' }} /></Grid><Grid item xs={4}><Chip label={`Proof ${vendor.proofCoveragePct || 0}%`} variant="outlined" sx={{ color: '#fff' }} /></Grid></Grid>
        <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}><Button variant="outlined" onClick={() => setVendorStatus(vendor, 'verified')} sx={{ color: '#10b981', borderColor: '#10b981' }}>Verify</Button><Button variant="outlined" onClick={() => setVendorStatus(vendor, 'suspended')} sx={{ color: '#ef4444', borderColor: '#ef4444' }}>Suspend</Button></Stack>
      </CardContent></Card></Grid>)}</Grid>
    </Box>
  );
}
