import React, { useState } from 'react';
import {
    Box, Grid, Card, Typography, Stack,
    Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, Alert,
    Divider, IconButton, LinearProgress
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BugReportIcon from '@mui/icons-material/BugReport';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import GppGoodIcon from '@mui/icons-material/GppGood';
import MapIcon from '@mui/icons-material/Map';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

export default function PilotCommandCenter() {
    const [stats] = useState({
        leads: 12,
        quotes: 10,
        contracts: 6,
        active: 4,
        unlocked: 4
    });

    const [activeContracts] = useState([
        { id: 'C_7781', owner: 'Al Noor Holdings', unit: 'Marina Apt', plan: 'Elite', status: 'ACTIVE', fee: 'AED 304,800' },
        { id: 'C_7782', owner: 'Falcon Villas', unit: 'Al Ain Villa', plan: 'Maintenance', status: 'PENDING', fee: 'AED 58,200' }
    ]);

    const [pricingIntegrity] = useState([
        { unit: 'Marina 2504', region: 'Dubai', weight: '2.11x', confidence: 92, status: 'Healthy' },
        { unit: 'Al Ain Villa 12', region: 'Al Ain', weight: '1.08x', confidence: 88, status: 'Healthy' },
        { unit: 'Office Tower 4', region: 'Sharjah', weight: '1.45x', confidence: 74, status: 'Warning' }
    ]);

    return (
        <Box sx={{ p: 4, bgcolor: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" sx={{ color: '#0f172a', letterSpacing: -1 }}>
                        PILOT COMMAND CENTER <Chip label="UAE ROLLOUT" size="small" sx={{ ml: 1, bgcolor: '#0f172a', color: 'white', fontWeight: 'bold' }} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Mission Control: Revenue Engine & Pricing Integrity Monitor
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Card sx={{ px: 3, py: 1, bgcolor: '#10b981', color: 'white' }}>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>Expected Annual Revenue</Typography>
                        <Typography variant="h6" fontWeight="bold">AED 1,248,600</Typography>
                    </Card>
                </Stack>
            </Box>

            <Grid container spacing={3}>
                {/* 1. Pipeline Summary */}
                <Grid item xs={12}>
                    <Card sx={{ p: 3 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <TrendingUpIcon color="primary" />
                            <Typography variant="h6" fontWeight="bold">Onboarding Pipeline Summary</Typography>
                        </Stack>
                        <Grid container spacing={2}>
                            {[
                                { label: 'Leads', val: stats.leads, color: '#64748b' },
                                { label: 'Quotes', val: stats.quotes, color: '#3b82f6' },
                                { label: 'Accepted', val: 8, color: '#8b5cf6' },
                                { label: 'Contracts', val: stats.contracts, color: '#ec4899' },
                                { label: 'Activated', val: stats.active, color: '#10b981' },
                                { label: 'Unlocked', val: stats.unlocked, color: '#059669' }
                            ].map((step, idx) => (
                                <Grid item xs={6} md={2} key={step.label}>
                                    <Box sx={{ p: 2, textAlign: 'center', borderRight: idx < 5 ? '1px solid #e2e8f0' : 'none' }}>
                                        <Typography variant="h4" fontWeight="bold" sx={{ color: step.color }}>{step.val}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>{step.label.toUpperCase()}</Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Card>
                </Grid>

                {/* 2. System Alerts & Audit Health */}
                <Grid item xs={12} md={4}>
                    <Stack spacing={2}>
                        <Card sx={{ p: 3 }}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                                <BugReportIcon sx={{ color: '#ef4444' }} />
                                <Typography variant="h6" fontWeight="bold">Integrity Flags</Typography>
                            </Stack>
                            <Stack spacing={1}>
                                <Alert severity="error" sx={{ py: 0 }}>Missing auditLog for Q-104</Alert>
                                <Alert severity="warning" sx={{ py: 0 }}>Decision drift detected: v4.3 Legacy</Alert>
                                <Alert severity="success" sx={{ py: 0 }}>Audit chain complete (94%)</Alert>
                            </Stack>
                        </Card>
                        <Card sx={{ p: 3, bgcolor: '#0f172a', color: 'white' }}>
                            <Typography variant="caption" sx={{ opacity: 0.7 }}>ENGINE VERSION</Typography>
                            <Typography variant="h5" fontWeight="black" gutterBottom>v5.0-STABLE</Typography>
                            <Divider sx={{ bgcolor: 'rgba(255,255,255,0.1)', my: 1 }} />
                            <Stack spacing={1}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption">Active Contracts</Typography>
                                    <Typography variant="caption" fontWeight="bold">6</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption">Pricing Logic Match</Typography>
                                    <Typography variant="caption" fontWeight="bold" color="#10b981">98%</Typography>
                                </Box>
                            </Stack>
                        </Card>
                    </Stack>
                </Grid>

                {/* 3. Pricing Integrity Table */}
                <Grid item xs={12} md={8}>
                    <Card sx={{ p: 0, height: '100%', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0' }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <GppGoodIcon color="success" />
                                <Typography variant="h6" fontWeight="bold">Pricing & Multiplier Monitor</Typography>
                            </Stack>
                        </Box>
                        <TableContainer sx={{ maxHeight: 300 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Unit</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Region</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Weight</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Confidence</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f8fafc' }}>Action</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pricingIntegrity.map((row) => (
                                        <TableRow key={row.unit} hover>
                                            <TableCell sx={{ fontWeight: 'bold' }}>{row.unit}</TableCell>
                                            <TableCell>{row.region}</TableCell>
                                            <TableCell><Chip label={row.weight} size="small" variant="outlined" /></TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="caption" sx={{ minWidth: 25 }}>{row.confidence}%</Typography>
                                                    <LinearProgress 
                                                        variant="determinate" 
                                                        value={row.confidence} 
                                                        sx={{ width: 60, height: 6, borderRadius: 3 }}
                                                        color={row.confidence > 85 ? 'success' : (row.confidence > 75 ? 'primary' : 'warning')}
                                                    />
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <IconButton size="small"><OpenInNewIcon fontSize="small" /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Card>
                </Grid>

                {/* 4. Active Contract Activation Monitor */}
                <Grid item xs={12}>
                    <Card sx={{ p: 0 }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <ReceiptLongIcon color="primary" />
                                <Typography variant="h6" fontWeight="bold">Revenue Readiness Dashboard</Typography>
                            </Stack>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <Chip icon={<MapIcon />} label="Heatmap" size="small" />
                                <Chip label="Strategy Dist" size="small" />
                            </Box>
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Owner</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Property</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Plan</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Annual Fee</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Unlock</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {activeContracts.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>{row.owner}</TableCell>
                                            <TableCell>{row.unit}</TableCell>
                                            <TableCell><Chip label={row.plan} size="small" /></TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={row.status} 
                                                    size="small" 
                                                    color={row.status === 'ACTIVE' ? 'success' : 'warning'} 
                                                    variant="filled"
                                                    sx={{ fontWeight: 'bold' }}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ fontWeight: 'black' }}>{row.fee}</TableCell>
                                            <TableCell>
                                                {row.status === 'ACTIVE' ? 
                                                    <GppGoodIcon sx={{ color: '#10b981' }} /> : 
                                                    <Box sx={{ width: 24, height: 24, border: '2px solid #e2e8f0', borderRadius: '50%' }} />
                                                }
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Box sx={{ p: 2, bgcolor: '#f1f5f9', textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ letterSpacing: 1, color: '#64748b' }}>
                                ADMIN ACTION: OPEN AUDIT VIEWER | RE-RUN SIMULATION | DOWNLOAD PILOT COHORT SUMMARY
                            </Typography>
                        </Box>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
