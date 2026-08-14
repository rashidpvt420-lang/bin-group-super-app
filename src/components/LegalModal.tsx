import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const endRef = useRef<HTMLDivElement>(null);

  const markAgreementReviewed = useCallback(() => {
    // Review readiness is intentionally monotonic. A late ResizeObserver
    // callback must not disable consent after the user already reached the end.
    setScrolledToBottom(true);
    try {
      sessionStorage.setItem(`bin_legal_terms_reviewed_v7_1_${userId || 'guest'}`, 'true');
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [userId]);

  const evaluateScrollReadiness = useCallback(() => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      // Some desktop and accessibility layouts show the complete agreement
      // without a scrollbar. In that case no scroll event is emitted, so the
      // consent action must become available immediately rather than remain
      // permanently disabled.
      if (
        scrollHeight <= clientHeight + 20 ||
        scrollTop + clientHeight >= scrollHeight - 20
      ) {
        markAgreementReviewed();
      }
    }
  }, [markAgreementReviewed]);

  useEffect(() => {
    try {
      const globalAccepted = localStorage.getItem('bin_legal_terms_accepted_v7_1');
      const userAccepted = userId ? localStorage.getItem(`bin_legal_terms_accepted_v7_1_${userId}`) : null;
      if (globalAccepted || userAccepted) {
        onAccepted();
      }
    } catch {
      // Ignore storage errors in restricted environments
    }
  }, [userId, onAccepted]);

  useEffect(() => {
    let reviewed = false;
    try {
      reviewed = sessionStorage.getItem(`bin_legal_terms_reviewed_v7_1_${userId || 'guest'}`) === 'true';
    } catch {
      // Ignore storage errors in restricted environments.
    }
    setScrolledToBottom(reviewed);
  }, [userId]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    const frame = window.requestAnimationFrame(evaluateScrollReadiness);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(evaluateScrollReadiness)
      : null;
    observer?.observe(content);
    content.addEventListener('scroll', evaluateScrollReadiness, { passive: true });
    const endObserver = typeof IntersectionObserver !== 'undefined' && endRef.current
      ? new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) markAgreementReviewed();
        },
        { root: content, threshold: 0.75 },
      )
      : null;
    if (endObserver && endRef.current) endObserver.observe(endRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      endObserver?.disconnect();
      content.removeEventListener('scroll', evaluateScrollReadiness);
    };
  }, [evaluateScrollReadiness, markAgreementReviewed]);

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
        const isPermissionDenied = error?.code === 'permission-denied' || 
                                   error?.message?.includes('permission-denied') || 
                                   error?.message?.includes('insufficient permissions');
        if (isPermissionDenied) {
          console.warn('Legal consent background update skipped (restricted).');
        } else {
          console.warn('Legal agreement background sync failed:', error);
        }
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
        onScroll={evaluateScrollReadiness}
        data-testid="legal-agreement-content"
        tabIndex={0}
        sx={{ py: 4, maxHeight: '60vh' }}
      >
        <Typography variant="body2" paragraph sx={{ mb: 4, color: '#D4AF37', fontWeight: 'bold' }}>
          PLEASE READ THE FOLLOWING TERMS CAREFULLY. YOU MUST SCROLL TO THE END TO ACCEPT.
        </Typography>

        <Section title="1. OVERVIEW" content="This Agreement governs your access to and use of the BIN GROUP Sovereign Asset Management platform. By accessing the platform, you represent that you are an authorized representative of an institutional entity or a registered resident of a BIN GROUP managed property." />
        
        <Section title="2. DATA PRIVACY & PDPL COMPLIANCE" content="In accordance with UAE Federal Decree-Law No. 45 of 2021 regarding the Protection of Personal Data (PDPL), BIN GROUP acts as the Data Controller. Your personal identity data, financial records, and maintenance history are encrypted and stored within the Sovereign UAE Cloud Infrastructure." />
        
        <Section title="3. REAL-TIME TELEMETRY & GPS" content="For Technicians and Field Agents: this platform uses foreground GPS points to support dispatch visibility and SLA compliance. For Tenants: location data is used during SOS dispatch events to provide a rough arrival estimate for emergency responders." />
        
        <Section title="4. INSTITUTIONAL SECURITY" content="Unauthorized access, reverse engineering, or attempts to bypass the Role-Based Access Control (RBAC) are strictly prohibited and will be reported to the UAE Cyber Security Council." />

        <Section title="5. FINANCIAL OBLIGATIONS" content="Owners and Corporate Entities acknowledge that all management fees are calculated based on the Fixed Rounding Protocol (2-decimal precision) and are payable upon issuance of the Institutional Manifest." />

        <Box sx={{ mt: 4, p: 2, bgcolor: 'rgba(212, 175, 55, 0.1)', borderRadius: 2 }}>
          <Typography variant="caption" sx={{ color: '#D4AF37' }}>
            BY CLICKING 'I AGREE', YOU PROVIDE EXPLICIT CONSENT FOR DATA PROCESSING AND LOCATION TRACKING UNDER THE LAWS OF THE UNITED ARAB EMIRATES.
          </Typography>
        </Box>
        <Box ref={endRef} data-testid="legal-agreement-end" sx={{ height: 1 }} aria-hidden="true" />
      </DialogContent>

      <Divider sx={{ bgcolor: '#333' }} />

      <DialogActions sx={{ p: 3, justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: scrolledToBottom ? '#10b981' : '#666' }}>
          {scrolledToBottom ? '✓ Terms Reviewed' : '⇩ Scroll to bottom to enable'}
        </Typography>
        <Button 
          data-testid="legal-agreement-accept"
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
