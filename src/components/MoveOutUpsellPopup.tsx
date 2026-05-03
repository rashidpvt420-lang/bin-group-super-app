// owner-app/src/components/MoveOutUpsellPopup.tsx
import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Button,
    Box,
    Divider,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

interface MoveOutUpsellPopupProps {
    open: boolean;
    unitId: string;
    onClose: () => void;
    onApprove: (unitId: string) => void;
}

export default function MoveOutUpsellPopup({ open, unitId, onClose, onApprove }: MoveOutUpsellPopupProps) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ bgcolor: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon />
                <Typography variant="h6" component="span">Unit {unitId} is becoming vacant</Typography>
            </DialogTitle>
            <DialogContent sx={{ pt: 3 }}>
                <Typography variant="h5" fontWeight="800" gutterBottom>
                    Increase rental value by 15%?
                </Typography>
                <Typography variant="body1" color="textSecondary" paragraph>
                    Tenants are 3x more likely to sign a premium lease if the unit is "Fresh Start" certified.
                    Schedule our high-yield renovation package now to ensure 100% occupancy for the next cycle.
                </Typography>

                <Box sx={{ p: 2, bgcolor: '#f1f5f9', borderRadius: 2, mb: 3 }}>
                    <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                        "Fresh Start" Package Includes:
                    </Typography>
                    <Box component="ul" sx={{ pl: 2, m: 0 }}>
                        <Typography component="li" variant="body2">Professional Anti-Bacterial Painting (Off-White)</Typography>
                        <Typography component="li" variant="body2">Industrial Deep Cleaning & Sanitization</Typography>
                        <Typography component="li" variant="body2">AC Duct Sanitization & Filter Service</Typography>
                        <Typography component="li" variant="body2">Digital Move-In Ready Inspection Report</Typography>
                    </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">Package Price:</Typography>
                    <Typography variant="h4" fontWeight="900" color="primary">AED 1,400</Typography>
                </Box>
                <Typography variant="caption" color="textSecondary" align="right" display="block">
                    (Fixed Institutional Rate)
                </Typography>
            </DialogContent>
            <DialogActions sx={{ p: 3, gap: 2 }}>
                <Button onClick={onClose} variant="outlined" color="inherit" fullWidth>
                    No, leave as is
                </Button>
                <Button
                    onClick={() => onApprove(unitId)}
                    variant="contained"
                    color="success"
                    fullWidth
                    startIcon={<CheckCircleOutlineIcon />}
                    sx={{ py: 1.5, fontWeight: 'bold' }}
                >
                    Approve & Deduct from Rent
                </Button>
            </DialogActions>
        </Dialog>
    );
}
