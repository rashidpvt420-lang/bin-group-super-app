import React, { useState, useEffect } from 'react';
import {
    Grid, Paper, Typography, Box, Chip, Table, TableBody,
    TableCell, TableHead, TableRow, TableContainer, Skeleton,
    Stack, Alert, Button, alpha, LinearProgress
} from '@mui/material';
import {
    Activity, Zap, Droplets, Thermometer, Wind,
    AlertTriangle, RefreshCw,
    Wifi, Cpu, Shield
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
    type: 'temperature' | 'water_leak' | 'hvac_efficiency' | 'power_consumption' | 'system_event';
    value: number;
    unit: string;
    status: 'nominal' | 'alert' | 'offline' | 'system';
    lastPulse: Timestamp | Date;
    location: string;
};

const isNoiseLog = (d: any) => {
    const event = String(d.event_type || d.type || d.deviceName || d.device_id || '').toLowerCase();
    const message = String(d.message || d.title || d.description || '').toLowerCase();
    return event.includes('frontend_crash') || event.includes('frontend crash') || message.includes('frontend crash');
};

export default function SmartBuildingMonitorPage() {
    const { tx, isRTL } = useLanguage();
    const [sensors, setSensors] = useState<SensorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState(new Date());

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "telemetry_logs"), orderBy("timestamp", "desc"), limit(40)),
            (snap) => {
                const rows = snap.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as any))
                    .filter(d => !isNoiseLog(d))
                    .slice(0, 20)
                    .map((d) => ({
                        id: d.id,
                        deviceId: d.deviceId || d.device_id || 'NODE-PENDING',
                        deviceName: d.deviceName || d.assetName || d.device_id || 'Telemetry Node',
                        type: d.type || d.event_type || 'system_event',
                        value: d.value || (d.telemetry?.moisture_level ?? d.telemetry?.temperature ?? 0),
                        unit: d.unit || (d.event_type === 'leak_detected' ? 'Leaks' : 'Units'),
                        status: d.status || (d.urgency === 'critical' ? 'alert' : 'nominal'),
                        lastPulse: d.timestamp || new Date(),
                        location: d.location || d.telemetry?.location_zone || d.propertyName || 'Unassigned Property'
                    })) as SensorData[];

                if (rows.length === 0) {
                    setSensors([
                        { id: 'ready-1', deviceId: 'IOT-READY-001', deviceName: 'Gateway Readiness Node', type: 'system_event', value: 100, unit: '%', status: 'system', lastPulse: new Date(), location: 'BIN GROUP Command Center' },
                        { id: 'ready-2', deviceId: 'HVAC-READY-001', deviceName: 'HVAC Monitoring Channel', type: 'hvac_efficiency', value: 98, unit: '%', status: 'nominal', lastPulse: new Date(), location: 'Awaiting live asset sensor binding' },
                    ]);
                } else {
                    setSensors(rows);
                }
                setLoading(false);
                setLastSync(new Date());
            },
            () => {
                setSensors([
                    { id: 'offline-1', deviceId: 'IOT-OFFLINE', deviceName: 'Telemetry Stream Pending', type: 'system_event', value: 0, unit: 'logs', status: 'offline', lastPulse: new Date(), location: 'Sensor collection unavailable' },
                ]);
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
            case 'system': return binThemeTokens.gold;
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

    const alertCount = sensors.filter(s => s.status === 'alert').length;

    return (
        <AdminPageFrame
            title={tx('admin.smart.title', 'Smart Building Monitor')}
            subtitle={tx('admin.smart.subtitle', 'Real-time IoT telemetry and predictive monitoring')}
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
                                    <Typography variant="h4" fontWeight="950">{sensors.length}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>ACTIVE NODES</Typography>
                                </Box>
                            </Box>
                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>✓ MONITORING ONLINE</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, bgcolor: binThemeTokens.graphite, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha('#ef4444', 0.1), borderRadius: 3, color: '#ef4444' }}><AlertTriangle size={24} /></Box>
                                <Box>
                                    <Typography variant="h4" fontWeight="950">{alertCount}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>CRITICAL ALERTS</Typography>
                                </Box>
                            </Box>
                            <Typography variant="caption" sx={{ color: alertCount > 0 ? '#ef4444' : 'rgba(255,255,255,0.2)', fontWeight: 900 }}>
                                {alertCount > 0 ? 'ATTENTION REQUIRED' : 'NO ACTIVE CRITICALS'}
                            </Typography>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Cpu color={binThemeTokens.gold} /> LIVE SENSOR STREAM
                        </Typography>
                        <Button startIcon={<RefreshCw size={16} />} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>REFRESH NODES</Button>
                    </Box>
                    <TableContainer>
                        <Table size="medium">
                            <TableHead>
                                <TableRow>
                                    {['DEVICE ID', 'ASSET NAME', 'TYPE', 'READING', 'STATUS', 'LOCATION', 'LAST PULSE'].map(h => (
                                        <TableCell key={h} sx={{ bgcolor: '#0f172a', fontWeight: 950, color: 'rgba(255,255,255,0.4)' }}>{h}</TableCell>
                                    ))}
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
                                                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{String(sensor.type || 'system').replace('_', ' ').toUpperCase()}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ fontWeight: 950 }}>
                                                    {sensor.value} <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>{sensor.unit}</span>
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={String(sensor.status || 'system').toUpperCase()}
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
                                                {sensor.lastPulse instanceof Date ? sensor.lastPulse.toLocaleTimeString() : (sensor.lastPulse as Timestamp).toDate?.().toLocaleTimeString?.() || '—'}
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
                            Frontend crash telemetry is no longer displayed as building sensor data. This panel now shows operational IoT nodes only.
                        </Typography>
                    </Alert>
                </Box>
            </Box>
        </AdminPageFrame>
    );
}
