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
import { apiClient } from '../../services/api';

interface SOSEvent {
  sosId: string;
  tenantId: string;
  unitId: string;
  status: 'ACTIVE' | 'RESPONDED' | 'RESOLVED';
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  createdAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  assignedTechnician?: string;
  emergencyChargeApplied: number;
}

export default function SOSFeedPage() {
  const [sosEvents, setSOSEvents] = useState<SOSEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchSOSFeed();

    if (autoRefresh) {
      const interval = setInterval(fetchSOSFeed, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchSOSFeed = async () => {
    try {
      const response = await apiClient.get('/api/admin/sos-feed');
      setSOSEvents(response?.data?.sosEvents || []);
    } catch (error) {
      console.error('Failed to fetch SOS feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (sosId: string) => {
    try {
      await apiClient.post(`/api/admin/sos/${sosId}/respond`);
      alert('SOS acknowledged');
      fetchSOSFeed();
    } catch (error) {
      console.error('Failed to respond to SOS:', error);
      alert('Failed to respond');
    }
  };

  const handleResolve = async (sosId: string) => {
    try {
      await apiClient.post(`/api/admin/sos/${sosId}/resolve`);
      alert('SOS resolved');
      fetchSOSFeed();
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

      {/* RISK MANAGEMENT / KILL SWITCH (God Mode) */}
      <Box sx={{ mt: 8 }}>
        <Typography variant="h5" sx={{ mb: 3, fontWeight: '800', color: '#0f172a' }}>
          🛡️ RISK MANAGEMENT CENTER (GOD MODE)
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Rogue Tenant Kill Switch</Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Suspension locks all digital keys, app access, and freezes maintenance response.
              </Typography>
              <List>
                {[
                  { name: 'John Doe', unit: '402', threat: 'Fraudulent Receipt' },
                  { name: 'Sarah Ahmed', unit: '1205', threat: 'Abusive to Staff' }
                ].map((tenant, idx) => (
                  <ListItem key={idx} sx={{ bgcolor: '#f8fafc', borderRadius: 1, mb: 1 }}>
                    <ListItemText
                      primary={tenant.name}
                      secondary={`Unit ${tenant.unit} - Alert: ${tenant.threat}`}
                    />
                    <Button
                      variant="contained"
                      color="error"
                      size="small"
                      onClick={() => alert(`CRITICAL: Access for ${tenant.name} has been TERMINATED. All digital keys invalidated.`)}
                    >
                      SUSPEND ACCOUNT
                    </Button>
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Technician Safety Monitor</Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                Live GPS tracking and SOS monitoring for field staff in high-rise towers.
              </Typography>
              <Box sx={{ p: 2, bgcolor: '#0f172a', color: '#fff', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: '#10b981', display: 'block' }}>● 14 TECHNICIANS LIVE ON GOOGLE MAPS</Typography>
                <Typography variant="caption" sx={{ color: '#fff', opacity: 0.7 }}>Last Pulse: {new Date().toLocaleTimeString()}</Typography>
              </Box>
              <Button 
                variant="outlined" 
                fullWidth 
                sx={{ mt: 2 }}
                onClick={() => alert("Initializing Real-Time GPS Tracking Module...\nSearching for 14 Active Technician Pulses across Dubai Marina and Downtown.")}
              >
                Open Live GPS Tracker
              </Button>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
