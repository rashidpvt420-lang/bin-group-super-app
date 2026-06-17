import React, { useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Divider, Grid, Paper,
  Stack, Tab, Tabs, TextField, Typography, alpha, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import {
  Award, Briefcase, CheckCircle2, Clock, DollarSign,
  MapPin, Plus, Star, Users, Wrench, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
  db, collection, query, where, onSnapshot,
  addDoc, serverTimestamp, updateDoc, doc,
} from '../../lib/firebase';
import { getQuoteAwardGate, getQuoteBenchmark } from '../../lib/uaeOwnerTrustOsConfig';

const gold = binThemeTokens.gold;
const CARD = 'rgba(15, 23, 42, 0.42)';
const BORDER = `1px solid ${alpha(gold, 0.18)}`;

const TRADES = [
  'Plumber', 'Electrician', 'AC Technician', 'Painter', 'Carpenter',
  'Tiler', 'Welder', 'General Maintenance', 'Civil / Structural', 'Landscaping',
];
const EMIRATES = ['Al Ain', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#22C55E',
  BIDDING: gold,
  AWARDED: '#22C55E',
  COMPLETED: '#22C55E',
  CANCELLED: '#EF4444',
};

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

function ContractorCard({ c }: { c: any }) {
  return (
    <Paper sx={{ p: 3, bgcolor: CARD, border: BORDER, borderRadius: 4, height: '100%', transition: 'all .2s', '&:hover': { boxShadow: `0 0 24px ${alpha(gold, 0.14)}`, borderColor: alpha(gold, 0.35) } }}>
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: '0.95rem' }}>{c.businessName || c.name}</Typography>
            <Typography variant="caption" sx={{ color: alpha(gold, 0.7), fontWeight: 800 }}>{c.trade}</Typography>
          </Box>
          {c.verified && (
            <Chip icon={<CheckCircle2 size={12} />} label="VERIFIED" size="small"
              sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 950, fontSize: '0.6rem', border: `1px solid ${alpha('#22C55E', 0.25)}` }} />
          )}
        </Stack>

        <Stack direction="row" spacing={0.8} alignItems="center">
          {[1, 2, 3, 4, 5].map(i => (
            <Star key={i} size={12} fill={i <= (c.rating || 0) ? gold : 'none'} color={gold} />
          ))}
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.4), fontWeight: 800 }}>
            {c.rating?.toFixed(1) || 'New'} · {c.jobsCompleted || 0} jobs
          </Typography>
        </Stack>

        <Stack direction="row" spacing={0.8} alignItems="center">
          <MapPin size={12} color={alpha(gold, 0.55)} />
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.45), fontWeight: 800 }}>
            {(c.coverage || []).join(' · ') || 'Al Ain, UAE'}
          </Typography>
        </Stack>

        <Typography variant="body2" sx={{ color: alpha('#fff', 0.45), lineHeight: 1.65, fontSize: '0.8rem' }}>
          {c.bio || 'Licensed contractor available for residential and commercial maintenance.'}
        </Typography>

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ pt: 0.5 }}>
          <Typography sx={{ color: gold, fontWeight: 950, fontSize: '0.88rem' }}>
            {c.rateMin && c.rateMax ? `${c.rateMin}–${c.rateMax} AED/hr` : 'Quote on request'}
          </Typography>
          <Button size="small" sx={{ color: gold, fontWeight: 950, fontSize: '0.72rem', border: `1px solid ${alpha(gold, 0.28)}`, borderRadius: 2, px: 1.5 }}>
            Invite to Bid
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function JobCard({ job, onAward }: { job: any; onAward?: (jobId: string, bidId: string) => void }) {
  const [bids, setBids] = useState<any[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'contractorBids'), where('jobId', '==', job.id)),
      snap => setBids(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [job.id]);

  const statusColor = STATUS_COLORS[job.status] || gold;

  return (
    <Paper sx={{ p: 3.5, bgcolor: CARD, border: BORDER, borderRadius: 4 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography sx={{ color: '#fff', fontWeight: 950 }}>{job.title}</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
              <Chip label={job.trade} size="small" sx={{ bgcolor: alpha(gold, 0.1), color: gold, fontWeight: 950, fontSize: '0.6rem' }} />
              <Chip label={job.emirate || 'Al Ain'} size="small" sx={{ bgcolor: alpha('#fff', 0.05), color: alpha('#fff', 0.5), fontWeight: 850, fontSize: '0.6rem' }} />
            </Stack>
          </Box>
          <Chip label={job.status} size="small" sx={{ bgcolor: alpha(statusColor, 0.12), color: statusColor, fontWeight: 950, border: `1px solid ${alpha(statusColor, 0.25)}` }} />
        </Stack>

        <Typography variant="body2" sx={{ color: alpha('#fff', 0.5), lineHeight: 1.7 }}>{job.description}</Typography>

        <Stack direction="row" spacing={2}>
          <Stack direction="row" spacing={0.8} alignItems="center">
            <DollarSign size={13} color={alpha(gold, 0.6)} />
            <Typography variant="caption" sx={{ color: alpha('#fff', 0.45), fontWeight: 800 }}>
              Budget: {job.budgetMin}–{job.budgetMax} AED
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.8} alignItems="center">
            <Users size={13} color={alpha(gold, 0.6)} />
            <Typography variant="caption" sx={{ color: alpha('#fff', 0.45), fontWeight: 800 }}>
              {bids.length} bid{bids.length !== 1 ? 's' : ''}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.8} alignItems="center">
            <Clock size={13} color={alpha(gold, 0.6)} />
            <Typography variant="caption" sx={{ color: alpha('#fff', 0.45), fontWeight: 800 }}>
              {job.urgency || 'Normal'}
            </Typography>
          </Stack>
        </Stack>

        {bids.length > 0 && (() => {
          const sortedBids = [...bids].sort((a, b) => (a.amount || 0) - (b.amount || 0));
          const benchmark = getQuoteBenchmark(sortedBids.map(b => b.amount || 0));
          return (
            <>
              <Divider sx={{ borderColor: alpha(gold, 0.1) }} />
              <Typography variant="caption" sx={{ color: alpha(gold, 0.7), fontWeight: 900, letterSpacing: 2 }}>BIDS RECEIVED</Typography>
              <Stack spacing={1.5}>
                {sortedBids.map(bid => {
                  const amount = bid.amount || 0;
 fix/emergency-quote-gate-override
                  const gate = getQuoteAwardGate(amount, bids.length, job.urgency === 'EMERGENCY');

                  const gate = getQuoteAwardGate(amount, bids.length);
 main
                  const deviationPct = benchmark ? Math.round(benchmark.deviationPct(amount)) : 0;
                  return (
                    <Stack key={bid.id} spacing={1} sx={{ p: 2, bgcolor: alpha(gold, 0.05), border: `1px solid ${alpha(gold, 0.14)}`, borderRadius: 2.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: '0.85rem' }}>{bid.contractorName || 'Contractor'}</Typography>
                          <Typography variant="caption" sx={{ color: alpha('#fff', 0.4), fontWeight: 800 }}>{bid.notes?.slice(0, 60)}</Typography>
                        </Box>
                        <Stack alignItems="flex-end" spacing={0.5}>
                          <Typography sx={{ color: gold, fontWeight: 950 }}>{amount.toLocaleString()} AED</Typography>
                          {job.status === 'BIDDING' && onAward && (
                            <Button size="small" onClick={() => onAward(job.id, bid.id)} disabled={!gate.allowed}
                              sx={{ bgcolor: gate.allowed ? gold : alpha('#fff', 0.08), color: gate.allowed ? '#111827' : alpha('#fff', 0.35), fontWeight: 950, fontSize: '0.65rem', px: 1.5, py: 0.3, borderRadius: 2, minHeight: 0 }}>
                              Award
                            </Button>
                          )}
                          {bid.awarded && <Chip label="AWARDED" size="small" sx={{ bgcolor: alpha('#22C55E', 0.12), color: '#22C55E', fontWeight: 950, fontSize: '0.55rem' }} />}
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        {benchmark && Math.abs(deviationPct) >= 10 && (
                          <Chip
                            label={`${Math.abs(deviationPct)}% ${deviationPct > 0 ? 'above' : 'below'} avg bid`}
                            size="small"
                            sx={{ bgcolor: alpha(deviationPct > 0 ? '#EF4444' : '#22C55E', 0.1), color: deviationPct > 0 ? '#EF4444' : '#22C55E', fontWeight: 850, fontSize: '0.58rem' }}
                          />
                        )}
                        {amount <= 500 && (
                          <Chip label="Auto-approval eligible · under AED 500" size="small" sx={{ bgcolor: alpha('#22C55E', 0.1), color: '#22C55E', fontWeight: 850, fontSize: '0.58rem' }} />
                        )}
                        {!gate.allowed && (
                          <Chip
                            label={`Needs ${gate.minimumQuotes} quotes before award (${gate.received}/${gate.minimumQuotes}) · over AED 1,500`}
                            size="small"
                            sx={{ bgcolor: alpha('#F59E0B', 0.1), color: '#F59E0B', fontWeight: 850, fontSize: '0.58rem' }}
                          />
                        )}
 fix/emergency-quote-gate-override
                        {gate.emergencyOverride && (
                          <Chip
                            label="Emergency override · 3-quote rule waived"
                            size="small"
                            sx={{ bgcolor: alpha('#EF4444', 0.1), color: '#EF4444', fontWeight: 850, fontSize: '0.58rem' }}
                          />
                        )}

 main
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            </>
          );
        })()}
      </Stack>
    </Paper>
  );
}

function PostJobForm({ ownerEmail, onSuccess }: { ownerEmail: string; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', trade: '', emirate: 'Al Ain',
    budgetMin: '', budgetMax: '', urgency: 'NORMAL', propertyAddress: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.title || !form.trade) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'jobPostings'), {
        ...form, budgetMin: Number(form.budgetMin), budgetMax: Number(form.budgetMax),
        ownerEmail, status: 'OPEN',
        createdAt: serverTimestamp(),
      });
      setForm({ title: '', description: '', trade: '', emirate: 'Al Ain', budgetMin: '', budgetMax: '', urgency: 'NORMAL', propertyAddress: '' });
      onSuccess();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  const field = { bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, input: { color: '#fff' }, '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: alpha(gold, 0.22) }, '&:hover fieldset': { borderColor: alpha(gold, 0.45) } }, '& .MuiInputLabel-root': { color: alpha('#fff', 0.4) } };

  return (
    <Paper sx={{ p: 4, bgcolor: CARD, border: BORDER, borderRadius: 4 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
        <Plus size={18} color={gold} />
        <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 3 }}>POST A JOB</Typography>
      </Stack>
      <Grid container spacing={2.5}>
        <Grid item xs={12}>
          <TextField fullWidth label="Job Title" value={form.title} onChange={e => set('title', e.target.value)} sx={field} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth sx={field}>
            <InputLabel>Trade Required</InputLabel>
            <Select value={form.trade} onChange={e => set('trade', e.target.value)} label="Trade Required">
              {TRADES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth sx={field}>
            <InputLabel>Emirate</InputLabel>
            <Select value={form.emirate} onChange={e => set('emirate', e.target.value)} label="Emirate">
              {EMIRATES.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth multiline rows={3} label="Job Description" value={form.description} onChange={e => set('description', e.target.value)} sx={field} />
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth label="Property Address" value={form.propertyAddress} onChange={e => set('propertyAddress', e.target.value)} sx={field} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField fullWidth label="Min Budget (AED)" type="number" value={form.budgetMin} onChange={e => set('budgetMin', e.target.value)} sx={field} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField fullWidth label="Max Budget (AED)" type="number" value={form.budgetMax} onChange={e => set('budgetMax', e.target.value)} sx={field} />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth sx={field}>
            <InputLabel>Urgency</InputLabel>
            <Select value={form.urgency} onChange={e => set('urgency', e.target.value)} label="Urgency">
              <MenuItem value="ROUTINE">Routine</MenuItem>
              <MenuItem value="NORMAL">Normal (24–48h)</MenuItem>
              <MenuItem value="PRIORITY">Priority (same day)</MenuItem>
              <MenuItem value="EMERGENCY">Emergency (2h)</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Button
            fullWidth variant="contained" onClick={submit} disabled={!form.title || !form.trade || saving}
            sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, py: 1.4, borderRadius: 3, boxShadow: `0 10px 28px ${alpha(gold, 0.3)}` }}
          >
            {saving ? <CircularProgress size={20} sx={{ color: '#111827' }} /> : 'Post Job to Marketplace'}
          </Button>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.2), display: 'block', mt: 1, textAlign: 'center' }}>
            BIN GROUP earns 10% commission on awarded jobs only.
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  );
}

