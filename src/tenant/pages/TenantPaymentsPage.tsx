import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider,
  Grid, Paper, Snackbar, Stack, Tab, Tabs, Typography, alpha
} from '@mui/material';
import {
  Building2, CheckCircle2, Clock, Copy, CreditCard,
  ExternalLink, FileText, MessageCircle, Phone, RefreshCw
} from 'lucide-react';
import {
  collection, db, onSnapshot, orderBy, query, serverTimestamp, where, addDoc
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const WHATSAPP_NUMBER = '971552423233';
const BANK_NAME = 'Abu Dhabi Islamic Bank (ADIB)';
const ACCOUNT_NAME = 'All Kind Building Projects Contracting LLC SPC';
const IBAN = 'AE07 0500 0000 0200 1234 567';
const SWIFT = 'ADIBAEAA';

const gold = binThemeTokens.gold;

function formatDate(value: any) {
  if (!value) return 'Pending';
  if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString('en-AE');
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Pending' : parsed.toLocaleDateString('en-AE');
}

function formatMoney(value: any) {
  const n = Number(value || 0);
  return `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#10b981',
  pending: '#eab308',
  overdue: '#ef4444',
  partial: '#f59e0b',
  cancelled: '#94a3b8',
};

export default function TenantPaymentsPage() {
  const { user } = useRole();
  const { isRTL } = useLanguage();
  const [tab, setTab] = useState(0);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    setLoading(true);
    const q = query(
      collection(db, 'invoices'),
      where('tenantId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.warn('[TenantPayments] Invoice sync failed:', err);
      setLoading(false);
    });
  }, [user?.uid]);

  const dueInvoices = invoices.filter((inv) => inv.status === 'pending' || inv.status === 'overdue');
  const totalDue = dueInvoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const sendWhatsAppConfirmation = async (invoice: any) => {
    const msg = encodeURIComponent(
      `Hello BIN GROUP,\n\nI have transferred payment for:\nInvoice: ${invoice.invoiceNumber || invoice.id}\nAmount: ${formatMoney(invoice.amount)}\nDue: ${formatDate(invoice.dueDate)}\n\nProperty: ${invoice.propertyName || ''} Unit: ${invoice.unitNumber || ''}\nTenant: ${user?.displayName || user?.email || ''}\n\nPlease confirm receipt. Thank you.`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');

    try {
      await addDoc(collection(db, 'paymentConfirmations'), {
        tenantId: user?.uid,
        tenantName: user?.displayName || user?.email || 'Tenant',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber || invoice.id,
        amount: invoice.amount,
        method: 'bank_transfer_whatsapp_confirmation',
        status: 'pending_verification',
        createdAt: serverTimestamp(),
      });
      setConfirmSent(invoice.id);
      setTimeout(() => setConfirmSent(null), 5000);
    } catch (err) {
      console.warn('[TenantPayments] Payment confirmation log failed:', err);
      setConfirmError('We could not save your confirmation. Your WhatsApp message was still sent — our finance team will follow up, or you can call them directly.');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
        <CircularProgress sx={{ color: gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 6 }}>
      <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 3 }}>
        TENANT LEDGER
      </Typography>
      <Typography variant="h3" fontWeight="950" color="#111827" sx={{ mb: 1 }}>
        Payments & Invoices
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        View all rent invoices, maintenance charges, and make payments via bank transfer or Stripe.
      </Typography>

      {/* Summary row */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #E5E7EB', textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="950" color={totalDue > 0 ? '#ef4444' : '#10b981'}>
              {formatMoney(totalDue)}
            </Typography>
            <Typography variant="caption" fontWeight="800" color="text.secondary">AMOUNT DUE</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #E5E7EB', textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="950" color="#111827">{invoices.length}</Typography>
            <Typography variant="caption" fontWeight="800" color="text.secondary">TOTAL INVOICES</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid #E5E7EB', textAlign: 'center' }}>
            <Typography variant="h4" fontWeight="950" color="#10b981">
              {invoices.filter((inv) => inv.status === 'paid').length}
            </Typography>
            <Typography variant="caption" fontWeight="800" color="text.secondary">PAID</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, borderRadius: 4, border: `1px solid ${alpha(gold, 0.4)}`, textAlign: 'center', bgcolor: alpha(gold, 0.04) }}>
            <Typography variant="h4" fontWeight="950" color={gold}>
              {dueInvoices.filter((inv) => inv.status === 'overdue').length}
            </Typography>
            <Typography variant="caption" fontWeight="800" color="text.secondary">OVERDUE</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, '& .MuiTab-root': { fontWeight: 900 }, '& .Mui-selected': { color: `${gold} !important` } }}
      >
        <Tab label="INVOICES" />
        <Tab label="BANK TRANSFER" />
        <Tab label="PAYMENT HISTORY" />
      </Tabs>

      {/* Tab 0: Invoice list */}
      {tab === 0 && (
        <Stack spacing={2}>
          {invoices.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #E5E7EB' }}>
              <FileText size={48} color="#CBD5E1" style={{ margin: '0 auto 16px' }} />
              <Typography color="text.secondary">No invoices found for your account yet.</Typography>
            </Paper>
          ) : (
            invoices.map((inv) => {
              const statusColor = STATUS_COLORS[inv.status] || '#94a3b8';
              const isOverdue = inv.status === 'overdue';
              const isPending = inv.status === 'pending';
              return (
                <Paper key={inv.id} sx={{ p: 3, borderRadius: 4, border: `1px solid ${isOverdue ? '#fecaca' : '#E5E7EB'}`, bgcolor: isOverdue ? 'rgba(239,68,68,0.02)' : '#FFFFFF' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2}>
                    <Box>
                      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight="950" color="#111827">
                          {inv.invoiceNumber || `INV-${inv.id.slice(-6).toUpperCase()}`}
                        </Typography>
                        <Chip
                          size="small"
                          label={(inv.status || 'pending').toUpperCase()}
                          sx={{ bgcolor: alpha(statusColor, 0.1), color: statusColor, fontWeight: 900 }}
                        />
                        {inv.type && (
                          <Chip size="small" label={(inv.type || 'RENT').toUpperCase()} sx={{ bgcolor: '#F1F5F9', fontWeight: 900 }} />
                        )}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {inv.description || 'Rent / Service Charge'} · Due: {formatDate(inv.dueDate)}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h5" fontWeight="950" color={isOverdue ? '#ef4444' : '#111827'}>
                          {formatMoney(inv.amount)}
                        </Typography>
                        {inv.paidDate && (
                          <Typography variant="caption" color="#10b981">Paid: {formatDate(inv.paidDate)}</Typography>
                        )}
                      </Box>
                      {(isPending || isOverdue) && (
                        <Stack spacing={1}>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<MessageCircle size={14} />}
                            onClick={() => sendWhatsAppConfirmation(inv)}
                            sx={{ bgcolor: '#25D366', color: '#FFF', fontWeight: 900, borderRadius: 2, fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                          >
                            {confirmSent === inv.id ? 'SENT ✓' : 'PAY & CONFIRM'}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<CreditCard size={14} />}
                            onClick={() => setTab(1)}
                            sx={{ borderColor: gold, color: gold, fontWeight: 900, borderRadius: 2, fontSize: '0.72rem' }}
                          >
                            BANK DETAILS
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              );
            })
          )}
        </Stack>
      )}

      {/* Tab 1: Bank Transfer */}
      {tab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 4, borderRadius: 4, border: `1px solid ${alpha(gold, 0.3)}` }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                <Building2 color={gold} size={24} />
                <Typography variant="h6" fontWeight="950" color="#111827">UAE Bank Transfer Details</Typography>
              </Stack>

              {[
                { label: 'Bank', value: BANK_NAME, key: 'bank' },
                { label: 'Account Name', value: ACCOUNT_NAME, key: 'name' },
                { label: 'IBAN', value: IBAN, key: 'iban' },
                { label: 'SWIFT / BIC', value: SWIFT, key: 'swift' },
              ].map(({ label, value, key }) => (
                <Box key={key} sx={{ mb: 2.5 }}>
                  <Typography variant="caption" fontWeight="800" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                    {label}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                    <Typography fontWeight="900" color="#111827" sx={{ fontFamily: 'monospace', fontSize: key === 'name' ? '0.9rem' : '1rem' }}>
                      {value}
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => copyText(value, key)}
                      sx={{ minWidth: 0, p: 0.5, color: copied === key ? '#10b981' : gold }}
                    >
                      <Copy size={14} />
                    </Button>
                    {copied === key && (
                      <Typography variant="caption" color="#10b981" fontWeight="900">Copied!</Typography>
                    )}
                  </Stack>
                  <Divider sx={{ mt: 1.5 }} />
                </Box>
              ))}

              <Alert severity="info" sx={{ mt: 2 }}>
                Use your <strong>invoice number</strong> or <strong>unit number</strong> as the payment reference so finance can reconcile your transfer.
              </Alert>
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 4, borderRadius: 4, border: '1px solid #E5E7EB', bgcolor: '#FAFAFA' }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                <MessageCircle color="#25D366" size={24} />
                <Typography variant="h6" fontWeight="950" color="#111827">Confirm on WhatsApp</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                After making your bank transfer, send us the receipt on WhatsApp so our finance team can reconcile your payment instantly.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                size="large"
                startIcon={<MessageCircle size={20} />}
                onClick={() => {
                  const msg = encodeURIComponent(`Hello BIN GROUP,\n\nI have completed a bank transfer payment.\nTenant: ${user?.displayName || user?.email || ''}\n\nPlease confirm receipt and update my account. Thank you.`);
                  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
                }}
                sx={{ bgcolor: '#25D366', color: '#FFF', fontWeight: 950, borderRadius: 3, py: 1.5, mb: 2 }}
              >
                SEND RECEIPT ON WHATSAPP
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Phone size={18} />}
                href={`tel:+${WHATSAPP_NUMBER}`}
                sx={{ borderColor: '#E5E7EB', color: '#374151', fontWeight: 900, borderRadius: 3, py: 1.5 }}
              >
                CALL FINANCE TEAM
              </Button>

              <Divider sx={{ my: 3 }} />

              <Box sx={{ p: 2.5, bgcolor: alpha(gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(gold, 0.2)}` }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <CreditCard size={18} color={gold} />
                  <Typography fontWeight="950" color="#111827">Online Card Payment</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Secure card payment via Stripe is coming soon. Contact us via WhatsApp to arrange an instant payment link.
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<ExternalLink size={16} />}
                  onClick={() => {
                    const msg = encodeURIComponent('Hello BIN GROUP,\n\nI would like to pay my rent via card. Please send me a secure payment link. Thank you.');
                    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
                  }}
                  sx={{ borderColor: gold, color: gold, fontWeight: 900, borderRadius: 2 }}
                >
                  REQUEST PAYMENT LINK
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Tab 2: Payment History */}
      {tab === 2 && (
        <Stack spacing={2}>
          {invoices.filter((inv) => inv.status === 'paid').length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #E5E7EB' }}>
              <Clock size={48} color="#CBD5E1" style={{ margin: '0 auto 16px' }} />
              <Typography color="text.secondary">No paid invoices yet. Payment history will appear here.</Typography>
            </Paper>
          ) : (
            invoices
              .filter((inv) => inv.status === 'paid')
              .map((inv) => (
                <Paper key={inv.id} sx={{ p: 3, borderRadius: 4, border: '1px solid #E5E7EB' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2}>
                    <Box>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <CheckCircle2 size={20} color="#10b981" />
                        <Typography fontWeight="950" color="#111827">
                          {inv.invoiceNumber || `INV-${inv.id.slice(-6).toUpperCase()}`}
                        </Typography>
                        <Chip size="small" label="PAID" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900 }} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {inv.description || 'Rent / Service Charge'} · Paid: {formatDate(inv.paidDate)}
                      </Typography>
                      {inv.paymentMethod && (
                        <Typography variant="caption" color="text.secondary">
                          Method: {String(inv.paymentMethod).replace(/_/g, ' ').toUpperCase()}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="h5" fontWeight="950" color="#10b981">
                      {formatMoney(inv.amount)}
                    </Typography>
                  </Stack>
                </Paper>
              ))
          )}
        </Stack>
      )}

      <Snackbar open={!!confirmError} autoHideDuration={8000} onClose={() => setConfirmError(null)}>
        <Alert severity="error" onClose={() => setConfirmError(null)} sx={{ fontWeight: 700 }}>
          {confirmError}
        </Alert>
      </Snackbar>
    </Box>
  );
}
