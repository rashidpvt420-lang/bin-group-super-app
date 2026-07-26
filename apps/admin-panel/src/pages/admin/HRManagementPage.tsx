import React from 'react';
import { Box, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Banknote, Users } from 'lucide-react';
import StaffAccessPage from './StaffAccessPage';

/**
 * Canonical HR entrypoint.
 *
 * Staff creation used to write a pending Firestore request containing a
 * provisional password without creating a Firebase Auth identity. The HR route
 * now exposes the server-authoritative Staff Access workflow directly. Payroll
 * remains available through its dedicated protected route.
 */
export default function HRManagementPage() {
    const navigate = useNavigate();

    return (
        <Box sx={{ minHeight: '100%', bgcolor: '#020617' }} data-testid="admin-staff-access-route">
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="flex-end"
                sx={{ px: 4, pt: 3 }}
            >
                <Button
                    variant="outlined"
                    startIcon={<Users size={17} />}
                    onClick={() => navigate('/ops/staff-directory')}
                    data-testid="admin-open-staff-directory"
                >
                    Staff Directory
                </Button>
                <Button
                    variant="outlined"
                    startIcon={<Banknote size={17} />}
                    onClick={() => navigate('/financials/payroll')}
                    data-testid="admin-open-payroll"
                >
                    Payroll Hub
                </Button>
            </Stack>
            <StaffAccessPage />
        </Box>
    );
}
