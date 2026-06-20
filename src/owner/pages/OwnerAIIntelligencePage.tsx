import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Grid, Paper, Stack, Typography, CircularProgress,
  alpha, Chip, LinearProgress, Button, Divider,
} from '@mui/material';
import {
  Sparkles, Brain, TrendingUp, Shield, Zap, AlertTriangle,
  CheckCircle2, Activity, Building2, Target, RefreshCw,
  BarChart2, Lock, Eye, Clock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';
import { useAI } from '../../context/AIContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { SovereignAIChat } from '../../components/SovereignAIChat';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import {
  getPropertyIntelligenceProfile,
  summarizePortfolioIntelligence,
} from '../../utils/contractIntelligence';
import {
  buildPropertyTruthLedger,
  getTruthHealthBand,
} from '../../utils/propertyTruthIntelligence';
import { generatePredictiveIntelligence } from '../../utils/predictiveIntelligence';

const gold = binThemeTokens.gold;
const CARD = 'rgba(15, 23, 42, 0.42)';
const BORDER = `1px solid ${alpha(gold, 0.18)}`;

const HEALTH_COLORS: Record<string, string> = {
  VERIFIED: '#22C55E',
  WATCHLIST: gold,
  AT_RISK: '#F59E0B',
  CRITICAL: '#EF4444',
};
const AUTOPILOT_COLORS: Record<string, string> = {
  READY: '#22C55E',
  WATCH: gold,
  LOCKED: '#EF4444',
};

function ScoreGauge({ score }: { score: number }) {
  const band = getTruthHealthBand(score);
  const color = HEALTH_COLORS[band] || gold;
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 120, height: 120 }}>
        <CircularProgress
          variant="determinate"
          value={100}
          size={120}
          thickness={5}
          sx={{ color: alpha(color, 0.12), position: 'absolute' }}
        />
        <CircularProgress
          variant="determinate"
          value={score}
          size={120}
          thickness={5}
          sx={{ color, position: 'absolute' }}
        />
        <Box sx={{ position: 'relative', textAlign: 'center' }}>
          <Typography sx={{ color, fontWeight: 950, fontSize: '2rem', lineHeight: 1 }}>{score}</Typography>
          <Typography sx={{ color: alpha('#fff', 0.45), fontSize: '0.6rem', fontWeight: 900, letterSpacing: 1.5 }}>/100</Typography>
        </Box>
      </Box>
      <Chip
        label={band}
        size="small"
        sx={{ mt: 1, bgcolor: alpha(color, 0.15), color, fontWeight: 950, fontSize: '0.65rem', border: `1px solid ${alpha(color, 0.3)}` }}
      />
    </Box>
  );
}

function StatTile({ label, value, icon: Icon, color = gold, sub }: { label: string; value: string | number; icon: any; color?: string; sub?: string }) {
  return (
    <Paper sx={{ p: 3, bgcolor: CARD, border: BORDER, borderRadius: 4, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.4), fontWeight: 900, letterSpacing: 2, display: 'block', mb: 0.5 }}>{label}</Typography>
          <Typography sx={{ color, fontWeight: 950, fontSize: '1.8rem', lineHeight: 1 }}>{value}</Typography>
          {sub && <Typography variant="caption" sx={{ color: alpha('#fff', 0.38), fontWeight: 800, mt: 0.5, display: 'block' }}>{sub}</Typography>}
        </Box>
        <Box sx={{ p: 1, bgcolor: alpha(color, 0.12), borderRadius: 2, color }}><Icon size={20} /></Box>
      </Stack>
    </Paper>
  );
}