export default function ContractorMarketplacePage() {
  const { user } = useRole();
  const { isRTL } = useLanguage();
  const [tab, setTab] = useState(0);
  const [jobs, setJobs] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email.toLowerCase();
    const unsubJobs = onSnapshot(
      query(collection(db, 'jobPostings'), where('ownerEmail', '==', email)),
      snap => { setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }
    );
    const unsubContractors = onSnapshot(
      query(collection(db, 'contractorProfiles'), where('active', '==', true)),
      snap => setContractors(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubJobs(); unsubContractors(); };
  }, [user?.email]);

  async function awardBid(jobId: string, bidId: string) {
    await updateDoc(doc(db, 'jobPostings', jobId), { status: 'AWARDED', awardedBidId: bidId, awardedAt: serverTimestamp() });
    await updateDoc(doc(db, 'contractorBids', bidId), { awarded: true });
  }

  if (loading) return (
    <Box sx={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress sx={{ color: gold }} />
    </Box>
  );

  const openJobs = jobs.filter(j => ['OPEN', 'BIDDING'].includes(j.status));
  const awardedJobs = jobs.filter(j => ['AWARDED', 'COMPLETED'].includes(j.status));

  return (
    <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ p: 1, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, display: 'inline-flex' }}>
            <Briefcase size={20} />
          </Box>
          <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 4 }}>CONTRACTOR MARKETPLACE</Typography>
        </Stack>
        <Typography variant="h4" fontWeight={950} sx={{ color: '#fff', mb: 0.5 }}>Find & Hire Contractors</Typography>
        <Typography variant="body2" sx={{ color: alpha('#fff', 0.4), fontWeight: 700 }}>
          Post jobs · Receive competitive bids · Pay only on award · BIN GROUP earns 10% commission
        </Typography>
      </Box>

      {/* Stats row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'OPEN JOBS', value: openJobs.length, color: '#22C55E' },
          { label: 'AWARDED', value: awardedJobs.length, color: gold },
          { label: 'CONTRACTORS', value: contractors.length, color: alpha('#fff', 0.55) },
          { label: 'COMMISSION RATE', value: '10%', color: gold },
        ].map(({ label, value, color }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Paper sx={{ p: 2.5, bgcolor: CARD, border: BORDER, borderRadius: 3, textAlign: 'center' }}>
              <Typography sx={{ color, fontWeight: 950, fontSize: '1.6rem', lineHeight: 1 }}>{value}</Typography>
              <Typography variant="caption" sx={{ color: alpha('#fff', 0.3), fontWeight: 900, letterSpacing: 1.5, fontSize: '0.6rem' }}>{label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {posted && (
        <Paper sx={{ p: 2, mb: 2.5, bgcolor: alpha('#22C55E', 0.08), border: `1px solid ${alpha('#22C55E', 0.25)}`, borderRadius: 3 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CheckCircle2 size={18} color="#22C55E" />
            <Typography sx={{ color: '#22C55E', fontWeight: 950 }}>Job posted! Contractors will be notified and can submit bids.</Typography>
          </Stack>
        </Paper>
      )}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ mb: 0.5, '& .MuiTab-root': { color: alpha('#fff', 0.45), fontWeight: 900, letterSpacing: 1 }, '& .Mui-selected': { color: gold }, '& .MuiTabs-indicator': { bgcolor: gold } }}>
        <Tab label="Post a Job" />
        <Tab label={`Active Jobs (${openJobs.length})`} />
        <Tab label={`Find Contractors (${contractors.length})`} />
      </Tabs>
      <Divider sx={{ borderColor: alpha(gold, 0.12), mb: 0 }} />

      <TabPanel value={tab} index={0}>
        <PostJobForm ownerEmail={user?.email || ''} onSuccess={() => { setPosted(true); setTab(1); setTimeout(() => setPosted(false), 4000); }} />
      </TabPanel>

      <TabPanel value={tab} index={1}>
        {openJobs.length === 0 ? (
          <Paper sx={{ p: 5, bgcolor: CARD, border: BORDER, borderRadius: 4, textAlign: 'center' }}>
            <Zap size={36} color={alpha(gold, 0.3)} />
            <Typography sx={{ color: alpha('#fff', 0.35), mt: 2, fontWeight: 800 }}>No active jobs yet. Post your first job to start receiving bids.</Typography>
            <Button onClick={() => setTab(0)} sx={{ mt: 2, color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.3)}`, borderRadius: 3 }}>
              Post a Job
            </Button>
          </Paper>
        ) : (
          <Stack spacing={2.5}>
            {[...openJobs, ...awardedJobs].map(job => (
              <JobCard key={job.id} job={job} onAward={awardBid} />
            ))}
          </Stack>
        )}
      </TabPanel>

      <TabPanel value={tab} index={2}>
        {contractors.length === 0 ? (
          <Paper sx={{ p: 5, bgcolor: CARD, border: BORDER, borderRadius: 4, textAlign: 'center' }}>
            <Users size={36} color={alpha(gold, 0.3)} />
            <Typography sx={{ color: alpha('#fff', 0.35), mt: 2, fontWeight: 800 }}>
              Verified contractors coming soon. BIN GROUP is onboarding licensed UAE contractors.
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2.5}>
            {contractors.map(c => (
              <Grid item xs={12} sm={6} md={4} key={c.id}>
                <ContractorCard c={c} />
              </Grid>
            ))}
          </Grid>
        )}
      </TabPanel>
    </Box>
  );
}
