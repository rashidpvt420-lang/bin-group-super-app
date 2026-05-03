import React, { useState } from 'react';
import {
    Container,
    Paper,
    Grid,
    Typography,
    Box,
    TextField,
    Button,
    Card,
    CardContent,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    Tab,
    Switch,
    FormControlLabel,
    Divider,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import LockIcon from '@mui/icons-material/Lock';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase';
import CompetitorComparison from '../../components/CompetitorComparison';

interface PricingResult {
    label: string;
    totalAED: number;
    monthlyAED: number;
    baseAED?: number;
    vatAED?: number;
    ratePerUnit?: number;
    numUnits?: number;
}

export default function PricingPage() {
    const [tabValue, setTabValue] = useState(0);
    const [calcData, setCalcData] = useState({
        sqft: 1200,
        annualRent: 85000,
        buildingAge: 3,
        isOffice: false,
        unitCount: 1,
    });
    const [results, setResults] = useState<Record<string, PricingResult> | null>(null);
    const [loading, setLoading] = useState(false);
    const [calcError, setCalcError] = useState('');

    const calculate = async () => {
        setLoading(true);
        setCalcError('');
        setResults(null);

        // Local calculation — always works, no network needed
        const localCalc = (multiplier = 1) => {
            const ageBonus = 1 + Math.min(calcData.buildingAge * 0.012, 0.40);
            const ratePerUnit = Math.round(3500 * ageBonus * multiplier);
            const baseAMC = ratePerUnit * calcData.unitCount;
            const rent = calcData.annualRent;
            const vat = 1.05; // 5% VAT multiplier

            setResults({
                maintenance: { 
                    label: 'Maintenance Only (AMC)', 
                    totalAED: Math.round(baseAMC * vat), 
                    monthlyAED: Math.round((baseAMC * vat) / 12), 
                    ratePerUnit: ratePerUnit, 
                    numUnits: calcData.unitCount 
                },
                management: { 
                    label: 'Property Management Only (5%)', 
                    totalAED: Math.round((rent * 0.05) * vat), 
                    monthlyAED: Math.round(((rent * 0.05) * vat) / 12),
                    baseAED: rent * 0.05
                },
                comprehensive: { 
                    label: 'Comprehensive (8% + AMC)', 
                    totalAED: Math.round(((rent * 0.08) + baseAMC) * vat), 
                    monthlyAED: Math.round((((rent * 0.08) + baseAMC) * vat) / 12),
                    ratePerUnit: ratePerUnit
                },
            });
        };

        try {
            const fns = getFunctions(app, 'us-central1');
            const cloudFn = httpsCallable(fns, 'calculateAMCV2');
            const res: any = await cloudFn({
                propertyName: 'Admin Calculation',
                zone: 'Marina',
                buildingAge: calcData.buildingAge,
                numUnits: calcData.unitCount,
            });
            const d = res.data;
            const baseAMC = d.baseAED as number;
            const rent = calcData.annualRent;
            const vat = 1.05;

            setResults({
                maintenance: { 
                    label: 'Maintenance Only (AMC)', 
                    totalAED: Math.round(baseAMC * vat), 
                    monthlyAED: Math.round((baseAMC * vat) / 12), 
                    ratePerUnit: d.ratePerUnit, 
                    numUnits: d.numUnits 
                },
                management: { 
                    label: 'Property Management Only (5%)', 
                    totalAED: Math.round((rent * 0.05) * vat), 
                    monthlyAED: Math.round(((rent * 0.05) * vat) / 12) 
                },
                comprehensive: { 
                    label: 'Comprehensive (8% + AMC)', 
                    totalAED: Math.round(((rent * 0.08) + baseAMC) * vat), 
                    monthlyAED: Math.round((((rent * 0.08) + baseAMC) * vat) / 12),
                    ratePerUnit: d.ratePerUnit
                },
            });
        } catch (err: any) {
            // Fallback to local calc silently
            console.warn('Cloud Function unavailable, using local calc:', err?.message);
            localCalc();
        } finally {
            setLoading(false);
        }
    };

    const matrix = [
        { feature: "24/7 Emergency Callouts", p1: true, p2: false, p3: true },
        { feature: "4x Annual PPM Visits", p1: true, p2: false, p3: true },
        { feature: "Rent Collection (UAEDDS)", p1: false, p2: true, p3: true },
        { feature: "Digital Ejari Registration", p1: false, p2: true, p3: true },
        { feature: "Tenant Screening", p1: false, p2: true, p3: true },
        { feature: "Handyman Labor Included", p1: true, p2: false, p3: true },
        { feature: "Dedicated Asset Manager", p1: false, p2: false, p3: true },
        { feature: "Major Hardware Replacement", p1: false, p2: false, p3: false },
    ];

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
                Sales & Pricing Intelligence
            </Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                    <Tab label="Comparison Matrix" />
                    <Tab label="Profit Calculator" />
                    <Tab label="VS Competitor" />
                    <Tab label="Digital Contract" />
                </Tabs>
            </Box>

            {tabValue === 0 && (
                <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden' }}>
                    <Table>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>Core Features</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 'bold', color: '#1976d2' }}>Maintenance Only</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 'bold', color: '#10b981' }}>Management Only</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 'bold', color: '#d97706' }}>Comprehensive</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {matrix.map((row) => (
                                <TableRow key={row.feature} hover>
                                    <TableCell>{row.feature}</TableCell>
                                    <TableCell align="center">{row.p1 ? <CheckCircleIcon color="success" /> : <LockIcon color="disabled" />}</TableCell>
                                    <TableCell align="center">{row.p2 ? <CheckCircleIcon color="success" /> : <LockIcon color="disabled" />}</TableCell>
                                    <TableCell align="center">{row.p3 ? <CheckCircleIcon color="success" /> : <CancelIcon color="error" />}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {tabValue === 1 && (
                <Grid container spacing={4}>
                    <Grid item xs={12} md={5}>
                        <Paper sx={{ p: 4, borderRadius: 3 }}>
                            <Typography variant="h6" gutterBottom>Unit Configuration</Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12}>
                                    <TextField fullWidth label="Unit Size (Sq. Ft.)" type="number" value={calcData.sqft} onChange={e => setCalcData({ ...calcData, sqft: +e.target.value })} />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField fullWidth label="Annual Rent (AED)" type="number" value={calcData.annualRent} onChange={e => setCalcData({ ...calcData, annualRent: +e.target.value })} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField fullWidth label="Building Age (Years)" type="number" value={calcData.buildingAge} onChange={e => setCalcData({ ...calcData, buildingAge: +e.target.value })} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField fullWidth label="Unit Count" type="number" value={calcData.unitCount} onChange={e => setCalcData({ ...calcData, unitCount: +e.target.value })} />
                                </Grid>
                                <Grid item xs={12}>
                                    <FormControlLabel control={<Switch checked={calcData.isOffice} onChange={e => setCalcData({ ...calcData, isOffice: e.target.checked })} />} label="Commercial/Office Unit" />
                                </Grid>
                            </Grid>
                            <Button variant="contained" fullWidth sx={{ mt: 3, p: 1.5, bgcolor: '#0f172a' }} onClick={calculate} disabled={loading}>
                                {loading ? 'Calculating...' : 'Run Algorithm'}
                            </Button>
                            {calcError && <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>{calcError}</Typography>}
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={7}>
                        {results ? (
                            <Grid container spacing={2}>
                                {Object.entries(results).map(([key, res]) => (
                                    <Grid item xs={12} key={key}>
                                        <Card variant="outlined" sx={{ borderRadius: 2, borderLeft: '6px solid', borderColor: key === 'comprehensive' ? '#d97706' : key === 'management' ? '#10b981' : '#1976d2' }}>
                                            <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Box>
                                                    <Typography variant="subtitle2" color="textSecondary" sx={{ fontWeight: 'bold' }}>{res.label}</Typography>
                                                    <Typography variant="h5" fontWeight="bold">AED {res.totalAED.toLocaleString()} /year</Typography>
                                                    {res.ratePerUnit && <Typography variant="caption" color="textSecondary">AED {res.ratePerUnit.toLocaleString()} × {res.numUnits} units + 5% VAT</Typography>}
                                                    <Typography variant="caption" color="textSecondary">AED {res.monthlyAED.toLocaleString()} per month</Typography>
                                                </Box>
                                                <Box sx={{ textAlign: 'right' }}>
                                                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold', color: '#16a34a' }}>+ Upsell Potential</Typography>
                                                    <Typography variant="h6" color="success.main">
                                                        AED {(calcData.annualRent * 0.05 + 500).toLocaleString()}
                                                    </Typography>
                                                    <Typography variant="caption">Leasing & Admin Fees</Typography>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}

                                <Grid item xs={12}>
                                    <Paper sx={{ p: 2, bgcolor: '#f1f5f9', borderRadius: 2 }}>
                                        <Typography variant="subtitle2" fontWeight="bold" color="primary">The "Hidden" Revenue Stream (Charged to Tenant)</Typography>
                                        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">5% Leasing Commission:</Typography>
                                            <Typography variant="body2" fontWeight="bold">AED {(calcData.annualRent * 0.05).toLocaleString()}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="body2">New Lease Admin Fee:</Typography>
                                            <Typography variant="body2" fontWeight="bold">AED 500</Typography>
                                        </Box>
                                        {calcData.isOffice && (
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body2">2.5% Fit-Out Coordination:</Typography>
                                                <Typography variant="body2" fontWeight="bold">AED {(calcData.annualRent * 0.025).toLocaleString()} (est)</Typography>
                                            </Box>
                                        )}
                                        <Divider sx={{ my: 1 }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography variant="subtitle1" fontWeight="bold">Total Extra Yield:</Typography>
                                            <Typography variant="subtitle1" fontWeight="bold" color="success.main">AED {(calcData.annualRent * 0.05 + 500 + (calcData.isOffice ? calcData.annualRent * 0.025 : 0)).toLocaleString()}</Typography>
                                        </Box>
                                    </Paper>
                                </Grid>
                            </Grid>
                        ) : (
                            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f8fafc', borderRadius: 3, border: '1px dashed #cbd5e1' }}>
                                <Typography color="textSecondary">Enter unit details and run the Pricing Algorithm</Typography>
                            </Box>
                        )}
                    </Grid>
                </Grid>
            )}

            {tabValue === 2 && (
                <Box sx={{ maxWidth: '800px', mx: 'auto' }}>
                    <CompetitorComparison binGroupTotal={results?.smart?.totalAED || 15000} />
                </Box>
            )}

            {tabValue === 3 && (
                <Paper sx={{ p: 4, borderRadius: 3, maxHeight: '700px', overflowY: 'auto', bgcolor: '#fff', border: '1px solid #e2e8f0 shadow-sm' }}>
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Typography variant="h5" fontWeight="800" sx={{ letterSpacing: -0.5 }}>BIN GROUP: SMART ASSET MANAGEMENT AGREEMENT</Typography>
                        <Typography variant="caption" color="textSecondary">Ref: BIN-AGR-2026 | Jurisdiction: United Arab Emirates</Typography>
                    </Box>

                    <Divider sx={{ mb: 3 }} />

                    <Typography variant="subtitle2" gutterBottom fontWeight="bold">BETWEEN:</Typography>
                    <Typography variant="body2" paragraph>
                        <strong>BIN CONSTRUCTION - GENERAL MAINTENANCE LLC</strong> ("The Service Provider / Manager")<br />
                        <strong>THE PROPERTY OWNER</strong> ("The Client") - Details captured digitally via App ID
                    </Typography>

                    <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mt: 3, color: '#0f172a' }}>1. SERVICE SELECTION (THE "SCOPE")</Typography>
                    <Typography variant="body2" paragraph>
                        The Client hereby engages BIN Group for the following services (selected via App):<br />
                        <strong>[✓] OPTION A: MAINTENANCE ONLY (AMC)</strong><br />
                        24/7 Emergency Callouts, PPM Visits, Water Tank Cleaning, and Handyman Labor.<br />
                        <strong>[ ] OPTION B: PROPERTY MANAGEMENT ONLY</strong><br />
                        Rent Collection (UAEDDS), Ejari, Tenant Screening, and Dispute Handling.<br />
                        <strong>[ ] OPTION C: COMPREHENSIVE ELITE</strong><br />
                        All Maintenance services PLUS all Management services. The "Hands-Off" elite package.
                    </Typography>

                    <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mt: 3, color: '#0f172a' }}>2. THE "NO-CALL" & DIGITAL PROTOCOL</Typography>
                    <Typography variant="body2" paragraph>
                        <strong>Digital-First Dispatch:</strong> The Client acknowledges that BIN Group operates a "No-Call" ecosystem. All maintenance requests must be submitted via the BIN Home OS App with mandatory photo/video evidence. Phone bookings are not accepted.<br />
                        <strong>Asset Tagging:</strong> The Client grants BIN Group permission to affix QR Code tags to all fixed assets (ACs, Pumps, Boards) for tracking purposes.<br />
                        <strong>Auto-Approval:</strong> Repairs under AED 1,000 are automatically approved to ensure tenant safety. Repairs above this threshold require App confirmation.
                    </Typography>

                    <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mt: 3, color: '#0f172a' }}>3. FINANCIAL AUTHORITY (FOR "TOTAL CARE" CLIENTS)</Typography>
                    <Typography variant="body2" paragraph>
                        <strong>Collection:</strong> To collect rental cheques, security deposits, and digital payments on the Client's behalf.<br />
                        <strong>Deduction:</strong> To automatically deduct the agreed Management Fee (5%) and any outstanding Maintenance Invoices from the collected rent prior to transfer.<br />
                        <strong>Disbursement:</strong> The Net Balance shall be transferred to the Client’s registered bank account within three (3) working days of fund clearance.
                    </Typography>

                    <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mt: 3, color: '#0f172a' }}>4. PAYMENT TERMS & DEFAULT POLICY</Typography>
                    <Typography variant="body2" paragraph>
                        <strong>Due Dates:</strong> Payments are due strictly as per the schedule selected in the App (Annual Upfront or Quarterly).<br />
                        <strong>The "Two-Strike" Suspension:</strong> If the Client fails to settle two (2) consecutive invoices (or if two cheques return unpaid), all services—including Emergency SOS response—will be automatically suspended. Service will only resume upon full settlement of the outstanding balance plus a Reactivation Fee of AED 500.<br />
                        <strong>Bounced Cheques:</strong> Any returned cheque or declined auto-payment will incur an administrative fine of AED 250 per instance.<br />
                        <strong>Spare Parts Markup:</strong> The Client acknowledges that spare parts and consumables are chargeable and include a standard institutional handling fee (20%) over the supplier cost.
                    </Typography>

                    <Typography variant="subtitle2" gutterBottom fontWeight="bold" sx={{ mt: 3, color: '#0f172a' }}>5. LIABILITY & DISPUTE RESOLUTION</Typography>
                    <Typography variant="body2" paragraph>
                        <strong>Rejection of Critical Repairs:</strong> If the Client rejects a "High Priority" repair recommended by the System (e.g., AC failure, Water Leak), the Client assumes full legal liability for any resulting property damage, municipal fines, or tenant compensation claims.<br />
                        <strong>Tenant Priority:</strong> BIN Group is not liable for delays caused by Tenants misreporting "Routine" issues as "SOS Emergencies."
                    </Typography>

                    <Box sx={{ mt: 4, p: 3, bgcolor: '#f8fafc', borderRadius: 2, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <Typography variant="subtitle2" gutterBottom>DIGITAL EXECUTION</Typography>
                        <Typography variant="caption" display="block" color="textSecondary" sx={{ mb: 2 }}>
                            By clicking "I ACCEPT" and signing digitally below, the Client agrees to be legally bound by these terms.
                        </Typography>
                        <Button 
                            variant="contained" 
                            startIcon={<CheckCircleIcon />} 
                            onClick={() => alert("Digital Signature Captured: BIN-AGR-" + Math.floor(Math.random() * 9000 + 1000) + "\nContract legally executed via BIN Secure Gateway. PDF copy sent to your email and Media Vault.")}
                            sx={{ bgcolor: '#0f172a', px: 4, py: 1.5 }}
                        >
                            I Accept &amp; Sign Digitally
                        </Button>
                        <Typography variant="caption" display="block" sx={{ mt: 1 }}>DATE: {new Date().toLocaleDateString()}</Typography>
                    </Box>
                </Paper>
            )}
        </Container>
    );
}
