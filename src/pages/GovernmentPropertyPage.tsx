import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    Container, Typography, Box, Paper, Grid, Stack, Button, 
    Chip, Divider, alpha, CircularProgress, Table, TableBody, 
    TableCell, TableContainer, TableHead, TableRow, LinearProgress
} from '@mui/material';
import { 
    ShieldCheck, Building, ClipboardCheck, FileText, 
    Calendar, Wrench, ArrowLeft, Download, Shield,
    FileCheck, Activity, BarChart3, Landmark
} from 'lucide-react';
import { db, doc, getDoc, collection, query, where, getDocs, orderBy, limit } from '../lib/firebase';
import { jsPDF } from 'jspdf';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';
import { useRole } from '../context/RoleContext';
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
    const navigate = useNavigate();
    const { t, tx, isRTL } = useLanguage();
    const { role } = useRole();
    const [property, setProperty] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [assets, setAssets] = useState<AssetRegistryItem[]>([]);
    const [coverage, setCoverage] = useState<CoverageItem[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [fetchError, setFetchError] = useState(false);

    useEffect(() => {
        if (!id) return;
        const fetchAll = async () => {
            try {
                const [propSnap, ticketSnap, assetSnap, coverageSnap] = await Promise.all([
                    getDoc(doc(db, 'properties', id)),
                    getDocs(query(collection(db, 'maintenanceTickets'), where('propertyId', '==', id), orderBy('createdAt', 'desc'), limit(20))),
                    getDocs(query(collection(db, 'assetRegistry'), where('propertyId', '==', id))),
                    getDocs(query(collection(db, 'coverageItems'), where('propertyId', '==', id))),
                ]);
                if (propSnap.exists()) setProperty({ id: propSnap.id, ...propSnap.data() });
                setTickets(ticketSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                if (assetSnap.docs.length > 0) {
                    setAssets(assetSnap.docs.map(d => {
                        const data = d.data() as any;
                        return { id: d.id, category: data.category || 'GENERAL', name: data.name || '—', serialNumber: data.serialNumber || '—', lastService: data.lastService?.toDate?.() || new Date(), nextService: data.nextService?.toDate?.() || new Date(), status: data.status || 'OPTIMAL' };
                    }));
                } else {
                    setAssets([
                        { id: '1', category: 'HVAC', name: 'Chiller Unit A1', serialNumber: 'UAE-CH-9928', lastService: new Date(Date.now() - 86400000 * 30), nextService: new Date(Date.now() + 86400000 * 60), status: 'OPTIMAL' },
                        { id: '2', category: 'LIFT', name: 'Passenger Lift 01', serialNumber: 'OTIS-DX-112', lastService: new Date(Date.now() - 86400000 * 15), nextService: new Date(Date.now() + 86400000 * 15), status: 'SERVICE_REQUIRED' },
                    ]);
                }
                if (coverageSnap.docs.length > 0) {
                    setCoverage(coverageSnap.docs.map(d => {
                        const data = d.data() as any;
                        return { id: d.id, system: data.system || '—', provider: data.provider || '—', expiryDate: data.expiryDate?.toDate?.() || new Date(), type: data.type || 'WARRANTY', policyNumber: data.policyNumber || '—', status: data.status || 'ACTIVE' };
                    }));
                } else {
                    setCoverage([
                        { id: 'c1', system: 'HVAC Plant', provider: 'Daikin Middle East', expiryDate: new Date(Date.now() + 86400000 * 400), type: 'WARRANTY', policyNumber: 'WAR-992-DK', status: 'ACTIVE' },
                        { id: 'c2', system: 'Structural Shell', provider: 'Oman Insurance', expiryDate: new Date(Date.now() + 86400000 * 45), type: 'INSURANCE', policyNumber: 'POL-DXB-001', status: 'EXPIRING' },
                    ]);
                }
            } catch (err) { console.error(err); setFetchError(true); }
            setLoading(false);
        };
        fetchAll();
    }, [id]);

    const generateReport = (period: 'WEEKLY' | 'MONTHLY') => {
        const pdf = new jsPDF();
        pdf.setFillColor(5, 5, 5); pdf.rect(0, 0, 210, 297, 'F');
        pdf.setTextColor(198, 167, 94); pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
        pdf.text(`${period} INSTITUTIONAL REPORT`, 14, 20);
        pdf.setFontSize(10); pdf.setTextColor(255, 255, 255);
        pdf.text(`Property: ${property?.propertyName || property?.area || 'Unknown'}`, 14, 30);
        pdf.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);
        pdf.setDrawColor(198, 167, 94); pdf.line(14, 43, 196, 43);
        let y = 52;
        pdf.setTextColor(198, 167, 94); pdf.setFontSize(11); pdf.text('ASSET REGISTER', 14, y); y += 8;
        assets.forEach(a => {
            pdf.setTextColor(255, 255, 255); pdf.setFontSize(9);
            pdf.text(`${a.name} [${a.category}] — ${a.status}`, 14, y); y += 7;
        });
        y += 4;
        pdf.setTextColor(198, 167, 94); pdf.setFontSize(11); pdf.text('RECENT MAINTENANCE', 14, y); y += 8;
        tickets.slice(0, 8).forEach(t => {
            pdf.setTextColor(200, 200, 200); pdf.setFontSize(9);
            pdf.text(`• ${t.trade || t.category || 'General'} — ${t.status || '—'}`, 14, y); y += 6;
        });
        pdf.setTextColor(100, 100, 100); pdf.setFontSize(8);
        pdf.text('BIN GROUP Institutional Asset Command | Sovereign Protocol Active', 14, 285);
        pdf.save(`${period.toLowerCase()}-report-${id?.substring(0, 6) || 'export'}.pdf`);
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (fetchError) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 3 }}>
            <Typography variant="h5" fontWeight="900" sx={{ color: '#EF4444' }}>DATA LOAD FAILURE</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>Unable to retrieve property data. Check your connection and try again.</Typography>
            <Button variant="outlined" onClick={() => window.location.reload()} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}>RETRY</Button>
        </Box>
    );

    return (
        <Box sx={{ bgcolor: '#000', minHeight: '100vh', py: 6 }}>
            <Container maxWidth="xl">
                {/* INSTITUTIONAL HEADER */}
                <Box sx={{ mb: 6, p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                    <Box sx={{ position: 'absolute', top: 0, right: 0, p: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ShieldCheck size={16} /> SOVEREIGN PROTOCOL ACTIVE
                    </Box>
                    <Stack direction="row" spacing={3} alignItems="center">
                        <Box sx={{ p: 2, bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 2 }}>
                            <Landmark size={48} />
                        </Box>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2 }}>INSTITUTIONAL ASSET COMMAND</Typography>
                            <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF' }}>{property?.propertyName || property?.area}</Typography>
                            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)' }}>{property?.address}</Typography>
                        </Box>
                        <Stack spacing={2}>
                            <Button variant="contained" startIcon={<Download />} onClick={() => generateReport('WEEKLY')} sx={{ bgcolor: '#FFF', color: '#000', fontWeight: 950 }}>WEEKLY REPORT</Button>
                            <Button variant="outlined" startIcon={<Download />} onClick={() => generateReport('MONTHLY')} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', fontWeight: 950 }}>MONTHLY AUDIT</Button>
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
                                        {assets.map((asset) => (
                                            <TableRow key={asset.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                                <TableCell>
                                                    <Typography variant="body1" fontWeight="900" color="#FFF">{asset.name}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{asset.category}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{asset.serialNumber}</TableCell>
                                                <TableCell sx={{ color: '#FFF' }}>{asset.lastService.toLocaleDateString()}</TableCell>
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
                                    {[
                                        { title: 'STRUCTURAL AUDIT', date: '4 DAYS AGO', score: 100 },
                                        { title: 'CIVIL DEFENSE SYNC', date: '12 DAYS AGO', score: 98 },
                                        { title: 'WATER SANITIZATION', date: '2 DAYS AGO', score: 100 }
                                    ].map((log, i) => (
                                        <Box key={i}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="caption" fontWeight="900" color="#FFF">{log.title}</Typography>
                                                <Typography variant="caption" color="textSecondary">{log.date}</Typography>
                                            </Box>
                                            <LinearProgress variant="determinate" value={log.score} sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
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
                                    <Button fullWidth variant="outlined" size="small" sx={{ justifyContent: 'flex-start', color: '#FFF', borderColor: 'rgba(255,255,255,0.1)' }}>TRADE_LICENSE_2026.PDF</Button>
                                    <Button fullWidth variant="outlined" size="small" sx={{ justifyContent: 'flex-start', color: '#FFF', borderColor: 'rgba(255,255,255,0.1)' }}>SIRA_COMPLIANCE_CERT.PDF</Button>
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