function PropertyCard({ property, profile }: { property: any; profile: any }) {
  const classColor = profile.propertyClass === 'UNKNOWN' ? alpha('#fff', 0.35) : gold;
  return (
    <Paper sx={{ p: 3, bgcolor: CARD, border: BORDER, borderRadius: 4, height: '100%', transition: 'box-shadow .2s', '&:hover': { boxShadow: `0 0 24px ${alpha(gold, 0.14)}` } }}>
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: '0.95rem' }} noWrap>
            {property.address || property.propertyName || property.id}
          </Typography>
          <Chip label={profile.propertyClass} size="small" sx={{ bgcolor: alpha(classColor, 0.13), color: classColor, fontWeight: 950, fontSize: '0.6rem', border: `1px solid ${alpha(classColor, 0.25)}` }} />
        </Stack>

        <Typography variant="body2" sx={{ color: alpha('#fff', 0.55), lineHeight: 1.7 }}>
          {profile.ownerProblemStatement}
        </Typography>

        <Divider sx={{ borderColor: alpha(gold, 0.12) }} />

        <Stack spacing={0.8}>
          {(profile.recommendedContracts || profile.requiredEvidence || []).slice(0, 3).map((item: string, i: number) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <CheckCircle2 size={13} color={gold} style={{ flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: alpha('#fff', 0.6), fontWeight: 800 }}>{item}</Typography>
            </Stack>
          ))}
        </Stack>

        {profile.occupancyModel && profile.occupancyModel !== 'NONE_REQUIRED' && (
          <Chip
            label={`Occupancy: ${profile.occupancyModel.replace(/_/g, ' ')}`}
            size="small"
            sx={{ alignSelf: 'flex-start', bgcolor: alpha(gold, 0.08), color: alpha(gold, 0.75), fontWeight: 850, fontSize: '0.6rem', border: `1px solid ${alpha(gold, 0.18)}` }}
          />
        )}
      </Stack>
    </Paper>
  );
}

