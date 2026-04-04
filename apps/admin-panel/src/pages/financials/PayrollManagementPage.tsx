// admin-panel/src/pages/financials/PayrollManagementPage.tsx
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
  Typography,
  Button,
  Chip,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from '@mui/material';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, getDocs, writeBatch, doc } from 'firebase/firestore';
import { Wallet, CheckCircle, Clock } from 'lucide-react';

interface Technician {
  uid: string;
  displayName: string;
  email: string;
  specialization: string;
  baseSalary?: number;
}

interface PayrollRecord {
  id: string;
  techId: string;
  techName: string;
  amount: number;
  month: string; // YYYY-MM
  status: 'pending' | 'paid';
  processedAt: any;
}

export default function PayrollManagementPage() {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProcess, setOpenAdd] = useState(false);
  const [processing, setProcessing] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
    const unsubscribeTechs = onSnapshot(qTechs, (snap) => {
      setTechs(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Technician)));
    });

    const qPayroll = query(collection(db, 'payroll'));
    const unsubscribePayroll = onSnapshot(qPayroll, (snap) => {
      setPayroll(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord)));
      setLoading(false);
    });

    return () => {
      unsubscribeTechs();
      unsubscribePayroll();
    };
  }, []);

  const handleProcessPayroll = async () => {
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      
      for (const tech of techs) {
        // Check if already processed for this month
        const existing = payroll.find(p => p.techId === tech.uid && p.month === currentMonth);
        if (existing) continue;

        const amount = tech.baseSalary || 3500; // Default AED 3500 if not set
        
        const payrollRef = doc(collection(db, 'payroll'));
        batch.set(payrollRef, {
          techId: tech.uid,
          techName: tech.displayName || tech.email,
          amount,
          month: currentMonth,
          status: 'pending',
          createdAt: serverTimestamp(),
        });

        // Add to transactions ledger as money OUT
        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          techId: tech.uid,
          amount,
          type: 'debit',
          category: 'payroll',
          description: `Salary for ${tech.displayName} - ${currentMonth}`,
          status: 'PENDING',
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      alert("Payroll batch generated for " + currentMonth);
      setOpenAdd(false);
    } catch (err) {
      console.error("Payroll failure:", err);
    } finally {
      setProcessing(false);
    }
  };

  const totalPayroll = payroll
    .filter(p => p.month === currentMonth)
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          Technician <Box component="span" sx={{ color: '#6366f1' }}>Payroll</Box>
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<Wallet />} 
          onClick={() => setOpenAdd(true)}
          sx={{ borderRadius: 100, px: 3, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
        >
          Generate Monthly Payroll
        </Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, bgcolor: '#6366f1', color: '#fff' }}>
            <CardContent>
              <Typography variant="overline" sx={{ fontWeight: 'bold', opacity: 0.8 }}>Active Liabilities ({currentMonth})</Typography>
              <Typography variant="h3" sx={{ fontWeight: 900 }}>AED {totalPayroll.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, height: '100%', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
              <Clock size={24} />
            </Box>
            <Box>
              <Typography variant="overline" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Pending Disbursement</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{payroll.filter(p => p.status === 'pending').length} Technicians</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Technician</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Month</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Amount (AED)</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payroll.sort((a,b) => b.month.localeCompare(a.month)).map((record) => (
              <TableRow key={record.id} hover>
                <TableCell sx={{ fontWeight: 'bold' }}>{record.techName}</TableCell>
                <TableCell>{record.month}</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>{record.amount.toLocaleString()}</TableCell>
                <TableCell>
                  <Chip 
                    label={record.status.toUpperCase()} 
                    color={record.status === 'paid' ? 'success' : 'warning'} 
                    size="small" 
                    sx={{ fontWeight: 'bold', fontSize: 10 }} 
                  />
                </TableCell>
                <TableCell align="right">
                  {record.status === 'pending' && (
                    <Button size="small" variant="outlined" color="success">Settle Payment</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openProcess} onClose={() => setOpenAdd(false)}>
        <DialogTitle sx={{ fontWeight: 900 }}>Generate Payroll: {currentMonth}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            This will calculate salaries for all active technicians and add them to the financial ledger as pending debits.
          </Typography>
          <Alert severity="info">
            Targeting {techs.length} technicians for a total liability of AED {(techs.length * 3500).toLocaleString()}.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAdd(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleProcessPayroll} 
            disabled={processing}
            sx={{ borderRadius: 100, bgcolor: '#6366f1' }}
          >
            Confirm & Execute
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
