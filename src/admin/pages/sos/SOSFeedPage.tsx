import React, { useState, useEffect } from 'react';
import {
  Paper, Typography, Chip, Grid, Button, Box,
  Avatar, List, ListItem, ListItemText, ListItemAvatar,
  alpha, Stack, IconButton, Tooltip
} from '@mui/material';
import { 
    AlertTriangle, ShieldAlert, CheckCircle, Clock, 
    Activity, Bell, User, MapPin, Zap, Siren
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useLanguage, binThemeTokens } from '@bin/shared';
import AdminPageFrame from '../../components/AdminPageFrame';

interface SOSEvent {
  sosId: string;
  tenantId: string;
  unitId: string;
  status: 'ACTIVE' | 'RESPONDED' | 'RESOLVED';
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  createdAt: any;
  respondedAt?: any;
  resolvedAt?: any;
  assignedTechnician?: string;
  emergencyChargeApplied: number;
}

export default function SOSFeedPage() {
  const { t, isRTL } = useLanguage();
  const [sosEvents, setSOSEvents] = useState<SOSEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'sos_alerts'), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snap) => {
        setSOSEvents(snap.docs.map(d => ({ sosId: d.id, ...d.data() } as SOSEvent)));
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleRespond = async (sosId: string) => {
    try {
      await updateDoc(doc(db, 'sos_alerts', sosId), {
        status: 'RESPONDED',
        respondedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async (sosId: string) => {
    try {
      await updateDoc(doc(db, 'sos_alerts', sosId), {
        status: 'RESOLVED',
        resolvedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    }
  };

  const getPriorityStyle = (priority: string) => {
    if (priority === 'CRITICAL') return { color: '#EF4444', icon: <Siren size={24} className="animate-pulse" /> };
    if (priority === 'HIGH') return { color: '#F59E0B', icon: <AlertTriangle size={24} /> };
    return { color: '#10B981', icon: <Bell size={24} /> };
  };

  const activeCount = sosEvents.filter(e => e.status === 'ACTIVE').length;

  return (
    <AdminPageFrame
      title={t('sos.feed_title') || 'EMERGENCY SOS COMMAND'}
      subtitle="Critical real-time monitoring of life-safety incidents and rapid dispatch"
      loading={loading}
      breadcrumbs={[{ label: 'SOS Feed' }]}
      actions={
          <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ px: 2, py: 1, bgcolor: alpha('#EF4444', 0.1), borderRadius: 2, border: '1px solid rgba(239,68,68,0.2)' }}>
                  <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Activity size={14} /> LIVE TELEMETRY
                  </Typography>
              </Box>
          </Stack>
      }
    >
      <Grid container spacing={3} sx={{ mb: 4 }}>
          {[
              { label: 'ACTIVE ALERTS', val: activeCount, color: '#EF4444', icon: <ShieldAlert size={20} /> },
              { label: 'PENDING RESOLUTION', val: sosEvents.filter(e => e.status === 'RESPONDED').length, color: '#F59E0B', icon: <Clock size={20} /> },
              { label: 'TOTAL RESOLVED (24H)', val: sosEvents.filter(e => e.status === 'RESOLVED').length, color: '#10B981', icon: <CheckCircle size={20} /> }
          ].map((stat, i) => (
              <Grid item xs={12} md={4} key={i}>
                  <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: `1px solid ${alpha(stat.color, 0.1)}` }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                          <Box sx={{ p: 1.5, bgcolor: alpha(stat.color, 0.1), color: stat.color, borderRadius: 2 }}>{stat.icon}</Box>
                          <Box>
                              <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>{stat.label}</Typography>
                              <Typography variant="h4" sx={{ fontWeight: 950, color: '#FFF' }}>{stat.val}</Typography>
                          </Box>
                      </Stack>
                  </Paper>
              </Grid>
          ))}
      </Grid>

      <List sx={{ p: 0 }}>
        {sosEvents.map((event) => {
          const style = getPriorityStyle(event.priority);
          return (
            <ListItem
              key={event.sosId}
              sx={{
                mb: 2,
                borderRadius: 4,
                bgcolor: 'rgba(255,255,255,0.01)',
                border: `1px solid ${event.status === 'ACTIVE' ? alpha(style.color, 0.3) : 'rgba(255,255,255,0.05)'}`,
                p: 3,
                transition: 'all 0.3s ease',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }
              }}
            >
              <ListItemAvatar>
                <Avatar sx={{ width: 60, height: 60, bgcolor: alpha(style.color, 0.1), color: style.color, mr: 2 }}>
                  {style.icon}
                </Avatar>
              </ListItemAvatar>

              <ListItemText
                primary={
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 950, color: '#FFF' }}>#{String(event.sosId || '').slice(0,8).toUpperCase()}</Typography>
                    <Chip label={String(event.priority || '').toUpperCase()} size="small" sx={{ bgcolor: alpha(style.color, 0.1), color: style.color, fontWeight: 950, fontSize: '0.65rem' }} />
                    <Chip 
                        label={event.status} 
                        size="small" 
                        sx={{ 
                            bgcolor: event.status === 'RESOLVED' ? alpha('#10B981', 0.1) : 'rgba(255,255,255,0.05)', 
                            color: event.status === 'RESOLVED' ? '#10B981' : 'rgba(255,255,255,0.4)',
                            fontWeight: 950, fontSize: '0.65rem'
                        }} 
                    />
                  </Stack>
                }
                secondary={
                  <Box>
                    <Typography variant="body1" sx={{ color: '#FFF', fontWeight: 600, mb: 1 }}>{event.description}</Typography>
                    <Stack direction="row" spacing={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MapPin size={14} color={binThemeTokens.gold} />
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>UNIT {event.unitId || 'N/A'}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Zap size={14} color="#EF4444" />
                            <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 900 }}>SURGE: AED {event.emergencyChargeApplied}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Clock size={14} color="rgba(255,255,255,0.3)" />
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                {event.createdAt?.toDate ? event.createdAt.toDate().toLocaleString() : 'N/A'}
                            </Typography>
                        </Box>
                    </Stack>
                  </Box>
                }
              />

              <Stack direction="row" spacing={2} sx={{ ml: 4 }}>
                {event.status === 'ACTIVE' && (
                  <Button
                    variant="contained"
                    sx={{ bgcolor: '#F59E0B', color: '#000', fontWeight: 950, borderRadius: 2 }}
                    onClick={() => handleRespond(event.sosId)}
                  >
                    RESPOND
                  </Button>
                )}
                {['ACTIVE', 'RESPONDED'].includes(event.status) && (
                  <Button
                    variant="contained"
                    sx={{ bgcolor: '#10B981', color: '#000', fontWeight: 950, borderRadius: 2 }}
                    onClick={() => handleResolve(event.sosId)}
                  >
                    RESOLVE
                  </Button>
                )}
              </Stack>
            </ListItem>
          );
        })}
      </List>
    </AdminPageFrame>
  );
}
