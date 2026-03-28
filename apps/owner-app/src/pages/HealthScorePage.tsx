// owner-app/src/pages/HealthScorePage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  Typography,
  Box,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Stack,
  Divider
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { binThemeTokens } from '../theme/binGroupTheme';
import { ShieldCheck, Activity, Database, AlertTriangle, Construction } from 'lucide-react';
import { db, collection, query, where, getDocs, limit } from '../lib/firebase';
import { useRole } from '../context/RoleContext';

interface HealthScoreData {
  date: string;
  score: number;
  openTickets: number;
  completedPPM: number;
}

interface PropertyHealth {
  propertyId: string;
  name: string;
  currentScore: number;
  trend: HealthScoreData[];
  scoreBreakdown: {
    openTickets: number;
    completedPPM: number;
    latePayments: number;
    tenantRating: number;
    responseTime: number;
  };
  components?: any[];
}

export default function HealthScorePage() {
  const { user, godMode } = useRole();
  const [selectedProperty, setSelectedProperty] = useState('');
  const [healthData, setHealthData] = useState<PropertyHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function fetchHealth() {
        if (!user) return;
        
        try {
            // Check if portfolioMetrics exist for this owner
            const metricsRef = collection(db, 'portfolioMetrics');
            const q = godMode 
                ? query(metricsRef, limit(1))
                : query(metricsRef, where('ownerId', '==', user.uid), limit(1));
            
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const data = snap.docs[0].data() as any;
                setHealthData({
                    propertyId: snap.docs[0].id,
                    name: data.name || 'Your Portfolio',
                    currentScore: data.currentScore || 0,
                    trend: data.trend || [],
                    scoreBreakdown: data.scoreBreakdown || {
                        openTickets: 0,
                        completedPPM: 0,
                        latePayments: 0,
                        tenantRating: 0,
                        responseTime: 0
                    },
                    components: data.components || []
                });
                setIsReady(true);
            } else {
                // Not ready for this user yet
                setIsReady(false);
            }
        } catch (err) {
            console.error("Health fetch failure:", err);
            setIsReady(false);
        } finally {
            setLoading(false);
        }
    }

    fetchHealth();
  }, [user, godMode]);

  if (loading) {
    return (
        <Container sx={{ py: 10, textAlign: 'center' }}>
            <Typography variant="h5" sx={{ color: binThemeTokens.gold }}>Scanning Asset Integrity Layers...</Typography>
        </Container>
    );
  }

  if (!isReady) {
    return (
        <Container sx={{ py: 20, textAlign: 'center' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                <Construction size={80} color={binThemeTokens.gold} />
            </Box>
            <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mb: 2 }}>
                ASSET INTELLIGENCE UNDER CONSTRUCTION
            </Typography>
            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, maxWidth: 600, mx: 'auto' }}>
                The real-time auditing engine is currently synchronizing with your property nodes. 
                Full integrity reporting will be available once the initial lifecycle scan is complete.
            </Typography>
            <Button 
                variant="outlined" 
                onClick={() => window.history.back()}
                sx={{ mt: 6, borderColor: binThemeTokens.gold, color: binThemeTokens.gold }}
            >
                RETURN TO DASHBOARD
            </Button>
        </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ mb: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
            <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>Asset Integrity Analysis</Typography>
            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>Real-time health auditing and digital twin synchronization.</Typography>
        </Box>
        <FormControl sx={{ minWidth: 350 }}>
            <InputLabel sx={{ color: binThemeTokens.gold }}>SELECT ASSET NODE</InputLabel>
            <Select
                value={healthData?.propertyId}
                label="SELECT ASSET NODE"
                sx={{ 
                    bgcolor: 'rgba(22, 22, 24, 0.7)', 
                    color: binThemeTokens.textPrimary,
                    borderRadius: 3,
                    border: `1px solid rgba(198, 167, 94, 0.3)`,
                    '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '&:hover': { bgcolor: 'rgba(198, 167, 94, 0.05)' }
                }}
            >
                <MenuItem value={healthData?.propertyId}>{healthData?.name}</MenuItem>
            </Select>
        </FormControl>
      </Box>

      <Grid container spacing={6}>
        <Grid item xs={12} md={4}>
            <Card sx={{ 
                bgcolor: '#0B0B0C', 
                borderRadius: 8, 
                border: `1px solid ${binThemeTokens.gold}`,
                boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
                textAlign: 'center',
                p: 4,
                position: 'relative',
                overflow: 'hidden'
            }}>
                <Box sx={{ 
                    position: 'absolute', top: -40, left: -40, opacity: 0.1, 
                    color: binThemeTokens.gold, transform: 'scale(4)' 
                }}>
                    <ShieldCheck />
                </Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 3 }}>INTEGRITY SCORE</Typography>
                <Box sx={{ 
                    my: 4, width: 180, height: 180, borderRadius: '50%', 
                    border: `8px solid rgba(198, 167, 94, 0.1)`, 
                    borderTopColor: binThemeTokens.gold,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    mx: 'auto',
                    boxShadow: '0 0 50px rgba(198, 167, 94, 0.2)'
                }}>
                    <Typography variant="h1" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>{healthData?.currentScore}</Typography>
                </Box>
                <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mb: 1.5 }}>OPTIMAL CONDITION</Typography>
                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, px: 4 }}>
                    Your asset is currently operating within the **Sovereign Efficiency Envelope**. 
                    All mission-critical systems verified.
                </Typography>
                <Divider sx={{ my: 4, borderColor: 'rgba(198, 167, 94, 0.1)' }} />
                <Button 
                    variant="contained" 
                    fullWidth
                    sx={{ 
                        background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                        color: '#0B0B0C', 
                        fontWeight: 900, 
                        py: 2, borderRadius: 3
                    }}>
                    RE-VALIDATE NOW
                </Button>
            </Card>
        </Grid>

        <Grid item xs={12} md={8}>
            <Grid container spacing={4} sx={{ mb: 4 }}>
                {[
                    { label: 'OPEN TICKETS', val: healthData?.scoreBreakdown.openTickets !== undefined ? `-${healthData?.scoreBreakdown.openTickets}` : '0', color: '#ff4d4d', icon: <AlertTriangle /> },
                    { label: 'COMPLETED PPM', val: healthData?.scoreBreakdown.completedPPM !== undefined ? `+${healthData?.scoreBreakdown.completedPPM}%` : '0%', color: binThemeTokens.gold, icon: <ShieldCheck /> },
                    { label: 'TENANT RATING', val: healthData?.scoreBreakdown.tenantRating !== undefined ? `+${healthData?.scoreBreakdown.tenantRating}` : '5.0', color: binThemeTokens.goldLight, icon: <Activity /> },
                    { label: 'AVG MTTR', val: healthData?.scoreBreakdown.responseTime !== undefined ? `${healthData?.scoreBreakdown.responseTime}h` : '0h', color: binThemeTokens.gold, icon: <Activity /> },
                ].map((kpi, i) => (
                    <Grid item xs={12} sm={6} md={3} key={i}>
                        <Paper sx={{ 
                            p: 3, 
                            bgcolor: 'rgba(22, 22, 24, 0.7)', 
                            borderRadius: 5, 
                            border: '1px solid rgba(255,255,255,0.05)',
                            textAlign: 'center'
                        }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 1 }}>{kpi.label}</Typography>
                            <Typography variant="h5" fontWeight="900" sx={{ color: kpi.color, mt: 1 }}>{kpi.val}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ 
                p: 4, 
                borderRadius: 6, 
                bgcolor: 'rgba(22, 22, 24, 0.6)', 
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 30px 60px rgba(0,0,0,0.4)'
            }}>
                <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.gold, letterSpacing: 1 }}>HEALTH VELOCITY (30D)</Typography>
                <Box sx={{ height: 350, width: '100%' }}>
                    <ResponsiveContainer>
                        <LineChart data={healthData?.trend || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="date" stroke={binThemeTokens.textSecondary} fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis domain={[0, 100]} stroke={binThemeTokens.textSecondary} fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#161618', border: '1px solid rgba(198,167,94,0.2)', borderRadius: 12, color: '#fff' }}
                                itemStyle={{ color: binThemeTokens.gold }}
                            />
                            <Line 
                                type="monotone" 
                                dataKey="score" 
                                stroke={binThemeTokens.gold} 
                                strokeWidth={4} 
                                dot={{ fill: binThemeTokens.gold, strokeWidth: 2, r: 6 }}
                                activeDot={{ r: 8, stroke: binThemeTokens.goldLight, strokeWidth: 4 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </Box>
            </Paper>
        </Grid>
      </Grid>

      {/* Digital Twin Layer - Only show if components available */}
      {healthData?.components && healthData.components.length > 0 && (
        <Box sx={{ mt: 10 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                <Database color={binThemeTokens.gold} size={28} />
                <Typography variant="h5" sx={{ fontWeight: 900, color: binThemeTokens.textPrimary, letterSpacing: 1 }}>DIGITAL TWIN COMPONENT REGISTRY</Typography>
            </Stack>
            <TableContainer component={Paper} sx={{ 
                bgcolor: 'rgba(22, 22, 24, 0.6)', 
                borderRadius: 6, 
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 30px 60px rgba(0,0,0,0.3)'
            }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                        <TableRow>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>COMPONENT NODE</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>ENTITY SERIAL</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>INTEGRITY</TableCell>
                            <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5 }}>LIFECYCLE STATUS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {healthData.components.map((asset: any, i: number) => (
                            <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                <TableCell sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>{asset.node}</TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', color: binThemeTokens.textSecondary, fontSize: '0.85rem' }}>{asset.serial}</TableCell>
                                <TableCell sx={{ color: binThemeTokens.goldLight, fontWeight: 900 }}>{asset.condition}</TableCell>
                                <TableCell>
                                    <Chip 
                                        label={asset.status} 
                                        size="small" 
                                        sx={{ 
                                            fontSize: '0.65rem', fontWeight: 900,
                                            bgcolor: 'rgba(198, 167, 94, 0.1)', color: binThemeTokens.gold,
                                            border: '1px solid rgba(198, 167, 94, 0.4)'
                                        }} 
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
      )}

      <Box sx={{ mt: 8, mb: 10 }}>
        <Button 
            fullWidth 
            variant="outlined" 
            sx={{ 
                py: 3, 
                borderRadius: 4, 
                border: `2px dashed rgba(198, 167, 94, 0.4)`, 
                color: binThemeTokens.gold,
                fontWeight: 900,
                fontSize: '1.1rem',
                letterSpacing: 1,
                '&:hover': { bgcolor: 'rgba(198,167,94,0.05)', borderColor: binThemeTokens.gold }
            }}
        >
            SYNC ASSET INTEGRITY WITH NATIONAL SOVEREIGN REGISTRY (0x SHA256) →
        </Button>
      </Box>
    </Container>
  );
}
