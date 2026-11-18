// HR > ID Cards & Contracts (Rashid, 18 Nov 2026).
// Lists every staff member with Admin-panel write access, shows who is missing a current ID card or
// contract draft, and lets HR Managers / the Founder (MFA) generate them. PDFs are rendered and stored
// by the server; this page only receives 5-minute signed URLs. Contracts are DRAFTS pending legal review
// and MOHRE registration: nothing here registers, approves or signs a contract.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { canGenerateEmployeeCredentialsUi } from '../../security/staffAccessPolicy';

type CredentialRow = {
    uid: string;
    displayName: string;
    role: string;
    roleLabel?: { en: string; ar: string };
    department: string | null;
    isSelf: boolean;
    cardStatus: 'MISSING' | 'ACTIVE' | 'EXPIRED';
    cardDocumentId: string | null;
    cardIssueDate: string | null;
    cardExpiryDate: string | null;
    contractStatus: string;
    contractDocumentId: string | null;
    contractMissingFields: string[];
    lastGeneratedAtMs: number | null;
    needsGeneration: boolean;
};

function errorText(error: any) {
    return String(error?.details || error?.message || error?.code || 'Employee card operation failed.')
        .replace(/^FirebaseError:\s*/i, '')
        .slice(0, 300);
}

export async function openEmployeeDocumentPdf(staffUid: string, documentId: string) {
    const response: any = await httpsCallable(functions, 'openEmployeeDocument')({ staffUid, documentId });
    const url = String(response?.data?.url || '');
    if (!url.startsWith('https://')) throw new Error('No secure document link was returned.');
    window.open(url, '_blank', 'noopener,noreferrer');
}

