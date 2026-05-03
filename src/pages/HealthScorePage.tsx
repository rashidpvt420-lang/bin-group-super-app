// owner-app/src/pages/HealthScorePage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container, Card, Typography, Box, Grid, Paper, Chip, Select,
  MenuItem, FormControl, InputLabel, Button, Stack, Divider,
  LinearProgress, CircularProgress, alpha
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { binThemeTokens } from '../theme/binGroupTheme';
import { ShieldCheck, Activity, Database, AlertTriangle, Construction, AlertCircle, ArrowLeft } from 'lucide-react';
import { db, collection, query, where, getDocs, limit, doc } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { calculateBuildingHealth } from '../utils/buildingHealthEngine';
import type { BuildingHealthReport } from '../utils/buildingHealthEngine';

export default function HealthScorePage() {
  const { user } = useRole();
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [report, setReport] = useState<BuildingHealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
        if (!user) return;
        try {
            const propSnap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', user.uid)));
            const props = propSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setProperties(props);
            
            if (props.length > 0) {
                const p = props[0] as any;
                setSelectedId(p.id);
                await fetchReportForProperty(p);
            }
        } catch (err) { console.error("Data fetch failure:", err); }
        setLoading(false);
    }
    fetchData();
  }, [user]);

  const fetchReportForProperty = async (p: any) => {
      const ticketSnap = await getDocs(query(collection(db, 'maintenanceTickets'), where('propertyId', '==', p.id)));
      const tickets = ticketSnap.docs.map(d => d.data());

      const r = calculateBuildingHealth({
          age: p.age || 5,
          floors: p.floors || 1,
          units: p.units || 1,
          propertyType: p.propertyType || 'Villa',
          hvacType: p.hvacType || 'DX',
          liftCount: p.lifts || 0,
          pool: !!p.pool,
          complaintFrequency: tickets.length / 3,
          unresolvedTickets: tickets.filter(t => !['COMPLETED', 'RESOLVED', 'CLOSED'].includes(t.status)).length,
          emergencyIncidents: tickets.filter(t => t.priority === 'EMERGENCY').length,
          maintenanceLoad: 50
      });
      setReport(r);
  };

  const handleSelectProperty = async (id: string) => {
      setSelectedId(id);
      const p = properties.find(prop => prop.id === id);
      if (p) await fetchReportForProperty(p);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 20 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  if (properties.length === 0) return (
      <Container sx={{ py: 20, textAlign: 'center' }}>
          <Construction size={80} color={binThemeTokens.gold} style={{ opacity: 0.5, marginBottom: 24 }} />
          <Typography variant="h3" fontWeight="900" sx={{ color: '#FFF' }}>ASSET NODES NOT FOUND</Typography>
          <Button variant="outlined" onClick={() => window.history.back()} sx={{ mt: 4, color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>RETURN TO DASHBOARD</Button>
      </Container>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ mb: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
            <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1 }}>Building Performance Index (BPI)</Typography>
            <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary }}>Institutional asset integrity layers and decay monitoring.</Typography>
        </Box>
        <FormControl sx={{ minWidth: 350 }}>
            <InputLabel sx={{ color: binThemeTokens.gold }}>SELECT ASSET NODE</InputLabel>
            <Select
                value={selectedId}
                label="SELECT ASSET NODE"
                onChange={(e) => handleSelectProperty(e.target.value as string)}
                sx={{ 
                    bgcolor: 'rgba(22, 22, 24, 0.7)', color: '#FFF',
                    borderRadius: 3, border: `1px solid rgba(198, 167, 94, 0.3)`,
                    '.MuiOutlinedInput-notchedOutline': { border: 'none' }
                }}
            >
                {properties.map(p => <MenuItem key={p.id} value={p.id}>{p.propertyName || p.area}</MenuItem>)}
            </Select>
        </FormControl>
      </Box>

      <Grid container spacing={6}>
        <Grid item xs={12} md={4}>
            <Card sx={{ 
                bgcolor: '#0B0B0C', borderRadius: 8, border: `1px solid ${binThemeTokens.gold}`,
                p: 4, textAlign: 'center', position: 'relative', overflow: 'hidden'
            }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, letterSpacing: 3 }}>SOVEREIGN BPI SCORE</Typography>
                <Box sx={{ 
                    my: 4, width: 180, height: 180, borderRadius: '50%', 
                    border: `8px solid rgba(198, 167, 94, 0.1)`, borderTopColor: binThemeTokens.gold,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto',
                    boxShadow: '0 0 50px rgba(198, 167, 94, 0.2)'
                }}>
                    <Typography variant="h1" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>{report?.overallScore}</Typography>
                </Box>
                <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF', mb: 1.5 }}>{report?.label.toUpperCase()} CONDITION</Typography>
                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4 }}>Risk Level: **{report?.riskLevel}**</Typography>
                <Button variant="contained" fullWidth sx={{ background: binThemeTokens.gold, color: '#000', fontWeight: 900, py: 2, borderRadius: 3 }}>DOWNLOAD AUDIT PDF</Button>
            </Card>
        </Grid>

        <Grid item xs={12} md={8}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>SYSTEM BREAKDOWN</Typography>
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {report?.systems.map((s, i) => (
                    <Grid item xs={12} sm={6} key={i}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(22, 22, 24, 0.7)', borderRadius: 4, border: `1px solid ${alpha(s.color, 0.2)}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="subtitle2" fontWeight="900" color="#FFF">{s.system.toUpperCase()}</Typography>
                                <Typography variant="subtitle2" fontWeight="900" sx={{ color: s.color }}>{s.score}%</Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={s.score} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: s.color } }} />
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.02), border: `1px dashed ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 6 }}>
                <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 3 }}>INTELLIGENCE RECOMMENDATIONS</Typography>
                <Stack spacing={2}>
                    {report?.recommendations.map((rec, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 2 }}>
                            <AlertCircle color={binThemeTokens.gold} size={20} />
                            <Typography variant="body1" sx={{ color: '#FFF' }}>{rec}</Typography>
                        </Box>
                    ))}
                </Stack>
            </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
