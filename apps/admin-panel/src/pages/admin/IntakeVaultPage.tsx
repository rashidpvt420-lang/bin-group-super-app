import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Typography, 
    Paper, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    Chip, 
    IconButton, 
    Button,
    Drawer,
    Stack,
    Divider,
    Alert,
    CircularProgress,
    alpha,
    Grid,
    TextField
} from '@mui/material';
import { 
    Eye, 
    CheckCircle, 
    XCircle, 
    BrainCircuit, 
    Building2, 
    User,
    Calendar,
    ShieldCheck,
    Gem
} from 'lucide-react';
import { db, functions, httpsCallable } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { binThemeTokens } from '../../theme/adminTheme';

interface IntakeSubmission {
    id: string;
    userId?: string;
    status: string;
    source: string;
    createdAt: any;
    contactInfo?: {
        name: string;
        email: string;
        licenseNumber: string;
        phone?: string;
        contactPerson?: string;
    };
    companyProfile?: any;
    properties?: any[];
    propertyDetails?: any[];
    selectedPlan?: any;
    contractType?: string;
    selectedAddOns?: string[];
    addOns?: string[];
    proofDocuments?: Record<string, any>;
    ownerIdentityDocuments?: Record<string, any>;
    kycUrls?: Record<string, string>;
    payment?: {
        paymentId?: string;
        contractId?: string;
        method?: string;
        state?: string;
        amount?: number;
        currency?: string;
    };
    paymentStatus?: string;
    paymentState?: string;
    adminReviewState?: string;
    activationState?: string;
    portfolioSummary?: {
        totalUnits: number;
        recommendedTier: string;
    };
    aiAssessment?: {
        score: number;
        aiModel: string;
        riskLevel: string;
        valuationRange: {
            min: number;
            max: number;
            currency: string;
        };
        maintenanceForecast: Array<{
            item: string;
            value: number;
            period: string;
        }>;
        efficiencyRecommendations: string[];
    };
}

