import React, { useState, useRef } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Typography, 
  Box,
  Divider,
  CircularProgress
} from '@mui/material';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface LegalModalProps {
  userId: string;
  onAccepted: () => void;
}

export default function LegalModal({ userId, onAccepted }: LegalModalProps) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [loading, setLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 20) {
        setScrolledToBottom(true);
      }
    }
  };

  const handleAgree = () => {
    if (loading) return;
    setLoading(true);
    const acceptedAt = new Date().toISOString();

    try {
      localStorage.setItem('bin_legal_terms_accepted_v7_1', acceptedAt);
      localStorage.setItem(`bin_legal_terms_accepted_v7_1_${userId || 'guest'}`, acceptedAt);
      localStorage.setItem('bin_pdpl_consent', 'true');
      localStorage.setItem('bin_gps_consent', 'true');
    } catch (error) {
      console.warn('Local legal consent save failed:', error);
    }

    if (userId) {
      setDoc(doc(db, 'users', userId), {
        legalAcceptedAt: serverTimestamp(),
        legalAcceptedAtClient: acceptedAt,
        pdplCompliance: true,
        gpsConsent: true,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch((error) => {
        console.warn('Legal agreement background sync failed:', error);
      });
    }

    window.setTimeout(() => {
      onAccepted();
      setLoading(false);
    }, 50);
  };

  return (
    <Dialog 
      open={true} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 4, bgcolor: '#0B0B0C', color: '#fff', border: '1px solid #D4AF37' }
      }}
    >
      <DialogTitle sx={{ borderBottom: '1px solid #333', py: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, color: '#D4AF37', letterSpacing: 1 }}>
          SOVEREIGN INSTITUTIONAL AGREEMENT
        </Typography>
        <Typography variant="caption" sx={{ color: '#888' }}>
          V7.1 COMPLIANCE: UAE FED. LAW NO. 45/2021 & PDPL
        </Typography>
      </DialogTitle>
      
      <DialogContent 
        ref={contentRef} 
        onScroll={handleScroll}
        sx={{ py: 4, maxHeight: '60vh' }}
      >
        <Typography variant="body2" paragraph sx={{ mb: 4, color: '#D4AF37', fontWeight: 'bold' }}>
          PLEASE READ THE FOLLOWING TERMS CAREFULLY. YOU MUST SCROLL TO THE END TO ACCEPT.
        </Typography>

        <Section title="1. OVERVIEW" content="This Agreement governs your access to and use of the BIN GROUP Sovereign Asset Management platform. By accessing the platform, you represent that you are an authorized representative of an institutional entity or a registered resident of a BIN GROUP managed property." />
        
        <Section title="2. DATA PRIVACY & PDPL COMPLIANCE" content="In accordance with UAE Federal Decree-Law No. 45 of 2021 regarding the Protection of Personal Data (PDPL), BIN GROUP acts as the Data Controller. Your personal identity data, financial records, and maintenance history are encrypted and stored within the Sovereign UAE Cloud Infrastructure." />
        
        <Section title="3. REAL-TIME TELEMETRY & GPS" content="For Technicians and Field Agents: This platform utilizes real-time GPS tracking to optimize dispatch latency and ensure SLA compliance. For Tenants: Location data is utilized strictly during SOS dispatch events to provide accurate ETA for emergency responders." />
        
        <Section title="4. INSTITUTIONAL SECURITY" content="Unauthorized access, reverse engineering, or attempts to bypass the Role-Based Access Control (RBAC) are strictly prohibited and will be reported to the UAE Cyber Security Council." />

        <Section title="5. FINANCIAL OBLIGATIONS" content="Owners and Corporate Entities acknowledge that all management fees are calculated based on the Fixed Rounding Protocol (2-decimal precision) and are payable upon issuance of the Institutional Manifest." />

        <Box sx={{ mt: 4, p: 2, bgcolor: 'rgba(212, 175, 55, 0.1)', borderRadius: 2 }}>
          <Typography variant="caption" sx={{ color: '#D4AF37' }}>
            BY CLICKING 'I AGREE', YOU PROVIDE EXPLICIT CONSENT FOR DATA PROCESSING AND LOCATION TRACKING UNDER THE LAWS OF THE UNITED ARAB EMIRATES.
          </Typography>
        </Box>
      </DialogContent>

      <Divider sx={{ bgcolor: '#333' }} />

      <DialogActions sx={{ p: 3, justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: scrolledToBottom ? '#10b981' : '#666' }}>
          {scrolledToBottom ? '✓ Terms Reviewed' : '⇩ Scroll to bottom to enable'}
        </Typography>
        <Button 
          variant="contained" 
          disabled={!scrolledToBottom || loading}
          onClick={handleAgree}
          sx={{ 
            bgcolor: '#D4AF37', 
            color: '#000', 
            fontWeight: 900,
            px: 4,
            '&:hover': { bgcolor: '#C6A75E' },
            '&:disabled': { bgcolor: '#333', color: '#666' }
          }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : 'I AGREE & ENTER'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const Section = ({ title, content }: { title: string, content: string }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" sx={{ color: '#D4AF37', fontWeight: 900, mb: 1 }}>{title}</Typography>
    <Typography variant="body2" sx={{ color: '#ccc', textAlign: 'justify' }}>{content}</Typography>
  </Box>
);