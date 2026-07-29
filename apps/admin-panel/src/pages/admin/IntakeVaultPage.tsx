import React from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, Drawer, Grid, IconButton, Paper, Stack, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
    Building2, CalendarCheck, CheckCircle2, ClipboardCheck, Eye, FileText, Mail,
    MapPinned, Route, ShieldCheck, WalletCards, X,
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type IntakeSubmission = {
    id: string;
    workflowVersion?: string;
    status?: string;
    createdAt?: any;
    updatedAt?: any;
    ownerUid?: string;
    ownerId?: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerMobile?: string;
    contactInfo?: { name?: string; email?: string; phone?: string };
    companyProfile?: { name?: string; contactPerson?: string; email?: string; phone?: string };
    properties?: any[];
    selectedPlan?: { name?: string; packageName?: string };
    documentUrls?: Record<string, string>;
    annualContractValue?: number;
    mobilizationAmount?: number;
    portfolioSummary?: { totalProperties?: number; totalUnits?: number; estimatedACV?: number; recommendedTier?: string };
    payment?: { paymentId?: string; amount?: number; annualValue?: number; state?: string };
    paymentStatus?: string;
    adminReviewState?: string;
    activationState?: string;
    inspectionId?: string;
    inspectionIds?: string[];
    inspectionStatus?: string;
    inspectionCount?: number;
};

type Stage = { key: 'ACTIVE' | 'PAYMENT' | 'VISITS' | 'REVIEW'; label: string; color: 'success' | 'warning' | 'info' | 'default' };
const FIVE_PAGE_WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const GOLD = (binThemeTokens as any)?.gold || '#DAA520';
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const text = (value: unknown) => String(value || '').trim();
const money = (value: unknown) => Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timestampMs = (value: any) => value?.toMillis?.() || Date.parse(String(value || '')) || 0;
const ownerName = (item: IntakeSubmission) => item.ownerName || item.contactInfo?.name || item.companyProfile?.contactPerson || item.companyProfile?.name || 'Owner';
const ownerEmail = (item: IntakeSubmission) => item.ownerEmail || item.contactInfo?.email || item.companyProfile?.email || '—';
const propertyCount = (item: IntakeSubmission) => item.properties?.length || item.portfolioSummary?.totalProperties || 0;
const annualValue = (item: IntakeSubmission) => Number(item.annualContractValue || item.payment?.annualValue || item.portfolioSummary?.estimatedACV || 0);
const mobilisation = (item: IntakeSubmission) => Number(item.mobilizationAmount || item.payment?.amount || Math.round(annualValue(item) * 0.15));

const stageFor = (item: IntakeSubmission): Stage => {
    const activation = upper(item.activationState);
    const status = upper(item.status);
    const inspection = upper(item.inspectionStatus);
    const payment = upper(item.paymentStatus || item.payment?.state);
    if (activation === 'ACTIVE' || status.includes('ACTIVE') || status.includes('CONVERTED')) return { key: 'ACTIVE', label: 'ACTIVE OWNER', color: 'success' };
    if (inspection === 'COMPLETED' || payment.includes('PENDING_ADMIN_PAYMENT') || payment.includes('PENDING_ADMIN_APPROVAL')) return { key: 'PAYMENT', label: '15% PAYMENT', color: 'warning' };
    if (inspection.includes('READY') || (item.inspectionIds?.length || item.inspectionId)) return { key: 'VISITS', label: 'SITE VISITS', color: 'info' };
    return { key: 'REVIEW', label: 'ADMIN REVIEW', color: 'default' };
};

