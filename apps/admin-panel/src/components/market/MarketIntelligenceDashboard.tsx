import React, { useEffect, useMemo, useState } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { Globe, Target, Map as MapIcon, Database, Search } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const Icon = ({ icon: IconComponent, size = 16, className = '' }: { icon: any, size?: number, className?: string }) => (
  <IconComponent size={size} className={className} />
);

type PricingAudit = {
  id: string;
  result?: any;
  createdAt?: any;
};

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const MarketIntelligenceDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [audits, setAudits] = useState<PricingAudit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let active = true;
    async function loadMarketEvidence() {
      try {
        setLoading(true);
        setError(null);
        const snap = await getDocs(query(collection(db, 'pricingAuditLogs'), orderBy('createdAt', 'desc'), limit(250)));
        if (active) setAudits(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as PricingAudit)));
      } catch (loadError) {
        console.error('[MarketIntelligence] Live pricing evidence load failed:', loadError);
        if (active) {
          setAudits([]);
          setError('Live market intelligence could not be loaded from pricing audit records.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadMarketEvidence();
    return () => { active = false; };
  }, []);

  const marketData = useMemo(() => {
    const zoneMap = new Map<string, { name: string; audits: number; confidenceTotal: number; confidenceCount: number; ppsfTotal: number; ppsfCount: number }>();
    const confidenceDistribution = [
      { name: 'High (90%+)', value: 0 },
      { name: 'Med (70-89%)', value: 0 },
      { name: 'Low (<70%)', value: 0 },
    ];
    const dayMap = new Map<string, { day: string; audits: number; confidenceTotal: number; confidenceCount: number; sortKey: number }>();

    for (const audit of audits) {
      const result = audit.result || {};
      const property = result.property || {};
      const valuation = result.valuation || {};
      const zoneName = String(property.area || property.community || property.emirate || 'Unspecified zone').trim();
      const confidence = finite(result.confidenceScore ?? valuation.confidenceScore);
      const saleTarget = finite(valuation?.saleEstimate?.target);
      const areaSqFt = finite(property.builtUpAreaSqFt);
      const ppsf = saleTarget !== null && areaSqFt !== null && areaSqFt > 0 ? saleTarget / areaSqFt : null;

      const zone = zoneMap.get(zoneName) || { name: zoneName, audits: 0, confidenceTotal: 0, confidenceCount: 0, ppsfTotal: 0, ppsfCount: 0 };
      zone.audits += 1;
      if (confidence !== null) {
        zone.confidenceTotal += confidence;
        zone.confidenceCount += 1;
        if (confidence >= 90) confidenceDistribution[0].value += 1;
        else if (confidence >= 70) confidenceDistribution[1].value += 1;
        else confidenceDistribution[2].value += 1;
      }
      if (ppsf !== null) {
        zone.ppsfTotal += ppsf;
        zone.ppsfCount += 1;
      }
      zoneMap.set(zoneName, zone);

      const createdAt = toDate(audit.createdAt);
      if (createdAt) {
        const key = createdAt.toISOString().slice(0, 10);
        const day = dayMap.get(key) || {
          day: createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          audits: 0,
          confidenceTotal: 0,
          confidenceCount: 0,
          sortKey: createdAt.setHours(0, 0, 0, 0),
        };
        day.audits += 1;
        if (confidence !== null) {
          day.confidenceTotal += confidence;
          day.confidenceCount += 1;
        }
        dayMap.set(key, day);
      }
    }

    const zones = [...zoneMap.values()]
      .map((zone) => ({
        name: zone.name,
        audits: zone.audits,
        avgConfidence: zone.confidenceCount ? zone.confidenceTotal / zone.confidenceCount : null,
        avgAEDPerSqFt: zone.ppsfCount ? zone.ppsfTotal / zone.ppsfCount : null,
      }))
      .sort((a, b) => b.audits - a.audits);

    const dailyTrend = [...dayMap.values()]
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-14)
      .map((day) => ({
        day: day.day,
        audits: day.audits,
        avgConfidence: day.confidenceCount ? Math.round(day.confidenceTotal / day.confidenceCount) : null,
      }));

    const confidenceValues = zones.filter((zone) => zone.avgConfidence !== null);
    const avgConfidence = confidenceValues.length
      ? confidenceValues.reduce((sum, zone) => sum + Number(zone.avgConfidence), 0) / confidenceValues.length
      : null;

    return { zones, confidenceDistribution, dailyTrend, avgConfidence };
  }, [audits]);

  const filteredZones = marketData.zones.filter((zone) => zone.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b'];

  if (loading) return <div className="p-8 text-center text-blue-400 font-mono tracking-widest animate-pulse">LOADING LIVE MARKET EVIDENCE...</div>;

  return (
    <div className="p-8 bg-[#0a0a0b] text-white min-h-screen font-sans selection:bg-blue-500/30">
      <div className="flex flex-col md:flex-row justify-between md:items-end mb-10 gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-black tracking-widest mb-2 uppercase">
            <Icon icon={Database} size={14} /> Firestore Pricing Evidence
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-white">
            Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-400">Intelligence</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2">Derived only from persisted pricing audit records. No external-market values are invented.</p>
        </div>
        <div className="bg-[#141417] px-4 py-2 rounded-lg border border-white/5 flex items-center gap-3">
          <Icon icon={Search} className="text-gray-500" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Zone lookup..."
            className="bg-transparent outline-none text-sm w-48"
          />
        </div>
      </div>

      {error && <div className="mb-8 border border-red-500/30 bg-red-500/10 text-red-300 rounded-2xl p-4">{error}</div>}

      {!error && audits.length === 0 ? (
        <div className="bg-[#141417] p-10 rounded-3xl border border-white/5 text-center text-gray-400">
          No pricing audit evidence exists yet. Market intelligence will populate after real property pricing audits are saved.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
            <div className="lg:col-span-2 bg-[#141417] p-8 rounded-3xl border border-white/5 shadow-2xl">
              <div className="flex justify-between items-center mb-10">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  <Icon icon={Globe} className="text-blue-400" /> Pricing Audit Activity
                </h2>
                <div className="text-xs text-gray-500">{audits.length} persisted audits loaded</div>
              </div>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={marketData.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222226" vertical={false} />
                    <XAxis dataKey="day" stroke="#52525b" axisLine={false} tickLine={false} />
                    <YAxis stroke="#52525b" axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px' }} />
                    <Area type="monotone" dataKey="audits" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#141417] p-8 rounded-3xl border border-white/5 flex flex-col items-center justify-center">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Icon icon={Target} className="text-indigo-400" /> Confidence Mix
              </h2>
              <div className="text-3xl font-black mb-4">
                {marketData.avgConfidence === null ? 'N/A' : `${marketData.avgConfidence.toFixed(1)}%`}
              </div>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={marketData.confidenceDistribution} innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                      {marketData.confidenceDistribution.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-3 w-full">
                {marketData.confidenceDistribution.map((item) => (
                  <div key={item.name} className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">{item.name}</span>
                    <span className="font-bold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredZones.slice(0, 12).map((zone) => (
              <div key={zone.name} className="bg-[#141417] p-6 rounded-2xl border border-white/5">
                <div className="flex justify-between items-start mb-6">
                  <div className="bg-white/5 p-2 rounded-lg"><Icon icon={MapIcon} size={20} className="text-blue-400" /></div>
                  <div className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-blue-400/10 text-blue-400">
                    {zone.audits} AUDITS
                  </div>
                </div>
                <div className="text-sm font-bold text-white mb-4">{zone.name}</div>
                <div className="space-y-3">
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-400">Avg confidence</span>
                    <span className="text-sm font-bold">{zone.avgConfidence === null ? 'N/A' : `${zone.avgConfidence.toFixed(1)}%`}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-xs text-gray-400">Avg AED / sq ft</span>
                    <span className="text-sm font-bold text-emerald-400">{zone.avgAEDPerSqFt === null ? 'N/A' : zone.avgAEDPerSqFt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MarketIntelligenceDashboard;
