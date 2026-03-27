// admin-panel/src/pages/owners/OwnerDetailsPage.tsx
import React, { useState } from 'react';
import {
    Container,
    Typography,
    Box,
    Paper,
    Grid,
    Button,
    Chip,
    Divider,
    Alert,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import GavelIcon from '@mui/icons-material/Gavel';
import FilePresentIcon from '@mui/icons-material/FilePresent';
import ROIReportModal from '../../components/ROIReportModal';
import DigitalTwinTab from '../../components/DigitalTwinTab';

export default function OwnerDetailsPage() {
    const [isTerminated, setIsTerminated] = useState(false);

    const handleTerminate = () => {
        if (window.confirm("CRITICAL ACTION: Terminating this owner will permanently revoke portal access and lock all Asset DNA to BIN Group. Proceed?")) {
            setIsTerminated(true);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="bold">Owner Profile: Al-Mansoori Properties</Typography>
                <Chip
                    label={isTerminated ? "TERMINATED / LOCKED" : "ACTIVE ACCOUNT"}
                    color={isTerminated ? "error" : "success"}
                />
            </Box>

            {isTerminated && (
                <Alert severity="error" sx={{ mb: 4 }} icon={<LockIcon />}>
                    DATA SOVEREIGNTY LOCK ACTIVE: Portal access for OWNER_045 has been revoked.
                    Historical Asset DNA remains property of BIN GROUP.
                </Alert>
            )}

            <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Typography variant="h6" gutterBottom>Asset Overview</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Typography variant="body1">Total Units: 42</Typography>
                        <Typography variant="body1">Portfolio Value: AED 142.5M</Typography>
                        <Typography variant="body1" sx={{ mt: 2, fontWeight: 'bold' }}>Assets Tagged: 100% (Asset DNA Active)</Typography>
                    </Paper>

                    {/* ── LAYER 4: 30-Day Trial ROI Report ── */}
                    <Paper sx={{ p: 3, mb: 3, border: '1px solid #7c3aed', bgcolor: '#faf5ff' }}>
                        <Typography variant="h6" sx={{ color: '#7c3aed', fontWeight: 'bold' }} gutterBottom>
                            Client Performance Report
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                            Generate a printable 30-day SLA &amp; ROI summary for this client's trial period.
                            Use it to close the contract or present during renewal meetings.
                        </Typography>
                        <ROIReportModal
                            propertyId="OWNER_045"
                            propertyName="Al-Mansoori Properties"
                        />
                    </Paper>

                    {/* Task 5: Document Runner (Ejari Zip) */}
                    <Paper sx={{ p: 3, mb: 3, border: '1px solid #3b82f6', bgcolor: '#eff6ff' }}>
                        <Typography variant="h6" color="primary" gutterBottom>Ejari Integration (v1.0)</Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                            Document Runner: Auto-package Tenant EID, Title Deed, and Contract into a RERA-compliant .zip for Dubai REST uploading.
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => alert("Bundling EID, Title Deed, and Lease...\n\nSuccessfully downloaded: Al-Mansoori_Ejari_Package.zip")}
                        >
                            Generate Ejari Package (.zip)
                        </Button>
                    </Paper>

                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>Legal & Compliance</Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                            <Button startIcon={<FilePresentIcon />} variant="outlined">Management Agreement</Button>
                            <Button startIcon={<GavelIcon />} variant="outlined">UAEDDS Authorization</Button>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, border: '1px solid #fee2e2' }}>
                        <Typography variant="h6" color="error" gutterBottom>Account Security</Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                            Revoking access will trigger the Data Sovereignty protocol (Blueprint Section 3.2).
                        </Typography>
                        <Button
                            variant="contained"
                            color="error"
                            fullWidth
                            disabled={isTerminated}
                            onClick={handleTerminate}
                        >
                            Terminate & Lock Data
                        </Button>
                    </Paper>
                </Grid>
            </Grid>
            <Box sx={{ mt: 5 }}>
                <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>🔩 Digital Twin — Asset Registry</Typography>
                <DigitalTwinTab propertyId="prop_almansoori_01" readOnly={false} />
            </Box>
        </Container>
    );
}
