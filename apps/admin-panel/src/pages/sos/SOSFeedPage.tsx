// admin-panel/src/pages/sos/SOSFeedPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  Chip,
  Grid,
  Button,
  Box,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
} from '@mui/material';
import { db, auth, collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp } from '../../lib/firebase';

interface SOSEvent {
  sosId: string;
  tenantId: string;
  unitId: string;
  status: 'ACTIVE' | 'RESPONDED' | 'RESOLVED';
  description: string;
  priority: 'EMERGENCY' | 'CRITICAL' | 'HIGH' | 'MEDIUM';
  createdAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  assignedTechnician?: string;
  emergencyChargeApplied: number;
}

const toIso = (value: any): string => {
  if (value?.toDate) return value.toDate().toISOString();
  if (value) return new Date(value).toISOString();
  return new Date().toISOString();
};

function mapTicketToSOSEvent(id: string, t: any): SOSEvent {
  return {
    sosId: id,
    tenantId: t.tenantId || '',
    unitId: t.unitNumber || t.unitId || '',
    status: t.sosStatus || 'ACTIVE',
    description: t.description || '',
    priority: t.priority || 'EMERGENCY',
    createdAt: toIso(t.createdAt),
    respondedAt: t.sosRespondedAt ? toIso(t.sosRespondedAt) : undefined,
    resolvedAt: t.sosResolvedAt ? toIso(t.sosResolvedAt) : undefined,
    assignedTechnician: t.assignedTechnicianName || undefined,
    emergencyChargeApplied: Number(t.emergencyCharge || 0),
  };
}

