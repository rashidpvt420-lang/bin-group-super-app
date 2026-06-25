import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, alpha } from '@mui/material';
import { AlertTriangle, CreditCard, Download, Percent, Plus, ReceiptText } from 'lucide-react';
import { db, doc, serverTimestamp, setDoc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { NotificationEvents } from '../../services/notificationService';
import { binThemeTokens } from '../../theme/binGroupTheme';
import type { TenantLedgerSummary } from '../utils/ownerTenantLedgerResolver';

type RentRecordPayload = { tenantName: string; propertyId: string; propertyName: string; unitNumber: string; rentDue: number; rentPaid: number; paymentMethod: string; paymentReference: string; notes: string };
type Props = { ledgerSummary: TenantLedgerSummary | null; pendingPayments: number; properties: any[]; onRecordRentPayment: (payload: RentRecordPayload) => Promise<void> };

const money = (value: number) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const propertyIdOf = (property: any) => String(property?.id || property?.propertyId || '');
const propertyNameOf = (property: any) => String(property?.propertyName || property?.name || propertyIdOf(property) || 'Property');
const emptyRentForm = (properties: any[]): RentRecordPayload => { const property = properties[0]; return { tenantName: '', propertyId: propertyIdOf(property), propertyName: propertyNameOf(property), unitNumber: '', rentDue: 0, rentPaid: 0, paymentMethod: 'BANK_TRANSFER', paymentReference: '', notes: '' }; };
function statusTone(status: string, balance: number, overdueDays: number) { if (overdueDays > 0) return '#ef4444'; if (balance > 0) return '#f59e0b'; if (String(status || '').includes('ACTIVE') || String(status || '').includes('PAID')) return '#10b981'; return binThemeTokens.gold; }

export default function OwnerMoneySnapshotSection({ ledgerSummary, pendingPayments, properties, onRecordRentPayment }: Props) {
  const { user } = useRole();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RentRecordPayload>(() => emptyRentForm(properties));

  useEffect(() => { if (!properties.length) return; setForm((current) => current.propertyId ? current : { ...current, ...emptyRentForm(properties) }); }, [properties]);

  const rows = ledgerSummary?.ledgerRows || [];
  const overdueTenants = useMemo(() => rows.filter((row) => row.overdueDays > 0).length, [rows]);
  const ledgerPendingPayments = useMemo(() => rows.filter((row) => String(row.status || '').toUpperCase().includes('PENDING')).length, [rows]);
  const effectivePendingPayments = Math.max(pendingPayments, ledgerPendingPayments);
  const isRentRecordValid = form.tenantName.trim().length > 0 && !!form.propertyId && Number(form.rentPaid || 0) > 0;

  const updateForm = (key: keyof RentRecordPayload, value: string | number) => setForm((current) => ({ ...current, [key]: value }));
  const selectProperty = (propertyId: string) => { const property = properties.find((item) => propertyIdOf(item) === propertyId); setForm((current) => ({ ...current, propertyId, propertyName: propertyNameOf(property) || current.propertyName || 'Property' })); };

  const submit = async () => {
    if (!user?.uid || !isRentRecordValid) return;
    setSaving(true);
    try {
      const rentDue = Number(form.rentDue || 0);
      const rentPaid = Number(form.rentPaid || 0);
      const balance = Math.max(0, rentDue - rentPaid);
      const propertyName = String(form.propertyName || 'Property');
      const recordId = `owner_rent_${user.uid}_${Date.now()}`;
      await setDoc(doc(db, 'payment_transactions', recordId), { recordType: 'OWNER_RENT_PAYMENT', transactionType: 'RENT_COLLECTION', paymentId: recordId, ownerId: user.uid, ownerUid: user.uid, ownerEmail: user.email || '', userId: user.uid, payerId: user.uid, tenantName: form.tenantName.trim(), propertyId: String(form.propertyId || ''), propertyName, unitNumber: form.unitNumber.trim(), rentDue, rentPaid, amountDue: rentDue, amountPaid: rentPaid, amount: rentPaid, balance, status: 'pending', paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION', paymentVerified: false, approved: false, contractActivated: false, unlocksDashboard: false, paymentMethod: String(form.paymentMethod || 'BANK_TRANSFER'), paymentReference: form.paymentReference.trim(), notes: form.notes.trim(), lastPaymentDate: new Date().toISOString(), createdByOwnerUid: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await onRecordRentPayment(form);
      await NotificationEvents.OWNER.RENT_PAYMENT_SUBMITTED(user.uid, rentPaid, propertyName, recordId);
      setOpen(false);
      setForm(emptyRentForm(properties));
    } finally { setSaving(false); }
  };

  const cards = [
    { label: 'Rent Due', value: money(ledgerSummary?.totalRentDue || 0), icon: <ReceiptText size={20} />, tone: binThemeTokens.gold },
    { label: 'Rent Collected', value: money(ledgerSummary?.totalRentPaid || 0), icon: <CreditCard size={20} />, tone: '#10b981' },
    { label: 'Balance', value: money(ledgerSummary?.totalRentBalance || 0), icon: <AlertTriangle size={20} />, tone: (ledgerSummary?.totalRentBalance || 0) > 0 ? '#ef4444' : '#10b981' },
    { label: 'Collection Rate', value: `${ledgerSummary?.collectionRate || 0}%`, icon: <Percent size={20} />, tone: (ledgerSummary?.collectionRate || 0) >= 90 ? '#10b981' : '#f59e0b' },
    { label: 'Pending Verification', value: effectivePendingPayments, icon: <ReceiptText size={20} />, tone: effectivePendingPayments > 0 ? '#f59e0b' : '#10b981' },
    { label: 'Overdue Tenants', value: overdueTenants, icon: <AlertTriangle size={20} />, tone: overdueTenants > 0 ? '#ef4444' : '#10b981' },
  ];

  return <Paper sx={{ p: { xs: 2.25, md: 4 }, bgcolor: 'rgba(15,23,42,.58)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, borderRadius: 5 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3 }}><Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>OWNER MONEY SNAPSHOT</Typography><Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>Rent collection, payment proof and tenant balance control</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: .75 }}>Uses the resolved tenant ledger. Rent submissions now update the ledger writer and payment verification queue.</Typography></Box><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Button startIcon={<Plus size={16} />} variant="contained" onClick={() => setOpen(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Record Rent Payment</Button><Button startIcon={<Download size={16} />} variant="outlined" onClick={() => window.print()} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Print Statement</Button></Stack></Stack><Grid container spacing={2} sx={{ mb: 3 }}>{cards.map((card) => <Grid item xs={12} sm={6} md={4} key={card.label}><Paper sx={{ p: 2.25, bgcolor: 'rgba(255,255,255,.035)', border: `1px solid ${alpha(card.tone, .25)}`, borderRadius: 4 }}><Box sx={{ color: card.tone, mb: 1 }}>{card.icon}</Box><Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>{card.value}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.48)', fontWeight: 900, letterSpacing: 1 }}>{card.label.toUpperCase()}</Typography></Paper></Grid>)}</Grid><TableContainer sx={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 3 }}><Table size="small"><TableHead><TableRow><TableCell>Tenant</TableCell><TableCell>Property</TableCell><TableCell>Unit</TableCell><TableCell align="right">Due</TableCell><TableCell align="right">Paid</TableCell><TableCell align="right">Balance</TableCell><TableCell>Status</TableCell><TableCell>Last Payment</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => { const tone = statusTone(row.status, row.balance, row.overdueDays); return <TableRow key={row.id} hover><TableCell sx={{ color: '#fff', fontWeight: 900 }}>{row.name}</TableCell><TableCell sx={{ color: 'rgba(255,255,255,.72)' }}>{row.property}</TableCell><TableCell sx={{ color: 'rgba(255,255,255,.72)' }}>{row.unit}</TableCell><TableCell align="right" sx={{ color: '#fff' }}>{money(row.due)}</TableCell><TableCell align="right" sx={{ color: '#10b981', fontWeight: 900 }}>{money(row.paid)}</TableCell><TableCell align="right" sx={{ color: row.balance > 0 ? '#ef4444' : '#10b981', fontWeight: 900 }}>{money(row.balance)}</TableCell><TableCell><Chip size="small" label={row.overdueDays > 0 ? `${row.overdueDays}D OVERDUE` : String(row.status || '').replace(/_/g, ' ')} sx={{ bgcolor: alpha(tone, .12), color: tone, fontWeight: 900 }} /></TableCell><TableCell sx={{ color: 'rgba(255,255,255,.72)' }}>{row.lastPaymentDate || 'Not recorded'}</TableCell></TableRow>; })}{rows.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: 'rgba(255,255,255,.42)', fontWeight: 800 }}>No tenant ledger rows found yet. Add tenants, leases, occupancies or rent payment records to populate this table.</TableCell></TableRow>}</TableBody></Table></TableContainer><Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth><DialogTitle>Record owner rent payment</DialogTitle><DialogContent><Stack spacing={2.25} sx={{ pt: 1 }}><TextField label="Tenant name" value={form.tenantName} onChange={(event) => updateForm('tenantName', event.target.value)} fullWidth required /><TextField select label="Property" value={form.propertyId} onChange={(event) => selectProperty(event.target.value)} fullWidth required>{properties.map((property) => { const id = propertyIdOf(property); return <MenuItem key={id} value={id}>{propertyNameOf(property)}</MenuItem>; })}</TextField><TextField label="Unit" value={form.unitNumber} onChange={(event) => updateForm('unitNumber', event.target.value)} fullWidth /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField type="number" label="Rent due" value={form.rentDue} onChange={(event) => updateForm('rentDue', Number(event.target.value))} fullWidth /><TextField type="number" label="Rent paid" value={form.rentPaid} onChange={(event) => updateForm('rentPaid', Number(event.target.value))} fullWidth required /></Stack><TextField select label="Payment method" value={form.paymentMethod} onChange={(event) => updateForm('paymentMethod', event.target.value)} fullWidth><MenuItem value="BANK_TRANSFER">Bank transfer</MenuItem><MenuItem value="CARD">Card</MenuItem><MenuItem value="CHEQUE">Cheque</MenuItem><MenuItem value="CASH_MANUAL">Cash manual</MenuItem><MenuItem value="OTHER">Other</MenuItem></TextField><TextField label="Payment reference / receipt" value={form.paymentReference} onChange={(event) => updateForm('paymentReference', event.target.value)} fullWidth /><TextField label="Notes" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} fullWidth multiline minRows={3} /></Stack></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || !isRentRecordValid} onClick={submit} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{saving ? 'Saving...' : 'Save rent record'}</Button></DialogActions></Dialog></Paper>;
}