export const IntakeVaultPage: React.FC = () => {
    const [submissions, setSubmissions] = useState<IntakeSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIntake, setSelectedIntake] = useState<IntakeSubmission | null>(null);
    const [clarificationNote, setClarificationNote] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'intake_submissions'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as IntakeSubmission));
            setSubmissions(docs);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleApprove = async (intake: IntakeSubmission) => {
        try {
            const paymentId = intake.payment?.paymentId || (intake as any).paymentId || intake.id;
            if (!paymentId) throw new Error('A server-created payment transaction is required before activation.');
            const method = String(intake.payment?.method || (intake as any).paymentMethod || '').toUpperCase();
            const paymentReferenceId = method === 'STRIPE'
                ? undefined
                : window.prompt('Enter the verified provider, bank, cheque, or cash receipt reference. Activation fails closed without it.');
            if (method !== 'STRIPE' && !paymentReferenceId?.trim()) return;
            const approvePayment = httpsCallable(functions, 'adminApprovePayment');
            await approvePayment({ paymentId, paymentReferenceId: paymentReferenceId?.trim() || undefined });
            setSelectedIntake(null);
            alert("Payment evidence verified and the bound owner contract was activated.");
        } catch (err) {
            console.error("Conversion Protocol Fault:", err);
            alert("Activation failed closed. Verify the signed contract, owner binding, quote hash, and payment evidence.");
        }
    };

    const handleReject = async (intake: IntakeSubmission) => {
        if (!window.confirm("Initialize Rejection Protocol? This will archive the submission.")) return;
        const reason = window.prompt('Enter the audited rejection reason.');
        if (!reason?.trim()) return;
        try {
            const paymentId = intake.payment?.paymentId || (intake as any).paymentId || intake.id;
            const rejectPayment = httpsCallable(functions, 'adminRejectPayment');
            await rejectPayment({ paymentId, reason: reason.trim() });
            setSelectedIntake(null);
        } catch (err) {
            console.error('Canonical payment rejection failed:', err);
            alert('Rejection failed closed. Confirm that a bound payment transaction exists and is not already active.');
        }
    };

    const handleClarification = async (id: string) => {
        if (!clarificationNote.trim()) {
            alert("Add a clarification note before requesting more information.");
            return;
        }
        try {
            await updateDoc(doc(db, 'intake_submissions', id), {
                status: 'CLARIFICATION_REQUESTED',
                adminReviewState: 'CLARIFICATION_REQUESTED',
                clarificationNote,
                clarificationRequestedAt: serverTimestamp()
            });
            setClarificationNote('');
            setSelectedIntake(null);
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#020617' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 6, bgcolor: '#020617', minHeight: '100vh' }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 1, letterSpacing: -1 }}>
                        INTAKE VAULT
                    </Typography>
                    <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 1 }}>
                        SOVEREIGN QUEUE FOR INSTITUTIONAL ASSET SUBMISSIONS
                    </Typography>
                </Box>
                <Chip 
                    label="VAULT ENCRYPTED" 
                    icon={<ShieldCheck size={16} color={binThemeTokens.gold} />} 
                    sx={{ 
                        bgcolor: alpha(binThemeTokens.gold, 0.1), 
                        color: binThemeTokens.gold, 
                        fontWeight: 900, 
                        border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`,
                        px: 1 
                    }} 
                />
            </Box>

            <TableContainer component={Paper} sx={{ 
                borderRadius: 4, 
                bgcolor: binThemeTokens.graphite,
                border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                boxShadow: 'none'
            }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, py: 3 }}>SUBMISSION ID</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DATE</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ASSETS</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TIER</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>AI STATUS</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }} align="right">ACTIONS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {submissions.map((intake) => (
                            <TableRow key={intake.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{intake.id.substring(0, 8)}...</TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Calendar size={14} color="#64748b" />
                                        <Typography variant="body2">{intake.createdAt?.toDate().toLocaleDateString()}</Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={`${intake.properties?.length || 0} Assets`} 
                                        size="small" 
                                        variant="outlined"
                                        icon={<Building2 size={12} />}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="caption" fontWeight="900" sx={{ color: '#b59410' }}>
                                        {intake.portfolioSummary?.recommendedTier?.toUpperCase() || 'STANDARD'}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={intake.status} 
                                        size="small"
                                        color={intake.status === 'ANALYZED' ? 'info' : intake.status === 'APPROVED' ? 'success' : 'default'}
                                        sx={{ fontWeight: 900, fontSize: '0.65rem' }}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton 
                                        sx={{ color: binThemeTokens.gold, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1) } }} 
                                        onClick={() => setSelectedIntake(intake)}
                                    >
                                        <Eye size={20} />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* DETAIL DRAWER */}
            <Drawer
                anchor="right"
                open={!!selectedIntake}
                onClose={() => setSelectedIntake(null)}
                PaperProps={{ 
                    sx: { 
                        width: { xs: '100%', md: 600 }, 
                        p: 6, 
                        bgcolor: '#020617', 
                        borderLeft: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` 
                    } 
                }}
            >
                {selectedIntake && (
                    <Box>
                        <Typography variant="h4" fontWeight="900" sx={{ mb: 1, color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 2 }}>
                            INTAKE ANALYSIS <BrainCircuit size={32} />
                        </Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 2, display: 'block', mb: 3 }}>
                            PROTOCOL ID: {selectedIntake.id.toUpperCase()} | ORIGIN: {selectedIntake.source}
                        </Typography>

                        <Divider sx={{ mb: 4, borderColor: alpha(binThemeTokens.gold, 0.1) }} />

                        <Stack spacing={3}>
                            {selectedIntake.aiAssessment && (
                                <Alert
                                    severity="success"
                                    icon={<Gem size={20} />}
                                    sx={{
                                        bgcolor: alpha(binThemeTokens.gold, 0.05),
                                        color: binThemeTokens.textPrimary,
                                        border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`,
                                        '& .MuiAlert-icon': { color: binThemeTokens.gold }
                                    }}
                                >
                                    <Typography variant="subtitle2" fontWeight="900">BIN-GENESIS AI SCORE: {selectedIntake.aiAssessment.score}/100</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>HEURISTIC MODEL: {selectedIntake.aiAssessment.aiModel}</Typography>
                                </Alert>
                            )}

                                <Box>
                                    <Typography variant="overline" fontWeight="900" color="text.secondary">Portfolio Composition</Typography>
                                    <Grid container spacing={2} sx={{ mt: 1 }}>
                                        <Grid item xs={6}>
                                            <Paper sx={{ p: 2, bgcolor: '#f1f5f9', borderLeft: '4px solid #0f172a' }}>
                                                <Typography variant="caption" color="text.secondary">TOTAL UNITS</Typography>
                                                <Typography variant="h6" fontWeight="900">{selectedIntake.portfolioSummary?.totalUnits || 0}</Typography>
                                            </Paper>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Paper sx={{ p: 2, bgcolor: '#f1f5f9', borderLeft: '4px solid #C6A75E' }}>
                                                <Typography variant="caption" color="text.secondary">RISK PROFILE</Typography>
                                                <Typography variant="h6" fontWeight="900" sx={{ color: '#C6A75E' }}>{selectedIntake.aiAssessment?.riskLevel || selectedIntake.status}</Typography>
                                            </Paper>
                                        </Grid>
                                    </Grid>
                                </Box>

                                <Box>
                                    <Typography variant="overline" fontWeight="900" color="text.secondary">Institutional Valuation Range</Typography>
                                    <Paper sx={{ p: 2, bgcolor: alpha('#C6A75E', 0.05), border: '1px solid #C6A75E', display: 'flex', justifyContent: 'center', gap: 4, mt: 1 }}>
                                        <Box sx={{ textAlign: 'center' }}>
                                            <Typography variant="caption" color="text.secondary">MINIMUM AMC</Typography>
                                            <Typography variant="h5" fontWeight="900">
                                                {selectedIntake.aiAssessment?.valuationRange?.currency || 'AED'} {selectedIntake.aiAssessment?.valuationRange?.min?.toLocaleString() || '0'}
                                            </Typography>
                                        </Box>
                                        <Divider orientation="vertical" flexItem />
                                        <Box sx={{ textAlign: 'center' }}>
                                            <Typography variant="caption" color="text.secondary">MAXIMUM AMC</Typography>
                                            <Typography variant="h5" fontWeight="900">
                                                {selectedIntake.aiAssessment?.valuationRange?.currency || 'AED'} {selectedIntake.aiAssessment?.valuationRange?.max?.toLocaleString() || '0'}
                                            </Typography>
                                        </Box>
                                    </Paper>
                                </Box>

                                <Box>
                                    <Typography variant="overline" fontWeight="900" color="text.secondary">Maintenance Forecast</Typography>
                                    <Stack spacing={1} sx={{ mt: 1 }}>
                                        {selectedIntake.aiAssessment?.maintenanceForecast?.map((forecast, i) => (
                                            <Box key={i} sx={{ p: 1.5, bgcolor: '#fafafa', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px dashed #e2e8f0' }}>
                                                <Typography variant="body2" fontWeight="700">{forecast.item}</Typography>
                                                <Typography variant="body2" fontWeight="900" color="#0f172a">
                                                    AED {forecast.value?.toLocaleString()} / {forecast.period}
                                                </Typography>
                                            </Box>
                                        )) || <Typography variant="caption">No forecast data generated.</Typography>}
                                    </Stack>
                                </Box>

                                <Box>
                                    <Typography variant="overline" fontWeight="900" color="text.secondary">Efficiency Recommendations</Typography>
                                    <Stack spacing={1} sx={{ mt: 1 }}>
                                        {selectedIntake.aiAssessment?.efficiencyRecommendations?.map((rec, i) => (
                                            <Box key={i} sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #f1f5f9', borderRadius: 2, display: 'flex', gap: 2 }}>
                                                <CheckCircle size={16} color="#C6A75E" style={{ flexShrink: 0 }} />
                                                <Typography variant="body2">{rec}</Typography>
                                            </Box>
                                        )) || <Typography variant="caption">No recommendations available.</Typography>}
                                    </Stack>
                                </Box>

                                <Box sx={{ mt: 4, p: 3, border: '1px solid #e2e8f0', borderRadius: 4, bgcolor: '#f8fafc' }}>
                                    <Typography variant="subtitle2" fontWeight="900" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <User size={18} /> CONTACT INFORMATION
                                    </Typography>
                                    {selectedIntake.contactInfo?.email ? (
                                        <Stack spacing={1}>
                                            <Typography variant="body2"><b>Entity:</b> {selectedIntake.contactInfo.name}</Typography>
                                            <Typography variant="body2"><b>Email:</b> {selectedIntake.contactInfo.email}</Typography>
                                            <Typography variant="body2"><b>License:</b> {selectedIntake.contactInfo.licenseNumber}</Typography>
                                        </Stack>
                                    ) : (
                                        <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                            Guest submission — no contact profile linked yet.
                                        </Typography>
                                    )}
                                </Box>

                                <Box sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 4, bgcolor: '#f8fafc' }}>
                                    <Typography variant="subtitle2" fontWeight="900" gutterBottom>PROPERTY SUMMARY</Typography>
                                    <Stack spacing={1}>
                                        {(selectedIntake.properties || []).map((property, index) => (
                                            <Typography key={property.id || index} variant="body2">
                                                <b>{property.propertyType || property.subType || 'Property'}:</b> {property.address || property.area || 'No address'} | Units: {property.units || 1} | Emirate: {property.emirate || 'N/A'}
                                            </Typography>
                                        ))}
                                        {(selectedIntake.properties || []).length === 0 && <Typography variant="body2">No property payload attached.</Typography>}
                                    </Stack>
                                </Box>

                                <Box sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 4, bgcolor: '#f8fafc' }}>
                                    <Typography variant="subtitle2" fontWeight="900" gutterBottom>CONTRACT / ADD-ONS / PAYMENT</Typography>
                                    <Stack spacing={1}>
                                        <Typography variant="body2"><b>Contract:</b> {selectedIntake.selectedPlan?.name || selectedIntake.selectedPlan?.packageName || selectedIntake.contractType || 'N/A'}</Typography>
                                        <Typography variant="body2"><b>Add-ons:</b> {(selectedIntake.selectedAddOns || selectedIntake.addOns || []).join(', ') || 'None'}</Typography>
                                        <Typography variant="body2"><b>Payment:</b> {selectedIntake.paymentStatus || selectedIntake.paymentState || 'N/A'} | {selectedIntake.payment?.method || 'No method'} | AED {(selectedIntake.payment?.amount || 0).toLocaleString()}</Typography>
                                    </Stack>
                                </Box>

                                <Box sx={{ p: 3, border: '1px solid #e2e8f0', borderRadius: 4, bgcolor: '#f8fafc' }}>
                                    <Typography variant="subtitle2" fontWeight="900" gutterBottom>UPLOADED DOCUMENTS</Typography>
                                    <Stack spacing={1}>
                                        {selectedIntake.proofDocuments ? Object.entries(selectedIntake.proofDocuments).map(([key, docData]: [string, any]) => (
                                            <Button key={key} href={docData?.url} target="_blank" rel="noreferrer" variant="outlined" size="small" sx={{ justifyContent: 'space-between', textTransform: 'none' }}>
                                                {docData?.label || key} - {docData?.fileName || 'Open file'}
                                            </Button>
                                        )) : null}
                                        {selectedIntake.kycUrls && Object.entries(selectedIntake.kycUrls).map(([key, url]: [string, any]) => (
                                            <Button key={key} href={url} target="_blank" rel="noreferrer" variant="outlined" size="small" sx={{ justifyContent: 'space-between', textTransform: 'none' }}>
                                                KYC: {key.toUpperCase()}
                                            </Button>
                                        ))}
                                        {(!selectedIntake.proofDocuments && !selectedIntake.kycUrls) && <Typography variant="body2">No document URLs attached.</Typography>}
                                    </Stack>
                                </Box>

                                <TextField
                                    label="Clarification note"
                                    multiline
                                    minRows={3}
                                    value={clarificationNote}
                                    onChange={(e) => setClarificationNote(e.target.value)}
                                />

                                <Stack direction="row" spacing={2} sx={{ pt: 4 }}>
                                    <Button 
                                        fullWidth 
                                        variant="contained" 
                                        startIcon={<CheckCircle />}
                                        onClick={() => handleApprove(selectedIntake)}
                                        sx={{ 
                                            background: binThemeTokens.goldGradient, 
                                            color: binThemeTokens.black,
                                            fontWeight: 950, py: 2 
                                        }}
                                        disabled={selectedIntake.status === 'CONVERTED_TO_OWNER'}
                                    >
                                        {selectedIntake.status === 'CONVERTED_TO_OWNER' ? 'INTAKE COMPLETED' : 'CONVERT TO OWNER'}
                                    </Button>
                                    <Button 
                                        variant="outlined" 
                                        color="error"
                                        startIcon={<XCircle />}
                                        onClick={() => handleReject(selectedIntake)}
                                        sx={{ 
                                            fontWeight: 900, 
                                            borderColor: binThemeTokens.danger,
                                            color: binThemeTokens.danger
                                        }}
                                    >
                                        REJECT
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={() => handleClarification(selectedIntake.id)}
                                        sx={{ fontWeight: 900 }}
                                    >
                                        REQUEST CLARIFICATION
                                    </Button>
                                </Stack>
                            </Stack>
                    </Box>
                )}
            </Drawer>
        </Box>
    );
};

export default IntakeVaultPage;
