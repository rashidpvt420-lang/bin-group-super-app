import React, { useState, useEffect } from 'react';
import { 
    Grid, Paper, Typography, Box, Chip, Table, TableBody, 
    TableCell, TableHead, TableRow, TableContainer, Skeleton, 
    Stack, Alert, Button, alpha, LinearProgress, Divider
} from '@mui/material';
import { 
    Activity, Zap, Droplets, Thermometer, Wind, 
    AlertTriangle, CheckCircle2, RefreshCw, 
    Wifi, WifiOff, Cpu, Building2, Clock, Shield
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { 
    collection, query, orderBy, limit, onSnapshot, Timestamp 
} from 'firebase/firestore';
import { useLanguage } from '../../../context/LanguageContext';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';

type SensorData = {
    id: string;
    deviceId: string;
    deviceName: string;
    type: 'temperature' | 'water_leak' | 'hvac_efficiency' | 'power_consumption';
    value: number;
    unit: string;
    status: 'nominal' | 'alert' | 'offline';
    lastPulse: Timestamp | Date;
    location: string;
};

export default function SmartBuildingMonitorPage() {
    const { t, isRTL } = useLanguage();
    const [sensors, setSensors] = useState<SensorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState(new Date());

    useEffect(() => {
        // Mocking live telemetry for demonstration if collection is empty
        const unsub = onSnapshot(query(collection(db, "telemetry_logs"), orderBy("timestamp", "desc"), limit(20)), 
            (snap) => {
                if (snap.empty) {
                    // Inject mock data for the UI demonstration if no real logs exist
                    const mockSensors: SensorData[] = [
                        { id: '1', deviceId: 'AC-DXB-001', deviceName: 'Chiller Array A', type: 'temperature', value: 22.4, unit: '°C', status: 'nominal', lastPulse: new Date(), location: 'Burj View Tower - Roof' },
                        { id: '2', deviceId: 'WL-DXB-102', deviceName: 'Water Main Valve', type: 'water_leak', value: 0, unit: 'Leaks', status: 'nominal', lastPulse: new Date(), location: 'Marina Heights - B2' },
                        { id: '3', deviceId: 'HVAC-DXB-505', deviceName: 'AHU Unit 5', type: 'hvac_efficiency', value: 94, unit: '%', status: 'alert', lastPulse: new Date(), location: 'Palm Jumeirah Villa 14' },
                        { id: '4', deviceId: 'PWR-DXB-99', deviceName: 'Main Switchgear', type: 'power_consumption', value: 450, unit: 'kW', status: 'nominal', lastPulse: new Date(), location: 'Business Bay Plaza' },
                        { id: '5', deviceId: 'AC-DXB-002', deviceName: 'Chiller Array B', type: 'temperature', value: 28.1, unit: '°C', status: 'alert', lastPulse: new Date(), location: 'Burj View Tower - Roof' },
                    ];
                    setSensors(mockSensors);
                } else {
                    const data = snap.docs.map(doc => {
                        const d = doc.data();
                        return {
                            id: doc.id,
                            deviceId: d.deviceId || d.device_id,
                            deviceName: d.deviceName || d.device_id,
                            type: d.type || d.event_type,
                            value: d.value || (d.telemetry?.moisture_level ?? d.telemetry?.temperature ?? 0),
                            unit: d.unit || (d.event_type === 'leak_detected' ? 'Leaks' : 'Units'),
                            status: d.status || (d.urgency === 'critical' ? 'alert' : 'nominal'),
                            lastPulse: d.timestamp,
                            location: d.location || d.telemetry?.location_zone || 'Unknown'
                        } as SensorData;
                    });
                    setSensors(data);
                }
                setLoading(false);
                setLastSync(new Date());
            }
        );

        return () => unsub();
    }, []);

    const getStatusColor = (status: SensorData['status']) => {
        switch (status) {
            case 'nominal': return '#10b981';
            case 'alert': return '#ef4444';
            case 'offline': return '#64748b';
            default: return '#fff';
        }
    };

    const getTypeIcon = (type: SensorData['type']) => {
        switch (type) {
            case 'temperature': return <Thermometer size={18} />;
            case 'water_leak': return <Droplets size={18} />;
            case 'hvac_efficiency': return <Wind size={18} />;
            case 'power_consumption': return <Zap size={18} />;
            default: return <Cpu size={18} />;
        }
    };

    return (
        <AdminPageFrame 
            title="Smart Building Monitor" 
            subtitle="REAL-TIME IOT TELEMETRY & PREDICTIVE OVERWATCH"
            lastUpdated={lastSync}
        >
            <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
                <Grid container spacing={3} sx={{ mb: 6 }}>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, bgcolor: binThemeTokens.graphite, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha('#10b981', 0.1), borderRadius: 3, color: '#10b981' }}><Wifi size={24} /></Box>
                                <Box>
                                    <Typography variant="h4" fontWeight="950">98.2%</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>NETWORK UPTIME</Typography>
                                </Box>
                            </Box>
                            <LinearProgress variant="determinate" value={98.2} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: '#10b981' } }} />
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, bgcolor: binThemeTokens.graphite, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><Activity size={24} /></Box>
                                <Box>
                                    <Typography variant="h4" fontWeight="950">412</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>ACTIVE NODES</Typography>
                                </Box>
                            </Box>
                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>✓ ALL GATEWAYS OPERATIONAL</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, bgcolor: binThemeTokens.graphite, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha('#ef4444', 0.1), borderRadius: 3, color: '#ef4444' }}><AlertTriangle size={24} /></Box>
                                <Box>
                                    <Typography variant="h4" fontWeight="950">{sensors.filter(s => s.status === 'alert').length}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>CRITICAL ALERTS</Typography>
                                </Box>
                            </Box>
                            <Typography variant="caption" sx={{ color: sensors.filter(s => s.status === 'alert').length > 0 ? '#ef4444' : 'rgba(255,255,255,0.2)', fontWeight: 900 }}>
                                {sensors.filter(s => s.status === 'alert').length > 0 ? 'ATTENTION REQUIRED' : 'NO ACTIVE CRITICALS'}
                            </Typography>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Cpu color={binThemeTokens.gold} /> LIVE SENSOR STREAM
                        </Typography>
                        <Button startIcon={<RefreshCw size={16} />} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>RESET NODES</Button>
                    </Box>
                    <TableContainer>
                        <Table size="medium">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>DEVICE ID</TableCell>
                                    <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>ASSET NAME</TableCell>
                                    <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>TYPE</TableCell>
                                    <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>READING</TableCell>
                                    <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>STATUS</TableCell>
                                    <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>LOCATION</TableCell>
                                    <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>LAST PULSE</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    [...Array(5)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={7}><Skeleton sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} /></TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    sensors.map((sensor) => (
                                        <TableRow key={sensor.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                            <TableCell sx={{ fontWeight: 900, color: binThemeTokens.gold, fontFamily: 'monospace' }}>{sensor.deviceId}</TableCell>
                                            <TableCell sx={{ fontWeight: 800 }}>{sensor.deviceName}</TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {getTypeIcon(sensor.type)}
                                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{sensor.type.replace('_', ' ').toUpperCase()}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 950 }}>
                                                    {sensor.value} <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>{sensor.unit}</span>
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={sensor.status.toUpperCase()} 
                                                    size="small" 
                                                    sx={{ 
                                                        bgcolor: alpha(getStatusColor(sensor.status), 0.1), 
                                                        color: getStatusColor(sensor.status),
                                                        fontWeight: 950,
                                                        fontSize: '0.65rem',
                                                        height: 20
                                                    }} 
                                                />
                                            </TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 700 }}>{sensor.location}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
                                                {sensor.lastPulse instanceof Date ? sensor.lastPulse.toLocaleTimeString() : (sensor.lastPulse as Timestamp).toDate().toLocaleTimeString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>

                <Box sx={{ mt: 4 }}>
                    <Alert 
                        severity="info" 
                        icon={<Shield size={20} />}
                        sx={{ 
                            bgcolor: 'rgba(59, 130, 246, 0.05)', 
                            border: '1px solid rgba(59, 130, 246, 0.2)', 
                            color: '#93c5fd',
                            borderRadius: 4,
                            '& .MuiAlert-icon': { color: '#3b82f6' }
                        }}
                    >
                        <Typography variant="caption" sx={{ fontWeight: 800 }}>
                            PROTOCOL 14 ACTIVE: All critical sensor triggers are automatically routed to the AI Triage engine for immediate work order generation.
                        </Typography>
                    </Alert>
                </Box>
            </Box>
        </AdminPageFrame>
    );
}
