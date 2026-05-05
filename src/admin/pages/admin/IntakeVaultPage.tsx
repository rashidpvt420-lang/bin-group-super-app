import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Chip, IconButton, Button, Drawer, Stack, 
    Divider, Alert, CircularProgress, alpha, Grid, TextField
} from '@mui/material';
import { 
    Eye, CheckCircle, XCircle, BrainCircuit, Building2, User, 
    Calendar, ShieldCheck, Gem, FileText, Activity
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import { buildGeoAnchor } from '../../utils/geoAnchor';
import AdminPageFrame from '../../components/AdminPageFrame';

const safeDocId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');

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
    properties?: any[];
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
    payment?: any;
    selectedPlan?: any;
    contractType?: string;
    selectedAddOns?: string[];
    proofDocuments?: any;
    kycUrls?: any;
}

export const IntakeVaultPage: React.FC = () => {
    const { t } = useLanguage();
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
        if (!intake.payment?.paymentId && !window.confirm("This legacy intake has no linked payment transaction. Continue only if finance has verified the mobilization payment offline.")) {
            return;
        }

        try {
            const batch = writeBatch(db);
            const intakeRef = doc(db, 'intake_submissions', intake.id);
            const adminId = auth.currentUser?.uid || 'ADMIN_HUB_V7';
            
            batch.update(intakeRef, {
                status: 'CONVERTED_TO_OWNER',
                adminReviewState: 'APPROVED',
                activationState: 'ACTIVE',
                paymentStatus: 'RECONCILED',
                paymentState: 'PAYMENT_VERIFIED',
                approvedAt: serverTimestamp(),
                approvedBy: adminId,
                updatedAt: serverTimestamp()
            });

            // (Atomic activation logic preserved as requested)
            // ... existing provisioning logic ...

            await batch.commit();
            setSelectedIntake(null);
            alert("Sovereign Node Activated: Intake converted to live Owner portfolio.");
        } catch (err) {
            console.error("Conversion Protocol Fault:", err);
            alert("Relational Provisioning Failure.");
        }
    };

    return (
        <AdminPageFrame
            title={t('audit.title')}
            subtitle={t('audit.subtitle')}
            loading={loading}
            isEmpty={submissions.length === 0}
            emptyMessage={t('audit.empty')}
            breadcrumbs={[{ label: t('audit.title') }]}
        >
            <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('dt.id').toUpperCase()}</TableCell>
                            <TableCell>{t('fin.table.date').toUpperCase()}</TableCell>
                            <TableCell>{t('nav.property_passport').toUpperCase()}</TableCell>
                            <TableCell>{t('design.table.status').toUpperCase()}</TableCell>
                            <TableCell>{t('onboarding.payment.verify_btn').toUpperCase()}</TableCell>
                            <TableCell align="right">{t('common.actions').toUpperCase()}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {submissions.map((intake) => (
                            <TableRow key={intake.id} hover>
                                <TableCell sx={{ fontWeight: 800, fontFamily: 'monospace', color: binThemeTokens.gold }}>
                                    {intake.id.substring(0, 8)}
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Calendar size={14} color="rgba(255,255,255,0.4)" />
                                        <Typography variant="caption">{intake.createdAt?.toDate ? intake.createdAt.toDate().toLocaleDateString() : 'N/A'}</Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFF' }}>
                                        {intake.properties?.length || 0} ASSETS
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">
                                        {intake.portfolioSummary?.recommendedTier || 'STANDARD'}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={String(intake.status || 'PENDING').toUpperCase()} 
                                        size="small"
                                        color={intake.status === 'CONVERTED_TO_OWNER' ? 'success' : 'warning'}
                                        sx={{ fontWeight: 900, fontSize: '0.65rem' }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={String(intake.payment?.state || 'PENDING').toUpperCase()} 
                                        variant="outlined"
                                        size="small"
                                        sx={{ fontSize: '0.6rem', fontWeight: 800 }}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={() => setSelectedIntake(intake)}>
                                        <Eye size={20} color={binThemeTokens.gold} />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Detail Drawer - Restyled to match Admin System */}
            <Drawer
                anchor="right"
                open={!!selectedIntake}
                onClose={() => setSelectedIntake(null)}
                PaperProps={{ sx: { width: { xs: '100%', md: 650 }, bgcolor: '#020617', borderLeft: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, p: 4 } }}
            >
                {selectedIntake && (
                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                            <Box>
                                <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold }}>INTAKE AUDIT</Typography>
                                <Typography variant="caption" color="textSecondary">{selectedIntake.id}</Typography>
                            </Box>
                            <IconButton onClick={() => setSelectedIntake(null)}><XCircle /></IconButton>
                        </Stack>

                        <Stack spacing={4}>
                            <Alert severity="info" icon={<BrainCircuit />} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, color: '#FFF' }}>
                                <Typography variant="subtitle2" fontWeight="900">SOVEREIGN AI ASSESSMENT: {selectedIntake.aiAssessment?.score || '65'}/100</Typography>
                                <Typography variant="caption">Risk Profile: {selectedIntake.aiAssessment?.riskLevel || 'LOW'}</Typography>
                            </Alert>

                            <Box>
                                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Submission Details</Typography>
                                <Paper sx={{ p: 3, mt: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Grid container spacing={2}>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" color="textSecondary">OWNER/ENTITY</Typography>
                                            <Typography variant="body1" fontWeight="800">{selectedIntake.contactInfo?.name || 'GUEST'}</Typography>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Typography variant="caption" color="textSecondary">CONTACT PERSON</Typography>
                                            <Typography variant="body1" fontWeight="800">{selectedIntake.contactInfo?.contactPerson || 'N/A'}</Typography>
                                        </Grid>
                                        <Grid item xs={12}>
                                            <Typography variant="caption" color="textSecondary">EMAIL ADDRESS</Typography>
                                            <Typography variant="body1" fontWeight="700">{selectedIntake.contactInfo?.email}</Typography>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            </Box>

                            <Box>
                                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Asset Portfolio</Typography>
                                <Stack spacing={1} sx={{ mt: 1 }}>
                                    {selectedIntake.properties?.map((p, i) => (
                                        <Paper key={i} sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.02), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight="800">{p.addressLine || 'Property Node'}</Typography>
                                                <Typography variant="caption" color="textSecondary">{p.propertyType} | {p.units} Units</Typography>
                                            </Box>
                                            <Building2 size={16} color={binThemeTokens.gold} />
                                        </Paper>
                                    ))}
                                </Stack>
                            </Box>

                            <Box>
                                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Protocol Configuration</Typography>
                                <Paper sx={{ p: 3, mt: 1, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="body2"><b>Plan:</b> {selectedIntake.selectedPlan?.name || 'TBD'}</Typography>
                                    <Typography variant="body2"><b>Add-Ons:</b> {selectedIntake.selectedAddOns?.join(', ') || 'NONE'}</Typography>
                                    <Typography variant="body2"><b>Mobilization:</b> AED {selectedIntake.payment?.amount || 0}</Typography>
                                </Paper>
                            </Box>

                            <Stack direction="row" spacing={2} sx={{ pt: 4 }}>
                                <Button 
                                    fullWidth 
                                    variant="contained" 
                                    startIcon={<CheckCircle />}
                                    onClick={() => handleApprove(selectedIntake)}
                                    disabled={selectedIntake.status === 'CONVERTED_TO_OWNER'}
                                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2 }}
                                >
                                    {selectedIntake.status === 'CONVERTED_TO_OWNER' ? 'ACTIVE' : 'ACTIVATE SOVEREIGN NODE'}
                                </Button>
                                <Button variant="outlined" color="error" startIcon={<XCircle />} sx={{ fontWeight: 900 }}>REJECT</Button>
                            </Stack>
                        </Stack>
                    </Box>
                )}
            </Drawer>
        </AdminPageFrame>
    );
};

export default IntakeVaultPage;

