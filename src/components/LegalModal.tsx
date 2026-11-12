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
  CircularProgress,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import { db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { LEGAL_CONSENT_VERSION, BIN_GROUP_LEGAL_ENTITY_NAME } from '../utils/ownerInitialContractPolicy';

interface LegalModalProps {
  userId: string;
  onAccepted: () => void;
}

export default function LegalModal({ userId, onAccepted }: LegalModalProps) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processingConsent, setProcessingConsent] = useState(false);
  const [retentionConsent, setRetentionConsent] = useState(false);
  const [crossBorderAiConsent, setCrossBorderAiConsent] = useState(false);
  const allConsents = processingConsent && retentionConsent && crossBorderAiConsent;
  const contentRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const markAgreementReviewed = useCallback(() => {
    // Review readiness is intentionally monotonic. A late ResizeObserver
    // callback must not disable consent after the user already reached the end.
    setScrolledToBottom(true);
    try {
      sessionStorage.setItem(`bin_legal_terms_reviewed_legal-review-2026-11-12_${userId || 'guest'}`, 'true');
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
      const globalAccepted = localStorage.getItem('bin_legal_terms_accepted_legal-review-2026-11-12');
      const userAccepted = userId ? localStorage.getItem(`bin_legal_terms_accepted_legal-review-2026-11-12_${userId}`) : null;
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
      reviewed = sessionStorage.getItem(`bin_legal_terms_reviewed_legal-review-2026-11-12_${userId || 'guest'}`) === 'true';
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
    if (loading || !allConsents || !scrolledToBottom) return;
    setLoading(true);
    const acceptedAt = new Date().toISOString();

    try {
      localStorage.setItem('bin_legal_terms_accepted_legal-review-2026-11-12', acceptedAt);
      localStorage.setItem(`bin_legal_terms_accepted_legal-review-2026-11-12_${userId || 'guest'}`, acceptedAt);
      localStorage.setItem('bin_pdpl_consent', 'true');
      localStorage.setItem('bin_legal_processing_consent', 'true');
      localStorage.setItem('bin_legal_retention_consent', 'true');
      localStorage.setItem('bin_legal_cross_border_ai_consent', 'true');
    } catch (error) {
      console.warn('Local legal consent save failed:', error);
    }

    if (userId) {
      setDoc(doc(db, 'users', userId), {
        legalAcceptedAt: serverTimestamp(),
        legalAcceptedAtClient: acceptedAt,
        legalConsentVersion: LEGAL_CONSENT_VERSION,
        legalAcceptedVersion: LEGAL_CONSENT_VERSION,
        termsVersion: LEGAL_CONSENT_VERSION,
        pdplCompliance: true,
        legalProcessingConsent: true,
        legalRetentionConsent: true,
        legalCrossBorderAiConsent: true,
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
          Legal terms / الشروط القانونية
        </Typography>
        <Typography variant="caption" sx={{ color: '#888', display: 'block' }}>
          {BIN_GROUP_LEGAL_ENTITY_NAME}. Version {LEGAL_CONSENT_VERSION}. Legal citations are for counsel to confirm.
        </Typography>
        <Typography variant="caption" sx={{ color: '#888', display: 'block', direction: 'rtl', textAlign: 'right' }}>
          الاستشهادات القانونية للتأكيد من المستشار القانوني. وإذا تعارض النصان يُعتد بالنص العربي.
        </Typography>
      </DialogTitle>
      
      <DialogContent 
        ref={contentRef} 
        onScroll={evaluateScrollReadiness}
        data-testid="legal-agreement-content"
        tabIndex={0}
        sx={{ py: 4, maxHeight: '60vh' }}
      >
        <Typography variant="body2" paragraph sx={{ mb: 2, color: '#D4AF37', fontWeight: 'bold' }}>
          Please read these terms carefully and scroll to the end. You must give the three explicit consents below before you can accept. / يُرجى قراءة هذه الشروط والتمرير حتى النهاية. ويجب منح الموافقات الثلاث الصريحة أدناه قبل القبول.
        </Typography>
        <Typography variant="body2" paragraph sx={{ color: '#ccc' }}>
          These terms are issued in English and Arabic. If there is any conflict, the Arabic text prevails (for counsel to confirm). The full public Terms of Service and Privacy Policy are at /terms-of-service.html and /privacy-policy.html. They replace the previous public Terms (including any 5–5.5% fee and two-strike SOS wording) and withdraw Master Agreement v1.
        </Typography>
        <Typography variant="body2" paragraph sx={{ color: '#ccc', direction: 'rtl', textAlign: 'right' }}>
          تصدر هذه الشروط بالإنجليزية والعربية. وفي حال التعارض يُعتد بالنص العربي (للتأكيد من المستشار القانوني). والنص الكامل لشروط الخدمة وسياسة الخصوصية في الصفحات العلنية. وقد حلت محل الشروط السابقة (بما في ذلك أي رسم 5–5.5% أو إيقاف استغاثة من ضربتين) وسحبت الاتفاقية الإطارية الإصدار 1.
        </Typography>

        <Section title="1. Overview / نظرة عامة" content="These terms govern access to the BIN GROUP platform operated by the legal entity named above. Owner commercial terms follow Owner Service Agreement v1.3: a 13-month term, month-1 management fee of AED 0, 15% mobilisation, cash or cheque in Phase 1 subject to an AED 50,000 cash cap per property contract, and emergency works never suspended without separate written notice." />
        <Section title="2. Processing of personal data / معالجة البيانات الشخصية" content="BIN GROUP processes personal data to perform the contract and operate the platform. A citation to confirm is Federal Decree-Law 45 of 2021 (PDPL) (for counsel to confirm). Data is not used for marketing without a separate opt-in." />
        <Section title="3. Retention / الاحتفاظ" content="Records are kept for the published periods. The signed-contract audit trail (IP address, device identifier, server timestamp, and SHA-256 hash of accepted terms) is retained for 10 years and is immutable. Retention periods are for counsel to confirm." />
        <Section title="4. Cross-border transfer and third-party AI processors / النقل عبر الحدود ومعالجو الذكاء الاصطناعي" content="Some features use third-party AI processors and may transfer personal data outside the UAE. This happens only with your explicit consent below. Optional AI features can be declined. This description is for counsel to confirm." />
        <Section title="5. Technician GPS / موقع الفني" content="Technician location is collected only during active duty, and only after a separate explicit technician consent in onboarding and the technician contract. Tracking stops at the end of the shift or active job." />

        <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(212, 175, 55, 0.1)', borderRadius: 2 }}>
          <FormControlLabel sx={{ alignItems: 'flex-start', color: '#fff', display: 'flex', mb: 1 }} control={<Checkbox data-testid="legal-consent-processing" checked={processingConsent} onChange={(e) => setProcessingConsent(e.target.checked)} sx={{ color: '#D4AF37' }} />} label={<Typography variant="caption">I explicitly consent to BIN GROUP processing my personal data to perform the service, as described in the Privacy Policy. / أوافق موافقة صريحة على معالجة BIN GROUP لبياناتي الشخصية لتنفيذ الخدمة وفق سياسة الخصوصية.</Typography>} />
          <FormControlLabel sx={{ alignItems: 'flex-start', color: '#fff', display: 'flex', mb: 1 }} control={<Checkbox data-testid="legal-consent-retention" checked={retentionConsent} onChange={(e) => setRetentionConsent(e.target.checked)} sx={{ color: '#D4AF37' }} />} label={<Typography variant="caption">I explicitly consent to retention of my data for the published periods, including the 10-year immutable signed-contract audit trail. / أوافق موافقة صريحة على الاحتفاظ ببياناتي للمدد المعلنة، بما في ذلك مسار تدقيق العقود الموقعة غير القابل للتغيير لمدة 10 سنوات.</Typography>} />
          <FormControlLabel sx={{ alignItems: 'flex-start', color: '#fff', display: 'flex' }} control={<Checkbox data-testid="legal-consent-cross-border-ai" checked={crossBorderAiConsent} onChange={(e) => setCrossBorderAiConsent(e.target.checked)} sx={{ color: '#D4AF37' }} />} label={<Typography variant="caption">I explicitly consent to cross-border transfer of my personal data via third-party AI processors as described in the Privacy Policy. / أوافق موافقة صريحة على نقل بياناتي الشخصية عبر الحدود عبر معالجي ذكاء اصطناعي من أطراف ثالثة وفق سياسة الخصوصية.</Typography>} />
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
          {loading ? <CircularProgress size={24} color="inherit" /> : 'I agree / أوافق'}
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
