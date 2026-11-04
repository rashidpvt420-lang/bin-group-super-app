import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  CalendarClock,
  FileText,
  Gauge,
  Home,
  Landmark,
  LineChart,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, getDocs, limit, query, where } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import {
  formatAed,
  formatPercent,
  resolveDigitalTwin,
  resolveOwnerDecisions,
  resolveOwnerFinancialTruth,
  resolvePredictiveMaintenance,
  resolvePropertyHealth,
  resolveTenantResidenceIntelligence,
  type TruthStatus,
} from '../utils/propertyIntelligenceEngine';
import Bi from './Bi';

type SupportedRole = 'owner' | 'tenant' | 'technician' | 'broker';

const toneByTruth: Record<TruthStatus, string> = {
  LIVE: '#22c55e',
  VERIFIED: '#38bdf8',
  ESTIMATED: '#f59e0b',
  FORECAST: '#a78bfa',
  MISSING: '#94a3b8',
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const dedupe = (rows: any[]) => {
  const map = new Map<string, any>();
  rows.forEach((row, index) => map.set(String(row?.id || row?.uid || `${index}`), row));
  return Array.from(map.values());
};

async function safeRows(collectionName: string, field: string, value?: string, max = 80) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value), limit(max)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn(`[RoleIntelligence] ${collectionName}.${field} read skipped`, error);
    return [] as any[];
  }
}

function TruthChip({ status }: { status: TruthStatus }) {
  const color = toneByTruth[status];
  return (
    <Chip
      size="small"
      label={status}
      sx={{
        height: 21,
        bgcolor: alpha(color, 0.12),
        color,
        border: `1px solid ${alpha(color, 0.28)}`,
        fontWeight: 950,
        fontSize: '0.62rem',
        letterSpacing: 0.6,
      }}
    />
  );
}

function MetricCard({
  label,
  value,
  status,
  basis,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  status: TruthStatus;
  basis: string;
  icon: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.25,
        height: '100%',
        bgcolor: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 3,
      }}
    >
      <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
        <Box sx={{ color: binThemeTokens.gold }}>{icon}</Box>
        <Tooltip title={basis} arrow>
          <Box><TruthChip status={status} /></Box>
        </Tooltip>
      </Stack>
      <Typography variant="h5" sx={{ mt: 1.5, color: '#fff', fontWeight: 950, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900 }}>
        {label.toUpperCase()}
      </Typography>
    </Paper>
  );
}

