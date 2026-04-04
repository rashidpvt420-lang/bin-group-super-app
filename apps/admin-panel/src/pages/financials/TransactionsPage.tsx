// admin-panel/src/pages/financials/TransactionsPage.tsx
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
  Chip,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { ArrowUpCircle, ArrowDownCircle, Activity } from 'lucide-react';

interface Transaction {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  category: string;
  description: string;
  status: string;
  createdAt: any;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const income = transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          Sovereign <Box component="span" sx={{ color: '#10b981' }}>Ledger</Box>
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, borderLeft: '6px solid #10b981' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="overline" sx={{ fontWeight: 'bold' }}>Total Income</Typography>
                <ArrowUpCircle color="#10b981" size={20} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 900, color: '#10b981' }}>AED {income.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, borderLeft: '6px solid #ef4444' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="overline" sx={{ fontWeight: 'bold' }}>Total Expenses</Typography>
                <ArrowDownCircle color="#ef4444" size={20} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 900, color: '#ef4444' }}>AED {expenses.toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, bgcolor: '#1e293b', color: '#fff' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="overline" sx={{ fontWeight: 'bold', opacity: 0.8 }}>Net Position</Typography>
                <Activity color="#fff" size={20} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>AED {(income - expenses).toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id} hover>
                <TableCell>{tx.createdAt?.toDate().toLocaleDateString() || 'Pending'}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{tx.description}</TableCell>
                <TableCell><Chip label={tx.category.toUpperCase()} size="small" variant="outlined" sx={{ fontSize: 10, fontWeight: 'bold' }} /></TableCell>
                <TableCell sx={{ fontWeight: 900, color: tx.type === 'credit' ? '#10b981' : '#ef4444' }}>
                  {tx.type === 'credit' ? '+' : '-'} {tx.amount.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={tx.type.toUpperCase()} 
                    color={tx.type === 'credit' ? 'success' : 'error'} 
                    size="small" 
                    sx={{ fontWeight: 'bold', fontSize: 10 }} 
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
