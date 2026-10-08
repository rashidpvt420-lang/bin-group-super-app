import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, limit, onSnapshot, orderBy, query } from '../../lib/firebase';

type Rfq = { id: string; ticketId?: string; propertyId?: string; ownerId?: string; ownerEmail?: string; trade?: string; standardScope?: string; status?: string; estimateBandAed?: number; quotesReceived?: number; minimumQuotes?: number };
const trades = ['AC', 'Plumbing', 'Electrical', 'Handyman', 'Pest control', 'Civil works', 'General maintenance'];

export default function RfqTrustWorkflowPage() {
  const [rfqs, setRfqs] = React.useState<Rfq[]>([]);
  const [notice, setNotice] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [actionBusy, setActionBusy] = React.useState('');
  const actionBusyRef = React.useRef(false);
  const [form, setForm] = React.useState({ ticketId: '', propertyId: '', ownerId: '', trade: 'General maintenance', standardScope: '', estimateBandAed: '0', emergency: false });
  const [quoteForms, setQuoteForms] = React.useState<Record<string, { vendorId: string; amountAed: string; warrantyDays: string; notes: string }>>({});

  React.useEffect(() => {
    const q = query(collection(db, 'vendor_rfqs'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Rfq, 'id'>) }));
      setRfqs(rows);
      setQuoteForms((current) => {
        const next = { ...current };
        rows.forEach((r) => { if (!next[r.id]) next[r.id] = { vendorId: '', amountAed: '', warrantyDays: '30', notes: '' }; });
        return next;
      });
      setLoadError('');
      setLoading(false);
    }, () => {
      setLoadError('RFQ workflow data could not be loaded. No procurement action has been taken.');
      setLoading(false);
    });
  }, []);

  const createRfq = async () => {
    if (!form.ticketId || !form.ownerId || !form.propertyId || !form.standardScope) return setNotice('Ticket, owner, property, and scope are required.');
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy('create');
    try {
      const create = httpsCallable(functions, 'adminCreateVendorRfq');
      const result = await create({
        ticketId: form.ticketId,
        propertyId: form.propertyId,
        ownerId: form.ownerId,
        trade: form.trade,
        standardScope: form.standardScope,
        estimateBandAed: Number(form.estimateBandAed || 0),
        emergency: form.emergency,
      });
      setNotice(`RFQ created: ${(result.data as any)?.rfqId || 'saved'}`);
      setForm({ ticketId: '', propertyId: '', ownerId: '', trade: 'General maintenance', standardScope: '', estimateBandAed: '0', emergency: false });
    } catch (error: any) {
      setNotice(error?.message || 'RFQ creation failed.');
    } finally {
      actionBusyRef.current = false;
      setActionBusy('');
    }
  };

  const addQuote = async (rfq: Rfq) => {
    if (actionBusyRef.current) return;
    const qf = quoteForms[rfq.id];
    const amount = Number(qf?.amountAed || 0);
    if (!qf?.vendorId || !amount) return setNotice('Verified Vendor ID and quote amount are required.');
    actionBusyRef.current = true;
    setActionBusy(`quote:${rfq.id}`);
    try {
      const add = httpsCallable(functions, 'adminAddVerifiedVendorQuote');
      await add({
        rfqId: rfq.id,
        vendorId: qf.vendorId,
        amountAed: amount,
        warrantyDays: Number(qf.warrantyDays || 0),
        notes: qf.notes,
      });
      setNotice(`Verified vendor quote added to RFQ ${rfq.id}.`);
    } catch (error: any) {
      setNotice(error?.message || 'Vendor quote could not be added.');
    } finally {
      actionBusyRef.current = false;
      setActionBusy('');
    }
  };

  const sendOwnerApproval = async (rfq: Rfq) => {
    if (actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(`approval:${rfq.id}`);
    try {
      const requestApproval = httpsCallable(functions, 'adminRequestRfqOwnerApproval');
      const result = await requestApproval({ rfqId: rfq.id });
      setNotice(`Owner approval requested: ${(result.data as any)?.approvalRequestId || 'recorded'}`);
    } catch (error: any) {
      setNotice(error?.message || 'Owner approval request failed.');
    } finally {
      actionBusyRef.current = false;
      setActionBusy('');
    }
  };

  return (
    <Box sx={{ p: 4, color: '#fff' }}>
      <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>PROCUREMENT TRUST</Typography>
      <Typography variant="h4" sx={{ fontWeight: 950, mb: 1 }}>RFQ / Quote Workflow</Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.65)', mb: 3 }}>Ticket → standard scope → RFQ → vendor quotes → owner approval → execution proof → invoice comparison.</Typography>
      {notice && <Alert sx={{ mb: 3 }} severity={/failed|could not|denied|required/i.test(notice) ? 'warning' : 'success'}>{notice}</Alert>}
      {loadError && <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}
      {loading && <Box role="status" sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
      {!loading && <Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(218,165,32,0.22)', mb: 3 }}><CardContent><Grid container spacing={2}>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Ticket ID" value={form.ticketId} onChange={(e) => setForm({ ...form, ticketId: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Property ID" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Owner ID" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField select fullWidth size="small" label="Trade" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })}>{trades.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Estimate AED" value={form.estimateBandAed} onChange={(e) => setForm({ ...form, estimateBandAed: e.target.value })} /></Grid>
        <Grid item xs={12} md={6}><TextField fullWidth size="small" label="Standard scope" value={form.standardScope} onChange={(e) => setForm({ ...form, standardScope: e.target.value })} /></Grid>
        <Grid item xs={12}><Button variant="contained" disabled={Boolean(actionBusy)} onClick={createRfq} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>Create RFQ</Button></Grid>
      </Grid></CardContent></Card>}
      {!loading && !loadError && rfqs.length === 0 && <Alert severity="info" sx={{ mb: 3 }}>No RFQs have been created yet.</Alert>}
      {!loading && !loadError && <Grid container spacing={2}>{rfqs.map((rfq) => { const qf = quoteForms[rfq.id] || { vendorId: '', amountAed: '', warrantyDays: '30', notes: '' }; return <Grid item xs={12} key={rfq.id}><Card sx={{ bgcolor: '#0f172a', color: '#fff' }}><CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"><Box><Typography variant="h6" sx={{ fontWeight: 950 }}>{rfq.trade} · {rfq.ticketId}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{rfq.standardScope}</Typography></Box><Stack direction="row" spacing={1}><Chip label={rfq.status || 'new'} /><Chip label={`${rfq.quotesReceived || 0}/${rfq.minimumQuotes || 1} quotes`} /></Stack></Stack>
        <Grid container spacing={2} sx={{ mt: 1 }}><Grid item xs={12} md={3}><TextField fullWidth size="small" label="Verified Vendor ID" value={qf.vendorId} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, vendorId: e.target.value } })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth size="small" label="Amount AED" value={qf.amountAed} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, amountAed: e.target.value } })} /></Grid><Grid item xs={12} md={2}><TextField fullWidth size="small" label="Warranty days" value={qf.warrantyDays} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, warrantyDays: e.target.value } })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth size="small" label="Notes" value={qf.notes} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, notes: e.target.value } })} /></Grid></Grid>
        <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}><Button variant="outlined" disabled={Boolean(actionBusy)} onClick={() => void addQuote(rfq)}>Add Quote</Button><Button variant="contained" disabled={Boolean(actionBusy)} onClick={() => void sendOwnerApproval(rfq)} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>Send Owner Approval</Button></Stack>
      </CardContent></Card></Grid>; })}</Grid>}
    </Box>
  );
}
