import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, limit, onSnapshot, query, where } from '../lib/firebase';

type PaidDesign = { id: string; propertyName: string; paymentVerified: boolean };

export default function DesignHandoffQueue() {
    const [designs, setDesigns] = useState<PaidDesign[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => onSnapshot(
        query(collection(db, 'design_requests'), where('status', '==', 'PAID'), limit(50)),
        (snapshot) => {
            setDesigns(snapshot.docs.map((document) => ({
                id: document.id,
                propertyName: String(document.data().propertyName || 'Design request'),
                paymentVerified: document.data().paymentVerified === true,
            })));
            setLoading(false);
        },
        (caught) => { setDesigns([]); setLoading(false); setError(caught.message || 'The design handoff queue could not be loaded.'); },
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
            setError(caught instanceof Error ? caught.message : 'Handoff failed. Payment evidence and an active Admin MFA session are required.');
        } finally { setBusyId(null); }
    };

    return <Paper component="section" aria-label="Paid design handoff queue" sx={{ p: 3, mb: 4, bgcolor: 'rgba(255,255,255,0.04)', color: '#fff' }}>
        <Stack spacing={2}>
            <Typography variant="h6">Paid designs awaiting engineer handoff</Typography>
            <Typography variant="body2">Cash/Cheque receipt verification happens in Payment Approvals. Handoff is a separate MFA-protected review step, not permission to start work.</Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {notice ? <Alert severity="success">{notice}</Alert> : null}
            {loading ? <CircularProgress aria-label="Loading paid designs" size={24} /> : null}
            {!loading && !error && designs.length === 0 ? <Typography>No paid designs are awaiting handoff.</Typography> : null}
            {designs.map((design) => <Stack key={design.id} direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                <Stack><Typography>{design.propertyName}</Typography><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{design.id}</Typography></Stack>
                <Button variant="outlined" disabled={busyId !== null || !design.paymentVerified} onClick={() => void handoff(design)}>
                    {busyId === design.id ? 'Submitting…' : design.paymentVerified ? 'Send to engineer review' : 'Receipt verification required'}
                </Button>
            </Stack>)}
            {designs.length === 50 ? <Alert severity="info">Showing the first 50 paid designs. The queue refreshes as handoffs complete.</Alert> : null}
        </Stack>
    </Paper>;
}
