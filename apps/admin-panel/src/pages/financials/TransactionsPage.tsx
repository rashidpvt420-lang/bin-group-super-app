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
import { useLanguage } from '@bin/shared';

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
  const { t, lang, isRTL } = useLanguage();
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

  const formatAED = (val: number) => {
    return val.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h4" sx={{ fontWeight: 900 }}>
          {t('nav.admin')} <Box component="span" sx={{ color: '#10b981' }}>{t('fin.ledger')}</Box>
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, borderLeft: isRTL ? 'none' : '6px solid #10b981', borderRight: isRTL ? '6px solid #10b981' : 'none' }}>
            <CardContent sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Typography variant="overline" sx={{ fontWeight: 'bold' }}>{t('fin.total_income')}</Typography>
                <ArrowUpCircle color="#10b981" size={20} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 900, color: '#10b981' }}>{t('common.currency_aed')} {formatAED(income)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, borderLeft: isRTL ? 'none' : '6px solid #ef4444', borderRight: isRTL ? '6px solid #ef4444' : 'none' }}>
            <CardContent sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Typography variant="overline" sx={{ fontWeight: 'bold' }}>{t('fin.total_expenses')}</Typography>
                <ArrowDownCircle color="#ef4444" size={20} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 900, color: '#ef4444' }}>{t('common.currency_aed')} {formatAED(expenses)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, bgcolor: '#1e293b', color: '#fff' }}>
            <CardContent sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Typography variant="overline" sx={{ fontWeight: 'bold', opacity: 0.8 }}>{t('fin.net_position')}</Typography>
                <Activity color="#fff" size={20} />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>{t('common.currency_aed')} {formatAED(income - expenses)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: 4 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.date')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.description')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.category')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.amount')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.table.type')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id} hover sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{tx.createdAt?.toDate().toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE') || t('status.pending')}</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{tx.description}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Chip label={tx.category.toUpperCase()} size="small" variant="outlined" sx={{ fontSize: 10, fontWeight: 'bold' }} /></TableCell>
                <TableCell sx={{ fontWeight: 900, color: tx.type === 'credit' ? '#10b981' : '#ef4444', textAlign: isRTL ? 'right' : 'left' }}>
                  {tx.type === 'credit' ? '+' : '-'} {formatAED(tx.amount)}
                </TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Chip 
                    label={tx.type === 'credit' ? t('status.settled') : t('status.pending')} 
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
