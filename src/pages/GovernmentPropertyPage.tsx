import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
    Container, Typography, Box, Paper, Grid, Stack, Button, 
    Chip, alpha, CircularProgress, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, LinearProgress
} from '@mui/material';
import { 
    ShieldCheck, ClipboardCheck, Download,
    FileCheck, Landmark
} from 'lucide-react';
import { db, doc, getDoc } from '../lib/firebase';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import CoverageTracker from '../components/CoverageTracker';
import type { CoverageItem } from '../components/CoverageTracker';

interface AssetRegistryItem {
    id: string;
    category: string;
    name: string;
    serialNumber: string;
    lastService: any;
    nextService: any;
    status: 'OPTIMAL' | 'SERVICE_REQUIRED' | 'CRITICAL';
}

const GovernmentPropertyPage: React.FC = () => {
    const { id } = useParams();
    const { tx, isRTL } = useLanguage();
    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [assets, setAssets] = useState<AssetRegistryItem[]>([]);
    const [coverage, setCoverage] = useState<CoverageItem[]>([]);
    const [inspections, setInspections] = useState<any[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);

    const toDate = (value: any) => value?.toDate?.() || (value ? new Date(value) : null);
    const displayDate = (value: any) => {
        const date = toDate(value);
        return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE') : tx('common.notRecorded', 'Not recorded');
    };

    useEffect(() => {
        if (!id) return;
        const fetchProp = async () => {
            try {
                const snap = await getDoc(doc(db, 'properties', id));
                if (!snap.exists()) {
                    setError(tx('government.propertyNotFound', 'Property record was not found or is not available to this account.'));
                    setLoading(false);
                    return;
                }
                const data = snap.data();
                setProperty(data);
                const assetRows = Array.isArray(data.assetRegistry) ? data.assetRegistry : Array.isArray(data.assets) ? data.assets : [];
                setAssets(assetRows.map((asset: any, index: number) => ({
                    id: String(asset.id || asset.assetId || index),
                    category: String(asset.category || asset.type || 'ASSET'),
                    name: String(asset.name || asset.assetName || 'Unnamed asset'),
                    serialNumber: String(asset.serialNumber || asset.serial || ''),
                    lastService: asset.lastService || asset.lastServiceAt || null,
                    nextService: asset.nextService || asset.nextServiceAt || null,
                    status: ['OPTIMAL', 'SERVICE_REQUIRED', 'CRITICAL'].includes(String(asset.status || '').toUpperCase())
                        ? String(asset.status).toUpperCase()
                        : 'SERVICE_REQUIRED',
                })) as AssetRegistryItem[]);
                const coverageRows = Array.isArray(data.coverage) ? data.coverage : Array.isArray(data.warranties) ? data.warranties : [];
                setCoverage(coverageRows.map((item: any, index: number) => ({
                    id: String(item.id || item.policyNumber || index),
                    system: String(item.system || item.name || 'Coverage'),
                    provider: String(item.provider || ''),
                    expiryDate: toDate(item.expiryDate || item.expiresAt) || new Date(0),
                    type: String(item.type || 'WARRANTY').toUpperCase(),
                    policyNumber: String(item.policyNumber || item.reference || ''),
                    status: String(item.status || 'UNKNOWN').toUpperCase(),
                })) as CoverageItem[]);
                setInspections(Array.isArray(data.inspectionHistory) ? data.inspectionHistory : []);
                setDocuments(Array.isArray(data.complianceDocuments) ? data.complianceDocuments : []);
            } catch (err) {
                console.error('[GovernmentProperty] load failed:', err);
                setError(tx('government.propertyLoadFailed', 'Property evidence could not be loaded.'));
            }
            setLoading(false);
        };
        fetchProp();
    }, [id]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (error || !property) {
        return <Box sx={{ p: 6, color: '#fff', textAlign: 'center', direction: isRTL ? 'rtl' : 'ltr' }}><Typography>{error || tx('government.propertyNotFound', 'Property record was not found.')}</Typography></Box>;
    }

    return (
        <Box sx={{ bgcolor: '#000', minHeight: '100vh', py: 6 }}>
            <Container maxWidth="xl">
                {/* INSTITUTIONAL HEADER */}
                <Box sx={{ mb: 6, p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                    <Box sx={{ position: 'absolute', top: 0, right: 0, p: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ShieldCheck size={16} /> SOVEREIGN PROTOCOL ACTIVE
                    </Box>
                    <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={3} alignItems={{ xs: 'flex-start', md: 'center' }}>
                        <Box sx={{ p: 2, bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 2 }}>
                            <Landmark size={48} />
                        </Box>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>INSTITUTIONAL ASSET COMMAND</Typography>
                            <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>{property?.propertyName || property?.area}</Typography>
                            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)' }}>{property?.address}</Typography>
                        </Box>
                        <Stack spacing={2}>
                            <Button disabled variant="contained" startIcon={<Download />} title={tx('government.reportUnavailable', 'No verified report artifact is available.')} sx={{ bgcolor: '#FFF', color: '#000', fontWeight: 950 }}>{tx('government.weeklyReport', 'WEEKLY REPORT — NOT AVAILABLE')}</Button>
                            <Button disabled variant="outlined" startIcon={<Download />} title={tx('government.reportUnavailable', 'No verified report artifact is available.')} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', fontWeight: 950 }}>{tx('government.monthlyAudit', 'MONTHLY AUDIT — NOT AVAILABLE')}</Button>
                        </Stack>
                    </Stack>
                </Box>

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, mb: 4 }}>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ClipboardCheck color={binThemeTokens.gold} /> INSTITUTIONAL ASSET REGISTER
                            </Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                        <TableRow>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>SYSTEM/ASSET</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>SERIAL REF</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>LAST SERVICE</TableCell>
                                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {assets.length === 0 ? (
                                            <TableRow><TableCell colSpan={4} sx={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', py: 5 }}>{tx('government.noAssets', 'No verified asset registry entries are recorded for this property.')}</TableCell></TableRow>
                                        ) : assets.map((asset) => (
                                            <TableRow key={asset.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                                <TableCell>
                                                    <Typography variant="body1" fontWeight="900" color="#FFF">{asset.name}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{asset.category}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{asset.serialNumber}</TableCell>
                                                <TableCell sx={{ color: '#FFF' }}>{displayDate(asset.lastService)}</TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={asset.status} 
                                                        size="small" 
                                                        sx={{ 
                                                            bgcolor: asset.status === 'OPTIMAL' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                                            color: asset.status === 'OPTIMAL' ? '#10b981' : '#ef4444',
                                                            fontWeight: 900, fontSize: '0.65rem'
                                                        }} 
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>

                        <CoverageTracker items={coverage} />
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Stack spacing={4}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3 }}>INSPECTION PROTOCOL</Typography>
                                <Stack spacing={3}>
                                    {inspections.length === 0 ? (
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>{tx('government.noInspections', 'No verified inspection history is recorded.')}</Typography>
                                    ) : inspections.map((log, i) => (
                                        <Box key={i}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="caption" fontWeight="900" color="#FFF">{String(log.title || log.type || 'INSPECTION')}</Typography>
                                                <Typography variant="caption" color="textSecondary">{displayDate(log.completedAt || log.date || log.createdAt)}</Typography>
                                            </Box>
                                            <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, Number(log.score || 0)))} sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                                        </Box>
                                    ))}
                                </Stack>
                            </Paper>

                            <Paper sx={{ p: 4, bgcolor: alpha('#3b82f6', 0.05), border: '1px solid rgba(59,130,246,0.2)', borderRadius: 6 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <FileCheck color="#3b82f6" /> DOCUMENT VAULT
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>Institutional certifications and authority approvals.</Typography>
                                <Stack spacing={1}>
                                    {documents.length === 0 ? (
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>{tx('government.noDocuments', 'No verified compliance documents are recorded.')}</Typography>
                                    ) : documents.map((document: any, index: number) => (
                                        <Button
                                            key={String(document.id || document.storagePath || index)}
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            disabled={!document.downloadUrl}
                                            href={document.downloadUrl || undefined}
                                            target={document.downloadUrl ? '_blank' : undefined}
                                            rel={document.downloadUrl ? 'noreferrer' : undefined}
                                            sx={{ justifyContent: 'flex-start', color: '#FFF', borderColor: 'rgba(255,255,255,0.1)' }}
                                        >
                                            {String(document.name || document.fileName || document.type || 'Compliance document')}
                                        </Button>
                                    ))}
                                </Stack>
                            </Paper>
                        </Stack>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default GovernmentPropertyPage;

