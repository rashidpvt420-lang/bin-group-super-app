// Authenticated check behind the employee ID card QR (?verifyCard=card_...). The QR carries only a
// random card id; the server (verifyEmployeeCard, HR / Founder with MFA) returns the card status.
import React, { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { functions, httpsCallable } from '../../lib/firebase';

export const EMPLOYEE_CARD_ID_PATTERN = /^card_[a-f0-9]{32}$/;

type Result = {
    cardId: string;
    valid: boolean;
    status: string;
    displayName?: string | null;
    roleLabel?: { en: string; ar: string };
    department?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
};

export default function EmployeeCardVerifyDialog({ cardId, onClose }: { cardId: string; onClose: () => void }) {
    const [result, setResult] = useState<Result | null>(null);
    const [error, setError] = useState('');
    const open = Boolean(cardId);

    useEffect(() => {
        if (!cardId) return;
        setResult(null);
        setError('');
        if (!EMPLOYEE_CARD_ID_PATTERN.test(cardId)) {
            setError('This QR code is not a BIN GROUP employee card.');
            return;
        }
        httpsCallable(functions, 'verifyEmployeeCard')({ cardId })
            .then((response: any) => setResult(response.data as Result))
            .catch((err: any) => setError(String(err?.message || 'Card could not be verified.').replace(/^FirebaseError:\s*/i, '')));
    }, [cardId]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="employee-card-verify-dialog">
            <DialogTitle>Employee card check — التحقق من بطاقة الموظف</DialogTitle>
            <DialogContent>
                {!result && !error && <Stack alignItems="center" sx={{ p: 3 }}><CircularProgress /></Stack>}
                {error && <Alert severity="error">{error}</Alert>}
                {result && (
                    <Stack spacing={1}>
                        <Alert severity={result.valid ? 'success' : 'error'}>
                            {result.valid ? 'Valid BIN GROUP staff card — بطاقة موظف سارية' : `Not valid: ${result.status.replace(/_/g, ' ')} — غير سارية`}
                        </Alert>
                        {result.displayName && <Typography><b>Name:</b> {result.displayName}</Typography>}
                        {result.roleLabel && <Typography><b>Role:</b> {result.roleLabel.en} — {result.roleLabel.ar}</Typography>}
                        {result.department && <Typography><b>Department:</b> {result.department}</Typography>}
                        {result.issueDate && <Typography><b>Issued:</b> {result.issueDate} · <b>Expires:</b> {result.expiryDate}</Typography>}
                        <Typography variant="caption" sx={{ opacity: .6 }}>{result.cardId}</Typography>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions><Button onClick={onClose}>Close — إغلاق</Button></DialogActions>
        </Dialog>
    );
}
