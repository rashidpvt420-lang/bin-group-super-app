import React from 'react';
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
    DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, Paper, Stack,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import {
    CalendarCheck, Camera, CheckCircle2, ClipboardCheck, Eye, FileText, LocateFixed,
    Mail, MapPinned, Route, ShieldCheck, WalletCards,
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
    ownerName?: string;
    ownerEmail?: string;
    ownerMobile?: string;
    contactInfo?: { name?: string; email?: string; phone?: string };
    companyProfile?: { name?: string; contactPerson?: string; email?: string; phone?: string };
    properties?: any[];
    selectedPlan?: { name?: string; packageName?: string };
    documentEvidence?: Record<string, { filename?: string; storagePath?: string }>;
    annualContractValue?: number;
    mobilizationAmount?: number;
    portfolioSummary?: { totalProperties?: number; totalUnits?: number; estimatedACV?: number; recommendedTier?: string };
    payment?: { paymentId?: string; amount?: number; annualValue?: number; state?: string };
    paymentStatus?: string;
    activationState?: string;
    inspectionId?: string;
    inspectionIds?: string[];
    inspectionStatus?: string;
    inspectionCount?: number;
    inspectionEvidenceVerifiedCount?: number;
};

type InspectionRow = {
    inspectionId: string;
    propertyId: string;
    propertyIndex: number;
    propertyName: string;
    status: string;
    evidenceVerified: boolean;
    arrivalDistanceMetres?: number;
    photoCount?: number;
    findings?: string;
    location: { lat: number; lng: number; address?: string; directionsUrl?: string };
};

type Readiness = {
    intakeId: string;
    expectedInspectionCount: number;
    verifiedCount: number;
    allEvidenceVerified: boolean;
    inspections: InspectionRow[];
};

type Stage = { key: 'ACTIVE' | 'PAYMENT' | 'VISITS' | 'REVIEW'; label: string; color: 'success' | 'warning' | 'info' | 'default' };

const FIVE_PAGE_WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const GOLD = (binThemeTokens as any)?.gold || '#DAA520';
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const money = (value: unknown) => Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timestampMs = (value: any) => value?.toMillis?.() || Date.parse(String(value || '')) || 0;
const ownerName = (item: IntakeSubmission) => item.ownerName || item.contactInfo?.name || item.companyProfile?.contactPerson || item.companyProfile?.name || 'Owner';
const ownerEmail = (item: IntakeSubmission) => item.ownerEmail || item.contactInfo?.email || item.companyProfile?.email || '—';
const propertyCount = (item: IntakeSubmission) => item.properties?.length || item.portfolioSummary?.totalProperties || 0;
const annualValue = (item: IntakeSubmission) => Number(item.annualContractValue || item.payment?.annualValue || item.portfolioSummary?.estimatedACV || 0);
const mobilisation = (item: IntakeSubmission) => Number(item.mobilizationAmount || item.payment?.amount || Math.round(annualValue(item) * 0.15));
const localDateTime = (date: Date) => {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 16);
};
const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const value = String(reader.result || '');
        resolve(value.includes(',') ? value.split(',').pop() || '' : value);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read visit photo.'));
    reader.readAsDataURL(file);
});

const stageFor = (item: IntakeSubmission): Stage => {
    const activation = upper(item.activationState);
    const status = upper(item.status);
    const inspection = upper(item.inspectionStatus);
    const payment = upper(item.paymentStatus || item.payment?.state);
    if (activation === 'ACTIVE' || status.includes('ACTIVE') || status.includes('CONVERTED')) return { key: 'ACTIVE', label: 'ACTIVE OWNER', color: 'success' };
    if (inspection === 'COMPLETED' || payment.includes('PENDING_ADMIN_PAYMENT') || payment.includes('PENDING_ADMIN_APPROVAL')) return { key: 'PAYMENT', label: '15% CASH / CHEQUE', color: 'warning' };
    if (inspection.includes('READY') || (item.inspectionIds?.length || item.inspectionId)) return { key: 'VISITS', label: 'VISIT EVIDENCE', color: 'info' };
    return { key: 'REVIEW', label: 'ADMIN REVIEW', color: 'default' };
};