export default function SOSFeedPage() {
  const [sosEvents, setSOSEvents] = useState<SOSEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    if (!autoRefresh) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'maintenanceTickets'),
      where('priority', '==', 'EMERGENCY'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setSOSEvents(snap.docs.map((d) => mapTicketToSOSEvent(d.id, d.data())));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to fetch SOS feed:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [autoRefresh]);

  const handleRespond = async (sosId: string) => {
    try {
      await updateDoc(doc(db, 'maintenanceTickets', sosId), {
        sosStatus: 'RESPONDED',
        sosRespondedAt: serverTimestamp(),
        sosRespondedBy: auth.currentUser?.uid || null,
      });
      alert('SOS acknowledged');
    } catch (error) {
      console.error('Failed to respond to SOS:', error);
      alert('Failed to respond');
    }
  };

  const handleResolve = async (sosId: string) => {
    try {
      await updateDoc(doc(db, 'maintenanceTickets', sosId), {
        sosStatus: 'RESOLVED',
        sosResolvedAt: serverTimestamp(),
        sosResolvedBy: auth.currentUser?.uid || null,
      });
      alert('SOS resolved');
    } catch (error) {
      console.error('Failed to resolve SOS:', error);
      alert('Failed to resolve');
    }
  };

  const getStatusColor = (status: string): any => {
    switch (status) {
      case 'ACTIVE':
        return 'error';
      case 'RESPONDED':
        return 'warning';
      case 'RESOLVED':
        return 'success';
      default:
        return 'default';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'EMERGENCY':
      case 'CRITICAL':
        return '#d32f2f';
      case 'HIGH':
        return '#f57c00';
      case 'MEDIUM':
        return '#fbc02d';
      default:
        return '#666';
    }
  };

  const getMinutesSince = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60));
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  const activeCount = (sosEvents || []).filter((e) => e.status === 'ACTIVE').length;
  const respondedCount = (sosEvents || []).filter((e) => e.status === 'RESPONDED').length;
  const resolvedCount = (sosEvents || []).filter((e) => e.status === 'RESOLVED').length;

  if (loading) {
    return <Typography>Loading SOS Feed...</Typography>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">SOS Emergency Feed (LIVE)</Typography>
        <Button
          variant={autoRefresh ? 'contained' : 'outlined'}
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          {autoRefresh ? '🔴 Live' : '⚪ Paused'}
        </Button>
      </Box>

      {/* Statistics */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Paper sx={{ p: 2, backgroundColor: '#ffebee', borderLeft: '4px solid #d32f2f' }}>
            <Typography color="textSecondary" gutterBottom>
              Active Emergencies
            </Typography>
            <Typography variant="h5" color="error">
              {activeCount}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Paper sx={{ p: 2, backgroundColor: '#fff3e0', borderLeft: '4px solid #f57c00' }}>
            <Typography color="textSecondary" gutterBottom>
              Responded
            </Typography>
            <Typography variant="h5" style={{ color: '#f57c00' }}>
              {respondedCount}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Paper sx={{ p: 2, backgroundColor: '#e8f5e9', borderLeft: '4px solid #4caf50' }}>
            <Typography color="textSecondary" gutterBottom>
              Resolved
            </Typography>
            <Typography variant="h5" color="success">
              {resolvedCount}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* SOS Events List */}
      <List>
        {(sosEvents || []).map((event) => (
          <ListItem
            component={Paper}
            key={event.sosId}
            sx={{
              mb: 2,
              border: `2px solid ${getPriorityColor(event.priority)}`,
              borderRadius: 1,
            }}
          >
            <ListItemAvatar>
              <Avatar
                sx={{
                  backgroundColor: getPriorityColor(event.priority),
                  mr: 2,
                  width: 56,
                  height: 56,
                }}
              >
                🚨
              </Avatar>
            </ListItemAvatar>

            <ListItemText
              primary={
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6">{event.sosId}</Typography>
                  <Chip label={event.priority} size="small" color="error" />
                  <Chip label={event.status} size="small" color={getStatusColor(event.status)} />
                </Box>
              }
              secondary={
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Unit:</strong> {event.unitId} | <strong>Charge:</strong> AED {event.emergencyChargeApplied}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {event.description}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    📅 {getMinutesSince(event.createdAt)} | {new Date(event.createdAt).toLocaleTimeString()}
                  </Typography>
                  {event.assignedTechnician && (
                    <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                      👨‍🔧 Assigned to: {event.assignedTechnician}
                    </Typography>
                  )}
                </Box>
              }
            />

            {/* Actions */}
            <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
              {event.status === 'ACTIVE' && (
                <>
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    onClick={() => handleRespond(event.sosId)}
                  >
                    Respond
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    onClick={() => handleResolve(event.sosId)}
                  >
                    Resolve
                  </Button>
                </>
              )}
              {event.status === 'RESPONDED' && (
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  onClick={() => handleResolve(event.sosId)}
                >
                  Resolve
                </Button>
              )}
              {event.status === 'RESOLVED' && (
                <Chip label="✓ Resolved" color="success" />
              )}
            </Box>
          </ListItem>
        ))}
      </List>

      {/* Verified risk controls */}
      <Box sx={{ mt: 8 }}>
        <Typography variant="h5" sx={{ mb: 3, fontWeight: '800', color: '#0f172a' }}>
          Risk Management Controls
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Tenant Access Review</Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Account restrictions must be handled from verified tenant records with an audit reason. This SOS page does not change user access from a simulated list.
              </Typography>
              <List>
                <ListItem sx={{ bgcolor: '#f8fafc', borderRadius: 1, mb: 1 }}>
                  <ListItemText
                    primary="Verified tenant record required"
                    secondary="Use Tenant Management to review tenancy status, payment records, complaint history, and supporting evidence."
                  />
                </ListItem>
                <ListItem sx={{ bgcolor: '#f8fafc', borderRadius: 1, mb: 1 }}>
                  <ListItemText
                    primary="Audit reason required"
                    secondary="Any restriction must be linked to an authenticated admin action and preserved in the audit log."
                  />
                </ListItem>
              </List>
              <Button variant="outlined" color="inherit" size="small" disabled>
                Use Tenant Management for audited restrictions
              </Button>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Technician Safety Monitor</Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Live tracking must come from technician location telemetry. This panel does not display simulated field pulses.
              </Typography>
              <Box sx={{ p: 2, bgcolor: '#0f172a', color: '#fff', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: '#10b981', display: 'block' }}>Telemetry source required</Typography>
                <Typography variant="caption" sx={{ color: '#fff', opacity: 0.7 }}>Last pulse appears only after a real technician location update.</Typography>
              </Box>
              <Button 
                variant="outlined" 
                fullWidth 
                sx={{ mt: 2 }}
                disabled
              >
                Live tracker pending telemetry
              </Button>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