function AlertCard({ alert }: { alert: any }) {
  const colors: Record<string, string> = { CRITICAL: '#EF4444', WARNING: '#F59E0B', INFO: gold };
  const icons: Record<string, any> = { CRITICAL: AlertTriangle, WARNING: AlertTriangle, INFO: Eye };
  const color = colors[alert.type] || gold;
  const Icon = icons[alert.type] || Eye;
  return (
    <Paper sx={{ p: 2.5, bgcolor: alpha(color, 0.06), border: `1px solid ${alpha(color, 0.22)}`, borderRadius: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box sx={{ pt: 0.3, flexShrink: 0 }}><Icon size={16} color={color} /></Box>
        <Box>
          <Typography sx={{ color, fontWeight: 950, fontSize: '0.78rem' }}>{alert.message}</Typography>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), mt: 0.4, display: 'block' }}>{alert.recommendation}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

export default function OwnerAIIntelligencePage() {
  const { user } = useRole();
  const navigate = useNavigate();
  const { isRTL, tx } = useLanguage();
  const { setPageContext } = useAI();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [passports, setPassports] = useState<any[]>([]);
  const [predictive, setPredictive] = useState<any>(null);

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email.toLowerCase();

    const unsubProps = onSnapshot(
      query(collection(db, 'properties'), where('ownerEmail', '==', email)),
      (snap) => setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubPassports = onSnapshot(
      query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email)),
      (snap) => {
        setPassports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );

    return () => { unsubProps(); unsubPassports(); };
  }, [user?.email]);

  const buildPredictive = useCallback(async (props: any[], pass: any[]) => {
    if (!props.length || !user?.email) return;
    setRefreshing(true);
    try {
      const first = props[0];
      const passport = pass.find(p => p.propertyId === first.id) || pass[0] || {};
      const result = await generatePredictiveIntelligence({
        propertyId: first.id,
        ownerId: user.email,
        workOrderHistory: passport.workOrders || [],
        financialHistory: passport.financials || [],
        propertyDetails: {
          sqft: first.sqft || 1200,
          grade: first.grade || 'B',
          propertyType: first.propertyType || 'APARTMENT',
          emirate: first.emirate || 'Abu Dhabi',
        },
      });
      setPredictive(result);
    } catch {
      // silently degrade
    } finally {
      setRefreshing(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (!loading && properties.length) {
      buildPredictive(properties, passports);
    }
  }, [loading, properties, passports, buildPredictive]);

  const profiles = properties.map(p => ({
    property: p,
    profile: getPropertyIntelligenceProfile(p),
  }));
  const portfolio = summarizePortfolioIntelligence(properties);

  const pageCtx = {
    properties,
    passports,
    propertyCount: properties.length,
    portfolio,
  };

  const ledger = buildPropertyTruthLedger(pageCtx);

  useEffect(() => {
    setPageContext({ ...pageCtx, ledger });
  }, [properties.length, passports.length]);

  const dir = isRTL ? 'rtl' : 'ltr';
  const textAlign: 'right' | 'left' = isRTL ? 'right' : 'left';

  if (loading) {
    return (
      <Box sx={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexDirection: 'column' }}>
        <CircularProgress sx={{ color: gold }} />
        <Typography variant="overline" sx={{ color: alpha('#fff', 0.35), fontWeight: 900, letterSpacing: 3 }}>
          {tx('ai.loading', 'CALIBRATING INTELLIGENCE ENGINE')}
        </Typography>
      </Box>
    );
  }

  const autopilotColor = AUTOPILOT_COLORS[ledger.autopilotMode] || gold;

  return (
    <Box sx={{ pb: 8, direction: dir }}>

      {/* ── HEADER ── */}
      <Box sx={{ mb: 5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
          <Box sx={{ p: 1, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, display: 'inline-flex' }}>
            <Brain size={20} />
          </Box>
          <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 4 }}>
            {tx('ai.overline', 'AI PROPERTY INTELLIGENCE')}
          </Typography>
        </Stack>
        <Typography variant="h4" fontWeight={950} sx={{ color: '#fff', mb: 1, textAlign }}>
          {tx('ai.title', 'Property Intelligence Center')}
        </Typography>
        <Typography variant="body2" sx={{ color: alpha('#fff', 0.45), maxWidth: 600, fontWeight: 700, textAlign }}>
          {tx('ai.subtitle', 'Predictive maintenance, portfolio scoring, and AI-assisted contract intelligence — all in one view.')}
        </Typography>
      </Box>

      {/* ── CREDIT SCORE ROW ── */}
      <Paper sx={{ p: 4, mb: 4, bgcolor: CARD, border: BORDER, borderRadius: 5, background: `linear-gradient(135deg, rgba(15,23,42,0.6) 0%, rgba(17,24,39,0.8) 100%)` }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={3} sx={{ display: 'flex', justifyContent: 'center' }}>
            <ScoreGauge score={ledger.maintenanceCreditScore} />
          </Grid>
          <Grid item xs={12} md={9}>
            <Typography variant="overline" sx={{ color: alpha(gold, 0.65), fontWeight: 900, letterSpacing: 3 }}>
              {tx('ai.credit_score', 'MAINTENANCE CREDIT SCORE')}
            </Typography>
            <Typography variant="h3" fontWeight={950} sx={{ color: gold, mb: 1 }}>
              {ledger.maintenanceCreditScore} <Typography component="span" sx={{ color: alpha(gold, 0.45), fontSize: '1rem', fontWeight: 800 }}>/ 100</Typography>
            </Typography>

            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              {[
                { label: tx('ai.autopilot', 'AUTOPILOT'), value: ledger.autopilotMode, color: autopilotColor, icon: Zap },
                { label: tx('ai.open_missions', 'OPEN MISSIONS'), value: String(ledger.openMissionCount), color: ledger.openMissionCount > 0 ? '#F59E0B' : '#22C55E', icon: Activity },
                { label: tx('ai.sla_breaches', 'SLA BREACHES'), value: String(ledger.slaBreachCount), color: ledger.slaBreachCount > 0 ? '#EF4444' : '#22C55E', icon: Clock },
                { label: tx('ai.proof_coverage', 'PROOF COVERAGE'), value: `${ledger.proofCoveragePct}%`, color: ledger.proofCoveragePct >= 80 ? '#22C55E' : gold, icon: Shield },
              ].map(({ label, value, color, icon: Icon }) => (
                <Grid item xs={6} sm={3} key={label}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: alpha(color, 0.07), borderRadius: 3, border: `1px solid ${alpha(color, 0.22)}` }}>
                    <Icon size={16} color={color} />
                    <Typography sx={{ color, fontWeight: 950, fontSize: '1.1rem', mt: 0.5 }}>{value}</Typography>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.38), fontWeight: 900, fontSize: '0.6rem', letterSpacing: 1.5 }}>{label}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>

            {ledger.nextBestAction && (
              <Box sx={{ mt: 2, p: 2, bgcolor: alpha(gold, 0.07), borderRadius: 3, border: `1px solid ${alpha(gold, 0.2)}` }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Target size={16} color={gold} style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: alpha(gold, 0.7), fontWeight: 900, letterSpacing: 2 }}>NEXT BEST ACTION</Typography>
                    <Typography sx={{ color: alpha('#fff', 0.78), fontWeight: 800, fontSize: '0.85rem', mt: 0.3 }}>{ledger.nextBestAction}</Typography>
                  </Box>
                </Stack>
              </Box>
            )}
          </Grid>
        </Grid>
      </Paper>

      {/* ── PORTFOLIO SUMMARY TILES ── */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={3}>
          <StatTile label={tx('ai.stat_properties', 'PROPERTIES')} value={properties.length} icon={Building2} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatTile label={tx('ai.stat_hybrid', 'HYBRID RECOMMENDED')} value={portfolio.recommendedHybrid || 0} icon={TrendingUp} color="#22C55E" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatTile label={tx('ai.stat_no_deed', 'MISSING TITLE DEEDS')} value={portfolio.missingTitleDeeds || 0} icon={AlertTriangle} color={portfolio.missingTitleDeeds > 0 ? '#F59E0B' : '#22C55E'} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatTile label={tx('ai.stat_repeat_defects', 'REPEAT DEFECTS')} value={ledger.repeatDefectCount} icon={RefreshCw} color={ledger.repeatDefectCount > 0 ? '#EF4444' : '#22C55E'} />
        </Grid>
      </Grid>

      {/* ── PROPERTY INTELLIGENCE CARDS ── */}
      {profiles.length > 0 && (
        <Box sx={{ mb: 5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
            <Building2 size={18} color={gold} />
            <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 3 }}>
              {tx('ai.per_property', 'PER-PROPERTY INTELLIGENCE')}
            </Typography>
          </Stack>
          <Grid container spacing={3}>
            {profiles.map(({ property, profile }) => (
              <Grid item xs={12} sm={6} md={4} key={property.id}>
                <PropertyCard property={property} profile={profile} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* ── PREDICTIVE INTELLIGENCE ── */}
      <Box sx={{ mb: 5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <BarChart2 size={18} color={gold} />
            <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 3 }}>
              {tx('ai.predictive', 'PREDICTIVE INTELLIGENCE')}
            </Typography>
          </Stack>
          {properties.length > 0 && (
            <Button
              size="small"
              onClick={() => buildPredictive(properties, passports)}
              disabled={refreshing}
              startIcon={<RefreshCw size={14} />}
              sx={{ color: alpha(gold, 0.7), fontWeight: 900, fontSize: '0.72rem', border: `1px solid ${alpha(gold, 0.22)}`, borderRadius: 2 }}
            >
              {refreshing ? tx('ai.refreshing', 'Refreshing…') : tx('ai.refresh', 'Refresh')}
            </Button>
          )}
        </Stack>

        {refreshing && !predictive && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: gold }} />
            <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), display: 'block', mt: 2, fontWeight: 900, letterSpacing: 2 }}>
              RUNNING PREDICTIVE MODELS…
            </Typography>
          </Box>
        )}

        {!refreshing && !predictive && !properties.length && (
          <Paper sx={{ p: 4, bgcolor: CARD, border: BORDER, borderRadius: 4, textAlign: 'center' }}>
            <Sparkles size={32} color={alpha(gold, 0.4)} />
            <Typography sx={{ color: alpha('#fff', 0.4), mt: 2, fontWeight: 800 }}>
              {tx('ai.no_properties', 'Add a property to unlock predictive intelligence.')}
            </Typography>
            <Button
              variant="outlined"
              onClick={() => navigate('/owner/properties')}
              sx={{ mt: 2, borderColor: alpha(gold, 0.35), color: gold, fontWeight: 950, borderRadius: 3 }}
            >
              {tx('ai.add_property', 'Add Property')}
            </Button>
          </Paper>
        )}

        {predictive && (
          <Grid container spacing={3}>
            {/* Asset Resilience */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3.5, bgcolor: CARD, border: BORDER, borderRadius: 4, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
                  <Activity size={18} color={gold} />
                  <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 2 }}>
                    ASSET RESILIENCE
                  </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" spacing={3} sx={{ mb: 3 }}>
                  <Box>
                    <Typography sx={{ color: alpha('#fff', 0.45), fontWeight: 900, fontSize: '0.7rem', letterSpacing: 2 }}>HEALTH INDEX</Typography>
                    <Typography sx={{ color: '#22C55E', fontWeight: 950, fontSize: '2.4rem', lineHeight: 1 }}>
                      {predictive.assetResilience.healthIndex}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={predictive.assetResilience.healthIndex}
                      sx={{ height: 8, borderRadius: 4, bgcolor: alpha('#22C55E', 0.12), '& .MuiLinearProgress-bar': { bgcolor: '#22C55E', borderRadius: 4 } }}
                    />
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), mt: 0.5, display: 'block', fontWeight: 800 }}>
                      Predicted decay: {predictive.assetResilience.predictedDecay12Months}mo
                    </Typography>
                  </Box>
                </Stack>

                <Divider sx={{ borderColor: alpha(gold, 0.1), mb: 2 }} />

                <Typography variant="caption" sx={{ color: alpha('#fff', 0.38), fontWeight: 900, letterSpacing: 2, display: 'block', mb: 1.5 }}>
                  CRITICAL FAILURE WINDOWS
                </Typography>
                <Stack spacing={1.5}>
                  {predictive.assetResilience.criticalFailureWindows.map((w: any, i: number) => (
                    <Box key={i} sx={{ p: 1.8, bgcolor: alpha('#F59E0B', 0.07), borderRadius: 3, border: `1px solid ${alpha('#F59E0B', 0.18)}` }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography sx={{ color: '#F59E0B', fontWeight: 950, fontSize: '0.8rem' }}>{w.assetCategory}</Typography>
                        <Chip label={`${Math.round(w.probability * 100)}% risk`} size="small" sx={{ bgcolor: alpha('#F59E0B', 0.12), color: '#F59E0B', fontWeight: 950, fontSize: '0.6rem' }} />
                      </Stack>
                      <Typography variant="caption" sx={{ color: alpha('#fff', 0.45), display: 'block', mt: 0.5 }}>{w.guidance}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>
            </Grid>

            {/* Financial Forecast */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3.5, bgcolor: CARD, border: BORDER, borderRadius: 4, height: '100%' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
                  <TrendingUp size={18} color={gold} />
                  <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 2 }}>
                    FINANCIAL FORECAST
                  </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" spacing={3} sx={{ mb: 3 }}>
                  <Box>
                    <Typography sx={{ color: alpha('#fff', 0.45), fontWeight: 900, fontSize: '0.7rem', letterSpacing: 2 }}>EXPECTED NET ROI</Typography>
                    <Typography sx={{ color: '#22C55E', fontWeight: 950, fontSize: '2.4rem', lineHeight: 1 }}>
                      {predictive.financialForecast.expectedNetROI}%
                    </Typography>
                  </Box>
                </Stack>

                <Divider sx={{ borderColor: alpha(gold, 0.1), mb: 2 }} />

                <Typography variant="caption" sx={{ color: alpha('#fff', 0.38), fontWeight: 900, letterSpacing: 2, display: 'block', mb: 1.5 }}>
                  QUARTERLY PROJECTIONS
                </Typography>
                <Stack spacing={1}>
                  {predictive.financialForecast.quarterlyProjections.map((q: any) => (
                    <Stack key={q.quarter} direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ color: alpha('#fff', 0.55), fontWeight: 850, fontSize: '0.8rem' }}>{q.quarter}</Typography>
                      <Stack direction="row" spacing={2}>
                        <Typography sx={{ color: '#22C55E', fontWeight: 950, fontSize: '0.8rem' }}>+{q.projectedIncome.toLocaleString()} AED</Typography>
                        <Typography sx={{ color: '#EF4444', fontWeight: 850, fontSize: '0.8rem' }}>-{q.projectedExpenses.toLocaleString()}</Typography>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>

                <Divider sx={{ borderColor: alpha(gold, 0.1), my: 2 }} />

                <Stack spacing={0.8}>
                  {predictive.financialForecast.riskFactors.map((r: string) => (
                    <Stack key={r} direction="row" spacing={1} alignItems="center">
                      <AlertTriangle size={12} color="#F59E0B" style={{ flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), fontWeight: 800 }}>{r}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            </Grid>

            {/* Alerts */}
            {predictive.alerts?.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 3, display: 'block', mb: 1.5 }}>
                  INTELLIGENCE ALERTS
                </Typography>
                <Grid container spacing={2}>
                  {predictive.alerts.map((alert: any, i: number) => (
                    <Grid item xs={12} sm={6} md={4} key={i}>
                      <AlertCard alert={alert} />
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            )}
          </Grid>
        )}
      </Box>

      {/* ── EVIDENCE PROTOCOL ── */}
      <Paper sx={{ p: 3, mb: 5, bgcolor: CARD, border: `1px solid ${alpha('#22C55E', 0.2)}`, borderRadius: 4 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ p: 1, bgcolor: alpha('#22C55E', 0.1), borderRadius: 2, color: '#22C55E', flexShrink: 0 }}>
            <Lock size={18} />
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: alpha('#22C55E', 0.7), fontWeight: 900, letterSpacing: 2 }}>EVIDENCE PROTOCOL</Typography>
            <Typography sx={{ color: alpha('#fff', 0.7), fontWeight: 800, fontSize: '0.85rem' }}>{ledger.evidenceProtocol}</Typography>
          </Box>
        </Stack>
      </Paper>

      {/* ── AI CHAT ── */}
      <SovereignAIChat role="owner" onNavigate={navigate} />
    </Box>
  );
}
