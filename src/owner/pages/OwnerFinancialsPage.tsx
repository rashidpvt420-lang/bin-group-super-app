import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { downloadCsv } from '../../utils/downloadCsv';
import {
    Alert, Box, Typography, Paper, Stack, Chip, CircularProgress,
    Grid, alpha, Button, Divider,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
    CreditCard, Download,
    Clock, CheckCircle2,
    Shield, TrendingUp, AlertCircle, FileText, ExternalLink
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, limit, getDocs, startAfter, orderBy, documentId, functions, httpsCallable } from '../../lib/firebase';

// Server ledger status (getOwnerPaymentLedger): PENDING / RECEIVED_UNVERIFIED / VERIFIED / BOUNCED / OVERDUE.
const LEDGER_LABEL: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'PENDING', color: '#f59e0b' },
    RECEIVED_UNVERIFIED: { label: 'RECEIVED - AWAITING VERIFICATION', color: '#3b82f6' },
    VERIFIED: { label: 'PAID - VERIFIED', color: '#10b981' },
    BOUNCED: { label: 'CHEQUE BOUNCED', color: '#ef4444' },
    OVERDUE: { label: 'OVERDUE', color: '#ef4444' },
};
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useOwnerFinancialTruthData } from '../hooks/useOwnerFinancialTruthData';
import OwnerPdcRegisterCard from '../components/OwnerPdcRegisterCard';
import Bi from '../../components/Bi';

const MANAGEMENT_FEE_RATE = 0.05;
const FINANCIAL_HISTORY_PAGE_SIZE = 100;
const FINANCIAL_HISTORY_MAX_PAGES = 100;