export const IntakeVaultPage: React.FC = () => {
    const navigate = useNavigate();
    const [submissions, setSubmissions] = React.useState<IntakeSubmission[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [busyId, setBusyId] = React.useState('');
    const [details, setDetails] = React.useState<IntakeSubmission | null>(null);
    const [visitTarget, setVisitTarget] = React.useState<IntakeSubmission | null>(null);
    const [readiness, setReadiness] = React.useState<Readiness | null>(null);
    const [evidenceTarget, setEvidenceTarget] = React.useState<InspectionRow | null>(null);
    const [arrivalLat, setArrivalLat] = React.useState('');
    const [arrivalLng, setArrivalLng] = React.useState('');
    const [startedAt, setStartedAt] = React.useState(localDateTime(new Date(Date.now() - 15 * 60_000)));
    const [completedAt, setCompletedAt] = React.useState(localDateTime(new Date()));
    const [findings, setFindings] = React.useState('');
    const [photo, setPhoto] = React.useState<File | null>(null);
    const [checklist, setChecklist] = React.useState({
        accessVerified: false,
        exteriorReviewed: false,
        utilitiesReviewed: false,
        safetyReviewed: false,
        occupancyConfirmed: false,
    });

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
        await httpsCallable(functions, 'adminLinkOwnerPropertyInspection')({ intakeId: item.id, inspectionIds: created.map((inspection) => inspection.inspectionId) });
        setNotice(`${created.length} property visit${created.length === 1 ? '' : 's'} created. Payment remains blocked until every visit has verified evidence.`);
        await openVisitWizard(item);
    });

    const loadReadiness = async (item: IntakeSubmission) => {
        const result = await httpsCallable(functions, 'adminGetOwnerPortfolioInspectionReadiness')({ intakeId: item.id });
        setReadiness(result.data as Readiness);
    };

    const openVisitWizard = async (item: IntakeSubmission) => {
        setVisitTarget(item);
        setReadiness(null);
        setError('');
        try { await loadReadiness(item); }
        catch (loadError: any) { setError(loadError?.details || loadError?.message || 'Unable to load visit readiness.'); }
    };

    const beginEvidence = (inspection: InspectionRow) => {
        setEvidenceTarget(inspection);
        setArrivalLat(Number.isFinite(inspection.location.lat) ? String(inspection.location.lat) : '');
        setArrivalLng(Number.isFinite(inspection.location.lng) ? String(inspection.location.lng) : '');
        setStartedAt(localDateTime(new Date(Date.now() - 15 * 60_000)));
        setCompletedAt(localDateTime(new Date()));
        setFindings('');
        setPhoto(null);
        setChecklist({ accessVerified: false, exteriorReviewed: false, utilitiesReviewed: false, safetyReviewed: false, occupancyConfirmed: false });
    };

    const useCurrentGps = () => {
        if (!navigator.geolocation) { setError('This device does not support GPS.'); return; }
        navigator.geolocation.getCurrentPosition((position) => {
            setArrivalLat(String(position.coords.latitude));
            setArrivalLng(String(position.coords.longitude));
            setNotice(`Current device GPS captured with approximately ${Math.round(position.coords.accuracy)} m accuracy.`);
        }, (gpsError) => setError(gpsError.message || 'Unable to capture current GPS.'), { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
    };

    const saveEvidence = async () => {
        if (!visitTarget || !evidenceTarget) return;
        if (!photo) { setError('Attach one current property visit photo.'); return; }
        if (photo.size > 6 * 1024 * 1024) { setError('Visit photo exceeds the secure 6 MB limit.'); return; }
        if (findings.trim().length < 8) { setError('Record clear inspection findings.'); return; }
        if (Object.values(checklist).some((value) => value !== true)) { setError('Complete every required inspection checklist item.'); return; }
        setBusyId(visitTarget.id);
        setError('');
        try {
            await httpsCallable(functions, 'adminRecordOwnerPortfolioVisitEvidence')({
                intakeId: visitTarget.id,
                inspectionId: evidenceTarget.inspectionId,
                arrivalLat: Number(arrivalLat),
                arrivalLng: Number(arrivalLng),
                startedAtMs: new Date(startedAt).getTime(),
                completedAtMs: new Date(completedAt).getTime(),
                findings: findings.trim(),
                checklist,
                filename: photo.name.replace(/[^A-Za-z0-9._-]/g, '_'),
                contentType: photo.type || 'image/jpeg',
                encodedPhoto: await fileToBase64(photo),
            });
            setEvidenceTarget(null);
            setNotice(`${evidenceTarget.propertyName} evidence verified and saved.`);
            await loadReadiness(visitTarget);
        } catch (saveError: any) {
            setError(saveError?.details || saveError?.message || 'Visit evidence failed.');
        } finally { setBusyId(''); }
    };

    const completePortfolio = async () => {
        if (!visitTarget || !readiness?.allEvidenceVerified) return;
        await runAction(visitTarget, async () => {
            await httpsCallable(functions, 'adminCompleteOwnerPortfolioInspections')({ intakeId: visitTarget.id });
            setNotice(`All ${readiness.verifiedCount} visits verified. The exact AED ${money(mobilisation(visitTarget))} Cash/Cheque payment is now due.`);
            setVisitTarget(null);
            setReadiness(null);
        });
    };

    const openDocument = async (item: IntakeSubmission, docType: string) => {
        setError('');
        try {
            const response = await httpsCallable(functions, 'adminCreateOwnerDocumentAccessUrl')({ intakeId: item.id, docType });
            const url = String((response.data as any)?.url || '');
            if (!url) throw new Error('Short-lived document access URL was not returned.');
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (documentError: any) { setError(documentError?.details || documentError?.message || 'Unable to open protected document.'); }
    };

    const messageOwner = (item: IntakeSubmission) => runAction(item, async () => {
        const message = window.prompt('Message to the Owner:', 'BIN GROUP is reviewing your five-page application and will contact you to arrange the evidence-backed property visit.');
        if (!message?.trim()) return;
        await httpsCallable(functions, 'adminSendOwnerOnboardingMessage')({ intakeId: item.id, subject: 'BIN GROUP property application update', message: message.trim() });
        setNotice('Owner update queued through the protected Admin messaging workflow.');
    });

    const actionButton = (item: IntakeSubmission) => {
        const stage = stageFor(item);
        const busy = busyId === item.id;
        if (stage.key === 'ACTIVE') return <Chip label="APPROVED & ACTIVE" color="success" variant="outlined" />;
        if (stage.key === 'PAYMENT') return <Button size="small" variant="contained" startIcon={<WalletCards size={15} />} onClick={() => navigate(`/payments?paymentId=${encodeURIComponent(item.payment?.paymentId || item.id)}`)} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>VERIFY CASH / CHEQUE</Button>;
        if (stage.key === 'VISITS') return <Button size="small" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : <Camera size={15} />} onClick={() => void openVisitWizard(item)} sx={{ bgcolor: '#2563EB', fontWeight: 950 }}>VISIT EVIDENCE</Button>;
        return <Button size="small" variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={14} /> : <Route size={15} />} onClick={() => void createVisits(item)} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>CREATE VISITS</Button>;
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, minHeight: '100%' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={2} sx={{ mb: 3 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: GOLD, fontWeight: 950, letterSpacing: 2 }}>OWNER ACQUISITION</Typography>
                    <Typography variant="h4" fontWeight={950} color="#FFF">Five-Page Applications & Verified Visits</Typography>
                    <Typography color="rgba(255,255,255,0.55)" sx={{ mt: 0.5 }}>Create visits → capture GPS/checklist/photo/findings → request exact 15% Cash/Cheque → MFA approval.</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip icon={<ShieldCheck size={15} />} label={`${submissions.filter((item) => item.workflowVersion === FIVE_PAGE_WORKFLOW).length} protected applications`} color="success" variant="outlined" />
                    <Chip icon={<CalendarCheck size={15} />} label={`${submissions.filter((item) => stageFor(item).key === 'VISITS').length} evidence pending`} color="info" variant="outlined" />
                </Stack>
            </Stack>

            <Alert severity="info" icon={<ClipboardCheck size={20} />} sx={{ mb: 3 }}>
                Payment is impossible during a visit. Every property requires current GPS within 750 m, a complete checklist, visit timestamps, written findings and an immutable photo before the 15% becomes due.
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
                                <TableCell><Typography color="#FFF" fontWeight={900}>AED {money(annualValue(item))}</Typography><Typography variant="caption" color={GOLD}>Exact 15%: AED {money(mobilisation(item))}</Typography></TableCell>
                                <TableCell><Chip label={stage.label} color={stage.color} size="small" variant={stage.key === 'ACTIVE' ? 'filled' : 'outlined'} sx={{ fontWeight: 900 }} /><Typography variant="caption" display="block" color="rgba(255,255,255,0.4)" sx={{ mt: 0.75 }}>{item.inspectionEvidenceVerifiedCount || 0}/{propertyCount(item)} evidence verified</Typography></TableCell>
                                <TableCell align="right"><Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap><IconButton onClick={() => setDetails(item)} sx={{ color: '#FFF' }}><Eye size={18} /></IconButton><IconButton onClick={() => void messageOwner(item)} disabled={busyId === item.id} sx={{ color: GOLD }}><Mail size={18} /></IconButton>{actionButton(item)}</Stack></TableCell>
                            </TableRow>;
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={Boolean(details)} onClose={() => setDetails(null)} fullWidth maxWidth="md">
                <DialogTitle>Protected Owner application</DialogTitle>
                <DialogContent>
                    {details && <Stack spacing={2} sx={{ pt: 1 }}>
                        <Typography><b>Owner:</b> {ownerName(details)} · {ownerEmail(details)}</Typography>
                        <Typography><b>Application:</b> {details.id}</Typography>
                        <Typography><b>Portfolio:</b> {propertyCount(details)} properties · AED {money(annualValue(details))} annual · AED {money(mobilisation(details))} exact 15%</Typography>
                        <Alert severity="info">Documents never expose permanent Firebase download tokens. Each Open action creates a short-lived Admin-only signed URL.</Alert>
                        <Grid container spacing={1.5}>{Object.keys(details.documentEvidence || {}).map((docType) => <Grid item xs={12} sm={6} key={docType}><Button fullWidth variant="outlined" startIcon={<FileText size={16} />} onClick={() => void openDocument(details, docType)}>Open {docType}</Button></Grid>)}</Grid>
                    </Stack>}
                </DialogContent>
                <DialogActions><Button onClick={() => setDetails(null)}>Close</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(visitTarget)} onClose={() => !busyId && setVisitTarget(null)} fullWidth maxWidth="md">
                <DialogTitle>Verified property visit evidence</DialogTitle>
                <DialogContent>
                    {!readiness ? <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box> : <Stack spacing={2} sx={{ pt: 1 }}>
                        <Alert severity={readiness.allEvidenceVerified ? 'success' : 'warning'}>{readiness.verifiedCount}/{readiness.expectedInspectionCount} visits contain complete verified evidence.</Alert>
                        {readiness.inspections.map((inspection) => <Paper key={inspection.inspectionId} variant="outlined" sx={{ p: 2 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={2}>
                                <Box><Typography fontWeight={900}>{inspection.propertyName}</Typography><Typography variant="caption">{inspection.propertyId} · {inspection.location.address || `${inspection.location.lat}, ${inspection.location.lng}`}</Typography>{inspection.evidenceVerified && <Typography variant="caption" color="success.main" display="block">GPS distance {Math.round(Number(inspection.arrivalDistanceMetres || 0))} m · {inspection.photoCount || 1} photo · evidence verified</Typography>}</Box>
                                <Stack direction="row" spacing={1}><Button size="small" variant="outlined" startIcon={<MapPinned size={14} />} onClick={() => window.open(inspection.location.directionsUrl || `https://www.google.com/maps/dir/?api=1&destination=${inspection.location.lat},${inspection.location.lng}`, '_blank', 'noopener,noreferrer')}>Directions</Button><Button size="small" variant="contained" color={inspection.evidenceVerified ? 'success' : 'primary'} startIcon={inspection.evidenceVerified ? <CheckCircle2 size={14} /> : <Camera size={14} />} onClick={() => beginEvidence(inspection)}>{inspection.evidenceVerified ? 'Replace evidence' : 'Record evidence'}</Button></Stack>
                            </Stack>
                        </Paper>)}
                    </Stack>}
                </DialogContent>
                <DialogActions><Button onClick={() => setVisitTarget(null)}>Close</Button><Button variant="contained" disabled={!readiness?.allEvidenceVerified || Boolean(busyId)} onClick={() => void completePortfolio()} sx={{ bgcolor: GOLD, color: '#000', fontWeight: 950 }}>{busyId ? <CircularProgress size={20} /> : 'Complete verified visits & request 15%'}</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(evidenceTarget)} onClose={() => !busyId && setEvidenceTarget(null)} fullWidth maxWidth="md">
                <DialogTitle>Record genuine visit evidence · {evidenceTarget?.propertyName}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Alert severity="info">Use the Admin device at the property. GPS must be within 750 m of the submitted location. A current property photo and all checklist items are mandatory.</Alert>
                        <Button variant="outlined" startIcon={<LocateFixed size={17} />} onClick={useCurrentGps}>Use current device GPS</Button>
                        <Grid container spacing={2}><Grid item xs={12} sm={6}><TextField fullWidth label="Arrival latitude" value={arrivalLat} onChange={(event) => setArrivalLat(event.target.value)} /></Grid><Grid item xs={12} sm={6}><TextField fullWidth label="Arrival longitude" value={arrivalLng} onChange={(event) => setArrivalLng(event.target.value)} /></Grid><Grid item xs={12} sm={6}><TextField fullWidth type="datetime-local" label="Visit started" InputLabelProps={{ shrink: true }} value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></Grid><Grid item xs={12} sm={6}><TextField fullWidth type="datetime-local" label="Visit completed" InputLabelProps={{ shrink: true }} value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} /></Grid></Grid>
                        <Paper variant="outlined" sx={{ p: 2 }}><Typography fontWeight={900} gutterBottom>Required checklist</Typography>{Object.entries({ accessVerified: 'Property access verified', exteriorReviewed: 'Exterior and common areas reviewed', utilitiesReviewed: 'Utilities and major systems reviewed', safetyReviewed: 'Safety and compliance risks reviewed', occupancyConfirmed: 'Occupancy and use confirmed' }).map(([key, label]) => <FormControlLabel key={key} control={<Checkbox checked={(checklist as any)[key]} onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))} />} label={label} />)}</Paper>
                        <TextField fullWidth multiline minRows={4} label="Inspection findings and recommended actions" value={findings} onChange={(event) => setFindings(event.target.value)} />
                        <Button component="label" variant="outlined" startIcon={<Camera size={17} />}>{photo ? photo.name : 'Attach current property photo'}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} /></Button>
                    </Stack>
                </DialogContent>
                <DialogActions><Button onClick={() => setEvidenceTarget(null)}>Cancel</Button><Button variant="contained" disabled={Boolean(busyId)} onClick={() => void saveEvidence()}>{busyId ? <CircularProgress size={20} /> : 'Verify and save evidence'}</Button></DialogActions>
            </Dialog>
        </Box>
    );
};

export default IntakeVaultPage;
