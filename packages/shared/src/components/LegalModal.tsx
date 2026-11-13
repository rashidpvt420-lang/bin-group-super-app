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
  CircularProgress,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface LegalModalProps {
  userId: string;
  onAccepted: () => void;
}

export function LegalModal({ userId, onAccepted }: LegalModalProps) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processingConsent, setProcessingConsent] = useState(false);
  const [retentionConsent, setRetentionConsent] = useState(false);
  const [crossBorderAiConsent, setCrossBorderAiConsent] = useState(false);
  const allConsents = processingConsent && retentionConsent && crossBorderAiConsent;
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
    if (loading || !allConsents) return;
    setLoading(true);
    const acceptedAt = new Date().toISOString();

    try {
      localStorage.setItem('bin_legal_terms_accepted_legal-review-2026-11-12', acceptedAt);
      localStorage.setItem(`bin_legal_terms_accepted_legal-review-2026-11-12_${userId || 'guest'}`, acceptedAt);
      localStorage.setItem('bin_pdpl_consent', 'true');
    } catch (error) {
      console.warn('Local legal consent save failed:', error);
    }

    if (userId) {
      setDoc(doc(db, 'users', userId), {
        legalAcceptedAt: serverTimestamp(),
        legalAcceptedAtClient: acceptedAt,
        legalConsentVersion: 'legal-review-2026-11-12',
        legalAcceptedVersion: 'legal-review-2026-11-12',
        termsVersion: 'legal-review-2026-11-12',
        pdplCompliance: true,
        legalProcessingConsent: true,
        legalRetentionConsent: true,
        legalCrossBorderAiConsent: true,
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

      <Box sx={{ px: 3, pb: 1 }}>
          <FormControlLabel control={<Checkbox data-testid="legal-consent-processing" checked={processingConsent} onChange={(e) => setProcessingConsent(e.target.checked)} />} label="I explicitly consent to processing of my personal data / أوافق موافقة صريحة على معالجة بياناتي الشخصية" />
          <FormControlLabel control={<Checkbox data-testid="legal-consent-retention" checked={retentionConsent} onChange={(e) => setRetentionConsent(e.target.checked)} />} label="I explicitly consent to published retention, including the 10-year signed-contract audit trail / أوافق على الاحتفاظ المعلن بما في ذلك تدقيق العقود لـ 10 سنوات" />
          <FormControlLabel control={<Checkbox data-testid="legal-consent-cross-border-ai" checked={crossBorderAiConsent} onChange={(e) => setCrossBorderAiConsent(e.target.checked)} />} label="I explicitly consent to cross-border transfer via third-party AI processors / أوافق على النقل عبر الحدود عبر معالجي ذكاء اصطناعي من أطراف ثالثة" />
        </Box>
      <Divider sx={{ bgcolor: '#333' }} />

      <DialogActions sx={{ p: 3, justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: scrolledToBottom ? '#10b981' : '#666' }}>
          {scrolledToBottom ? '✓ Terms Reviewed' : '⇩ Scroll to bottom to enable'}
        </Typography>
        <Button 
          variant="contained" 
          disabled={!scrolledToBottom || !allConsents || loading}
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