export default function EmployeeCredentialsPanel() {
    const { user, mfaVerified } = useAuth();
    const canGenerate = canGenerateEmployeeCredentialsUi(user, mfaVerified);
    const [rows, setRows] = useState<CredentialRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyUid, setBusyUid] = useState<string | null>(null);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

    const load = useCallback(async () => {
        if (!canGenerate) { setLoading(false); return; }
        setLoading(true);
        try {
            const response: any = await httpsCallable(functions, 'adminListEmployeeCredentials')({});
            setRows(Array.isArray(response?.data?.staff) ? response.data.staff : []);
        } catch (error) {
            setRows([]);
            setNotice({ type: 'error', message: `Staff card list could not load: ${errorText(error)}` });
        } finally {
            setLoading(false);
        }
    }, [canGenerate]);

    useEffect(() => { void load(); }, [load]);

    const missing = useMemo(() => rows.filter((row) => row.needsGeneration && !row.isSelf), [rows]);

    const generateFor = async (row: CredentialRow) => {
        if (busyUid || bulkBusy) return;
        setBusyUid(row.uid);
        setNotice(null);
        try {
            const response: any = await httpsCallable(functions, 'adminGenerateEmployeeCredentials')({ staffUid: row.uid });
            const blanks = Array.isArray(response?.data?.missingFields) ? response.data.missingFields.length : 0;
            setNotice({ type: 'success', message: `Card and contract DRAFT generated for ${row.displayName}. ${blanks} contract field(s) are blank for HR to complete before signing.` });
            await load();
        } catch (error) {
            setNotice({ type: 'error', message: errorText(error) });
        } finally {
            setBusyUid(null);
        }
    };

    const generateAllMissing = async () => {
        if (busyUid || bulkBusy || missing.length === 0) return;
        setBulkBusy(true);
        setNotice(null);
        try {
            const response: any = await httpsCallable(functions, 'adminGenerateMissingEmployeeCredentials')({});
            const data = response?.data || {};
            const failed = Array.isArray(data.failed) ? data.failed.length : 0;
            setNotice({
                type: failed ? 'error' : 'success',
                message: `Generated for ${Number(data.generatedCount || 0)} staff member(s).${failed ? ` ${failed} failed.` : ''}${Number(data.remaining || 0) ? ` ${data.remaining} still missing; run again.` : ''}`,
            });
            await load();
        } catch (error) {
            setNotice({ type: 'error', message: errorText(error) });
        } finally {
            setBulkBusy(false);
        }
    };

    const openDocument = async (row: CredentialRow, documentId: string | null) => {
        if (!documentId) return;
        try {
            await openEmployeeDocumentPdf(row.uid, documentId);
        } catch (error) {
            setNotice({ type: 'error', message: errorText(error) });
        }
    };

    if (!canGenerate) {
        return (
            <Alert severity="info" data-testid="employee-credentials-locked">
                Only HR Managers and the Founder, signed in with MFA, can generate employee ID cards and contract drafts.
                — يقتصر إصدار بطاقات الموظفين ومسودات العقود على مديري الموارد البشرية والمؤسس بعد التحقق الثنائي.
            </Alert>
        );
    }

    return (
        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.72)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 4 }} data-testid="employee-credentials-panel">
            <Stack spacing={2}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 950, color: '#fff' }}>Employee ID cards &amp; contracts — بطاقات الموظفين والعقود</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.6)' }}>
                        Every staff member with Admin-panel access gets an ID card and an employment contract DRAFT built from their HR record.
                        You cannot generate your own; another HR Manager or the Founder must.
                    </Typography>
                </Box>
                <Alert severity="warning" data-testid="employee-contract-draft-notice">
                    Contracts are DRAFTS pending legal review and MOHRE registration. They are not registered with MOHRE and are not signed.
                    Blank fields must be completed by HR, and signing stays with the employee and an authorised signatory. The Arabic text prevails if the texts differ.
                    — العقود مسودات بانتظار المراجعة القانونية والتسجيل لدى وزارة الموارد البشرية والتوطين، وغير موقعة، ويُعتمد النص العربي عند الاختلاف.
                </Alert>
                {notice && <Alert severity={notice.type} onClose={() => setNotice(null)}>{notice.message}</Alert>}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.75)' }} data-testid="employee-credentials-missing-count">
                        {missing.length} staff member(s) missing a current card or contract draft — {rows.length} eligible in total
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button variant="outlined" onClick={() => void load()} disabled={loading || bulkBusy}>Refresh — تحديث</Button>
                        <Button variant="contained" data-testid="employee-credentials-generate-missing" onClick={() => void generateAllMissing()} disabled={loading || bulkBusy || Boolean(busyUid) || missing.length === 0}>
                            {bulkBusy ? 'Generating…' : `Generate for all missing (${missing.length}) — إصدار للجميع`}
                        </Button>
                    </Stack>
                </Stack>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>STAFF</TableCell>
                                    <TableCell>ROLE</TableCell>
                                    <TableCell>ID CARD</TableCell>
                                    <TableCell>CONTRACT</TableCell>
                                    <TableCell align="right">ACTIONS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={row.uid} data-testid="employee-credentials-row">
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 800 }}>{row.displayName}</Typography>
                                            <Typography variant="caption" sx={{ opacity: .6 }}>{row.department || 'Department not recorded'}</Typography>
                                        </TableCell>
                                        <TableCell>{row.roleLabel?.en || row.role}</TableCell>
                                        <TableCell>
                                            <Chip size="small" color={row.cardStatus === 'ACTIVE' ? 'success' : row.cardStatus === 'EXPIRED' ? 'warning' : 'error'} label={row.cardStatus === 'ACTIVE' ? `Valid to ${row.cardExpiryDate}` : row.cardStatus} />
                                        </TableCell>
                                        <TableCell>
                                            {row.contractDocumentId ? (
                                                <Tooltip title={row.contractMissingFields.length ? `Blank for HR: ${row.contractMissingFields.join(', ')}` : 'All schedule fields filled from HR record'}>
                                                    <Chip size="small" color="warning" label={`DRAFT · ${row.contractMissingFields.length} blank`} />
                                                </Tooltip>
                                            ) : <Chip size="small" color="error" label="MISSING" />}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                {row.cardDocumentId && <Button size="small" onClick={() => void openDocument(row, row.cardDocumentId)}>View card</Button>}
                                                {row.contractDocumentId && <Button size="small" onClick={() => void openDocument(row, row.contractDocumentId)}>View contract</Button>}
                                                {row.isSelf ? (
                                                    <Chip size="small" label="Another HR Manager / Founder must generate yours" />
                                                ) : (
                                                    <Button size="small" variant={row.needsGeneration ? 'contained' : 'outlined'} data-testid="employee-credentials-generate" disabled={bulkBusy || Boolean(busyUid)} onClick={() => void generateFor(row)}>
                                                        {busyUid === row.uid ? 'Generating…' : row.needsGeneration ? 'Generate card & contract' : 'Re-issue card & contract'}
                                                    </Button>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {rows.length === 0 && <TableRow><TableCell colSpan={5} align="center">No eligible staff found.</TableCell></TableRow>}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Stack>
        </Paper>
    );
}