function OwnerIntelligence({ properties, contracts, tickets }: { properties: any[]; contracts: any[]; tickets: any[] }) {
  const navigate = useNavigate();
  const contract = contracts[0] || {};
  const financial = useMemo(() => resolveOwnerFinancialTruth(properties, contract), [properties, contract]);
  const health = useMemo(() => resolvePropertyHealth(properties, tickets), [properties, tickets]);
  const twin = useMemo(() => resolveDigitalTwin(properties), [properties]);
  const predictive = useMemo(() => resolvePredictiveMaintenance(tickets), [tickets]);
  const decisions = useMemo(() => resolveOwnerDecisions(properties, tickets, contract), [properties, tickets, contract]);
  const healthTone = health.score >= 85 ? '#22c55e' : health.score >= 65 ? '#f59e0b' : '#ef4444';

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Net Operating Income" value={formatAed(financial.noi.value)} status={financial.noi.status} basis={financial.noi.basis} icon={<Wallet size={20} />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Net Yield / ROI Basis" value={formatPercent(financial.netYield.value)} status={financial.netYield.status} basis={financial.netYield.basis} icon={<LineChart size={20} />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Occupancy" value={formatPercent(financial.occupancy.value)} status={financial.occupancy.status} basis={financial.occupancy.basis} icon={<Building2 size={20} />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard label="Potential Annual Rent Uplift" value={formatAed(financial.potentialUplift.value)} status={financial.potentialUplift.status} basis={financial.potentialUplift.basis} icon={<BarChart3 size={20} />} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={5}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,.58)', border: `1px solid ${alpha(healthTone, .25)}`, borderRadius: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
              <Box>
                <Typography variant="overline" sx={{ color: healthTone, fontWeight: 950, letterSpacing: 2 }}>PROPERTY HEALTH</Typography>
                <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950 }}>{health.score}/100</Typography>
              </Box>
              <Gauge size={30} color={healthTone} />
            </Stack>
            <Stack spacing={1.2} sx={{ mt: 2 }}>
              {health.reasons.slice(0, 4).map((reason) => (
                <Typography key={reason} variant="body2" sx={{ color: 'rgba(255,255,255,.66)' }}>• {reason}</Typography>
              ))}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} lg={7}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,.58)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, borderRadius: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>DIGITAL PROPERTY TWIN</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}><Bi en={"Portfolio → Building → Floor → Unit → Space → Asset"} ar={"المحفظة ← المبنى ← الطابق ← الوحدة ← المساحة ← الأصل"} /></Typography>
              </Box>
              <Home size={26} color={binThemeTokens.gold} />
            </Stack>
            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              {[
                ['Properties', twin.properties],
                ['Floors', twin.floors],
                ['Units', twin.units],
                ['Rooms / Spaces', twin.spaces],
                ['Registered Assets', twin.assets],
              ].map(([label, metric]) => (
                <Grid item xs={6} sm={4} key={String(label)}>
                  <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,.03)', borderRadius: 2.5 }}>
                    <Typography sx={{ color: '#fff', fontWeight: 950 }}>{metric}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)', fontWeight: 850 }}>{label}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,.58)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4 }}>
            <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mb: 2 }}>
              <AlertTriangle size={20} color="#f59e0b" />
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}><Bi en={"Owner Decision Center"} ar={"مركز قرارات المالك"} /></Typography>
            </Stack>
            {decisions.length ? (
              <Stack spacing={1.4}>
                {decisions.map((decision) => {
                  const color = decision.priority === 'HIGH' ? '#ef4444' : decision.priority === 'MEDIUM' ? '#f59e0b' : '#38bdf8';
                  return (
                    <Box key={`${decision.title}-${decision.detail}`} sx={{ p: 1.7, bgcolor: alpha(color, .06), border: `1px solid ${alpha(color, .18)}`, borderRadius: 2.5 }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography sx={{ color: '#fff', fontWeight: 900 }}>{decision.title}</Typography>
                        <Chip size="small" label={decision.priority} sx={{ color, bgcolor: alpha(color, .12), fontWeight: 950 }} />
                      </Stack>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{decision.detail}</Typography>
                    </Box>
                  );
                })}
              </Stack>
            ) : (
              <Alert severity="success"><Bi en={"No immediate owner decisions detected from the records currently available."} ar={"لا توجد قرارات عاجلة للمالك وفق السجلات المتاحة حالياً."} /></Alert>
            )}
            <Button onClick={() => navigate('/owner/approvals')} sx={{ mt: 2, color: binThemeTokens.gold, fontWeight: 950 }}>OPEN APPROVALS</Button>
          </Paper>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,.58)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4 }}>
            <Stack direction="row" alignItems="center" spacing={1.2} sx={{ mb: 2 }}>
              <Sparkles size={20} color={binThemeTokens.gold} />
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}><Bi en={"Predictive Maintenance"} ar={"الصيانة التنبؤية"} /></Typography>
            </Stack>
            {predictive.length ? predictive.slice(0, 3).map((item) => (
              <Box key={item.category} sx={{ mb: 1.5, p: 1.7, bgcolor: 'rgba(255,255,255,.03)', borderRadius: 2.5 }}>
                <Typography sx={{ color: '#fff', fontWeight: 900 }}>{item.category} · {item.count} <Bi en={"recorded issues"} ar={"مشكلات مسجلة"} /></Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{item.recommendation}</Typography>
              </Box>
            )) : (
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.6)' }}><Bi en={"No recurring 3+ issue pattern is visible yet. BIN will surface a recommendation when the recorded history supports one."} ar={"لا يوجد نمط متكرر (3 مشكلات أو أكثر) بعد. ستقدم BIN توصية عندما يدعمها السجل."} /></Typography>
            )}
            <Alert icon={<ShieldCheck size={18} />} severity="info" sx={{ mt: 2 }}><Bi en={"Recommendations are explainable heuristics from recorded history, not guaranteed failure predictions."} ar={"التوصيات تقديرات مبنية على السجل وليست تنبؤات مؤكدة بالأعطال."} /></Alert>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, bgcolor: alpha('#38bdf8', .035), border: `1px solid ${alpha('#38bdf8', .16)}`, borderRadius: 4 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline" sx={{ color: '#38bdf8', fontWeight: 950, letterSpacing: 2 }}>TRUST + MARKET INTELLIGENCE</Typography>
            <Typography sx={{ color: '#fff', fontWeight: 900 }}><Bi en={"Every financial number carries its source quality."} ar={"كل رقم مالي يوضح جودة مصدره."} /></Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: .5 }}><Bi en={"Stored market values/rents are labelled ESTIMATED. Contract/property records are VERIFIED. Collection and ticket activity can be LIVE. Missing market data is never invented."} ar={"قيم السوق والإيجارات المخزنة \"تقديرية\". سجلات العقود والعقارات \"موثقة\". التحصيل والطلبات قد تكون \"مباشرة\". لا يتم اختلاق بيانات السوق المفقودة."} /></Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {(['LIVE', 'VERIFIED', 'ESTIMATED', 'FORECAST', 'MISSING'] as TruthStatus[]).map((status) => <TruthChip key={status} status={status} />)}
          </Stack>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={() => navigate('/owner/documents')} startIcon={<FileText size={17} />} sx={{ borderColor: '#38bdf8', color: '#38bdf8', fontWeight: 950 }}>TRUST RECORDS</Button>
          <Button variant="outlined" onClick={() => navigate('/owner/property-passport')} startIcon={<Landmark size={17} />} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>PROPERTY PASSPORT</Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

