import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, AlertCircle, ShieldCheck, History, CheckCircle2, Construction } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { db, collection, query, limit, getDocs } from '../../lib/firebase';

const Icon = ({ icon: IconComponent, size = 16, className = '' }: { icon: any, size?: number, className?: string }) => (
  <IconComponent size={size} className={className} />
);

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function normalizeMethod(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function finiteAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const APPROVED_STATUSES = new Set(['APPROVED', 'VERIFIED', 'SETTLED', 'PAID', 'PAYMENT_VERIFIED']);
const PENDING_STATUSES = new Set(['PENDING', 'PENDING_VERIFICATION', 'ADMIN_VERIFICATION_REQUIRED', 'PENDING_ADMIN_PAYMENT_VERIFICATION']);
const PHASE1_METHODS = new Set(['CASH', 'CHEQUE']);

const RevenueReconciler: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSettlements() {
      try {
        setLoading(true);
        setError(null);
        const snap = await getDocs(query(collection(db, 'payment_transactions'), limit(250)));
        if (active) setRecords(snap.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() })));
      } catch (loadError) {
        console.error('[RevenueReconciler] payment_transactions read failed:', loadError);
        if (active) {
          setRecords([]);
          setError('Live payment verification records could not be loaded.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSettlements();
    return () => { active = false; };
  }, []);

  const live = useMemo(() => {
    const phase1 = records.filter((record) => PHASE1_METHODS.has(normalizeMethod(record.paymentMethod || record.method)));
    const approved = phase1.filter((record) => APPROVED_STATUSES.has(normalizeStatus(record.status || record.paymentStatus || record.verificationState)));
    const pending = phase1.filter((record) => PENDING_STATUSES.has(normalizeStatus(record.status || record.paymentStatus || record.verificationState)));
    const rejected = phase1.filter((record) => normalizeStatus(record.status || record.paymentStatus || record.verificationState).includes('REJECT'));

    const approvedAmounts = approved
      .map((record) => finiteAmount(record.amount ?? record.amountReceived))
      .filter((value): value is number => value !== null);
    const verifiedVolume = approved.length === 0
      ? 0
      : approvedAmounts.length === approved.length
        ? approvedAmounts.reduce((sum, value) => sum + value, 0)
        : null;

    const settlementMinutes = approved.map((record) => {
      const start = toDate(record.createdAt || record.submittedAt || record.paymentSubmittedAt);
      const end = toDate(record.approvedAt || record.verifiedAt || record.settledAt || record.updatedAt);
      if (!start || !end || end.getTime() < start.getTime()) return null;
      return (end.getTime() - start.getTime()) / 60000;
    }).filter((value): value is number => value !== null);
    const avgSettlement = settlementMinutes.length
      ? settlementMinutes.reduce((sum, value) => sum + value, 0) / settlementMinutes.length
      : null;

    const byMethod = ['CASH', 'CHEQUE'].map((method) => ({
      name: method,
      approved: approved.filter((record) => normalizeMethod(record.paymentMethod || record.method) === method).length,
      pending: pending.filter((record) => normalizeMethod(record.paymentMethod || record.method) === method).length,
      rejected: rejected.filter((record) => normalizeMethod(record.paymentMethod || record.method) === method).length,
    }));

    return { phase1, approved, pending, rejected, verifiedVolume, approvedAmountCount: approvedAmounts.length, avgSettlement, byMethod };
  }, [records]);

  if (loading) return <div className="p-8 text-white">Loading live settlement records...</div>;

  if (error) {
    return (
      <div className="p-20 text-center bg-[#020203] min-h-screen text-white">
        <div className="flex justify-center mb-8 text-red-400"><Construction size={80} /></div>
        <h1 className="text-3xl font-black mb-4 uppercase tracking-tighter">Settlement Data Unavailable</h1>
        <p className="text-gray-500 max-w-xl mx-auto">{error}</p>
      </div>
    );
  }

  const volumeLabel = live.verifiedVolume === null ? 'N/A' : `AED ${live.verifiedVolume.toLocaleString()}`;
  const volumeCoverage = live.approved.length === 0
    ? 'No approved records'
    : `${live.approvedAmountCount}/${live.approved.length} amounts recorded`;

  return (
    <div className="p-8 bg-[#020203] min-h-screen text-white font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-black tracking-[0.2em] mb-2 uppercase">
            <Icon icon={ShieldCheck} size={14} /> Phase 1 Manual Settlement Audit
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter">
            Cash &amp; Cheque <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Reconciliation</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2">Calculated from persisted payment_transactions only. Missing monetary fields remain N/A.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
        <ReconStat label="Verified Volume" value={volumeLabel} trend={volumeCoverage} icon={RefreshCcw} color="blue" />
        <ReconStat label="Pending Review" value={String(live.pending.length)} trend="Needs admin action" icon={AlertCircle} color="orange" />
        <ReconStat label="Avg Verification" value={live.avgSettlement === null ? 'N/A' : `${Math.round(live.avgSettlement)}m`} trend="From real timestamps" icon={History} color="emerald" />
        <ReconStat label="Approved Records" value={String(live.approved.length)} trend={`${live.rejected.length} rejected`} icon={CheckCircle2} color="indigo" />
      </div>

      <div className="bg-[#0a0a0b] p-8 rounded-[2rem] border border-white/5">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-xl font-bold flex items-center gap-3 italic tracking-tight uppercase">
            <Icon icon={ShieldCheck} className="text-blue-400" /> Verification State by Method
          </h2>
          <span className="text-xs text-gray-500">{live.phase1.length} Cash/Cheque records loaded</span>
        </div>

        {live.phase1.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-gray-500 text-center">
            No Cash or Cheque payment verification records exist yet.
          </div>
        ) : (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={live.byMethod}>
                <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
                <XAxis dataKey="name" stroke="#555" axisLine={false} tickLine={false} />
                <YAxis stroke="#555" axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.02)' }} contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }} />
                <Bar dataKey="approved" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

const ReconStat = ({ label, value, trend, icon, color }: any) => {
  const getColors = () => {
    switch (color) {
      case 'blue': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'emerald': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'orange': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'indigo': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
      default: return 'text-white bg-white/10';
    }
  };

  return (
    <div className="bg-[#0a0a0b] p-8 rounded-[2rem] border border-white/5 hover:border-white/10 transition-all group">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${getColors()}`}>
        <Icon icon={icon} size={28} />
      </div>
      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-2">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="text-2xl font-black tracking-tighter italic">{value}</div>
        <div className={`text-[10px] font-black px-3 py-1 rounded-lg ${getColors().split(' ')[1]} ${getColors().split(' ')[0]}`}>
          {trend}
        </div>
      </div>
    </div>
  );
};

export default RevenueReconciler;