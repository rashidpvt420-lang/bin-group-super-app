import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { addDoc, collection, db, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from '../../lib/firebase';

type Rfq = { id: string; ticketId?: string; propertyId?: string; ownerId?: string; ownerEmail?: string; trade?: string; standardScope?: string; status?: string; estimateBandAed?: number; quotesReceived?: number; minimumQuotes?: number };
const trades = ['AC', 'Plumbing', 'Electrical', 'Handyman', 'Pest control', 'Civil works', 'General maintenance'];
const minQuotes = (amount: number, emergency: boolean) => (!emergency && amount > 1500 ? 3 : 1);

export default function RfqTrustWorkflowPage() {
  const [rfqs, setRfqs] = React.useState<Rfq[]>([]);
  const [notice, setNotice] = React.useState('');
  const [form, setForm] = React.useState({ ticketId: '', propertyId: '', ownerId: '', ownerEmail: '', trade: 'General maintenance', standardScope: '', estimateBandAed: '0', emergency: false });
  const [quoteForms, setQuoteForms] = React.useState<Record<string, { vendorId: string; vendorName: string; amountAed: string; warrantyDays: string; notes: string }>>({});

  React.useEffect(() => {
    const q = query(collection(db, 'vendor_rfqs'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Rfq, 'id'>) }));
      setRfqs(rows);
      setQuoteForms((current) => {
        const next = { ...current };
        rows.forEach((r) => { if (!next[r.id]) next[r.id] = { vendorId: '', vendorName: '', amountAed: '', warrantyDays: '30', notes: '' }; });
        return next;
      });
    });
  }, []);

  const createRfq = async () => {
    const amount = Number(form.estimateBandAed || 0);
    if (!form.ticketId || !form.ownerId || !form.propertyId || !form.standardScope) return setNotice('Ticket, owner, property, and scope are required.');
    const minimumQuotes = minQuotes(amount, form.emergency);
    const ref = await addDoc(collection(db, 'vendor_rfqs'), {
      ...form,
      estimateBandAed: amount,
      minimumQuotes,
      quotesReceived: 0,
      status: 'collecting_quotes',
      approvalGate: amount > 1500 && !form.emergency ? 'three_quotes_required' : amount > 500 ? 'owner_approval_required' : 'low_value_auto_eligible',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'maintenance_ledger'), { source: 'rfq_trust_workflow', ledgerEvent: 'RFQ_CREATED', rfqId: ref.id, ticketId: form.ticketId, ownerId: form.ownerId, propertyId: form.propertyId, createdAt: serverTimestamp() });
    setNotice(`RFQ created: ${ref.id}`);
    setForm({ ticketId: '', propertyId: '', ownerId: '', ownerEmail: '', trade: 'General maintenance', standardScope: '', estimateBandAed: '0', emergency: false });
  };

  const addQuote = async (rfq: Rfq) => {
    const qf = quoteForms[rfq.id];
    const amount = Number(qf?.amountAed || 0);
    if (!qf?.vendorName || !amount) return setNotice('Vendor name and quote amount are required.');
    const quoteRef = await addDoc(collection(db, 'vendor_quotes'), { rfqId: rfq.id, ticketId: rfq.ticketId || '', propertyId: rfq.propertyId || '', ownerId: rfq.ownerId || '', ...qf, amountAed: amount, warrantyDays: Number(qf.warrantyDays || 0), status: 'submitted', createdAt: serverTimestamp() });
    const nextCount = Number(rfq.quotesReceived || 0) + 1;
    await updateDoc(doc(db, 'vendor_rfqs', rfq.id), { quotesReceived: nextCount, lastQuoteAmountAed: amount, status: nextCount >= Number(rfq.minimumQuotes || 1) ? 'ready_for_owner_approval' : 'collecting_quotes', updatedAt: serverTimestamp() });
    await addDoc(collection(db, 'maintenance_ledger'), { source: 'rfq_trust_workflow', ledgerEvent: 'VENDOR_QUOTE_RECEIVED', rfqId: rfq.id, quoteId: quoteRef.id, amountAed: amount, createdAt: serverTimestamp() });
    setNotice(`Quote added to RFQ ${rfq.id}`);
  };

  const sendOwnerApproval = async (rfq: Rfq) => {
    const approvalRef = await addDoc(collection(db, 'owner_approval_requests'), { rfqId: rfq.id, ticketId: rfq.ticketId || '', propertyId: rfq.propertyId || '', ownerId: rfq.ownerId || '', ownerEmail: rfq.ownerEmail || '', trade: rfq.trade || '', standardScope: rfq.standardScope || '', estimateBandAed: Number(rfq.estimateBandAed || 0), quotesReceived: Number(rfq.quotesReceived || 0), status: 'pending_owner_decision', decision: '', decisionNote: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await updateDoc(doc(db, 'vendor_rfqs', rfq.id), { status: 'owner_approval_requested', approvalRequestId: approvalRef.id, updatedAt: serverTimestamp() });
    await addDoc(collection(db, 'maintenance_ledger'), { source: 'rfq_trust_workflow', ledgerEvent: 'OWNER_APPROVAL_REQUESTED', rfqId: rfq.id, approvalRequestId: approvalRef.id, ownerId: rfq.ownerId || '', createdAt: serverTimestamp() });
    setNotice(`Owner approval requested: ${approvalRef.id}`);
  };

  return (
    <Box sx={{ p: 4, color: '#fff' }}>
      <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>PROCUREMENT TRUST</Typography>
      <Typography variant="h4" sx={{ fontWeight: 950, mb: 1 }}>RFQ / Quote Workflow</Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.65)', mb: 3 }}>Ticket → standard scope → RFQ → vendor quotes → owner approval → execution proof → invoice comparison.</Typography>
      {notice && <Alert sx={{ mb: 3 }} severity={notice.includes('required') ? 'warning' : 'success'}>{notice}</Alert>}
      <Card sx={{ bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(218,165,32,0.22)', mb: 3 }}><CardContent><Grid container spacing={2}>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Ticket ID" value={form.ticketId} onChange={(e) => setForm({ ...form, ticketId: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Property ID" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Owner ID" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Owner Email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} /></Grid>
        <Grid item xs={12} md={3}><TextField select fullWidth size="small" label="Trade" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })}>{trades.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField></Grid>
        <Grid item xs={12} md={3}><TextField fullWidth size="small" label="Estimate AED" value={form.estimateBandAed} onChange={(e) => setForm({ ...form, estimateBandAed: e.target.value })} /></Grid>
        <Grid item xs={12} md={6}><TextField fullWidth size="small" label="Standard scope" value={form.standardScope} onChange={(e) => setForm({ ...form, standardScope: e.target.value })} /></Grid>
        <Grid item xs={12}><Button variant="contained" onClick={createRfq} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>Create RFQ</Button></Grid>
      </Grid></CardContent></Card>
      <Grid container spacing={2}>{rfqs.map((rfq) => { const qf = quoteForms[rfq.id] || { vendorId: '', vendorName: '', amountAed: '', warrantyDays: '30', notes: '' }; return <Grid item xs={12} key={rfq.id}><Card sx={{ bgcolor: '#0f172a', color: '#fff' }}><CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between"><Box><Typography variant="h6" sx={{ fontWeight: 950 }}>{rfq.trade} · {rfq.ticketId}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{rfq.standardScope}</Typography></Box><Stack direction="row" spacing={1}><Chip label={rfq.status || 'new'} /><Chip label={`${rfq.quotesReceived || 0}/${rfq.minimumQuotes || 1} quotes`} /></Stack></Stack>
        <Grid container spacing={2} sx={{ mt: 1 }}><Grid item xs={12} md={2}><TextField fullWidth size="small" label="Vendor ID" value={qf.vendorId} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, vendorId: e.target.value } })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth size="small" label="Vendor name" value={qf.vendorName} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, vendorName: e.target.value } })} /></Grid><Grid item xs={12} md={2}><TextField fullWidth size="small" label="Amount AED" value={qf.amountAed} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, amountAed: e.target.value } })} /></Grid><Grid item xs={12} md={2}><TextField fullWidth size="small" label="Warranty days" value={qf.warrantyDays} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, warrantyDays: e.target.value } })} /></Grid><Grid item xs={12} md={3}><TextField fullWidth size="small" label="Notes" value={qf.notes} onChange={(e) => setQuoteForms({ ...quoteForms, [rfq.id]: { ...qf, notes: e.target.value } })} /></Grid></Grid>
        <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}><Button variant="outlined" onClick={() => addQuote(rfq)}>Add Quote</Button><Button variant="contained" onClick={() => sendOwnerApproval(rfq)} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>Send Owner Approval</Button></Stack>
      </CardContent></Card></Grid>; })}</Grid>
    </Box>
  );
}