function TenantIntelligence({ unit, contract, tickets }: { unit: any; contract: any; tickets: any[] }) {
  const navigate = useNavigate();
  const residence = useMemo(() => resolveTenantResidenceIntelligence(unit, contract, tickets), [unit, contract, tickets]);
  const healthTone = residence.unitHealth >= 85 ? '#22c55e' : residence.unitHealth >= 65 ? '#f59e0b' : '#ef4444';

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}><MetricCard label="Next Rent / Payment" value={formatAed(residence.nextPayment)} status={residence.nextPayment ? 'VERIFIED' : 'MISSING'} basis="Recorded contract or unit payment amount" icon={<Wallet size={20} />} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard label="Days Until Lease Action" value={residence.daysToRenewal === null ? '—' : residence.daysToRenewal} status={residence.daysToRenewal === null ? 'MISSING' : 'VERIFIED'} basis="Calculated from the recorded lease/contract end date" icon={<CalendarClock size={20} />} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard label="Active Maintenance" value={residence.activeTickets} status="LIVE" basis="Current active maintenance ticket records" icon={<Wrench size={20} />} /></Grid>
        <Grid item xs={12} sm={6} md={3}><MetricCard label="Unit Health" value={`${residence.unitHealth}/100`} status="LIVE" basis={residence.healthReasons.join(' · ')} icon={<Gauge size={20} />} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,.58)', border: `1px solid ${alpha(healthTone, .22)}`, borderRadius: 4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="overline" sx={{ color: healthTone, fontWeight: 950, letterSpacing: 2 }}>TENANT RESIDENCE CENTER</Typography>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{residence.unitLabel}</Typography>
              </Box>
              <Home color={healthTone} />
            </Stack>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: 1 }}><Bi en={"Lease, payments, maintenance, technician proof, notices, documents and move-out actions stay connected to the same residence record."} ar={"الإيجار والمدفوعات والصيانة وإثبات الفني والإشعارات والمستندات وإجراءات الخروج مرتبطة بسجل السكن نفسه."} /></Typography>
            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              {[
                ['Lease / payments', '/tenant/payments', <Wallet size={17} />],
                ['Maintenance status', '/tenant/tickets', <Activity size={17} />],
                ['Documents', '/tenant/documents', <FileText size={17} />],
                ['Move-in / Move-out', '/tenant/move-inspection/move-out', <Home size={17} />],
              ].map(([label, route, icon]) => (
                <Grid item xs={12} sm={6} key={String(label)}>
                  <Button fullWidth variant="outlined" onClick={() => navigate(String(route))} startIcon={icon as React.ReactNode} sx={{ justifyContent: 'flex-start', borderColor: 'rgba(255,255,255,.12)', color: '#fff', fontWeight: 900 }}>{String(label)}</Button>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
        <Grid item xs={12} lg={5}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,.58)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4 }}>
            <Stack direction="row" spacing={1.2} alignItems="center"><ShieldCheck size={20} color="#22c55e" /><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}><Bi en={"Maintenance Guarantee"} ar={"ضمان الصيانة"} /></Typography></Stack>
            <Stack spacing={1.2} sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.64)' }}><Bi en={"• Live request and status visibility"} ar={"• متابعة مباشرة للطلب والحالة"} /></Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.64)' }}><Bi en={"• Technician identity/status when recorded"} ar={"• هوية الفني وحالته عند تسجيلها"} /></Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.64)' }}><Bi en={"• Before/after proof tied to the ticket"} ar={"• إثبات قبل/بعد مرتبط بالطلب"} /></Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.64)' }}><Bi en={"• Approve, dispute or request revisit through the existing ticket workflow"} ar={"• الموافقة أو الاعتراض أو طلب زيارة أخرى عبر الطلب"} /></Typography>
            </Stack>
            <Button variant="contained" onClick={() => navigate('/tenant/emergency')} startIcon={<AlertTriangle size={17} />} sx={{ mt: 2.5, bgcolor: '#ef4444', color: '#fff', fontWeight: 950 }}>EMERGENCY CENTER</Button>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,.58)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4 }}>
            <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}><Bi en={"Unit Health + Prevention"} ar={"صحة الوحدة والوقاية"} /></Typography>
            {residence.predictive.length ? residence.predictive.slice(0, 3).map((item) => (
              <Box key={item.category} sx={{ mt: 1.5, p: 1.7, bgcolor: 'rgba(255,255,255,.03)', borderRadius: 2.5 }}><Typography sx={{ color: '#fff', fontWeight: 900 }}>{item.category}: {item.count} <Bi en={"recorded issues"} ar={"مشكلات مسجلة"} /></Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{item.recommendation}</Typography></Box>
            )) : <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.58)', mt: 1.5 }}><Bi en={"No recurring issue pattern is currently visible."} ar={"لا يوجد نمط مشكلات متكرر حالياً."} /></Typography>}
          </Paper>
        </Grid>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, height: '100%', bgcolor: alpha('#a78bfa', .035), border: `1px solid ${alpha('#a78bfa', .17)}`, borderRadius: 4 }}>
            <Stack direction="row" spacing={1.2} alignItems="center"><Bot size={20} color="#a78bfa" /><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}><Bi en={"BIN AI Residence Assistant"} ar={"مساعد BIN الذكي للسكن"} /></Typography></Stack>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.6)', mt: 1.5 }}><Bi en={"Ask about your lease expiry, payments, maintenance history, move-out requirements or where your technician is. Answers must stay inside your authorized residence data."} ar={"اسأل عن انتهاء إيجارك أو مدفوعاتك أو سجل الصيانة أو متطلبات الخروج أو موقع الفني. الإجابات تقتصر على بيانات سكنك المصرح بها."} /></Typography>
            <Button onClick={() => navigate('/tenant/ai-concierge')} sx={{ mt: 2, color: '#c4b5fd', fontWeight: 950 }}>OPEN AI CONCIERGE</Button>
          </Paper>
        </Grid>
      </Grid>

      <Alert icon={<MapPin size={18} />} severity="info"><Bi en={"BIN labels residence information by source quality. Estimated or forecast values must never be presented as verified live facts."} ar={"تصنف BIN معلومات السكن حسب جودة المصدر. لا تُعرض القيم التقديرية كحقائق موثقة."} /></Alert>
    </Stack>
  );
}

