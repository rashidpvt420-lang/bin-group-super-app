import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, limit, onSnapshot, query, where } from '../lib/firebase';

type PaidDesign = { id: string; propertyName: string; paymentVerified: boolean; lockedOptionLabel: string };
type ReviewDesign = PaidDesign & { status: string };
type BriefSection = { category?: string; items?: string[] };
type ExecutionBriefView = {
    requestId?: string;
    status?: string;
    chosenImageUrl?: string;
    referenceImageUrl?: string;
    executionBrief?: {
        lockedOptionLabel?: string;
        lightingNotes?: string;
        followThePicture?: string;
        incompleteScope?: Array<{ label?: string }>;
        sections?: BriefSection[];
    };
};

export default function DesignHandoffQueue() {
    const [designs, setDesigns] = useState<PaidDesign[]>([]);
    const [inReview, setInReview] = useState<ReviewDesign[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [brief, setBrief] = useState<ExecutionBriefView | null>(null);
    const [briefId, setBriefId] = useState('');
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [reasons, setReasons] = useState<Record<string, string>>({});

    useEffect(() => onSnapshot(
        query(collection(db, 'design_requests'), where('status', '==', 'PAID'), limit(50)),
        (snapshot) => {
            setDesigns(snapshot.docs.map((document) => ({
                id: document.id,
                propertyName: String(document.data().propertyName || 'Design request'),
                paymentVerified: document.data().paymentVerified === true,
                lockedOptionLabel: String(document.data().lockedChoice?.optionLabel || ''),
            })));
            setLoading(false);
        },
        (caught) => { setDesigns([]); setLoading(false); setError(caught.message || 'The design handoff queue could not be loaded.'); },
    ), []);

    useEffect(() => onSnapshot(
        query(collection(db, 'design_requests'), where('status', '==', 'ENGINEER_REVIEW'), limit(30)),
        (snapshot) => {
            setInReview(snapshot.docs.map((document) => ({
                id: document.id,
                status: 'ENGINEER_REVIEW',
                propertyName: String(document.data().propertyName || 'Design request'),
                paymentVerified: document.data().paymentVerified === true,
                lockedOptionLabel: String(document.data().lockedChoice?.optionLabel || ''),
            })));
        },
        () => setInReview([]),
    ), []);

    const handoff = async (design: PaidDesign) => {
        setBusyId(design.id);
        setError('');
        setNotice('');
        try {
            const submit = httpsCallable(functions, 'adminHandoffDesignRequest');
            await submit({ designRequestId: design.id });
            setNotice(`${design.propertyName} entered engineer scope review. Work has not been started.`);
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : 'Handoff failed. Payment evidence, a locked design, and an active Admin MFA session are required.');
        } finally { setBusyId(null); }
    };

    const openBrief = async (designId: string) => {
        setBusyId(designId);
        setError('');
        setBrief(null);
        setBriefId(designId);
        try {
            const load = httpsCallable(functions, 'getDesignExecutionBrief');
            const result = await load({ designRequestId: designId });
            setBrief((result.data || null) as ExecutionBriefView);
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : 'The execution brief could not be loaded.');
        } finally { setBusyId(null); }
    };

    const markReady = async (designId: string) => {
        setBusyId(designId);
        setError('');
        setNotice('');
        try {
            const mark = httpsCallable(functions, 'markDesignExecutionReady');
            await mark({ designRequestId: designId, completionNote: notes[designId] || '' });
            setNotice('Tenant and owner were notified that the work is ready for handover. No payment was approved.');
            setNotes((current) => ({ ...current, [designId]: '' }));
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : 'The design could not be marked ready.');
        } finally { setBusyId(null); }
    };

    const authorizeRevision = async (designId: string) => {
        setBusyId(designId);
        setError('');
        setNotice('');
        try {
            const revise = httpsCallable(functions, 'authorizeDesignChoiceRevision');
            await revise({ designRequestId: designId, reason: reasons[designId] || '' });
            setNotice('The tenant and owner must lock the design again. The deposit was not refunded. Send the job to the engineer again after the new lock.');
            setReasons((current) => ({ ...current, [designId]: '' }));
        } catch (caught: unknown) {
            setError(caught instanceof Error ? caught.message : 'The design-choice revision could not be authorized.');
        } finally { setBusyId(null); }
    };

    const briefBody = brief?.executionBrief;

    return <Paper component="section" aria-label="Paid design handoff queue" sx={{ p: 3, mb: 4, bgcolor: 'rgba(255,255,255,0.04)', color: '#fff' }}>
        <Stack spacing={2}>
            <Typography variant="h6">Paid designs awaiting engineer handoff</Typography>
            <Typography variant="body2">Cash/Cheque receipt verification happens in Payment Approvals. Handoff is a separate MFA-protected review step, not permission to start work. A chosen design must be locked first. After handoff, changing the picture needs a design-choice revision, a new lock, and handoff again. That revision does not refund or re-approve the deposit.</Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {notice ? <Alert severity="success">{notice}</Alert> : null}
            {loading ? <CircularProgress aria-label="Loading paid designs" size={24} /> : null}
            {!loading && !error && designs.length === 0 ? <Typography>No paid designs are awaiting handoff.</Typography> : null}
            {designs.map((design) => <Stack key={design.id} direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                <Stack>
                    <Typography>{design.propertyName}</Typography>
                    <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{design.id}</Typography>
                    <Typography variant="caption">{design.lockedOptionLabel ? `Locked design: ${design.lockedOptionLabel}` : 'Chosen design not locked'}</Typography>
                </Stack>
                <Button variant="outlined" disabled={busyId !== null || !design.paymentVerified || !design.lockedOptionLabel} onClick={() => void handoff(design)}>
                    {busyId === design.id ? 'Submitting…' : !design.paymentVerified ? 'Receipt verification required' : design.lockedOptionLabel ? 'Send to engineer review' : 'Chosen design not locked'}
                </Button>
            </Stack>)}
            {designs.length === 50 ? <Alert severity="info">Showing the first 50 paid designs. The queue refreshes as handoffs complete.</Alert> : null}

            <Typography variant="h6" sx={{ pt: 2 }}>With the engineer</Typography>
            {inReview.length === 0 ? <Typography variant="body2">No designs are in engineer review.</Typography> : null}
            {inReview.map((design) => <Stack key={design.id} spacing={1.5} sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2 }}>
                <Typography>{design.propertyName}</Typography>
                <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{design.id} · {design.lockedOptionLabel || 'No locked design'}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button variant="outlined" disabled={busyId !== null} onClick={() => void openBrief(design.id)}>View layout brief</Button>
                </Stack>
                {briefId === design.id && briefBody ? <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 2 }}>
                    <Typography fontWeight={800}>{briefBody.followThePicture || briefBody.lockedOptionLabel}</Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>{briefBody.lightingNotes}</Typography>
                    {brief?.chosenImageUrl ? <Box component="img" alt={briefBody.lockedOptionLabel || 'Locked design'} src={brief.chosenImageUrl} sx={{ width: '100%', maxHeight: 320, objectFit: 'cover', mt: 2, borderRadius: 1 }} /> : <Alert severity="warning" sx={{ mt: 2 }}>The locked design image is not available.</Alert>}
                    {brief?.referenceImageUrl ? <Box component="img" alt="Before photo" src={brief.referenceImageUrl} sx={{ width: 180, height: 120, objectFit: 'cover', mt: 1, borderRadius: 1 }} /> : null}
                    {(briefBody.incompleteScope || []).length > 0 ? <Alert severity="warning" sx={{ mt: 2 }}>Incomplete scope. {(briefBody.incompleteScope || []).map((gap) => gap.label).filter(Boolean).join(' ')}</Alert> : null}
                    <Stack spacing={1} sx={{ mt: 2 }}>
                        {(briefBody.sections || []).map((section) => <Box key={section.category}>
                            <Typography fontWeight={800}>{section.category}</Typography>
                            {(section.items || []).map((item) => <Typography key={item} variant="body2">{item}</Typography>)}
                        </Box>)}
                    </Stack>
                </Box> : null}
                <TextField label="Completion note for tenant and owner" value={notes[design.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [design.id]: event.target.value.slice(0, 500) }))} size="small" fullWidth />
                <Button variant="contained" disabled={busyId !== null} onClick={() => void markReady(design.id)}>Mark work ready for handover</Button>
                <TextField label="Reason to unlock a different design" value={reasons[design.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [design.id]: event.target.value.slice(0, 500) }))} size="small" fullWidth />
                <Button variant="outlined" disabled={busyId !== null || (reasons[design.id] || '').trim().length < 8} onClick={() => void authorizeRevision(design.id)}>Authorize a new design choice</Button>
            </Stack>)}
        </Stack>
    </Paper>;
}
