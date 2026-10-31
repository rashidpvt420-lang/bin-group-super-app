import React from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';

export type OwnerApplicationDecision = 'REQUEST_CHANGES' | 'REJECT';

const COPY: Record<OwnerApplicationDecision, { title: string; help: string; confirm: string }> = {
    REQUEST_CHANGES: {
        title: 'Request changes from the Owner',
        help: 'The Owner sees this reason and can correct and resubmit the application. The decision is recorded in the audit log.',
        confirm: 'REQUEST CHANGES',
    },
    REJECT: {
        title: 'Reject this application',
        help: 'Rejection is final for this application and is recorded in the audit log. The Owner sees the reason.',
        confirm: 'REJECT APPLICATION',
    },
};

export const MIN_DECISION_REASON_LENGTH = 8;

interface Props {
    open: boolean;
    intakeId: string | null;
    decision: OwnerApplicationDecision | null;
    onClose: () => void;
    onDone: (message: string) => void;
}

const OwnerApplicationDecisionDialog: React.FC<Props> = ({ open, intakeId, decision, onClose, onDone }) => {
    const [reason, setReason] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    React.useEffect(() => { if (open) { setReason(''); setError(''); } }, [open, decision]);
    if (!decision) return null;
    const copy = COPY[decision];
    const trimmed = reason.trim();
    const valid = trimmed.length >= MIN_DECISION_REASON_LENGTH;
    const submit = async () => {
        if (!intakeId || !valid || busy) return;
        setBusy(true); setError('');
        try {
            await httpsCallable(functions, 'adminDecideOwnerApplication')({ intakeId, decision, reason: trimmed });
            onDone(decision === 'REJECT' ? 'Application rejected and recorded.' : 'Changes requested. The Owner can now resubmit.');
        } catch (err: any) {
            setError(err?.message || 'The decision could not be recorded.');
        } finally { setBusy(false); }
    };
    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
            <DialogTitle fontWeight={950}>{copy.title}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ mb: 2 }}>{copy.help}</Typography>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <TextField
                    label="Reason shown to the Owner"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    multiline minRows={3} fullWidth autoFocus
                    inputProps={{ maxLength: 2000, 'aria-label': 'Decision reason' }}
                    helperText={valid ? ' ' : `At least ${MIN_DECISION_REASON_LENGTH} characters.`}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={busy}>Cancel</Button>
                <Button variant="contained" color={decision === 'REJECT' ? 'error' : 'warning'} disabled={!valid || busy} onClick={() => void submit()} startIcon={busy ? <CircularProgress size={14} /> : undefined}>{copy.confirm}</Button>
            </DialogActions>
        </Dialog>
    );
};

export default OwnerApplicationDecisionDialog;