async function fetchAllOwnerFinancialRows(baseQuery: any) {
    const rows: any[] = [];
    let cursor: any = null;
    let pagesRead = 0;
    let complete = false;
    while (pagesRead < FINANCIAL_HISTORY_MAX_PAGES) {
        const pageQuery = cursor
            ? query(baseQuery, startAfter(cursor), limit(FINANCIAL_HISTORY_PAGE_SIZE))
            : query(baseQuery, limit(FINANCIAL_HISTORY_PAGE_SIZE));
        const page = await getDocs(pageQuery);
        rows.push(...page.docs.map((document) => ({ id: document.id, ...(document.data() as Record<string, unknown>) })));
        pagesRead += 1;
        if (page.docs.length < FINANCIAL_HISTORY_PAGE_SIZE) {
            complete = true;
            break;
        }
        cursor = page.docs[page.docs.length - 1];
    }
    return { rows, complete, pagesRead };
}
const payoutStatusColor = (value: unknown) => {
    const status = String(value || '').trim().toUpperCase();
    if (['PAID', 'COMPLETED', 'SETTLED'].includes(status)) return '#10b981';
    if (['PENDING', 'PROCESSING', 'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'IN_PROGRESS'].includes(status)) return '#f59e0b';
    if (['FAILED', 'REJECTED', 'CANCELLED', 'VOIDED', 'DISPUTED'].includes(status)) return '#ef4444';
    return '#64748b';
};

const formatRecordedAed = (value: number) => Number(value || 0).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const timestampMs = (value: any) => {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatInvoiceDate = (value: any) => {
    const ms = timestampMs(value);
    return ms > 0
        ? new Date(ms).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: '2-digit' })
        : 'Pending';
};

export default function OwnerFinancialsPage() {
    const { user } = useRole();
    const { tx, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [streamsLoading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [ledgerByInvoice, setLedgerByInvoice] = useState<Record<string, any>>({});
    const [suspensionNotices, setSuspensionNotices] = useState<any[]>([]);
    const invoiceKey = invoices.map((invoice) => `${invoice.id}:${invoice.status || ''}:${invoice.updatedAt?.seconds || ''}`).join('|');
    useEffect(() => {
        if (!invoiceKey) return undefined;
        let cancelled = false;
        httpsCallable(functions, 'getOwnerPaymentLedger')({})
            .then((result: any) => {
                if (cancelled) return;
                const map: Record<string, any> = {};
                for (const row of result?.data?.rows || []) map[row.invoiceId] = row;
                setLedgerByInvoice(map);
                setSuspensionNotices((result?.data?.suspensionNotices || []).filter((n: any) => ['NOTICE_ISSUED', 'SUSPENDED'].includes(String(n.status))));
            })
            .catch((error) => console.warn('Owner payment ledger unavailable; showing invoice status only.', error?.message || error));
        return () => { cancelled = true; };
    }, [invoiceKey]);
    const [loadError, setLoadError] = useState('');
    const [invoiceHistoryComplete, setInvoiceHistoryComplete] = useState(false);
    const [payoutHistoryComplete, setPayoutHistoryComplete] = useState(false);
    const [fullHistoryBusy, setFullHistoryBusy] = useState(false);
    const [historyLoadError, setHistoryLoadError] = useState('');
    const [invoicesVisible, setInvoicesVisible] = useState(50);
    const [transactionsVisible, setTransactionsVisible] = useState(25);
    // Shared Financial Truth summary (passport rent + paid invoices + VERIFIED NOI).
    // This page owns the UID-scoped invoice stream below and hands its rows to
    // the hook, so invoice failures are surfaced here rather than hidden.
    const {
        summary,
        loading: truthLoading,
        error: truthError,
    } = useOwnerFinancialTruthData(user, { invoices, feeRate: MANAGEMENT_FEE_RATE });

    useEffect(() => {
        if (!user?.email || !user?.uid) {
            setLoading(false);
            setLoadError('Authenticated Owner identity is unavailable. Reload the portal and try again.');
            return undefined;
        }

        setLoading(true);
        setLoadError('');
        setInvoiceHistoryComplete(false);
        setPayoutHistoryComplete(false);
        setHistoryLoadError('');
        setInvoicesVisible(50);
        setTransactionsVisible(25);
        const email = user.email.toLowerCase();
        let payoutsReady = false;
        let invoicesReady = false;
        const finishStreams = () => {
            if (payoutsReady && invoicesReady) setLoading(false);
        };

        // UID is the authoritative owner key. Keep a verified-email query as a
        // compatibility path for historical payouts that predate ownerUid.
        // Merge and deduplicate because migrated records may match both queries.
        let uidPayoutRows: any[] = [];
        let legacyPayoutRows: any[] = [];
        let uidPayoutReady = false;
        let legacyPayoutReady = false;
        let uidPayoutHistoryComplete = false;
        let legacyPayoutHistoryComplete = false;
        const publishPayouts = () => {
            const merged = new Map<string, any>();
            [...uidPayoutRows, ...legacyPayoutRows].forEach((row) => {
                if (!merged.has(row.id)) merged.set(row.id, row);
            });
            const rows = Array.from(merged.values())
                .sort((a: any, b: any) => timestampMs(b.createdAt || b.date) - timestampMs(a.createdAt || a.date));
            setTransactions(rows);
        };
        const finishPayoutSource = (source: 'uid' | 'legacy') => {
            if (source === 'uid') uidPayoutReady = true;
            else legacyPayoutReady = true;
            payoutsReady = uidPayoutReady && legacyPayoutReady;
            finishStreams();
        };

        const uidPayoutQ = query(collection(db, 'payouts'), where('ownerUid', '==', user.uid), limit(FINANCIAL_HISTORY_PAGE_SIZE));
        const unsubscribeUidPayouts = onSnapshot(uidPayoutQ, (snap) => {
            uidPayoutRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            uidPayoutHistoryComplete = snap.size < FINANCIAL_HISTORY_PAGE_SIZE;
            setPayoutHistoryComplete(uidPayoutHistoryComplete && legacyPayoutHistoryComplete);
            publishPayouts();
            finishPayoutSource('uid');
        }, (error) => {
            uidPayoutHistoryComplete = false;
            setPayoutHistoryComplete(false);
            console.error('Owner payout stream failed (UID query):', error);
            setLoadError('UID-scoped payout history is unavailable. Verify account permissions before relying on payout totals.');
            finishPayoutSource('uid');
        });

        const legacyPayoutQ = query(collection(db, 'payouts'), where('ownerEmail', '==', email), limit(FINANCIAL_HISTORY_PAGE_SIZE));
        const unsubscribeLegacyPayouts = onSnapshot(legacyPayoutQ, (snap) => {
            legacyPayoutRows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            legacyPayoutHistoryComplete = snap.size < FINANCIAL_HISTORY_PAGE_SIZE;
            setPayoutHistoryComplete(uidPayoutHistoryComplete && legacyPayoutHistoryComplete);
            publishPayouts();
            finishPayoutSource('legacy');
        }, (error) => {
            legacyPayoutHistoryComplete = false;
            setPayoutHistoryComplete(false);
            console.error('Owner payout stream failed (legacy email query):', error);
            setLoadError('Legacy payout history is unavailable. Verify the owner account mapping before relying on payout totals.');
            finishPayoutSource('legacy');
        });

        const invoiceQ = query(collection(db, 'invoices'), where('ownerUid', '==', user.uid), limit(FINANCIAL_HISTORY_PAGE_SIZE));
        const unsubscribeInvoices = onSnapshot(invoiceQ, (snap) => {
            const rows: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setInvoiceHistoryComplete(snap.size < FINANCIAL_HISTORY_PAGE_SIZE);
            setInvoices(
                rows.sort((a, b) => timestampMs(b.issuedAt || b.createdAt) - timestampMs(a.issuedAt || a.createdAt)),
            );
            invoicesReady = true;
            finishStreams();
        }, (error) => {
            console.error('Owner invoice stream failed:', error);
            setInvoiceHistoryComplete(false);
            setInvoices([]);
            setLoadError('Owner invoices could not be loaded. Paid-invoice totals are incomplete; please retry before approving or paying any amount.');
            invoicesReady = true;
            finishStreams();
        });

        return () => {
            unsubscribeUidPayouts();
            unsubscribeLegacyPayouts();
            unsubscribeInvoices();
        };
    }, [user?.email, user?.uid]);

    const loadCompleteHistory = async () => {
        if (!user?.uid || !user?.email) {
            setHistoryLoadError('Authenticated Owner identity is required to load the complete ledger.');
            return;
        }
        setFullHistoryBusy(true);
        setHistoryLoadError('');
        try {
            const invoiceQuery = query(collection(db, 'invoices'), where('ownerUid', '==', user.uid), orderBy(documentId()));
            const uidPayoutQuery = query(collection(db, 'payouts'), where('ownerUid', '==', user.uid), orderBy(documentId()));
            const legacyPayoutQuery = query(collection(db, 'payouts'), where('ownerEmail', '==', user.email.toLowerCase()), orderBy(documentId()));
            const [invoiceResult, uidPayoutResult, legacyPayoutResult] = await Promise.all([
                fetchAllOwnerFinancialRows(invoiceQuery),
                fetchAllOwnerFinancialRows(uidPayoutQuery),
                fetchAllOwnerFinancialRows(legacyPayoutQuery),
            ]);
            const mergedPayouts = new Map<string, any>();
            [...uidPayoutResult.rows, ...legacyPayoutResult.rows].forEach((row) => {
                if (!mergedPayouts.has(row.id)) mergedPayouts.set(row.id, row);
            });
            const allPayouts = Array.from(mergedPayouts.values())
                .sort((a, b) => timestampMs(b.createdAt || b.date) - timestampMs(a.createdAt || a.date));
            const allInvoices = invoiceResult.rows.sort(
                (a, b) => timestampMs(b.issuedAt || b.createdAt) - timestampMs(a.issuedAt || a.createdAt),
            );
            setInvoices(allInvoices);
            setTransactions(allPayouts);
            setInvoicesVisible(50);
            setTransactionsVisible(25);
            setInvoiceHistoryComplete(invoiceResult.complete);
            setPayoutHistoryComplete(uidPayoutResult.complete && legacyPayoutResult.complete);
            if (!invoiceResult.complete || !uidPayoutResult.complete || !legacyPayoutResult.complete) {
                setHistoryLoadError('The 10,000-record safety limit was reached for at least one ledger query. The history remains marked incomplete; reconcile the account with Finance before relying on totals.');
            }
        } catch (error: any) {
            console.error('[OwnerFinancials] complete history load failed:', error);
            setHistoryLoadError(error?.message || 'Complete financial history could not be loaded. Existing figures remain marked as partial.');
            setInvoiceHistoryComplete(false);
            setPayoutHistoryComplete(false);
        } finally {
            setFullHistoryBusy(false);
        }
    };

    const loading = streamsLoading || truthLoading;
    const visibleError = truthError || loadError;

    const FINANCIAL_KPIs = [
        { label: tx('owner.fin.gross_revenue', 'Gross Revenue'), value: summary.totalRevenue, color: '#10b981', icon: <TrendingUp size={20} /> },
        { label: tx('owner.fin.verified_noi', 'Verified NOI'), value: summary.verifiedNoi ?? 0, color: '#38bdf8', icon: <Shield size={20} />, missing: summary.verifiedNoi === null },
        { label: tx('owner.fin.paid_invoices', 'Paid Invoices'), value: summary.paidInvoiceTotal, color: '#f59e0b', icon: <FileText size={20} /> },
        { label: tx('owner.fin.net_payout', 'Net Payout'), value: summary.netPayout, color: binThemeTokens.goldText, icon: <CreditCard size={20} /> },
    ];

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.goldText }} />
            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{tx('owner.fin.securing', 'Securing Financial Stream...')}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            {visibleError && (
                <Alert severity="warning" sx={{ mb: 3 }}>{visibleError}</Alert>
            )}
            {suspensionNotices.map((notice) => (
                <Alert key={notice.noticeId} data-testid="owner-suspension-notice" severity={notice.status === 'SUSPENDED' ? 'error' : 'warning'} sx={{ mb: 3 }}>
                    <strong>{notice.status === 'SUSPENDED' ? 'Services suspended / الخدمات معلقة' : `Written notice - pay by ${String(notice.deadlineAt || '').slice(0, 10)} / إشعار كتابي`}</strong>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>{notice.textEn}</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, direction: 'rtl', textAlign: 'right' }}>{notice.textAr}</Typography>
                </Alert>
            ))}

            {invoiceHistoryComplete && payoutHistoryComplete ? (
                <Alert severity="success" sx={{ mb: 3 }}>
                    <Bi en={"Complete financial history has been loaded for the Owner UID and verified-email ledger queries. The figures below use all records returned by those authorized queries."} ar={"تم تحميل السجل المالي الكامل لحسابك. الأرقام أدناه تشمل جميع السجلات المصرح بها."} />
                </Alert>
            ) : (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    <Stack spacing={1.5}>
                        <Typography variant="body2">
                            <Bi en={"Financial figures are currently partial:"} ar={"الأرقام المالية جزئية حالياً:"} /> {invoices.length} <Bi en={"invoice rows and"} ar={"سجل فواتير و"} /> {transactions.length} <Bi en={"payout rows are loaded. Load complete history before relying on totals or exporting the ledger."} ar={"سجل مدفوعات محملة. حمّل السجل الكامل قبل الاعتماد على الإجماليات أو التصدير."} />
                        </Typography>
                        <Box>
                            <Button
                                size="small"
                                variant="contained"
                                disabled={fullHistoryBusy}
                                onClick={() => void loadCompleteHistory()}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}
                            >
                                {fullHistoryBusy ? 'LOADING COMPLETE HISTORY…' : 'LOAD COMPLETE FINANCIAL HISTORY'}
                            </Button>
                        </Box>
                    </Stack>
                </Alert>
            )}
            {historyLoadError && <Alert severity="error" sx={{ mb: 3 }}>{historyLoadError}</Alert>}

            <OwnerPdcRegisterCard />

            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.goldText, fontWeight: 900, letterSpacing: 4 }}>{tx('owner.fin.ledger_title', 'INSTITUTIONAL REVENUE LEDGER')}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.textPrimary, mt: 1 }}>{tx('owner.fin.financial_sovereign', 'Financial Sovereign')}</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button
                        variant="outlined"
                        startIcon={<Download size={16} />}
                        disabled={!transactions.length || !payoutHistoryComplete}
                        onClick={() => downloadCsv(
                            'bin-owner-transactions.csv',
                            ['Date', 'Reference', 'Description', 'Amount (AED)', 'Status'],
                            transactions.map((txn: any) => [txn.date || '', txn.id, txn.description || '', txn.amount ?? '', txn.status || '']),
                        )}
                        sx={{ borderColor: binThemeTokens.border, color: binThemeTokens.textPrimary, fontWeight: 900, borderRadius: 3 }}
                    >
                        {tx('owner.fin.export_txn', 'Export transactions')}
                    </Button>
                </Stack>
            </Box>

            <Grid container spacing={3} sx={{ mb: 6 }}>
                {FINANCIAL_KPIs.map((kpi, idx) => (
                    <Grid item xs={12} sm={6} md={3} key={idx}>
                        <Paper sx={{ p: 3, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 6 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Box sx={{ p: 1, bgcolor: alpha(kpi.color, 0.1), borderRadius: 2, color: kpi.color }}>{kpi.icon}</Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{tx('owner.fin.recorded', 'RECORDED')}</Typography>
                            </Box>
                            <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.textPrimary }}>{(kpi as any).missing ? '—' : `AED ${formatRecordedAed(kpi.value)}`}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mt: 0.5 }}>{kpi.label.toUpperCase()}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ mb: 4, bgcolor: 'rgba(15, 23, 42, 0.4)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6, overflow: 'hidden' }}>
                <Box sx={{ p: 3, borderBottom: `1px solid ${binThemeTokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <FileText size={18} color={binThemeTokens.gold} /> {tx('owner.fin.invoices', 'ONBOARDING & SERVICE INVOICES')}
                    </Typography>
                    <Chip label={`${invoices.length} RECORD${invoices.length === 1 ? '' : 'S'}`} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.goldText, fontWeight: 950 }} />
                </Box>
                {invoices.length === 0 ? (
                    <Box sx={{ py: 7, textAlign: 'center' }}>
                        <AlertCircle size={42} color="#D1D5DB" style={{ margin: '0 auto 14px' }} />
                        <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{tx('owner.fin.no_invoices', 'NO INVOICE RECORDS FOUND')}</Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: binThemeTokens.softCanvas }}>
                                    <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>INVOICE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>TYPE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>AMOUNT</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>STATUS</TableCell>
                                    <TableCell align="right" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>DOCUMENTS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {invoices.slice(0, invoicesVisible).map(invoice => (
                                    <TableRow key={invoice.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{invoice.invoiceId || invoice.id}</Typography>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{formatInvoiceDate(invoice.issuedAt || invoice.createdAt)}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ color: binThemeTokens.textPrimary, fontWeight: 700 }}>{String(invoice.feeType || invoice.type || 'SERVICE_INVOICE').replace(/_/g, ' ')}</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{invoice.currency || 'AED'} {Number(invoice.amount || invoice.amountPaid || 0).toLocaleString()}</TableCell>
                                        <TableCell>{(() => {
                                            const ledger = ledgerByInvoice[invoice.id];
                                            const view = ledger ? LEDGER_LABEL[ledger.ledgerStatus] : null;
                                            const label = view?.label || String(invoice.status || invoice.paymentStatus || 'PENDING').replace(/_/g, ' ').toUpperCase();
                                            const color = view?.color || payoutStatusColor(invoice.status || invoice.paymentStatus);
                                            return <>
                                                <Chip data-testid="owner-invoice-ledger-status" label={label} size="small" sx={{ bgcolor: alpha(color, 0.12), color, fontWeight: 950 }} />
                                                {ledger?.method && <Typography variant="caption" display="block" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>{ledger.method}{ledger.chequeNumber ? ` #${ledger.chequeNumber}` : ''}{ledger.chequeClearanceState ? ` · ${String(ledger.chequeClearanceState).replace(/_/g, ' ')}` : ''}</Typography>}
                                            </>;
                                        })()}</TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <Button
                                                    size="small"
                                                    startIcon={<ExternalLink size={14} />}
                                                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                                                    sx={{ color: binThemeTokens.goldText, fontWeight: 900 }}
                                                >
                                                    <Bi en={"Open"} ar={"فتح"} />
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<Download size={14} />}
                                                    disabled={!invoice.pdfUrl}
                                                    onClick={() => invoice.pdfUrl && window.open(invoice.pdfUrl, '_blank', 'noopener,noreferrer')}
                                                    sx={{ color: binThemeTokens.textPrimary, fontWeight: 800 }}
                                                >
                                                    <Bi en={"Invoice"} ar={"الفاتورة"} />
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<Shield size={14} />}
                                                    disabled={!invoice.receiptPdfUrl}
                                                    onClick={() => invoice.receiptPdfUrl && window.open(invoice.receiptPdfUrl, '_blank', 'noopener,noreferrer')}
                                                    sx={{ color: invoice.receiptPdfUrl ? '#10b981' : binThemeTokens.textSecondary, fontWeight: 800 }}
                                                >
                                                    <Bi en={"Receipt"} ar={"الإيصال"} />
                                                </Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
                {invoices.length > invoicesVisible && (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Button variant="outlined" onClick={() => setInvoicesVisible((count) => count + 50)} sx={{ fontWeight: 900 }}>
                            <Bi en={"Load more invoices ("} ar={"تحميل المزيد من الفواتير ("} />{invoices.length - invoicesVisible} <Bi en={"remaining)"} ar={"متبقية)"} />
                        </Button>
                    </Box>
                )}
            </Paper>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 6, overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: `1px solid ${binThemeTokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle1" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Clock size={18} color={binThemeTokens.gold} /> {tx('owner.fin.transaction_history', 'TRANSACTION HISTORY')}
                            </Typography>
                        </Box>
                        {transactions.length === 0 ? (
                            <Box sx={{ py: 10, textAlign: 'center' }}>
                                <AlertCircle size={48} color="#D1D5DB" style={{ margin: '0 auto 16px' }} />
                                <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 800 }}>{tx('owner.fin.no_transactions', 'NO TRANSACTION RECORDS FOUND')}</Typography>
                            </Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: binThemeTokens.softCanvas }}>
                                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.table.date', 'DATE / ID')}</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.table.description', 'DESCRIPTION')}</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.table.amount', 'AMOUNT')}</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.log.status', 'STATUS')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {transactions.slice(0, transactionsVisible).map(txn => (
                                            <TableRow key={txn.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 700 }}>{formatInvoiceDate(txn.createdAt || txn.date)}</Typography>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontFamily: 'monospace' }}>#{txn.id.slice(0,8)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 600 }}>{txn.description || txn.transactionType || txn.type || 'Payout record'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>AED {formatRecordedAed(Number(txn.amount ?? txn.amountPaid ?? 0))}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={String(txn.status || txn.paymentStatus || 'STATUS UNAVAILABLE').replace(/_/g, ' ').toUpperCase()}
                                                        size="small"
                                                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(payoutStatusColor(txn.status || txn.paymentStatus), 0.1), color: payoutStatusColor(txn.status || txn.paymentStatus) }}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                        {transactions.length > transactionsVisible && (
                            <Box sx={{ p: 2, textAlign: 'center' }}>
                                <Button variant="outlined" onClick={() => setTransactionsVisible((count) => count + 25)} sx={{ fontWeight: 900 }}>
                                    <Bi en={"Load more transactions ("} ar={"تحميل المزيد من المعاملات ("} />{transactions.length - transactionsVisible} <Bi en={"remaining)"} ar={"متبقية)"} />
                                </Button>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 6, mb: 4 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.goldText, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>{tx('owner.fin.fee_architecture', 'FEE ARCHITECTURE')}</Typography>
                        <Stack spacing={2.5}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{tx('owner.fin.bin_management', 'BIN GROUP Management')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 800 }}>5%</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{tx('owner.fin.management_fees', 'Management Fees')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 800 }}>AED {formatRecordedAed(summary.managementFees)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{tx('owner.fin.pending_verification', 'Pending Verification')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 800 }}>AED {formatRecordedAed(summary.pendingVerification)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{tx('owner.fin.maintenance_deductions', 'Maintenance Deductions')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 800 }}>AED {formatRecordedAed(summary.maintenanceDeductions)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>{tx('owner.fin.bank_processing', 'Bank Processing')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 800 }}>0%</Typography>
                            </Box>
                            <Divider sx={{ borderColor: binThemeTokens.border }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.goldText, fontWeight: 900, display: 'block', mb: 1 }}>{tx('owner.fin.next_payout', 'RECORDED NET OWNER PAYOUT')}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: binThemeTokens.textPrimary }}>AED {summary.netPayout.toLocaleString()}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, mt: 1, display: 'block' }}>{tx('owner.fin.payout_desc', 'Recorded rent collected minus the management fee and approved maintenance deductions. This is a historical calculation, not a forecast of the next payment.')}</Typography>
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 3, bgcolor: alpha('#10b981', 0.03), border: `1px solid ${alpha('#10b981', 0.15)}`, borderRadius: 6 }}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#10b981', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CheckCircle2 size={16} /> {tx('owner.fin.escrow_compliance', 'ESCROW COMPLIANCE')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, lineHeight: 1.5, display: 'block' }}>
                            {tx('owner.fin.escrow_desc', 'Rental collections are calculated through the owner ledger waterfall: gross rent, 5% BIN GROUP management fee, approved maintenance deductions, then net owner payout.')}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
