import React, { useState } from 'react';
import { 
    Box, Typography, Paper, Button, Stack, Chip, Divider, 
    CircularProgress, alpha 
} from '@mui/material';
import { 
    Info, ShieldAlert, CheckCircle, Zap, 
    ArrowRight, AlertTriangle, TrendingDown 
} from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import { MissionGuidancePayload } from '../utils/predictiveIntelligence';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

interface MaintenanceProposal {
    id: string;
    title: string;
    description: string;
    status: string;
    suggestedBudget?: number;
    createdAt: any;
}

interface MissionGuidanceFeedProps {
    propertyId: string;
    intel: MissionGuidancePayload;
    onActionSuccess?: () => void;
}

/**
 * BIN-GENESIS™ Mission Guidance Feed (Sovereign Action Center)
 * Transforms AI predictive alerts into actionable protocol commands.
 */
export default function MissionGuidanceFeed({ propertyId, intel, onActionSuccess }: MissionGuidanceFeedProps) {
    const [executingAlert, setExecutingAlert] = useState<string | null>(null);
    const [proposals, setProposals] = useState<MaintenanceProposal[]>([]);
    const [loadingProposals, setLoadingProposals] = useState(true);

    // ── PROPOSALS SUBSCRIPTION ───────────────────────────────────────────────
    React.useEffect(() => {
        const q = query(
            collection(db, "tickets"),
            where("propertyId", "==", propertyId),
            where("status", "==", "PREVENTIVE_PROPOSAL")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as MaintenanceProposal[];
            setProposals(docs);
            setLoadingProposals(false);
        });

        return () => unsubscribe();
    }, [propertyId]);

    const handleSanctionProtocol = async (alertMsg: string, recommendation: string) => {
        setExecutingAlert(alertMsg);
        try {
            const createTicket = httpsCallable(functions, 'createAiMaintenanceTicket');
            await createTicket({
                propertyId,
                title: `[SOVEREIGN-SANCTION] ${alertMsg.substring(0, 50)}`,
                description: `Owner-sanctioned preventive protocol based on Mission Guidance: ${recommendation}`,
                trade: 'GENERAL',
                priority: 'HIGH'
            });
            
            if (onActionSuccess) onActionSuccess();
            alert("Sovereign Protocol Sanctioned. Work order dispatched to Geo-Spatial Triage.");
        } catch (error) {
            console.error("Protocol sanction failure:", error);
            alert("Sanction failed. Terminal connection unstable.");
        } finally {
            setExecutingAlert(null);
        }
    };

    const handleApproveProposal = async (proposal: MaintenanceProposal) => {
        setExecutingAlert(proposal.id);
        try {
            const approve = httpsCallable(functions, 'approveMaintenanceProposal');
            await approve({ ticketId: proposal.id });
            
            if (onActionSuccess) onActionSuccess();
            alert("Proposed Protocol Approved. Technician dispatch initiated.");
        } catch (error) {
            console.error("Proposal approval failure:", error);
            alert("Approval failed: " + (error as Error).message);
        } finally {
            setExecutingAlert(null);
        }
    };

    return (
        <Box sx={{ mt: 3 }}>
            <Stack spacing={3}>
                {intel.alerts.length > 0 ? intel.alerts.map((alert, idx) => (
                    <Paper 
                        key={idx}
                        sx={{
                            p: 3,
                            bgcolor: alert.type === 'CRITICAL' 
                                ? alpha(binThemeTokens.danger, 0.05) 
                                : alpha(binThemeTokens.gold, 0.03),
                            borderRadius: 5,
                            border: `1px solid ${
                                alert.type === 'CRITICAL' 
                                    ? alpha(binThemeTokens.danger, 0.3) 
                                    : alpha(binThemeTokens.gold, 0.2)
                            }`,
                            position: 'relative',
                            overflow: 'hidden',
                            '&::before': {
                                content: '""',
                                position: 'absolute',
                                top: 0, left: 0, bottom: 0,
                                width: 4,
                                bgcolor: alert.type === 'CRITICAL' ? binThemeTokens.danger : binThemeTokens.gold
                            }
                        }}
                    >
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                {alert.type === 'CRITICAL' ? (
                                    <ShieldAlert color={binThemeTokens.danger} size={24} />
                                ) : (
                                    <AlertTriangle color={binThemeTokens.gold} size={24} />
                                )}
                                <Typography variant="subtitle1" fontWeight={900} sx={{ color: binThemeTokens.textPrimary }}>
                                    {alert.message}
                                </Typography>
                            </Stack>
                            <Chip 
                                label={alert.type} 
                                size="small" 
                                sx={{ 
                                    fontWeight: 900, fontSize: '0.65rem',
                                    bgcolor: alert.type === 'CRITICAL' ? binThemeTokens.danger : alpha(binThemeTokens.gold, 0.1),
                                    color: alert.type === 'CRITICAL' ? '#fff' : binThemeTokens.gold,
                                    border: `1px solid ${alert.type === 'CRITICAL' ? 'transparent' : binThemeTokens.gold}`
                                }} 
                            />
                        </Stack>

                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 3, pl: 5, lineHeight: 1.6 }}>
                            {alert.recommendation}
                        </Typography>

                        <Divider sx={{ mb: 2, borderColor: alpha('#fff', 0.05) }} />

                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end">
                            <Button 
                                size="small"
                                sx={{ color: binThemeTokens.textTertiary, fontWeight: 700 }}
                                onClick={() => {/* Dismiss logic */}}
                            >
                                DISMISS
                            </Button>
                            <Button
                                variant="contained"
                                size="small"
                                disabled={executingAlert === alert.message}
                                startIcon={executingAlert === alert.message ? <CircularProgress size={16} color="inherit" /> : <Zap size={16} />}
                                onClick={() => handleSanctionProtocol(alert.message, alert.recommendation)}
                                sx={{
                                    bgcolor: alert.type === 'CRITICAL' ? binThemeTokens.danger : binThemeTokens.gold,
                                    '&:hover': {
                                        bgcolor: alert.type === 'CRITICAL' ? alpha(binThemeTokens.danger, 0.8) : binThemeTokens.goldLight,
                                    },
                                    color: '#000',
                                    fontWeight: 900,
                                    px: 3,
                                    borderRadius: 3
                                }}
                            >
                                {alert.type === 'CRITICAL' ? 'SANCTION EMERGENCY PROTOCOL' : 'SANCTION PREVENTIVE PROTOCOL'}
                            </Button>
                        </Stack>
                    </Paper>
                )) : null}

                {/* AI PROPOSALS FROM CRON */}
                {proposals.map((proposal) => (
                    <Paper 
                        key={proposal.id}
                        sx={{
                            p: 3,
                            bgcolor: alpha(binThemeTokens.gold, 0.08),
                            borderRadius: 5,
                            border: `1px solid ${binThemeTokens.gold}`,
                            position: 'relative',
                            overflow: 'hidden',
                            '&::before': {
                                content: '""',
                                position: 'absolute',
                                top: 0, left: 0, bottom: 0,
                                width: 4,
                                bgcolor: binThemeTokens.gold
                            }
                        }}
                    >
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Zap color={binThemeTokens.gold} size={24} />
                                <Typography variant="subtitle1" fontWeight={900} sx={{ color: binThemeTokens.textPrimary }}>
                                    {proposal.title}
                                </Typography>
                            </Stack>
                            <Chip 
                                label="AI PROPOSAL" 
                                size="small" 
                                sx={{ 
                                    fontWeight: 900, fontSize: '0.65rem',
                                    bgcolor: binThemeTokens.gold,
                                    color: '#000'
                                }} 
                            />
                        </Stack>

                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 1, pl: 5, lineHeight: 1.6 }}>
                            {proposal.description}
                        </Typography>

                        <Box sx={{ pl: 5, mb: 3 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>
                                SUGGESTED BUDGET: AED {proposal.suggestedBudget || 450}
                            </Typography>
                        </Box>

                        <Divider sx={{ mb: 2, borderColor: alpha('#fff', 0.05) }} />

                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end">
                            <Button 
                                size="small"
                                sx={{ color: binThemeTokens.textTertiary, fontWeight: 700 }}
                                onClick={() => {/* Decline logic */}}
                            >
                                DECLINE
                            </Button>
                            <Button
                                variant="contained"
                                size="small"
                                disabled={executingAlert === proposal.id}
                                startIcon={executingAlert === proposal.id ? <CircularProgress size={16} color="inherit" /> : <CheckCircle size={16} />}
                                onClick={() => handleApproveProposal(proposal)}
                                sx={{
                                    bgcolor: binThemeTokens.gold,
                                    '&:hover': { bgcolor: binThemeTokens.goldLight },
                                    color: '#000',
                                    fontWeight: 900,
                                    px: 3,
                                    borderRadius: 3
                                }}
                            >
                                {executingAlert === proposal.id ? 'PROCESSING...' : 'APPROVE PROTOCOL'}
                            </Button>
                        </Stack>
                    </Paper>
                ))}

                {intel.alerts.length === 0 && proposals.length === 0 && (
                    <Box sx={{ py: 4, textAlign: 'center', opacity: 0.5 }}>
                        <CheckCircle size={40} color={binThemeTokens.gold} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <Typography variant="body2" sx={{ color: binThemeTokens.textTertiary }}>
                            All systems operating within nominal Sovereign thresholds.
                        </Typography>
                    </Box>
                )}
            </Stack>

            {/* Asset Resilience Context Footer */}
            <Paper sx={{ mt: 4, p: 3, bgcolor: alpha(binThemeTokens.graphite, 0.5), borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                <Stack direction="row" spacing={3} divider={<Divider orientation="vertical" flexItem sx={{ borderColor: alpha(binThemeTokens.gold, 0.1) }} />}>
                    <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <TrendingDown size={14} color={binThemeTokens.danger} />
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>DECAY (12M)</Typography>
                        </Stack>
                        <Typography variant="h6" fontWeight={900} sx={{ color: binThemeTokens.textPrimary }}>
                            -{intel.assetResilience.predictedDecay12Months}%
                        </Typography>
                    </Box>
                    <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Zap size={14} color={binThemeTokens.gold} />
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>RISK VECTOR</Typography>
                        </Stack>
                        <Typography variant="h6" fontWeight={900} sx={{ color: binThemeTokens.textPrimary }}>
                            {intel.assetResilience.criticalFailureWindows[0]?.assetCategory} SURGE
                        </Typography>
                    </Box>
                    <Box sx={{ flexGrow: 1, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1 }}>
                            VIEW INTEGRITY REPORT <ArrowRight size={14} />
                        </Typography>
                    </Box>
                </Stack>
            </Paper>
        </Box>
    );
}
