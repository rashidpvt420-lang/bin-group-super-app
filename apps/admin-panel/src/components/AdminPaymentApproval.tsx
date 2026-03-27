import React, { useState, useEffect } from 'react';
import { db, auth, functions } from '../lib/firebase';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, getDoc 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Button, IconButton, Chip, Modal, CircularProgress 
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';

interface PaymentApproval {
  id: string;
  amount: number;
  type: string;
  paymentMethod: string;
  receiptUrl: string;
  tenantId: string;
  propertyId: string;
  submittedAt: any;
  status: string;
}

export default function AdminPaymentApproval() {
  const [pendingPayments, setPendingPayments] = useState<PaymentApproval[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'payments'),
      where('status', '==', 'pending')
    );

    return onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PaymentApproval));
      setPendingPayments(fetched);
    });
  }, []);

  const handleApprove = async (payment: PaymentApproval) => {
    setProcessingId(payment.id);
    try {
      // 1. Update Payment Status to VERIFIED (Audit-ready)
      const paymentRef = doc(db, 'payments', payment.id);
      await updateDoc(paymentRef, {
        status: 'VERIFIED',
        approvedAt: new Date().toISOString(),
        approvedBy: auth.currentUser?.email || 'System Admin'
      });

      // 2. Resolve Property Owner
      const propertySnap = await getDoc(doc(db, 'properties', payment.propertyId));
      if (!propertySnap.exists()) throw new Error("Property not found");
      const ownerId = propertySnap.data().ownerId;

      // 3. Move to Escrow (V2.0 — Enterprise Escrow State Machine)
      const settlementEngine = httpsCallable(functions, 'financialSettlementEngine');
      await settlementEngine({
        action: 'LOCK_TO_ESCROW',
        paymentId: payment.id,
        gross_amount: payment.amount,
        ownerId: ownerId,
        propertyId: payment.propertyId,
        type: payment.type || 'rent_collection'
      });

      alert(`Payment Verified. Funds are now LOCKED_IN_ESCROW. Settlement will occur once maintenance/lease milestones are COMPLETED.`);
    } catch (error: any) {
      console.error("Approval flow failed:", error);
      alert(`Critical Error: ${error.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 2, color: 'white' }}>
        <SecurityIcon sx={{ color: '#10b981', fontSize: 40 }} /> MANUAL PAYMENT APPROVALS
      </Typography>

      <TableContainer component={Paper} sx={{ bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#94a3b8', fontWeight: 'bold' }}>Invoice</TableCell>
              <TableCell sx={{ color: '#94a3b8', fontWeight: 'bold' }}>Method</TableCell>
              <TableCell align="right" sx={{ color: '#94a3b8', fontWeight: 'bold' }}>Amount (AED)</TableCell>
              <TableCell sx={{ color: '#94a3b8', fontWeight: 'bold' }}>Tenant</TableCell>
              <TableCell align="center" sx={{ color: '#94a3b8', fontWeight: 'bold' }}>Receipt</TableCell>
              <TableCell align="right" sx={{ color: '#94a3b8', fontWeight: 'bold' }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pendingPayments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 10, color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>
                  No pending manual payments in the queue.
                </TableCell>
              </TableRow>
            ) : (
              pendingPayments.map((payment) => (
                <TableRow key={payment.id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                  <TableCell sx={{ color: 'white' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>#{payment.id.slice(0, 8)}</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>{payment.type}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={payment.paymentMethod} size="small" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 'bold', fontSize: '10px' }} />
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#10b981', fontWeight: '900' }}>
                    {payment.amount.toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ color: '#cbd5e1' }}>{payment.tenantId.slice(0, 10)}...</TableCell>
                  <TableCell align="center">
                    <IconButton onClick={() => setSelectedImage(payment.receiptUrl)} sx={{ color: '#3b82f6' }}>
                      <VisibilityIcon />
                    </IconButton>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      disabled={processingId === payment.id}
                      onClick={() => handleApprove(payment)}
                      startIcon={processingId === payment.id ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
                      sx={{ 
                        bgcolor: '#10b981', 
                        '&:hover': { bgcolor: '#059669' },
                        fontWeight: 'bold',
                        borderRadius: 2
                      }}
                    >
                      Approve
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Image Modal */}
      <Modal open={!!selectedImage} onClose={() => setSelectedImage(null)}>
        <Box sx={{ 
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '80%', maxWidth: 800, bgcolor: '#0f172a', border: '2px solid #1e293b', boxShadow: 24, p: 4, borderRadius: 4 
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold' }}>PAYMENT PROOF VERIFICATION</Typography>
            <IconButton onClick={() => setSelectedImage(null)} sx={{ color: 'white' }}><CloseIcon /></IconButton>
          </Box>
          <Box 
            component="img"
            src={selectedImage || ''} 
            alt="Payment Receipt" 
            sx={{ 
              width: '100%', 
              height: 'auto', 
              maxHeight: '70vh', 
              objectFit: 'contain', 
              borderRadius: 4 
            }} 
          />
        </Box>
      </Modal>
    </Box>
  );
}
