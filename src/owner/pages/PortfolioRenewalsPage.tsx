import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { collection, db, getDocs, limit, query, Timestamp, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type RenewalWatchRecord = {
  id: string;
  contractId?: string;
  propertyId?: string;
  propertyName?: string;
  unitNumber?: string;
  expiryAt?: Timestamp;
  expiresAt?: Timestamp;
  daysRemaining?: number;
  renewalStatus?: string;
  status?: string;
  pdfUrl?: string | null;
  sourceCollection?: string;
  sourceId?: string;
};

const timestampMs = (value: any) => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function PortfolioRenewalsPage() {
  const navigate = useNavigate();
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [renewals, setRenewals] = useState<RenewalWatchRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user?.uid) {
        setRenewals([]);
        setLoadError(tx('owner.renewals.auth_required', 'Authenticated Owner identity is unavailable. Reload the portal and try again.'));
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError('');
      try {
        // Canonical Owner renewal authority is the immutable ownerId written by
        // the contract renewal watcher. Avoid broad collection scans.
        const snap = await getDocs(
          query(
            collection(db, 'contract_renewal_watch'),
            where('ownerId', '==', user.uid),
            limit(50),
          ),
        );
        const rows = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<RenewalWatchRecord, 'id'>) }))
          .sort((a, b) => {
            const aDays = Number.isFinite(Number(a.daysRemaining)) ? Number(a.daysRemaining) : 999999;
            const bDays = Number.isFinite(Number(b.daysRemaining)) ? Number(b.daysRemaining) : 999999;
            if (aDays !== bDays) return aDays - bDays;
            return timestampMs(a.expiryAt || a.expiresAt) - timestampMs(b.expiryAt || b.expiresAt);
          });

        if (!cancelled) setRenewals(rows);
      } catch (error: any) {
        console.error('[PortfolioRenewals] Failed to load renewal watch records:', error);
        if (!cancelled) {
          setRenewals([]);
          setLoadError(tx('owner.renewals.load_failed', 'Renewal records could not be loaded. Please retry.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, tx]);

  const headline = useMemo(() => {
    if (!renewals.length) return tx('owner.renewals.none', 'No active renewal record is linked yet.');
    const nearest = renewals[0];
    const days = nearest.daysRemaining;
    if (typeof days !== 'number') return tx('owner.renewals.available', 'Renewal records are available for your portfolio.');
    if (days < 0) return tx('owner.renewals.overdue', `At least one renewal is overdue by ${Math.abs(days)} day(s).`);
    if (days === 0) return tx('owner.renewals.today', 'A contract renewal reaches expiry today.');
    return tx('owner.renewals.nearest', `Nearest renewal milestone in ${days} day(s).`);
  }, [renewals, tx]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: binThemeTokens.goldHover }} />
      </Box>
    );
  }

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2 }}>
            {tx('owner.renewals.overline', 'PORTFOLIO RENEWAL WATCH')}
          </Typography>
          <Typography variant="h4" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>
            {tx('owner.renewals.title', 'Contract renewal timeline')}
          </Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 700, mt: 1, maxWidth: 820 }}>
            {tx('owner.renewals.desc', 'Contract expiry, renewal status and generated notice PDFs from the server renewal watcher appear here for your owned portfolio.')}
          </Typography>
        </Box>

        {loadError && <Alert severity="error">{loadError}</Alert>}

        <Card sx={{ bgcolor: '#FFFFFF', color: binThemeTokens.textPrimary, border: `1px solid ${binThemeTokens.border}`, borderRadius: 4 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 800 }}>{headline}</Typography>
            <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1 }}>
              {tx('owner.renewals.evidence', 'Renewal records are generated by the contract renewal watcher and include notice timing, status and linked PDF evidence.')}
            </Typography>
          </CardContent>
        </Card>

        {renewals.map((record) => {
          const expiryRaw = record.expiryAt || record.expiresAt;
          const expiry = expiryRaw?.toDate?.();
          const statusLabel = String(record.renewalStatus || record.status || 'RENEWAL_WATCH').toUpperCase();
          const days = typeof record.daysRemaining === 'number' ? record.daysRemaining : null;
          const urgency = days === null ? 'default' : days < 0 ? 'error' : days <= 14 ? 'warning' : 'success';

          return (
            <Card key={record.id} sx={{ bgcolor: '#FFFFFF', color: binThemeTokens.textPrimary, border: `1px solid ${binThemeTokens.border}`, borderRadius: 4 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} useFlexGap flexWrap="wrap">
                    <Typography sx={{ fontWeight: 900 }}>
                      {record.propertyName || tx('owner.renewals.property', 'Property')}
                      {record.unitNumber ? ` · ${tx('owner.renewals.unit', 'Unit')} ${record.unitNumber}` : ''}
                    </Typography>
                    <Chip size="small" color={urgency as any} label={statusLabel} />
                    {days !== null && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={days < 0
                          ? tx('owner.renewals.days_overdue', `${Math.abs(days)} day(s) overdue`)
                          : tx('owner.renewals.days_remaining', `${days} day(s) remaining`)}
                      />
                    )}
                  </Stack>

                  <Typography sx={{ color: binThemeTokens.textSecondary }}>
                    {tx('owner.renewals.expiry', 'Expiry')}: {expiry ? expiry.toLocaleDateString('en-AE') : tx('owner.renewals.not_provided', 'Not provided')}
                  </Typography>

                  {record.contractId && (
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>
                      {tx('owner.renewals.contract_ref', 'Contract')}: {record.contractId}
                    </Typography>
                  )}

                  <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} useFlexGap flexWrap="wrap">
                    <Button
                      variant="outlined"
                      onClick={() => navigate(record.contractId ? `/owner/contracts?contractId=${encodeURIComponent(record.contractId)}` : '/owner/contracts')}
                      sx={{ borderColor: binThemeTokens.goldHover, color: binThemeTokens.goldHover, fontWeight: 900 }}
                    >
                      {tx('owner.renewals.open_contract', 'Open Contract')}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => navigate('/owner/documents')}
                      sx={{ borderColor: binThemeTokens.border, color: binThemeTokens.textPrimary, fontWeight: 900 }}
                    >
                      {tx('owner.renewals.open_documents', 'Open Documents')}
                    </Button>
                    {record.pdfUrl && (
                      <Button
                        variant="contained"
                        onClick={() => window.open(record.pdfUrl || '', '_blank', 'noopener,noreferrer')}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}
                      >
                        {tx('owner.renewals.open_pdf', 'Open Renewal PDF')}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