export default function RoleIntelligencePanel({ role }: { role: SupportedRole }) {
  const { user } = useRole();
  const [loading, setLoading] = useState(role === 'owner' || role === 'tenant');
  const [properties, setProperties] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [unit, setUnit] = useState<any>(null);

  useEffect(() => {
    let active = true;

    async function loadOwner() {
      const uid = String(user?.uid || '').trim();
      const email = normalizeEmail(user?.email);
      const [pOwnerId, pOwnerUid, cOwnerId, cOwnerUid, tOwnerId, tOwnerUid, tOwnerEmail] = await Promise.all([
        safeRows('properties', 'ownerId', uid),
        safeRows('properties', 'ownerUid', uid),
        safeRows('contracts', 'ownerId', uid),
        safeRows('contracts', 'ownerUid', uid),
        safeRows('maintenanceTickets', 'ownerId', uid),
        safeRows('maintenanceTickets', 'ownerUid', uid),
        safeRows('maintenanceTickets', 'ownerEmail', email),
      ]);
      if (!active) return;
      setProperties(dedupe([...pOwnerId, ...pOwnerUid]));
      setContracts(dedupe([...cOwnerId, ...cOwnerUid]));
      setTickets(dedupe([...tOwnerId, ...tOwnerUid, ...tOwnerEmail]));
    }

    async function loadTenant() {
      const uid = String(user?.uid || '').trim();
      const email = normalizeEmail(user?.email);
      const [unitsByUid, unitsByEmail, contractsByUid, contractsByEmail, ticketsByUid, ticketsByEmail] = await Promise.all([
        safeRows('units', 'tenantId', uid, 10),
        safeRows('units', 'tenantEmail', email, 10),
        safeRows('contracts', 'tenantId', uid, 10),
        safeRows('contracts', 'tenantEmail', email, 10),
        safeRows('maintenanceTickets', 'tenantId', uid),
        safeRows('maintenanceTickets', 'tenantEmail', email),
      ]);
      if (!active) return;
      setUnit(dedupe([...unitsByUid, ...unitsByEmail])[0] || null);
      setContracts(dedupe([...contractsByUid, ...contractsByEmail]));
      setTickets(dedupe([...ticketsByUid, ...ticketsByEmail]));
    }

    if (role !== 'owner' && role !== 'tenant') {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    const loader = role === 'owner' ? loadOwner() : loadTenant();
    loader.catch((error) => console.warn('[RoleIntelligence] dashboard intelligence load failed', error)).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, user?.uid, user?.email]);

  if (role !== 'owner' && role !== 'tenant') return null;

  return (
    <Paper elevation={0} data-testid={`${role}-intelligence-panel`} sx={{ mt: 2.5, p: { xs: 2, md: 3 }, bgcolor: 'rgba(2,6,23,.72)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, borderRadius: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2.5 }}>{role === 'owner' ? 'BIN OWNER INTELLIGENCE' : 'BIN RESIDENCE INTELLIGENCE'}</Typography>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{role === 'owner' ? 'Know · Earn · Protect · Control · Predict' : 'Live · Report · Track · Verify · Trust'}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center"><TruthChip status="LIVE" /><TruthChip status="VERIFIED" /><TruthChip status="ESTIMATED" /></Stack>
      </Stack>
      {loading ? (
        <Box sx={{ minHeight: 140, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} sx={{ color: binThemeTokens.gold }} /></Box>
      ) : role === 'owner' ? (
        <OwnerIntelligence properties={properties} contracts={contracts} tickets={tickets} />
      ) : (
        <TenantIntelligence unit={unit} contract={contracts[0] || {}} tickets={tickets} />
      )}
    </Paper>
  );
}
