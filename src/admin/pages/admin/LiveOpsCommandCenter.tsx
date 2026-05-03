// admin-panel/src/pages/admin/LiveOpsCommandCenter.tsx
import React, { useState, useEffect } from 'react';
import { 
    Zap, 
    Radio, 
    Users, 
    Activity, 
    Filter,
    Navigation as NavigationIcon,
    ShieldAlert
} from 'lucide-react';

import { 
    Box, 
    Typography, 
    Grid, 
    Paper, 
    Chip, 
    IconButton, 
    Avatar,
    LinearProgress
} from '@mui/material';
import { motion } from 'framer-motion';

import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';

// Helper for type-safe icons in React 18
const Icon = ({ icon: IconComponent, size = 16, className = "", color = "currentColor" }: { icon: any, size?: number, className?: string, color?: string }) => (
    <IconComponent size={size} className={className} color={color} />
);

// --- Types ---
interface TechnicianLocation {
    id: string;
    technicianId: string;
    name: string;
    lat: number;
    lng: number;
    status: string;
    batteryLevel: number;
    speed: number;
    heading: number;
    category: string;
    lastUpdate: string;
    isStale: boolean;
    riskFlag: boolean;
    jobId?: string;
}

interface LiveEvent {
    id: string;
    type: 'EMERGENCY' | 'TRIAGE' | 'RESOLVED' | 'INFO';
    title: string;
    location: string;
    time: string;
}

