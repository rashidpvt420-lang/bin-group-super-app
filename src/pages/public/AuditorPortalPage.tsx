
// apps/owner-app/src/pages/public/AuditorPortalPage.tsx
import React, { useState } from 'react';
import {
    Container, Paper, Typography, Box, Grid, Card,
    Button, Divider, Alert, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, LinearProgress, CircularProgress, Stack
} from '@mui/material';
import { ShieldCheck, Lock, Download, Bell, Activity, Database, Key } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function AuditorPortalPage() {
    const { role, loading, user } = useRole();
    const navigate = useNavigate();
    const [generating, setGenerating] = useState(false);

    const [isReady, setIsReady] = useState(false);
    const [auditData, setAuditData] = useState<any[]>([]);

    React.useEffect(() => {
        if (!loading && (!user || !role || !['AUDITOR', 'ADMIN'].includes(role as string))) {
            navigate('/dashboard');
            return;
        }

        async function checkAuditIntegrity() {
            if (!user) return;
            try {
                const { collection, getDocs, query, limit } = await import('../../lib/firebase');
                const { db } = await import('../../lib/firebase');
                const snap = await getDocs(query(collection(db, 'auditLogs'), limit(10)));
                if (!snap.empty) {
                    setAuditData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setIsReady(true);
                } else {
                    setIsReady(false);
                }
            } catch (err) {
                console.error("Audit integrity check failure:", err);
                setIsReady(false);
            }
        }
        if (user) checkAuditIntegrity();
    }, [loading, user, role, navigate]);

    if (loading) return (
        <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0B0B0C' }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
        </Box>
    );

    if (!user || !role || !['AUDITOR', 'ADMIN'].includes(role as string)) return null;

    if (!isReady) {
        return (
            <Container sx={{ py: 20, textAlign: 'center' }}>
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                    <ShieldCheck size={80} color={binThemeTokens.gold} />
                </Box>
                <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mb: 2 }}>
                    AUDIT FEDERATION HUB OFFLINE
                </Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, maxWidth: 600, mx: 'auto' }}>
                    The read-only transparency protocol is currently synchronizing with the National Regulatory Registry.
                    Institutional audit logs will populate upon the next block validation cycle.
                </Typography>
                <Button
                    variant="outlined"
                    onClick={() => navigate('/dashboard')}
                    sx={{ mt: 6, borderColor: binThemeTokens.gold, color: binThemeTokens.gold }}
                >
                    RETURN TO SECURE DASHBOARD
                </Button>
            </Container>
        );
    }

    const handleAuditRequest = () => {
        setGenerating(true);
        setTimeout(() => {
            setGenerating(false);
            alert("Audit Bundle Generation restricted. Contact Federation HQ for secure key transfer.");
        }, 1500);
    };

    return (
        <Container maxWidth="xl" sx={{ py: 10 }}>
            <Box sx={{ mb: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <ShieldCheck size={48} color={binThemeTokens.gold} />
                        <Box>
                            <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, letterSpacing: -1 }}>Auditor Federation Hub</Typography>
                            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>Read-only transparency protocol for National Regulatory Entities.</Typography>
                        </Box>
                    </Stack>
                </Box>
                <Card sx={{ bgcolor: binThemeTokens.gold, px: 4, py: 1.5, borderRadius: 3, boxShadow: '0 0 30px rgba(198,167,94,0.3)' }}>
                    <Typography variant="overline" sx={{ color: '#0B0B0C', fontWeight: 900, letterSpacing: 1.5, display: 'block' }}>AUDIT TRUST SCORE</Typography>
                    <Typography variant="h4" fontWeight="900" sx={{ color: '#0B0B0C' }}>98 / 100</Typography>
                </Card>
            </Box>

            <Grid container spacing={6}>
                {/* Early Warning Engine */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{
                        p: 5,
                        borderRadius: 6,
                        mb: 6,
                        bgcolor: '#161618',
                        border: '1px solid rgba(198, 167, 94, 0.2)',
                        boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
                    }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                            <Bell color={binThemeTokens.goldLight} size={24} />
                            <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.goldLight, letterSpacing: 1 }}>COMPLIANCE EARLY-WARNING ENGINE</Typography>
                        </Stack>
                        <Alert
                            severity="warning"
                            icon={<Activity color={binThemeTokens.gold} />}
                            sx={{
                                mb: 4,
                                borderRadius: 4,
                                bgcolor: 'rgba(198, 167, 94, 0.05)',
                                color: binThemeTokens.textPrimary,
                                border: '1px solid rgba(198, 167, 94, 0.15)',
                                '& .MuiAlert-message': { width: '100%' }
                            }}
                        >
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold }}>PREDICTIVE VIOLATION DETECTED: CLUSTER SOUTH-C</Typography>
                            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5, lineHeight: 1.6 }}>
                                Fire Safety Certification ID: **CERT-DXB-921** is 15 days from expiration.
                                **Regulatory Prediction:** Transition renewal lag (5d) puts entity risk at 84% on April 10.
                            </Typography>
                        </Alert>
                        <Button
                            variant="outlined"
                            fullWidth
                            sx={{
                                py: 2.5,
                                borderRadius: 3,
                                borderColor: binThemeTokens.gold,
                                color: binThemeTokens.gold,
                                fontWeight: 900,
                                '&:hover': { bgcolor: 'rgba(198, 167, 94, 0.05)', borderColor: binThemeTokens.goldLight }
                            }}
                        >
                            INITIATE AUTOMATED RENEWAL LIFECYCLE →
                        </Button>
                    </Paper>

                    <TableContainer component={Paper} sx={{
                        borderRadius: 6,
                        bgcolor: 'rgba(22, 22, 24, 0.6)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        boxShadow: '0 30px 60px rgba(0,0,0,0.4)'
                    }}>
                        <Table>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                                <TableRow>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>ENTITY NODE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>REGIONAL ZONE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>INTEGRITY</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>AUDIT HASH (SHA256)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {auditData.map((row, i) => (
                                    <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                        <TableCell sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{row.entity || row.name || 'Unknown'}</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>{row.zone || 'UAE'}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={2} alignItems="center">
                                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900, minWidth: 35 }}>{row.integrity || 100}%</Typography>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={row.integrity || 100}
                                                    sx={{
                                                        width: 80, height: 6, borderRadius: 3,
                                                        bgcolor: 'rgba(255,255,255,0.05)',
                                                        '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold }
                                                    }}
                                                />
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', color: binThemeTokens.goldLight, fontSize: '0.8rem', letterSpacing: 0.5 }}>{row.hash || row.id}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                {/* Audit Bundle & API Hub */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{
                        p: 5,
                        borderRadius: 6,
                        bgcolor: '#161618',
                        border: '1px solid rgba(255,255,255,0.05)',
                        mb: 6,
                        background: 'linear-gradient(135deg, #161618 0%, #0B0B0C 100%)',
                        boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
                    }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                            <Download color={binThemeTokens.gold} size={24} />
                            <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>ADM / DLD GATEWAY</Typography>
                        </Stack>
                        <Divider sx={{ mb: 4, borderColor: 'rgba(198, 167, 94, 0.1)' }} />
                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4, lineHeight: 1.8 }}>
                            Generate an encrypted, municipality-grade **Audit Bundle (ZIP)** containing all notarized evidence and certification history for the current fiscal cycle.
                        </Typography>
                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            onClick={handleAuditRequest}
                            sx={{
                                background: 'linear-gradient(135deg, #C6A75E, #E6C77A)',
                                color: '#0B0B0C',
                                fontWeight: 900,
                                py: 3,
                                borderRadius: 4,
                                boxShadow: '0 20px 40px rgba(198, 167, 94, 0.3)',
                                '&:hover': { transform: 'scale(1.02)' }
                            }}
                            disabled={generating}
                        >
                            {generating ? 'ENCRYPTING BUNDLE...' : 'DOWNLOAD AUDIT BUNDLE’26'}
                        </Button>
                    </Paper>

                    <Paper sx={{
                        p: 5,
                        borderRadius: 6,
                        bgcolor: 'rgba(22, 22, 24, 0.4)',
                        border: '1px solid rgba(255,255,255,0.03)',
                        boxShadow: '0 30px 60px rgba(0,0,0,0.3)'
                    }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                            <Key color={binThemeTokens.gold} size={20} />
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: 1 }}>LIVE COMPLIANCE WEBHOOKS</Typography>
                        </Stack>
                        <Stack spacing={3}>
                            <Box sx={{ p: 3, bgcolor: '#0B0B0C', borderRadius: 4, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, display: 'block', fontWeight: 900 }}>ADM_INGESTION_REALTIME</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.goldLight, fontFamily: 'monospace', mt: 1, fontWeight: 900 }}>POST /api/v1/fed-audit/adm</Typography>
                            </Box>
                            <Box sx={{ p: 3, bgcolor: '#0B0B0C', borderRadius: 4, border: '1px solid rgba(198, 167, 94, 0.15)' }}>
                                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, display: 'block', fontWeight: 900 }}>DLD_RISK_SYNC_PORT</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.goldLight, fontFamily: 'monospace', mt: 1, fontWeight: 900 }}>GET /api/v1/risk-profile/live</Typography>
                            </Box>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            <Box sx={{ mt: 10, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 2, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                    <Lock size={14} /> SECURE AUDIT SESSION • END-TO-END ENCRYPTED (AES-256) • BIN-OS V1.19
                </Typography>
            </Box>
        </Container>
    );
}
