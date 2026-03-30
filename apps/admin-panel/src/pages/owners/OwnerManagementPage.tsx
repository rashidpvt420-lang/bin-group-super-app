// admin-panel/src/pages/owners/OwnerManagementPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Grid,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import { apiClient } from '../../services/api';

interface Owner {
  ownerId: string;
  name: string;
  email: string;
  totalBuildings: number;
  totalUnits: number;
  monthlyRentCollected: number;
  unpaidInvoiceCount: number;
  suspensionStatus: 'ACTIVE' | 'SUSPENDED';
  joinedDate: string;
}

export default function OwnerManagementPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  useEffect(() => {
    fetchOwners();
  }, []);

  const fetchOwners = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/admin/owners');
      setOwners(response?.data?.owners || []);
    } catch (error) {
      console.error('Failed to fetch owners:', error);
      alert('Failed to load owners');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!selectedOwner) return;

    try {
      await apiClient.post(`/api/admin/owners/${selectedOwner.ownerId}/suspend`, {
        reason: suspensionReason,
      });

      alert(`Owner ${selectedOwner.name} has been suspended`);
      setSuspendDialogOpen(false);
      fetchOwners();
    } catch (error) {
      console.error('Failed to suspend owner:', error);
      alert('Failed to suspend owner');
    }
  };

  const handleResume = async (ownerId: string) => {
    try {
      await apiClient.post(`/api/admin/owners/${ownerId}/resume`);
      alert('Owner has been re-activated');
      fetchOwners();
    } catch (error) {
      console.error('Failed to resume owner:', error);
      alert('Failed to resume owner');
    }
  };

  if (loading) {
    return <Typography>Loading owners...</Typography>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 4 }}>
        Owner Management
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell align="center">Buildings</TableCell>
              <TableCell align="center">Units</TableCell>
              <TableCell align="right">Monthly Rent</TableCell>
              <TableCell align="center">Unpaid Invoices</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(owners || []).map((owner) => (
              <TableRow key={owner.ownerId}>
                <TableCell>{owner.name}</TableCell>
                <TableCell>{owner.email}</TableCell>
                <TableCell align="center">{owner.totalBuildings}</TableCell>
                <TableCell align="center">{owner.totalUnits}</TableCell>
                <TableCell align="right">AED {(owner.monthlyRentCollected || 0).toLocaleString()}</TableCell>
                <TableCell align="center">
                  <Chip
                    label={owner.unpaidInvoiceCount}
                    color={owner.unpaidInvoiceCount >= 2 ? 'error' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={owner.suspensionStatus}
                    color={owner.suspensionStatus === 'SUSPENDED' ? 'error' : 'success'}
                  />
                </TableCell>
                <TableCell align="center">
                  <Grid container spacing={1}>
                    <Grid item>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setSelectedOwner(owner);
                          setSuspendDialogOpen(true);
                        }}
                        disabled={owner.suspensionStatus === 'SUSPENDED'}
                      >
                        Suspend
                      </Button>
                    </Grid>
                    <Grid item>
                      {owner.suspensionStatus === 'SUSPENDED' && (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          onClick={() => handleResume(owner.ownerId)}
                        >
                          Resume
                        </Button>
                      )}
                    </Grid>
                  </Grid>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Suspension Dialog */}
      <Dialog open={suspendDialogOpen} onClose={() => setSuspendDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Suspend Owner</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to suspend <strong>{selectedOwner?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Suspended owners will have their app access blocked and emergency services disabled.
          </Typography>
          <TextField
            fullWidth
            label="Suspension Reason"
            multiline
            rows={4}
            value={suspensionReason}
            onChange={(e) => setSuspensionReason(e.target.value)}
            placeholder="Enter reason for suspension..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuspendDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSuspend} variant="contained" color="error">
            Suspend Owner
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