export default function LiveOpsCommandCenter() {
    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
    const [activeTechs, setActiveTechs] = useState<TechnicianLocation[]>([]);
    const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
    const [stats, setStats] = useState({ queueClearance: 84, activeTeams: 0 });

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
        }, 1000);

        // 🛰️ 1. Production Data Subscription (Locations)
        const qTechs = query(collection(db, 'technicianLocations'), limit(20));
        const unsubTechs = onSnapshot(qTechs, (snapshot) => {
            const techs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as TechnicianLocation));
            setActiveTechs(techs);
            setStats(prev => ({ ...prev, activeTeams: techs.length }));
        });

        // 🎟️ 2. Live Events Subscription (Tickets)
        const qTickets = query(collection(db, 'maintenanceTickets'), orderBy('createdAt', 'desc'), limit(15));
        const unsubTickets = onSnapshot(qTickets, (snapshot) => {
            const events: LiveEvent[] = snapshot.docs.map(doc => {
                const data = doc.data();
                const type = data.priority === 'High' || data.priority === 'Emergency' ? 'EMERGENCY' : 
                             data.status === 'COMPLETED' ? 'RESOLVED' : 'TRIAGE';
                
                return {
                    id: doc.id,
                    type,
                    title: data.issueType || 'General Request',
                    location: `Unit ${data.unitId || 'N/A'}`,
                    time: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just Now'
                };
            });
            setLiveEvents(events);
            
            // Calc queue clearance (Simple mock for demo)
            const completed = snapshot.docs.filter(d => d.data().status === 'COMPLETED').length;
            const total = snapshot.docs.length || 1;
            setStats(prev => ({ ...prev, queueClearance: Math.round((completed / total) * 100) || 84 }));
        });

        return () => {
            clearInterval(timer);
            unsubTechs();
            unsubTickets();
        };
    }, []);

    return (
        <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100vh', color: '#f8fafc' }}>
            {/* ── HEADER: MISSION CONTROL ── */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Box sx={{ bgcolor: '#3b82f6', p: 1, borderRadius: 2 }}>
                            <Icon icon={NavigationIcon} size={24} color="white" />
                        </Box>
                        <Typography variant="h4" fontWeight={900} sx={{ letterSpacing: -2, fontStyle: 'italic' }}>
                            LIVE OPS <Box component="span" sx={{ color: '#3b82f6' }}>COMMAND</Box>
                        </Typography>
                    </Box>
                    <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 900, letterSpacing: 6 }}>
                        Dubai Infrastructure Hub · {currentTime}
                    </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', gap: 3 }}>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h6" fontWeight={900} sx={{ color: '#10b981' }}>{stats.queueClearance}%</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 900 }}>QUEUE CLEARANCE</Typography>
                    </Box>
                    <Box sx={{ width: 1, height: 40, bgcolor: 'rgba(255,255,255,0.1)', w: '1px' }} />
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="h6" fontWeight={900} sx={{ color: '#3b82f6' }}>{stats.activeTeams}</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 900 }}>ACTIVE TEAMS</Typography>
                    </Box>
                </Box>
            </Box>

            <Grid container spacing={3}>
                {/* ── LEFT: LIVE MAP ── */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ 
                        height: '75vh', 
                        bgcolor: '#0f172a', 
                        borderRadius: 6, 
                        border: '1px solid rgba(255,255,255,0.05)',
                        position: 'relative',
                        overflow: 'hidden',
                        boxShadow: '0 40px 100px rgba(0,0,0,0.5)'
                    }}>
                        {/* Map Grid Background */}
                        <Box sx={{ 
                            position: 'absolute', 
                            inset: 0, 
                            backgroundImage: 'radial-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 0)',
                            backgroundSize: '40px 40px',
                            opacity: 0.3
                        }} />
                        
                        {/* Markers */}
                        {activeTechs.map((tech) => (
                            <motion.div
                                key={tech.id}
                                style={{
                                    position: 'absolute',
                                    left: tech.lng ? `${((tech.lng - 55.2) * 500) % 100}%` : '50%',
                                    top: tech.lat ? `${((25.3 - tech.lat) * 500) % 100}%` : '50%',
                                    zIndex: 10
                                }}
                                initial={false}
                                animate={{ x: 0, y: 0 }}
                                transition={{ type: 'spring', stiffness: 50 }}
                            >
                                <Box sx={{ position: 'relative', cursor: 'pointer' }}>
                                    <Box className={tech.status === 'EMERGENCY' ? 'animate-pulse' : ''} sx={{ 
                                        width: 16, 
                                        height: 16, 
                                        bgcolor: tech.status === 'EMERGENCY' ? '#ef4444' : '#3b82f6', 
                                        borderRadius: '50%',
                                        border: '3px solid rgba(255,255,255,0.2)',
                                        boxShadow: `0 0 15px ${tech.status === 'EMERGENCY' ? '#f87171' : '#60a5fa'}`
                                    }} />
                                    <Box sx={{ 
                                        position: 'absolute', 
                                        top: 20, 
                                        left: '50%', 
                                        transform: 'translateX(-50%)',
                                        bgcolor: 'rgba(15, 23, 42, 0.95)',
                                        px: 1,
                                        py: 0.2,
                                        borderRadius: 1,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <Typography variant="caption" sx={{ fontWeight: 900, color: 'white', fontSize: 9 }}>{tech.name}</Typography>
                                    </Box>
                                </Box>
                            </motion.div>
                        ))}

                        {/* Informative Placeholder if no GPS */}
                        {activeTechs.length === 0 && (
                            <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.5, flexDirection: 'column', gap: 1 }}>
                                <Activity size={48} className="animate-pulse" />
                                <Typography variant="h6" fontWeight={900} letterSpacing={2}>AWAITING FIELD TELEMETRY...</Typography>
                            </Box>
                        )}

                        {/* Map HUD Overlay */}
                        <Box sx={{ position: 'absolute', bottom: 32, left: 32, display: 'flex', gap: 2 }}>
                            <Chip 
                                icon={<Icon icon={Radio} size={14} className={activeTechs.length > 0 ? "animate-pulse" : ""} />} 
                                label="REAL-TIME GPS" 
                                sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#3b82f6', fontWeight: 900, fontSize: 10 }} 
                            />
                            <Chip 
                                icon={<Icon icon={Activity} size={14} />} 
                                label="INSTITUTIONAL SYNC" 
                                sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#10b981', fontWeight: 900, fontSize: 10 }} 
                            />
                        </Box>
                    </Paper>
                </Grid>

                {/* ── RIGHT: OPS FEED & TRIAGE ── */}
                <Grid item xs={12} lg={4}>
                    <Box sx={{ height: '75vh', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        
                        {/* Live Radio / Feed */}
                        <Paper sx={{ 
                            flex: 1, 
                            bgcolor: 'rgba(255,255,255,0.02)', 
                            borderRadius: 6, 
                            border: '1px solid rgba(255,255,255,0.05)',
                            p: 3,
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                                <Typography variant="h6" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Icon icon={Zap} size={20} color="#fbbf24" /> LIVE TICKETS
                                </Typography>
                                <IconButton size="small"><Icon icon={Filter} size={18} color="#64748b" /></IconButton>
                            </Box>
                            
                            <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {liveEvents.map(event => (
                                    <Box key={event.id} sx={{ 
                                        p: 2, 
                                        borderRadius: 4, 
                                        bgcolor: event.type === 'EMERGENCY' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.03)',
                                        border: '1px solid',
                                        borderColor: event.type === 'EMERGENCY' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                            <Box sx={{ 
                                                width: 8, 
                                                height: 8, 
                                                borderRadius: '50%', 
                                                bgcolor: event.type === 'EMERGENCY' ? '#ef4444' : event.type === 'TRIAGE' ? '#fbbf24' : '#10b981' 
                                            }} />
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight={900} sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {event.title}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b' }}>{event.location}</Typography>
                                            </Box>
                                        </Box>
                                        <Typography variant="caption" sx={{ fontWeight: 900, color: event.type === 'EMERGENCY' ? '#ef4444' : '#64748b' }}>{event.time}</Typography>
                                    </Box>
                                ))}
                                {liveEvents.length === 0 && (
                                    <Typography variant="caption" sx={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                                        Zero pending incidents reported.
                                    </Typography>
                                )}
                            </Box>
                        </Paper>

                        {/* Specialist Status Rack */}
                        <Paper sx={{ 
                            p: 3, 
                            bgcolor: 'rgba(255,255,255,0.02)', 
                            borderRadius: 6, 
                            border: '1px solid rgba(255,255,255,0.05)',
                            overflowY: 'auto',
                            maxHeight: '30vh'
                        }}>
                             <Typography variant="h6" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                                <Icon icon={Users} size={20} color="#3b82f6" /> FIELD SQUAD
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {activeTechs.map(tech => (
                                    <Box key={tech.id} sx={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        p: 1.5,
                                        borderRadius: 3,
                                        bgcolor: tech.riskFlag ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                                        border: tech.riskFlag ? '1px solid rgba(239, 68, 68, 0.1)' : '1px solid transparent'
                                    }}>
                                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                            <Avatar sx={{ 
                                                bgcolor: tech.riskFlag ? '#ef4444' : tech.status === 'EMERGENCY' ? '#ef4444' : '#334155', 
                                                width: 32, 
                                                height: 32, 
                                                fontSize: 12, 
                                                fontWeight: 900 
                                            }}>
                                                {tech.riskFlag ? <Icon icon={ShieldAlert} size={16} /> : (tech.name?.[0] || 'T')}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body2" fontWeight={900}>{tech.name || `TECH-${tech.id.slice(-4)}`}</Typography>
                                                <Typography variant="caption" sx={{ color: '#64748b', display: 'flex', gap: 1 }}>
                                                    {tech.category || 'Specialist'} · {tech.speed || 0} km/h
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="caption" sx={{ 
                                                fontWeight: 900, 
                                                color: tech.riskFlag ? '#ef4444' : tech.status === 'EMERGENCY' ? '#ef4444' : tech.status === 'ON_TICKET' ? '#3b82f6' : '#10b981' 
                                            }}>{tech.riskFlag ? 'RISK' : tech.status || 'READY'}</Typography>
                                            <Box sx={{ width: 60, mt: 0.5 }}>
                                                <LinearProgress variant="determinate" value={tech.batteryLevel || 100} sx={{ 
                                                    height: 3, 
                                                    borderRadius: 1, 
                                                    bgcolor: 'rgba(255,255,255,0.05)', 
                                                    '& .MuiLinearProgress-bar': { bgcolor: (tech.batteryLevel || 100) < 30 ? '#ef4444' : '#10b981' } 
                                                }} />
                                            </Box>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        </Paper>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
}