export const IntakeVaultPage: React.FC = () => {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = React.useState<IntakeSubmission[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [busyId, setBusyId] = React.useState('');
    const [selected, setSelected] = React.useState<IntakeSubmission | null>(null);
    const [completionTarget, setCompletionTarget] = React.useState<IntakeSubmission | null>(null);
    const [completionNotes, setCompletionNotes] = React.useState('');

    React.useEffect(() => {
        const intakeQuery = query(collection(db, 'intake_submissions'), orderBy('createdAt', 'desc'));
        return onSnapshot(intakeQuery, (snapshot) => {
            setSubmissions(snapshot.docs
                .map((document) => ({ id: document.id, ...document.data() } as IntakeSubmission))
                .sort((a, b) => timestampMs(b.createdAt || b.updatedAt) - timestampMs(a.createdAt || a.updatedAt)));
            setLoading(false);
            setError('');
        }, (streamError) => {
            console.error('Owner application queue failed:', streamError);
            setError(streamError.message || 'Unable to load Owner applications.');
            setLoading(false);
        });
    }, []);

    const runAction = async (item: IntakeSubmission, action: () => Promise<void>) => {
        setBusyId(item.id);
        setError('');
        setNotice('');
        try { await action(); }
        catch (actionError: any) {
            console.error('Owner application action failed:', actionError);
            setError(actionError?.details || actionError?.message || String(actionError));
        } finally { setBusyId(''); }
    };

    const createVisits = (item: IntakeSubmission) => runAction(item, async () => {
        if (item.workflowVersion !== FIVE_PAGE_WORKFLOW) throw new Error('This submission is not on the protected five-page workflow.');
        const properties = item.properties || [];
        if (!properties.length) throw new Error('No property records are attached to this application.');
        if (properties.some((property) => !Number.isFinite(Number(property?.geo?.lat)) || !Number.isFinite(Number(property?.geo?.lng)))) {
            throw new Error('Every property requires valid Owner-submitted GPS before a visit can be created.');
        }

        const createInspection = httpsCallable(functions, 'adminCreateOwnerPortfolioPropertyInspection');
        const created: Array<{ inspectionId: string; directionsUrl?: string }> = [];
        for (let propertyIndex = 0; propertyIndex < properties.length; propertyIndex += 1) {
            const response = await createInspection({ intakeId: item.id, propertyIndex });
            const result = response.data as { inspectionId?: string; directionsUrl?: string };
            if (!result.inspectionId) throw new Error(`Inspection reference missing for property ${propertyIndex + 1}.`);
            created.push({ inspectionId: result.inspectionId, directionsUrl: result.directionsUrl });
        }
        await httpsCallable(functions, 'adminLinkOwnerPropertyInspection')({
            intakeId: item.id,
            inspectionIds: created.map((inspection) => inspection.inspectionId),
        });
        setNotice(`${created.length} idempotent property visit${created.length === 1 ? '' : 's'} created. No payment is collected during the visits.`);
        const firstDirections = created.find((inspection) => inspection.directionsUrl)?.directionsUrl;
        if (firstDirections && window.confirm('Visits created. Open directions for the first property?')) window.open(firstDirections, '_blank', 'noopener,noreferrer');
    });

    const completeVisits = async () => {
        if (!completionTarget) return;
        const target = completionTarget;
        await runAction(target, async () => {
            await httpsCallable(functions, 'adminCompleteOwnerPortfolioInspections')({ intakeId: target.id, notes: completionNotes.trim() });
            setCompletionTarget(null);
            setCompletionNotes('');
            setNotice(`All property visits completed. AED ${money(mobilisation(target))} is now due as the exact 15% mobilisation payment.`);
        });
    };

    const messageOwner = (item: IntakeSubmission) => runAction(item, async () => {
        const message = window.prompt('Message to the Owner:', 'BIN GROUP is reviewing your five-page property application and will contact you to arrange the site visit.');
        if (!message?.trim()) return;
        await httpsCallable(functions, 'adminSendOwnerOnboardingMessage')({
            intakeId: item.id,
            subject: 'BIN GROUP property application update',
            message: message.trim(),
        });
        setNotice('Owner update queued through the protected Admin messaging workflow.');
    });

    const actionButton = (item: IntakeSubmission) => {
        const stage = stageFor(item);
        const busy = busyId === item.id;
        if (stage.key === 'ACTIVE') return <Chip label="APPROVED & ACTIVE" color="success" variant="outlined" />;
        if (stage.key === 'PAYMENT') return <Button size="small" variant="contained" startIcon={<WalletCards size={15} />} onClick={() => navigate(`/payments?paymentId=${encodeURIComponent(item.payment?.paymentId || item.id)}`)} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>RECORD 15% & APPROVE</Button>;
        if (stage.key === 'VISITS') return <Button size="small" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : <CheckCircle2 size={15} />} onClick={() => { setCompletionNotes(''); setCompletionTarget(item); }} sx={{ bgcolor: '#2563EB', fontWeight: 950 }}>COMPLETE ALL VISITS</Button>;
        return <Button size="small" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : <Route size={15} />} onClick={() => void createVisits(item)} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>CREATE PROPERTY VISITS</Button>;
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, minHeight: '100%' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={2} sx={{ mb: 3 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: GOLD, fontWeight: 950, letterSpacing: 2 }}>OWNER ACQUISITION</Typography>
                    <Typography variant="h4" fontWeight={950} color="#FFF">Five-Page Applications & Property Visits</Typography>
                    <Typography color="rgba(255,255,255,0.55)" sx={{ mt: 0.5 }}>Application → Admin review → one visit per property → exact 15% received → final approval.</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip icon={<ShieldCheck size={15} />} label={`${submissions.filter((item) => item.workflowVersion === FIVE_PAGE_WORKFLOW).length} protected applications`} color="success" variant="outlined" />
                    <Chip icon={<CalendarCheck size={15} />} label={`${submissions.filter((item) => stageFor(item).key === 'VISITS').length} visit-ready`} color="info" variant="outlined" />
                </Stack>
            </Stack>

            <Alert severity="info" icon={<ClipboardCheck size={20} />} sx={{ mb: 3 }}>
                The site-visit jobs are explicitly marked paymentCollectionRequired=false. The 15% becomes due only after every linked property visit is completed.
            </Alert>
            {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 3 }}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 3 }}>{notice}</Alert>}

            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <Table>
                    <TableHead><TableRow sx={{ '& th': { color: 'rgba(255,255,255,0.52)', fontWeight: 900, borderColor: 'rgba(255,255,255,0.06)' } }}><TableCell>OWNER</TableCell><TableCell>PORTFOLIO</TableCell><TableCell>VALUE / 15%</TableCell><TableCell>STAGE</TableCell><TableCell align="right">ACTIONS</TableCell></TableRow></TableHead>
                    <TableBody>
                        {loading ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8 }}><CircularProgress sx={{ color: GOLD }} /></TableCell></TableRow> : submissions.length === 0 ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.5)' }}>No Owner applications found.</TableCell></TableRow> : submissions.map((item) => {
                            const stage = stageFor(item);
                            return <TableRow key={item.id} hover sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)' } }}>
                                <TableCell><Typography color="#FFF" fontWeight={900}>{ownerName(item)}</Typography><Typography variant="caption" color="rgba(255,255,255,0.45)">{ownerEmail(item)}</Typography><Typography variant="caption" display="block" color="rgba(255,255,255,0.35)">{item.id}</Typography></TableCell>
                                <TableCell><Typography color="#FFF" fontWeight={850}>{propertyCount(item)} propert{propertyCount(item) === 1 ? 'y' : 'ies'}</Typography><Typography variant="caption" color="rgba(255,255,255,0.45)">{item.portfolioSummary?.totalUnits || 0} units · {item.selectedPlan?.name || item.selectedPlan?.packageName || item.portfolioSummary?.recommendedTier || 'Service plan'}</Typography></TableCell>
                                <TableCell><Typography color="#FFF" fontWeight={900}>AED {money(annualValue(item))}</Typography><Typography variant="caption" color={GOLD}>15%: AED {money(mobilisation(item))}</Typography></TableCell>
                                <TableCell><Chip label={stage.label} color={stage.color} size="small" variant={stage.key === 'ACTIVE' ? 'filled' : 'outlined'} sx={{ fontWeight: 900 }} /><Typography variant="caption" display="block" color="rgba(255,255,255,0.4)" sx={{ mt: 0.75 }}>{item.inspectionIds?.length || item.inspectionCount || 0}/{propertyCount(item)} inspections</Typography></TableCell>
                                <TableCell align="right"><Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap><IconButton onClick={() => setSelected(item)} sx={{ color: '#FFF' }}><Eye size={18} /></IconButton><IconButton onClick={() => void messageOwner(item)} disabled={busyId === item.id} sx={{ color: GOLD }}><Mail size={18} /></IconButton>{actionButton(item)}</Stack></TableCell>
                            </TableRow>;
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, bgcolor: '#07111F', color: '#FFF', p: 3 } }}>
                {selected && <Stack spacing={3}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" color={GOLD} fontWeight={950}>OWNER APPLICATION</Typography><Typography variant="h5" fontWeight={950}>{ownerName(selected)}</Typography></Box><IconButton onClick={() => setSelected(null)} sx={{ color: '#FFF' }}><X /></IconButton></Stack>
                    <Alert severity={selected.workflowVersion === FIVE_PAGE_WORKFLOW ? 'success' : 'warning'}>{selected.workflowVersion === FIVE_PAGE_WORKFLOW ? 'Protected inspection-first five-page workflow.' : 'Legacy application — migrate it before using the five-page approval sequence.'}</Alert>
                    <Paper sx={{ p: 2.5, bgcolor: 'rgba(218,165,32,0.06)', border: '1px solid rgba(218,165,32,0.22)' }}><Typography variant="overline" color={GOLD} fontWeight={950}>LOCKED COMMERCIALS</Typography><Grid container spacing={2} sx={{ mt: 0.2 }}><Grid item xs={6}><Typography variant="caption" color="text.secondary">Annual value</Typography><Typography color="#FFF" fontWeight={950}>AED {money(annualValue(selected))}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">15% after visits</Typography><Typography color={GOLD} fontWeight={950}>AED {money(mobilisation(selected))}</Typography></Grid></Grid></Paper>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                    <Box><Typography variant="overline" color={GOLD} fontWeight={950}>PROPERTIES & GPS</Typography><Stack spacing={1.5} sx={{ mt: 1 }}>{(selected.properties || []).map((property, index) => <Paper key={property.id || index} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}><Stack direction="row" spacing={1.5} alignItems="flex-start"><Building2 size={18} color={GOLD} /><Box><Typography color="#FFF" fontWeight={900}>{property.address || property.area || property.emirate || `Property ${index + 1}`}</Typography><Typography variant="caption" color="rgba(255,255,255,0.5)">{property.propertyType} · {property.units || 0} units</Typography><Stack direction="row" spacing={0.7} alignItems="center" sx={{ mt: 0.8 }}><MapPinned size={13} color={property.geo?.lat && property.geo?.lng ? '#4ADE80' : '#EF4444'} /><Typography variant="caption" color={property.geo?.lat && property.geo?.lng ? '#4ADE80' : '#EF4444'}>{property.geo?.lat && property.geo?.lng ? `${property.geo.lat}, ${property.geo.lng}` : 'GPS missing'}</Typography></Stack></Box></Stack></Paper>)}</Stack></Box>
                    <Box><Typography variant="overline" color={GOLD} fontWeight={950}>PROTECTED DOCUMENTS</Typography><Stack spacing={1} sx={{ mt: 1 }}>{Object.entries(selected.documentUrls || {}).filter(([, url]) => text(url)).map(([key, url]) => <Button key={key} variant="outlined" startIcon={<FileText size={16} />} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} sx={{ justifyContent: 'flex-start', color: '#FFF', borderColor: 'rgba(255,255,255,0.16)' }}>{key.replace(/([A-Z])/g, ' $1')}</Button>)}</Stack></Box>
                    {actionButton(selected)}
                </Stack>}
            </Drawer>

            <Dialog open={Boolean(completionTarget)} onClose={() => !busyId && setCompletionTarget(null)} fullWidth maxWidth="sm">
                <DialogTitle sx={{ fontWeight: 950 }}>Confirm every property visit is complete</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>This action makes the exact 15% mobilisation payment due. Confirm physical visits, GPS, access, systems, condition and service scope for every property.</Alert>
                    <Typography variant="body2" sx={{ mb: 1 }}>{completionTarget ? `${propertyCount(completionTarget)} properties · ${completionTarget.inspectionIds?.length || completionTarget.inspectionCount || 0} linked inspections` : ''}</Typography>
                    <TextField autoFocus multiline minRows={4} fullWidth label="Portfolio site-visit findings and verification notes" value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} />
                </DialogContent>
                <DialogActions><Button onClick={() => setCompletionTarget(null)} disabled={Boolean(busyId)}>Cancel</Button><Button variant="contained" disabled={completionNotes.trim().length < 8 || Boolean(busyId)} onClick={() => void completeVisits()} startIcon={busyId ? <CircularProgress size={16} /> : <CheckCircle2 size={16} />}>Complete all visits & request 15%</Button></DialogActions>
            </Dialog>
        </Box>
    );
};
