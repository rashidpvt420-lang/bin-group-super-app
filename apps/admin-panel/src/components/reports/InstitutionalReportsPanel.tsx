// admin-panel/src/components/reports/InstitutionalReportsPanel.tsx
import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line 
} from 'recharts';
import { 
  Building2, BadgePercent, ShieldCheck, Activity, Download, 
  FileText, TrendingUp, AlertTriangle 
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

/**
 * 📊 INSTITUTIONAL REPORTS PANEL v1.1
 * Integrated with Live BIN-GROUP Firestore Ledger.
 */
const InstitutionalReportsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [portfolioData, setPortfolioData] = useState<any>({
    towerName: "Portfolio Operations",
    unitsActive: 0,
    totalSavingsAED: 0,
    healthScore: 0,
    slaCompliance: 0,
    ticketCount: 0,
    monthlyTrends: [],
    assetDistribution: [],
    riskRows: []
  });

  useEffect(() => {
    // 🏢 1. Active Units & Asset Distribution
    const unsubProperties = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const rows = snapshot.docs.map((d) => d.data() as any);
      const healthValues = rows.map((row) => Number(row.healthScore ?? row.bpi ?? 0)).filter((value) => value > 0 && Number.isFinite(value));
      const healthScore = healthValues.length ? Math.round(healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length) : 0;
      const typeCounts = new Map<string, number>();
      rows.forEach((row) => {
        const type = String(row.propertyType || row.type || 'Property');
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      });

      setPortfolioData((prev: any) => ({
        ...prev,
        unitsActive: snapshot.size,
        healthScore,
        assetDistribution: [...typeCounts.entries()].map(([name, count]) => ({ name, count, health: healthScore }))
      }));
      setLoadError('');
      setLoading(false);
    }, (error: any) => {
      console.error('[InstitutionalReports] properties listener failed:', error);
      setLoadError(error?.message || 'Unable to load portfolio records.');
      setLoading(false);
    });

    // 💰 2. Savings & Compliance (Derived from Contracts/Tickets)
    const unsubTickets = onSnapshot(collection(db, 'maintenanceTickets'), (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const completed = rows.filter((row) => ['COMPLETED', 'CLOSED', 'completed', 'closed'].includes(String(row.status || ''))).length;
        const compliance = snapshot.size ? Math.round((completed / snapshot.size) * 100) : 0;
        const totalSavingsAED = rows.reduce((sum, row) => sum + Number(row.costSavedAED || row.savingsAED || 0), 0);

        const monthMap = new Map<string, number>();
        const toDate = (value: any): Date | null => {
          if (typeof value?.toDate === 'function') return value.toDate();
          if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
          const parsed = value ? new Date(value) : null;
          return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
        };
        rows.forEach((row) => {
          const date = toDate(row.completedAt || row.updatedAt || row.createdAt);
          if (!date) return;
          const month = date.toLocaleString('en-AE', { month: 'short', year: '2-digit' });
          monthMap.set(month, (monthMap.get(month) || 0) + Number(row.costSavedAED || row.savingsAED || 0));
        });
        const monthlyTrends = [...monthMap.entries()].map(([month, savings]) => ({ month, savings }));

        const riskRows = rows
          .filter((row) => {
            const status = String(row.status || '').toUpperCase();
            const priority = String(row.priority || row.slaPriority || '').toUpperCase();
            return !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(status) &&
              ['EMERGENCY', 'CRITICAL', 'HIGH', 'URGENT'].includes(priority);
          })
          .slice(0, 10)
          .map((row) => ({
            id: row.id,
            asset: row.propertyName || row.unitNumber || row.title || row.id,
            risk: String(row.priority || row.slaPriority || 'HIGH').toUpperCase(),
            action: row.status || row.trackingStatus || 'OPEN',
            savings: Number(row.costSavedAED || row.savingsAED || 0),
          }));

        setPortfolioData((prev: any) => ({
            ...prev,
            slaCompliance: compliance,
            totalSavingsAED,
            ticketCount: snapshot.size,
            monthlyTrends,
            riskRows
        }));
        setLoadError('');
    }, (error: any) => {
        console.error('[InstitutionalReports] tickets listener failed:', error);
        setLoadError(error?.message || 'Unable to load maintenance reporting data.');
    });

    return () => {
        unsubProperties();
        unsubTickets();
    };
  }, []);

  if (loading) return (
    <div className="p-8 text-center text-blue-400 font-mono tracking-widest animate-pulse h-screen flex items-center justify-center bg-[#0a0a0b]">
        GENERATING PORTFOLIO_INTELLIGENCE...
    </div>
  );
  if (loadError) return <div className="p-8 bg-[#0a0a0b] text-red-300 min-h-screen">{loadError}</div>;
  if (portfolioData.unitsActive === 0 && portfolioData.ticketCount === 0) {
    return (
      <div className="p-8 bg-[#0a0a0b] text-white min-h-screen flex items-center justify-center">
        <div className="max-w-xl text-center">
          <Building2 size={42} className="mx-auto mb-4 text-gray-500" />
          <h2 className="text-xl font-black mb-2">No portfolio records available</h2>
          <p className="text-gray-500">Live properties and maintenance records will populate this institutional report when records exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#0a0a0b] text-white min-h-screen font-sans">
      {/* 🚀 Header */}
      <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 uppercase">
            {portfolioData.towerName}
          </h1>
          <p className="text-gray-500 font-medium tracking-wide mt-2">Institutional Asset Ledger & Institutional Truth Hub</p>
        </div>
        <button disabled title="Unavailable until this workflow is connected" aria-label="Export Sovereign Audit" className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-xl transition-all font-bold shadow-lg shadow-blue-500/20 uppercase tracking-widest text-xs">
          <Download size={18} /> Export Sovereign Audit
        </button>
      </div>

      {/* 📈 KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
        <KPIBox 
          icon={<BadgePercent className="text-emerald-400" />} 
          label="Total Savings (AED)" 
          value={portfolioData.totalSavingsAED.toLocaleString()} 
          trend="LIVE LEDGER"
        />
        <KPIBox 
          icon={<Activity className="text-blue-400" />} 
          label="Portfolio Health" 
          value={`${portfolioData.healthScore}%`} 
          trend={portfolioData.healthScore > 0 ? "LIVE SCORE" : "NO SCORE"}
          color="blue"
        />
        <KPIBox 
          icon={<ShieldCheck className="text-purple-400" />} 
          label="SLA Compliance" 
          value={`${portfolioData.slaCompliance}%`} 
          trend={`${portfolioData.ticketCount} TICKETS`}
          color="purple"
        />
        <KPIBox 
          icon={<Building2 className="text-orange-400" />} 
          label="Managed Units" 
          value={portfolioData.unitsActive} 
          trend="LIVE RECORDS"
          color="orange"
        />
      </div>

      {/* 📊 Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
        <div className="bg-[#141417] p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -z-1" />
          <h2 className="text-xl font-bold mb-8 flex items-center gap-3">
            <TrendingUp size={22} className="text-blue-400" /> Savings Velocity (AED)
          </h2>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={portfolioData.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222226" vertical={false} />
                <XAxis dataKey="month" stroke="#52525b" axisLine={false} tickLine={false} />
                <YAxis stroke="#52525b" axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Line type="monotone" dataKey="savings" stroke="#3b82f6" strokeWidth={4} dot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#141417] p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -z-1" />
          <h2 className="text-xl font-bold mb-8 flex items-center gap-3">
            <Activity size={22} className="text-emerald-400" /> Health per Asset Family
          </h2>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={portfolioData.assetDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222226" vertical={false} />
                <XAxis dataKey="name" stroke="#52525b" axisLine={false} tickLine={false} />
                <YAxis stroke="#52525b" axisLine={false} tickLine={false} />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px' }}
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                />
                <Bar dataKey="health" fill="#10b981" radius={[8, 8, 0, 0]} barSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ⚠️ Risk & Alerts Table */}
      <div className="bg-[#141417] rounded-3xl border border-white/5 p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <AlertTriangle className="text-orange-400" /> Operational Risk Audit
          </h2>
          <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                Real-Time Diagnostics
              </span>
          </div>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 text-xs font-black uppercase tracking-widest">
                  <th className="pb-6">Asset Intelligence</th>
                  <th className="pb-6">Condition</th>
                  <th className="pb-6">Sovereign Action</th>
                  <th className="pb-6 text-right">Proj. Savings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {portfolioData.riskRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-gray-500 font-medium">
                      No open high-priority maintenance risks are currently recorded.
                    </td>
                  </tr>
                ) : portfolioData.riskRows.map((row: any) => (
                  <RiskRow
                    key={row.id}
                    asset={row.asset}
                    risk={row.risk}
                    action={row.action}
                    savings={Number(row.savings || 0).toLocaleString('en-AE')}
                  />
                ))}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

const KPIBox = ({ icon, label, value, trend, color = "emerald" }: any) => (
  <div className="bg-[#141417] p-8 rounded-3xl border border-white/5 hover:border-blue-500/20 transition-all cursor-default shadow-xl group">
    <div className="flex justify-between items-start mb-6">
      <div className="bg-white/5 p-3 rounded-xl group-hover:scale-110 transition-transform">{icon}</div>
      <span className={`text-[10px] font-black uppercase tracking-widest bg-${color}-500/10 text-${color}-400 px-3 py-1 rounded-full`}>
        {trend}
      </span>
    </div>
    <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-2 opacity-60">{label}</div>
    <div className="text-3xl font-black tracking-tight">{value}</div>
  </div>
);

const RiskRow = ({ asset, risk, action, savings }: any) => (
  <tr className="group hover:bg-white/[0.01] transition-colors">
    <td className="py-6 font-bold flex items-center gap-3 text-white">
      <FileText size={18} className="text-gray-600 group-hover:text-blue-400 transition-colors" /> {asset}
    </td>
    <td className="py-6">
      <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
        ['CRITICAL', 'EMERGENCY'].includes(risk) ? 'bg-red-500/20 text-red-500' :
        ['HIGH', 'URGENT', 'MODERATE'].includes(risk) ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
      }`}>
        {risk}
      </span>
    </td>
    <td className="py-6 text-gray-400 text-sm font-medium">{action}</td>
    <td className="py-6 text-emerald-400 font-black text-right tracking-tight">AED {savings}</td>
  </tr>
);

export default InstitutionalReportsPanel;
