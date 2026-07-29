import React from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, Drawer, Grid, IconButton, Paper, Stack, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, TextField, Typography, alpha,
} from '@mui/material';
import {
    Building2, CalendarCheck, CheckCircle2, ClipboardCheck, Eye, FileText, Mail,
    MapPinned, Route, ShieldCheck, WalletCards, X,
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type IntakeDocument = { label?: string; name?: string; url?: string; downloadUrl?: string };
type IntakeSubmission = {
    id: string;
    workflowVersion?: string;
    status?: string;
    source?: string;
    createdAt?: any;
    updatedAt?: any;
    ownerUid?: string;
    ownerId?: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerMobile?: string;
    contactInfo?: { name?: string; email?: string; phone?: string; licenseNumber?: string };
    companyProfile?: { name?: string; contactPerson?: string; email?: string; phone?: string; licenseNumber?: string };
    properties?: any[];
    selectedPlan?: { name?: string; packageName?: string; id?: string; type?: string };
    selectedAddOns?: string[];
    documentUrls?: Record<string, string>;
    proofDocuments?: Record<string, IntakeDocument>;
    annualContractValue?: number;
    mobilizationAmount?: number;
    portfolioSummary?: { totalProperties?: number; totalUnits?: number; estimatedACV?: number; recommendedTier?: string };
    payment?: { paymentId?: string; contractId?: string; amount?: number; annualValue?: number; state?: string; method?: string };
    paymentStatus?: string;
    adminReviewState?: string;
    activationState?: string;
    inspectionId?: string;
    inspectionIds?: string[];
    inspectionStatus?: string;
    inspectionCount?: number;
    inspectionCompletedCount?: number;
};

type BusyAction = 'schedule' | 'complete' | 'message' | '';
const GOLD = (binThemeTokens as any)?.gold || '#DAA520';
const FIVE_PAGE_WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const text = (value: unknown) => String(value || '').trim();
const money = (value: unknown) => Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const timestampMs = (value: any) => {
    if (value?.toMillis) return value.toMillis();
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const ownerName = (intake: IntakeSubmission) => intake.ownerName || intake.contactInfo?.name || intake.companyProfile?.contactPerson || intake.companyProfile?.name || 'Owner';
const ownerEmail = (intake: IntakeSubmission) => intake.ownerEmail || intake.contactInfo?.email || intake.companyProfile?.email || '—';
const propertyCount = (intake: IntakeSubmission) => intake.properties?.length || intake.portfolioSummary?.totalProperties || 0;
const annualValue = (intake: IntakeSubmission) => Number(intake.annualContractValue || intake.payment?.annualValue || intake.portfolioSummary?.estimatedACV || 0);
const mobilisation = (intake: IntakeSubmission) => Number(intake.mobilizationAmount || intake.payment?.amount || Math.round(annualValue(intake) * 0.15));

const stageFor = (intake: IntakeSubmission) => {
    const activation = upper(intake.activationState);
    const status = upper(intake.status);
    const inspection = upper(intake.inspectionStatus);
    const payment = upper(intake.paymentStatus || intake.payment?.state);
    if (activation === 'ACTIVE' || status.includes('ACTIVE') || status.includes('CONVERTED')) return { key: 'ACTIVE', label: 'ACTIVE OWNER', color: 'success' as const };
    if (payment.includes('PENDING_ADMIN_APPROVAL') || payment.includes('PAYMENT_EVIDENCE_RECORDED')) return { key: 'PAYMENT_REVIEW', label: '15% PAYMENT READY', color: 'warning' as const };
    if (inspection === 'COMPLETED' || payment.includes('PENDING_ADMIN_PAYMENT_VERIFICATION')) return { key: 'PAYMENT_DUE', label: '15% PAYMENT DUE', color: 'warning' as const };
    if (inspection.includes('READY') || (intake.inspectionIds?.length || intake.inspectionId)) return { key: 'VISIT_READY', label: 'SITE VISITS READY', color: 'info' as const };
    if (status.includes('SUBMITTED') || upper(intake.adminReviewState).includes('AWAITING')) return { key: 'REVIEW', label: 'ADMIN REVIEW', color: 'default' as const };
    return { key: 'REVIEW', label: status || 'ADMIN REVIEW', color: 'default' as const };
};

export const IntakeVaultPage: React.FC = () => {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = React.useState<IntakeSubmission[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState('');
    const [selectedIntake, setSelectedIntake] = React.useState<IntakeSubmission | null>(null);
    const [inspectionDialog, setInspectionDialog] = React.useState<IntakeSubmission | null>(null);
    const [inspectionNotes, setInspectionNotes] = React.useState('');
    const [busyId, setBusyId] = React.useState('');
    const [busyAction, setBusyAction] = React.useState<BusyAction>('');
    const [notice, setNotice] = React.useState('');

    React.useEffect(() => {
        const q = query(collection(db, 'intake_submissions'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rows = snapshot.docs
                .map((document) => ({ id: document.id, ...document.data() } as IntakeSubmission))
                .sort((left, right) => timestampMs(right.createdAt || right.updatedAt) - timestampMs(left.createdAt || left.updatedAt));
            setSubmissions(rows);
            setLoading(false);
            setLoadError('');
        }, (error) => {
            console.error('Owner application queue failed:', error);
            setLoadError(error.message || 'Unable to load owner applications.');
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const runBusy = async (intakeId: string, action: BusyAction, work: () => Promise<void>) => {
        setBusyId(intakeId);
        setBusyAction(action);
        setNotice('');
        try {
            await work();
        } catch (error: any) {
            console.error(`Owner application ${action} failed:`, error);
            setNotice(error?.details || error?.message || String(error));
        } finally {
            setBusyId('');
            setBusyAction('');
        }
    };

    const scheduleVisits = async (intake: IntakeSubmission) => runBusy(intake.id, 'schedule', async () => {
        if (intake.workflowVersion !== FIVE_PAGE_WORKFLOW) throw new Error('This submission is not using the protected five-page inspection-first workflow.');
        const properties = intake.properties || [];
        if (!properties.length) throw new Error('No property records are attached to this Owner application.');
        if (properties.some((property) => !Number.isFinite(Number(property?.geo?.lat)) || !Number.isFinite(Number(property?.geo?.lng)))) {
            throw new Error('Every property requires valid Owner-submitted GPS before creating site visits.');
        }
        const createInspection = httpsCallable(functions, 'adminCreateOwnerPropertyInspection');
        const created: Array<{ inspectionId: string; directionsUrl?: string }> = [];
        for (let propertyIndex = 0; propertyIndex < properties.length; propertyIndex += 1) {
            const response = await createInspection({ intakeId: intake.id, propertyIndex });
            const result = response.data as { inspectionId?: string; directionsUrl?: string };
            if (!result.inspectionId) throw new Error(`Property ${propertyIndex + 1} inspection reference was not returned.`);
            created.push({ inspectionId: result.inspectionId, directionsUrl: result.directionsUrl });
        }
        const linkInspection = httpsCallable(functions, 'adminLinkOwnerPropertyInspection');
        await linkInspection({ intakeId: intake.id, inspectionIds: created.map((item) => item.inspectionId) });
        setNotice(`${created.length} property site visit${created.length === 1 ? '' : 's'} created. Assign the inspection tickets and complete the visits before collecting payment.`);
        const firstDirections = created.find((item) => item.directionsUrl)?.directionsUrl;
        if (firstDirections && window.confirm('Site visits created. Open directions for the first property now?')) window.open(firstDirections, '_blank', 'noopener,noreferrer');
    });

    const completeVisits = async () => {
        const intake = inspectionDialog;
        if (!intake) return;
        await runBusy(intake.id, 'complete', async () => {
            const callable = httpsCallable(functions, 'adminCompleteOwnerPortfolioInspections');
            await callable({ intakeId: intake.id, notes: inspectionNotes.trim() });
            setInspectionDialog(null);
            setInspectionNotes('');
            setNotice(`All ${propertyCount(intake)} property visits completed. The exact 15% mobilisation payment of AED ${money(mobilisation(intake))} is now due.`);
        });
    };

    const contactOwner = async (intake: IntakeSubmission) => {
        const message = window.prompt('Message to the Owner:', 'BIN GROUP is reviewing your property application. We will contact you to arrange the site visit.');
        if (!message?.trim()) return;
        await runBusy(intake.id, 'message', async () => {
            const callable = httpsCallable(functions, 'adminSendOwnerOnboardingMessage');
            await callable({ intakeId: intake.id, subject: 'BIN GROUP property application update', message: message.trim() });
            setNotice('Owner update queued through the protected Admin message workflow.');
        });
    };

    const openPayments = (intake: IntakeSubmission) => {
        navigate(`/payments?paymentId=${encodeURIComponent(intake.payment?.paymentId || intake.id)}`);
    };

    const renderAction = (intake: IntakeSubmission) => {
        const stage = stageFor(intake);
        const busy = busyId === intake.id;
        if (stage.key === 'ACTIVE') return <Chip label="APPROVED & ACTIVE" color="success" variant="outlined" />;
        if (stage.key === 'PAYMENT_DUE' || stage.key === 'PAYMENT_REVIEW') {
            return <Button size="small" variant="contained" startIcon={<WalletCards size={15} />} onClick={() => openPayments(intake)} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>RECORD 15% & APPROVE</Button>;
        }
        if (stage.key === 'VISIT_READY') {
            return <Button size="small" variant="contained" startIcon={busy ? <CircularProgress size={14} /> : <CheckCircle2 size={15} />} disabled={busy} onClick={() => { setInspectionNotes(''); setInspectionDialog(intake); }} sx={{ bgcolor: '#2563EB', fontWeight: 950 }}>MARK ALL VISITS COMPLETE</Button>;
        }
        return <Button size="small" variant="contained" startIcon={busy && busyAction === 'schedule' ? <CircularProgress size={14} /> : <Route size={15} />} disabled={busy} onClick={() => void scheduleVisits(intake)} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>CREATE PROPERTY VISITS</Button>;
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, minHeight: '100%' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={2} sx={{ mb: 3 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: GOLD, fontWeight: 950, letterSpacing: 2 }}>OWNER ACQUISITION</Typography>
                    <Typography variant="h4" fontWeight={950} color="#FFF">Five-Page Applications & Property Visits</Typography>
                    <Typography color="rgba(255,255,255,0.55)" sx={{ mt: 0.5 }}>Application → Admin review → every property visited → exact 15% received → final Admin approval.</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Chip icon={<ShieldCheck size={15} />} label={`${submissions.filter((item) => item.workflowVersion === FIVE_PAGE_WORKFLOW).length} protected five-page applications`} color="success" variant="outlined" />
                    <Chip icon={<CalendarCheck size={15} />} label={`${submissions.filter((item) => stageFor(item).key === 'VISIT_READY').length} visit-ready`} color="info" variant="outlined" />
                </Stack>
            </Stack>

            <Alert severity="info" icon={<ClipboardCheck size={20} />} sx={{ mb: 3 }}>
                Never collect or approve the 15% mobilisation before every linked property visit is completed. Final dashboard unlock happens only through the Payment Approvals page.
            </Alert>
            {notice && <Alert severity={notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('unable') ? 'error' : 'success'} onClose={() => setNotice('')} sx={{ mb: 3 }}>{notice}</Alert>}
            {loadError && <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}

            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <Table>
                    <TableHead><TableRow sx={{ '& th': { color: 'rgba(255,255,255,0.52)', fontWeight: 900, borderColor: 'rgba(255,255,255,0.06)' } }}><TableCell>OWNER</TableCell><TableCell>PORTFOLIO</TableCell><TableCell>VALUE / 15%</TableCell><TableCell>WORKFLOW STAGE</TableCell><TableCell align="right">ACTIONS</TableCell></TableRow></TableHead>
                    <TableBody>
                        {loading ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8 }}><CircularProgress sx={{ color: GOLD }} /></TableCell></TableRow> : submissions.length === 0 ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.5)' }}>No Owner applications found.</TableCell></TableRow> : submissions.map((intake) => {
                            const stage = stageFor(intake);
                            return <TableRow key={intake.id} hover sx={{ '& td': { borderColor: 'rgba(255,255,255,0.05)' } }}>
                                <TableCell><Typography color="#FFF" fontWeight={900}>{ownerName(intake)}</Typography><Typography variant="caption" color="rgba(255,255,255,0.45)">{ownerEmail(intake)}</Typography><Typography variant="caption" display="block" color="rgba(255,255,255,0.35)">{intake.id}</Typography></TableCell>
                                <TableCell><Typography color="#FFF" fontWeight={850}>{propertyCount(intake)} propert{propertyCount(intake) === 1 ? 'y' : 'ies'}</Typography><Typography variant="caption" color="rgba(255,255,255,0.45)">{intake.portfolioSummary?.totalUnits || 0} units · {intake.selectedPlan?.name || intake.selectedPlan?.packageName || intake.portfolioSummary?.recommendedTier || 'Service plan'}</Typography></TableCell>
                                <TableCell><Typography color="#FFF" fontWeight={900}>AED {money(annualValue(intake))}</Typography><Typography variant="caption" color={GOLD}>15%: AED {money(mobilisation(intake))}</Typography></TableCell>
                                <TableCell><Chip label={stage.label} color={stage.color} size="small" variant={stage.key === 'ACTIVE' ? 'filled' : 'outlined'} sx={{ fontWeight: 900 }} /><Typography variant="caption" display="block" color="rgba(255,255,255,0.4)" sx={{ mt: 0.75 }}>{intake.inspectionIds?.length || intake.inspectionCount || 0}/{propertyCount(intake)} inspections</Typography></TableCell>
                                <TableCell align="right"><Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap><IconButton onClick={() => setSelectedIntake(intake)} sx={{ color: '#FFF' }}><Eye size={18} /></IconButton><IconButton onClick={() => void contactOwner(intake)} disabled={busyId === intake.id} sx={{ color: GOLD }}><Mail size={18} /></IconButton>{renderAction(intake)}</Stack></TableCell>
                            </TableRow>;
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            <Drawer anchor="right" open={Boolean(selectedIntake)} onClose={() => setSelectedIntake(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 560 }, bgcolor: '#07111F', color: '#FFF', p: 3 } }}>
                {selectedIntake && <Stack spacing={3}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" color={GOLD} fontWeight={950}>OWNER APPLICATION</Typography><Typography variant="h5" fontWeight={950}>{ownerName(selectedIntake)}</Typography></Box><IconButton onClick={() => setSelectedIntake(null)} sx={{ color: '#FFF' }}><X /></IconButton></Stack>
                    <Alert severity={selectedIntake.workflowVersion === FIVE_PAGE_WORKFLOW ? 'success' : 'warning'}>{selectedIntake.workflowVersion === FIVE_PAGE_WORKFLOW ? 'Protected inspection-first five-page workflow.' : 'Legacy application — do not use the five-page approval sequence without migration.'}</Alert>
                    <Paper sx={{ p: 2.5, bgcolor: alpha(GOLD, 0.06), border: `1px solid ${alpha(GOLD, 0.22)}` }}><Typography variant="overline" color={GOLD} fontWeight={950}>LOCKED COMMERCIALS</Typography><Grid container spacing={2} sx={{ mt: 0.2 }}><Grid item xs={6}><Typography variant="caption" color="text.secondary">Annual value</Typography><Typography color="#FFF" fontWeight={950}>AED {money(annualValue(selectedIntake))}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">15% after visits</Typography><Typography color={GOLD} fontWeight={950}>AED {money(mobilisation(selectedIntake))}</Typography></Grid></Grid></Paper>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                    <Box><Typography variant="overline" color={GOLD} fontWeight={950}>PROPERTIES & GPS</Typography><Stack spacing={1.5} sx={{ mt: 1 }}>{(selectedIntake.properties || []).map((property, index) => <Paper key={property.id || index} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}><Stack direction="row" spacing={1.5} alignItems="flex-start"><Building2 size={18} color={GOLD} /><Box><Typography color="#FFF" fontWeight={900}>{property.address || property.area || property.emirate || `Property ${index + 1}`}</Typography><Typography variant="caption" color="rgba(255,255,255,0.5)">{property.propertyType} · {property.units || 0} units</Typography><Stack direction="row" spacing={0.7} alignItems="center" sx={{ mt: 0.8 }}><MapPinned size={13} color={property.geo?.lat && property.geo?.lng ? '#4ADE80' : '#EF4444'} /><Typography variant="caption" color={property.geo?.lat && property.geo?.lng ? '#4ADE80' : '#EF4444'}>{property.geo?.lat && property.geo?.lng ? `${property.geo.lat}, ${property.geo.lng}` : 'GPS missing'}</Typography></Stack></Box></Stack></Paper>)}</Stack></Box>
                    <Box><Typography variant="overline" color={GOLD} fontWeight={950}>PROTECTED DOCUMENTS</Typography><Stack spacing={1} sx={{ mt: 1 }}>{Object.entries(selectedIntake.documentUrls || {}).filter(([, url]) => text(url)).map(([key, url]) => <Button key={key} variant="outlined" startIcon={<FileText size={16} />} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} sx={{ justifyContent: 'flex-start', color: '#FFF', borderColor: 'rgba(255,255,255,0.16)' }}>{key.replace(/([A-Z])/g, ' $1')}</Button>)}{Object.keys(selectedIntake.documentUrls || {}).length === 0 && <Typography variant="body2" color="rgba(255,255,255,0.45)">No document URLs found.</Typography>}</Stack></Box>
                    <Box>{renderAction(selectedIntake)}</Box>
                </Stack>}
            </Drawer>

            <Dialog open={Boolean(inspectionDialog)} onClose={() => !busyId && setInspectionDialog(null)} fullWidth maxWidth="sm">
                <DialogTitle sx={{ fontWeight: 950 }}>Confirm all property visits are complete</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>This action makes the exact 15% mobilisation payment due. Confirm that every property was physically visited and its GPS, access, systems, condition and service scope were checked.</Alert>
                    <Typography variant="body2" sx={{ mb: 1 }}>{inspectionDialog ? `${propertyCount(inspectionDialog)} properties · ${inspectionDialog.inspectionIds?.length || inspectionDialog.inspectionCount || 0} linked inspections` : ''}</Typography>
                    <TextField autoFocus multiline minRows={4} fullWidth label="Site-visit findings and verification notes" value={inspectionNotes} onChange={(event) => setInspectionNotes(event.target.value)} />
                </DialogContent>
                <DialogActions><Button onClick={() => setInspectionDialog(null)} disabled={Boolean(busyId)}>Cancel</Button><Button variant="contained" disabled={inspectionNotes.trim().length < 8 || Boolean(busyId)} onClick={() => void completeVisits()} startIcon={busyAction === 'complete' ? <CircularProgress size={16} /> : <CheckCircle2 size={16} />}>Complete all visits & request 15%</Button></DialogActions>
            </Dialog>
        </Box>
    );
};
