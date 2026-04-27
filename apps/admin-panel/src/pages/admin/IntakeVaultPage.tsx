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
import { db, auth } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { binThemeTokens } from '../../theme/adminTheme';
import { buildGeoAnchor } from '../../utils/geoAnchor';

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
        if (!intake.payment?.paymentId && !window.confirm("This legacy intake has no linked payment transaction. Continue only if finance has verified the mobilization payment offline.")) {
            return;
        }

        try {
            const batch = writeBatch(db);
            const intakeRef = doc(db, 'intake_submissions', intake.id);
            const adminId = auth.currentUser?.uid || 'ADMIN_HUB_V7';
            
            // 1. Update Intake Status
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

            const ownerId = intake.userId || (intake as any).ownerId;
            const ownerEmail = intake.contactInfo?.email || (intake as any).ownerAccount?.email;
            const ownerName = intake.contactInfo?.contactPerson || intake.contactInfo?.name || (intake as any).ownerAccount?.fullName || 'BIN Owner';
            const contractId = intake.payment?.contractId;
            const paymentId = intake.payment?.paymentId;
            const propertyIds: string[] = [];
            const companyId = (intake as any).companyId || 'BIN_GROUP';

            // 2. Provision Property Node (if properties exist in intake)
            if (intake.properties && intake.properties.length > 0) {
                for (const [index, p] of intake.properties.entries()) {
                    const sourcePropertyId = p.id || p.propertyId || `property_${index + 1}`;
                    const propRef = doc(db, 'properties', safeDocId(`${intake.id}_${sourcePropertyId}`));
                    const targetCompanyId = p.companyId || companyId;
                    const companyPropRef = doc(db, 'companies', targetCompanyId, 'properties', propRef.id);
                    propertyIds.push(propRef.id);
                    
                    const geoSource = p.geo || p.location || p.coordinates;
                    const geoData = buildGeoAnchor({
                        lat: geoSource?.lat ?? geoSource?.latitude,
                        lng: geoSource?.lng ?? geoSource?.longitude,
                        address: p.addressLine || p.address || p.geo?.address,
                        emirate: p.emirate || p.geo?.emirate,
                        city: p.city || p.area || p.geo?.city,
                        area: p.area || p.city || p.geo?.area,
                        placeId: p.googlePlaceId || p.placeId || p.geo?.placeId,
                        verifiedBy: adminId
                    });

                    const propertyPayload = {
                        ...p,
                        companyId: targetCompanyId,
                        id: propRef.id,
                        propertyId: propRef.id,
                        propertyName: p.propertyName || p.name || `${p.propertyType || 'Property'} ${index + 1}`,
                        ownerId: ownerId || 'SYSTEM',
                        ownerEmail,
                        addressLine: p.addressLine || p.address || (geoData ? geoData.address : ''),
                        googlePlaceId: p.googlePlaceId || (geoData ? geoData.placeId : ''),
                        geo: geoData,
                        status: 'ACTIVE',
                        verified: true,
                        geoAnchorStatus: 'admin_verified',
                        verificationSource: 'ADMIN_INTAKE_APPROVAL',
                        auditVersion: 1,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        source: `INTAKE_CONVERSION_${intake.id}`
                    };

                    batch.set(propRef, propertyPayload, { merge: true });
                    batch.set(companyPropRef, propertyPayload, { merge: true });

                    // Provision Units placeholder
                    const unitCount = p.units || 1;
                    for (let i = 1; i <= unitCount; i++) {
                        const unitRef = doc(db, 'units', safeDocId(`${propRef.id}_unit_${i}`));
                        batch.set(unitRef, {
                            companyId: targetCompanyId,
                            id: unitRef.id,
                            unitId: unitRef.id,
                            propertyId: propRef.id,
                            ownerId: ownerId || 'SYSTEM',
                            unitNumber: `${p.propertyType === 'Villa' ? 'Villa' : 'Unit'} ${i}`,
                            occupancyStatus: 'VACANT',
                            moveInStatus: 'READY_FOR_TENANT_ASSIGNMENT',
                            auditVersion: 1,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        }, { merge: true });
                    }
                }
            }

            // 3. Activate User Role
            if (ownerId) {
                const userRef = doc(db, 'users', ownerId);
                batch.set(userRef, {
                    role: 'owner',
                    status: 'active',
                    dashboardUnlocked: true,
                    paymentVerified: true,
                    adminApproved: true,
                    activatedAt: serverTimestamp()
                }, { merge: true });

                batch.set(doc(db, 'owners', ownerId), {
                    ownerId,
                    name: ownerName,
                    email: ownerEmail,
                    phone: intake.contactInfo?.phone || (intake as any).ownerAccount?.mobile || '',
                    status: 'active',
                    dashboardUnlocked: true,
                    paymentVerified: true,
                    adminApproved: true,
                    propertyIds,
                    activeContractId: contractId || null,
                    latestIntakeId: intake.id,
                    activatedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            if (contractId) {
                batch.update(doc(db, 'contracts', contractId), {
                    status: 'ACTIVE',
                    contractStatus: 'active',
                    activationStatus: 'ACTIVE',
                    paymentVerified: true,
                    paymentStatus: 'RECONCILED',
                    signedByBinGroups: true,
                    propertyIds,
                    primaryPropertyId: propertyIds[0] || null,
                    approvedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }

            if (paymentId) {
                batch.update(doc(db, 'payment_transactions', paymentId), {
                    status: 'RECONCILED',
                    verificationState: 'ADMIN_VERIFIED',
                    unlocksDashboard: true,
                    reconciledBy: adminId,
                    reconciledAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }

            batch.set(doc(collection(db, 'audit_logs')), {
                action: 'INTAKE_APPROVED_ATOMIC_ACTIVATION',
                adminId,
                ownerId: ownerId || null,
                intakeId: intake.id,
                contractId: contractId || null,
                paymentId: paymentId || null,
                propertyIds,
                createdAt: serverTimestamp(),
                auditVersion: 1
            });

            await batch.commit();
            setSelectedIntake(null);
            alert("Sovereign Node Activated: Intake converted to live Owner portfolio.");
        } catch (err) {
            console.error("Conversion Protocol Fault:", err);
            alert("Relational Provisioning Failure. Check Admin permissions.");
        }
    };

    const handleReject = async (id: string) => {
        if (!window.confirm("Initialize Rejection Protocol? This will archive the submission.")) return;
        try {
            await updateDoc(doc(db, 'intake_submissions', id), {
                status: 'REJECTED',
                rejectedAt: serverTimestamp()
            });
            setSelectedIntake(null);
        } catch (err) {
            console.error(err);
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
                                        onClick={() => handleReject(selectedIntake.id)}
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
