import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Chip, CircularProgress, Container, Divider, Grid,
  Paper, Stack, Typography, alpha,
} from '@mui/material';
import { Award, Building2, CheckCircle2, Clock, MapPin, Phone, ShieldCheck, Wrench } from 'lucide-react';
import { db, doc, getDoc, collection, query, where, getDocs, orderBy, limit } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrandWatermark from '../../components/BrandWatermark';

const gold = binThemeTokens.gold;

const STATUS_COLORS: Record<string, string> = {
  VERIFIED: '#22C55E',
  ACTIVE: '#22C55E',
  COMPLETED: '#22C55E',
  PENDING: gold,
  OPEN: '#F59E0B',
  AT_RISK: '#EF4444',
};

export default function PropertyPassportPublicPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [passport, setPassport] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) { setError(true); setLoading(false); return; }
    async function load() {
      try {
        // Try propertyPassports collection first
        let snap = await getDoc(doc(db, 'propertyPassports', id));
        if (!snap.exists()) {
          // Try properties collection
          snap = await getDoc(doc(db, 'properties', id));
        }
        if (!snap.exists()) { setError(true); setLoading(false); return; }
        setPassport({ id: snap.id, ...snap.data() });

        // Load recent maintenance tickets (public-safe fields only)
        const tSnap = await getDocs(
          query(collection(db, 'maintenanceTickets'),
            where('propertyId', '==', id),
            orderBy('createdAt', 'desc'),
            limit(8))
        );
        setTickets(tSnap.docs.map(d => {
          const t = d.data();
          return {
            id: d.id,
            title: t.title || t.category || 'Maintenance',
            status: t.status || 'Completed',
            completedAt: t.completedAt?.toDate?.()?.toLocaleDateString('en-AE') || '',
            trade: t.trade || '',
          };
        }));
      } catch { setError(true); }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0B0B0C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: gold }} />
      </Box>
    );
  }

  if (error || !passport) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0B0B0C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ color: alpha('#fff', 0.35), fontWeight: 800 }}>Property passport not found.</Typography>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.2) }}>ID: {id}</Typography>
        </Box>
      </Box>
    );
  }

  const healthScore = passport.maintenanceCreditScore || passport.healthScore || 0;
  const scoreColor = healthScore >= 86 ? '#22C55E' : healthScore >= 72 ? gold : healthScore >= 55 ? '#F59E0B' : '#EF4444';
  const healthBand = healthScore >= 86 ? 'VERIFIED' : healthScore >= 72 ? 'WATCHLIST' : healthScore >= 55 ? 'AT_RISK' : 'CRITICAL';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B0B0C', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <BrandWatermark opacity={0.04} />

      {/* Grid overlay */}
      <Box sx={{ position: 'fixed', inset: 0, backgroundImage: `linear-gradient(${alpha(gold, 0.025)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(gold, 0.025)} 1px, transparent 1px)`, backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        {/* Credentials band */}
        <Box sx={{ bgcolor: '#111827', py: 0.8, borderBottom: `1px solid ${alpha(gold, 0.2)}` }}>
          <Container maxWidth="md">
            <Stack direction="row" justifyContent="center" alignItems="center" spacing={1.5} flexWrap="wrap">
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
              <Typography sx={{ color: alpha('#fff', 0.7), fontSize: '0.72rem', fontWeight: 800 }}>BIN GROUP · All Kind Building Projects Contracting LLC S.P.C</Typography>
              <Typography sx={{ color: alpha(gold, 0.5), fontSize: '0.7rem' }}>·</Typography>
              <Typography sx={{ color: alpha(gold, 0.75), fontSize: '0.72rem', fontWeight: 800 }}>Est. 2010 · Al Ain, UAE</Typography>
            </Stack>
          </Container>
        </Box>

        <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
          {/* Header */}
          <Stack alignItems="center" spacing={3} sx={{ mb: 6, textAlign: 'center' }}>
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <Box sx={{ position: 'absolute', inset: -12, borderRadius: '28px', background: `radial-gradient(circle, ${alpha(gold, 0.22)} 0%, transparent 70%)` }} />
              <Box component="img" src="/logo.png" alt="BIN GROUP" sx={{ width: 80, height: 80, borderRadius: '18px', border: `2px solid ${alpha(gold, 0.6)}`, boxShadow: `0 0 0 4px ${alpha(gold, 0.1)}, 0 16px 48px ${alpha(gold, 0.35)}`, position: 'relative', zIndex: 1 }} />
            </Box>

            <Box>
              <Chip label="BIN GROUP VERIFIED PASSPORT" sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.3)}`, letterSpacing: 2, mb: 2 }} />
              <Typography variant="h4" fontWeight={950} sx={{ color: '#fff' }}>
                {passport.address || passport.propertyName || `Property ${id}`}
              </Typography>
              {passport.emirate && (
                <Stack direction="row" spacing={0.8} justifyContent="center" alignItems="center" sx={{ mt: 0.8 }}>
                  <MapPin size={14} color={alpha(gold, 0.65)} />
                  <Typography sx={{ color: alpha('#fff', 0.5), fontWeight: 800, fontSize: '0.85rem' }}>
                    {passport.emirate}, UAE
                  </Typography>
                </Stack>
              )}
            </Box>
          </Stack>

          {/* Health Score */}
          <Paper sx={{ p: 4, mb: 4, bgcolor: alpha(scoreColor, 0.06), border: `1px solid ${alpha(scoreColor, 0.25)}`, borderRadius: 4, textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: alpha(scoreColor, 0.7), fontWeight: 900, letterSpacing: 3 }}>MAINTENANCE CREDIT SCORE</Typography>
            <Typography sx={{ color: scoreColor, fontWeight: 950, fontSize: '4rem', lineHeight: 1.1, my: 1 }}>{healthScore}</Typography>
            <Chip label={healthBand} sx={{ bgcolor: alpha(scoreColor, 0.15), color: scoreColor, fontWeight: 950, border: `1px solid ${alpha(scoreColor, 0.3)}` }} />
            <Typography variant="body2" sx={{ color: alpha('#fff', 0.4), mt: 1.5, fontWeight: 700 }}>
              Verified by BIN GROUP Property OS · {new Date().toLocaleDateString('en-AE', { year: 'numeric', month: 'long' })}
            </Typography>
          </Paper>

          {/* Stats grid */}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {[
              { label: 'PROPERTY TYPE', value: passport.propertyType || passport.propertyClass || 'Residential', icon: Building2 },
              { label: 'UNITS', value: passport.units || passport.unitCount || '1', icon: Building2 },
              { label: 'OPEN TICKETS', value: tickets.filter(t => t.status === 'OPEN').length, icon: Wrench },
              { label: 'JOBS COMPLETED', value: tickets.filter(t => ['COMPLETED', 'CLOSED', 'RESOLVED'].includes(t.status)).length, icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => (
              <Grid item xs={6} sm={3} key={label}>
                <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.04)', border: `1px solid ${alpha(gold, 0.15)}`, borderRadius: 3, textAlign: 'center' }}>
                  <Icon size={18} color={alpha(gold, 0.6)} />
                  <Typography sx={{ color: gold, fontWeight: 950, fontSize: '1.5rem', mt: 0.5 }}>{value}</Typography>
                  <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), fontWeight: 900, fontSize: '0.6rem', letterSpacing: 1.5 }}>{label}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          {/* Trust factors */}
          <Paper sx={{ p: 3.5, mb: 4, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${alpha(gold, 0.15)}`, borderRadius: 4 }}>
            <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 3, display: 'block', mb: 2.5 }}>
              VERIFIED TRUST FACTORS
            </Typography>
            <Grid container spacing={1.5}>
              {[
                'Before-and-after photo proof on every job',
                'GPS-verified technician dispatch',
                'Digital job cards with SLA timestamps',
                'Licensed under Abu Dhabi trade licence',
                'Bilingual English/Arabic documentation',
                'Maintenance credit score updated in real-time',
              ].map(item => (
                <Grid item xs={12} sm={6} key={item}>
                  <Stack direction="row" spacing={1.2} alignItems="center">
                    <ShieldCheck size={15} color="#22C55E" style={{ flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ color: alpha('#fff', 0.6), fontWeight: 800 }}>{item}</Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* Maintenance history */}
          {tickets.length > 0 && (
            <Paper sx={{ p: 3.5, mb: 4, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${alpha(gold, 0.15)}`, borderRadius: 4 }}>
              <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 3, display: 'block', mb: 2.5 }}>
                RECENT MAINTENANCE HISTORY
              </Typography>
              <Stack spacing={1.5}>
                {tickets.map(ticket => (
                  <Box key={ticket.id}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Wrench size={14} color={alpha(gold, 0.55)} />
                        <Typography sx={{ color: alpha('#fff', 0.7), fontWeight: 850, fontSize: '0.88rem' }}>{ticket.title}</Typography>
                        {ticket.trade && <Typography variant="caption" sx={{ color: alpha('#fff', 0.3), fontWeight: 800 }}>{ticket.trade}</Typography>}
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {ticket.completedAt && <Typography variant="caption" sx={{ color: alpha('#fff', 0.25), fontWeight: 800 }}>{ticket.completedAt}</Typography>}
                        <Chip label={ticket.status} size="small" sx={{ bgcolor: alpha(STATUS_COLORS[ticket.status] || gold, 0.12), color: STATUS_COLORS[ticket.status] || gold, fontWeight: 950, fontSize: '0.6rem' }} />
                      </Stack>
                    </Stack>
                    <Divider sx={{ borderColor: alpha(gold, 0.08), mt: 1.5 }} />
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Contact */}
          <Paper sx={{ p: 3.5, bgcolor: alpha(gold, 0.05), border: `1px solid ${alpha(gold, 0.2)}`, borderRadius: 4, textAlign: 'center' }}>
            <Award size={28} color={gold} />
            <Typography variant="h6" fontWeight={950} sx={{ color: gold, mt: 1.5 }}>Managed by BIN GROUP</Typography>
            <Typography variant="body2" sx={{ color: alpha('#fff', 0.5), mt: 0.5, mb: 2 }}>
              All Kind Building Projects Contracting LLC S.P.C · Licensed in Abu Dhabi, UAE
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
              <Stack direction="row" spacing={0.8} alignItems="center">
                <Phone size={14} color={alpha(gold, 0.7)} />
                <Typography sx={{ color: alpha(gold, 0.7), fontWeight: 850, fontSize: '0.85rem' }}>+971 55 7474560</Typography>
              </Stack>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <Clock size={14} color={alpha(gold, 0.5)} />
                <Typography sx={{ color: alpha('#fff', 0.35), fontWeight: 800, fontSize: '0.8rem' }}>Sun–Thu 8am–6pm</Typography>
              </Stack>
            </Stack>
          </Paper>

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 4, color: alpha('#fff', 0.18), fontWeight: 700 }}>
            © 2026 BIN GROUP · Property Truth Infrastructure · Al Ain, UAE · {id}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
