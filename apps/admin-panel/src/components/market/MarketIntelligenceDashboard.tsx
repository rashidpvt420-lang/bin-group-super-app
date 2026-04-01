import React, { useState, useEffect } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  Globe, Target, Map, 
  ChevronRight, Database, Search
} from 'lucide-react';

// Use a cast to any for the component to bypass complex type mismatches between React versions
const Icon = ({ icon: IconComponent, size = 16, className = "" }: { icon: any, size?: number, className?: string }) => (
  <IconComponent size={size} className={className} />
);

/**
 * 🌍 MARKET INTELLIGENCE DASHBOARD v1.0 (Phase 10 UI)
 * Strategic Moat Tool: Visualizes price acceptance & community drift.
 */
const MarketIntelligenceDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [marketData, setMarketData] = useState<any>(null);

  useEffect(() => {
    // Mocking real-time feed from marketIntelligence.ts
    setTimeout(() => {
      setMarketData({
        overallConversionRatio: 72.4,
        topZones: [
          { name: 'Dubai Marina', conversions: 450, avgAED: 2450, drift: 'OPTIMAL' },
          { name: 'Downtown Dubai', conversions: 380, avgAED: 3100, drift: 'OPTIMAL' },
          { name: 'Palm Jumeirah', conversions: 120, avgAED: 4500, drift: 'LOW_ACCEPTANCE' },
          { name: 'Business Bay', conversions: 210, avgAED: 1800, drift: 'HIGH_ACCEPTANCE' }
        ],
        confidenceDistribution: [
          { name: 'High (90%+)', value: 65 },
          { name: 'Med (70-89%)', value: 25 },
          { name: 'Low (<70%)', value: 10 }
        ],
        driftTrend: [
          { day: 'Mon', marina: 70, downtown: 75, palm: 40 },
          { day: 'Tue', marina: 72, downtown: 78, palm: 42 },
          { day: 'Wed', marina: 75, downtown: 80, palm: 38 },
          { day: 'Thu', marina: 68, downtown: 82, palm: 35 },
          { day: 'Fri', marina: 74, downtown: 79, palm: 41 }
        ]
      });
      setLoading(false);
    }, 1000);
  }, []);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

  if (loading) return <div className="p-8 text-center text-blue-400 font-mono tracking-widest animate-pulse">BOOTING MARKET_MOAT ENGINE_V5.0...</div>;

  return (
    <div className="p-8 bg-[#0a0a0b] text-white min-h-screen font-sans selection:bg-blue-500/30">
      {/* 🚀 AI-Driven Header */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-black tracking-widest mb-2 uppercase">
             <Icon icon={Database} size={14} /> Neural Market Intelligence
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-white">
            Competitive <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-indigo-400">Data Moat</span>
          </h1>
        </div>
        <div className="flex gap-4">
           <div className="bg-[#141417] px-4 py-2 rounded-lg border border-white/5 flex items-center gap-3">
              <Icon icon={Search} className="text-gray-500" size={18} />
              <input type="text" placeholder="Zone Lookup..." className="bg-transparent outline-none text-sm w-40" />
           </div>
           <button className="bg-blue-600 px-6 py-2 rounded-lg font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20">
              Update Multipliers
           </button>
        </div>
      </div>

      {/* 📈 Central Conversion Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        {/* Left: Conversion Delta */}
        <div className="lg:col-span-2 bg-[#141417] p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] -z-1 group-hover:bg-blue-500/10 transition-all duration-700" />
           <div className="flex justify-between items-center mb-10">
              <h2 className="text-xl font-bold flex items-center gap-3">
                 <Icon icon={Globe} className="text-blue-400" /> Community Delta Tracking (7D)
              </h2>
              <div className="flex gap-4 text-[10px] font-bold tracking-widest">
                 <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" /> MARINA</span>
                 <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> DOWNTOWN</span>
                 <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-500" /> PALM</span>
              </div>
           </div>
           
           <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={marketData.driftTrend}>
                    <defs>
                      <linearGradient id="colorMarina" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorDT" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222226" vertical={false} />
                    <XAxis dataKey="day" stroke="#52525b" axisLine={false} tickLine={false} />
                    <YAxis stroke="#52525b" axisLine={false} tickLine={false} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} />
                    <Area type="monotone" dataKey="marina" stroke="#3b82f6" fillOpacity={1} fill="url(#colorMarina)" strokeWidth={3} />
                    <Area type="monotone" dataKey="downtown" stroke="#10b981" fillOpacity={1} fill="url(#colorDT)" strokeWidth={3} />
                    <Area type="monotone" dataKey="palm" stroke="#f59e0b" strokeWidth={3} fill="transparent" />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* Right: Confidence Distribution */}
        <div className="bg-[#141417] p-8 rounded-3xl border border-white/5 flex flex-col items-center justify-center">
           <h2 className="text-lg font-bold mb-8 flex items-center gap-2">
              <Icon icon={Target} className="text-indigo-400" /> Confidence Mix
           </h2>
           <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                    <Pie data={marketData.confidenceDistribution} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                       {marketData.confidenceDistribution.map((entry: any, index: any) => (
                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                       ))}
                    </Pie>
                    <Tooltip />
                 </PieChart>
              </ResponsiveContainer>
           </div>
           <div className="mt-8 space-y-4 w-full">
              {marketData.confidenceDistribution.map((c: any, i: any) => (
                <div key={c.name} className="flex justify-between items-center text-sm">
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        i === 0 ? 'bg-emerald-500' :
                        i === 1 ? 'bg-blue-500' :
                        i === 2 ? 'bg-orange-500' : 'bg-red-500'
                      }`} />
                      <span className="text-gray-400">{c.name}</span>
                   </div>
                   <span className="font-bold">{c.value}%</span>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* 📍 Zone-Level Intelligence Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {marketData.topZones.map((zone: any) => (
          <ZoneIntelligenceCard key={zone.name} zone={zone} />
        ))}
      </div>
    </div>
  );
};

const ZoneIntelligenceCard = ({ zone }: any) => {
  const isOptimal = zone.drift === 'OPTIMAL';
  const isLow = zone.drift === 'LOW_ACCEPTANCE';

  return (
    <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all cursor-pointer group">
      <div className="flex justify-between items-start mb-6">
        <div className="bg-white/5 p-2 rounded-lg group-hover:bg-blue-500/10 transition-colors">
          <Icon icon={Map} size={20} className={isOptimal ? 'text-blue-400' : 'text-orange-400'} />
        </div>
        <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
          isOptimal ? 'bg-emerald-400/10 text-emerald-400' : 
          isLow ? 'bg-red-400/10 text-red-500' : 'bg-blue-400/10 text-blue-400'
        }`}>
          {zone.drift}
        </div>
      </div>
      <div className="text-sm font-bold text-white mb-1">{zone.name}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-4">Market Velocity</div>
      
      <div className="flex justify-between items-end">
        <div>
          <div className="text-xs text-gray-400">Avg Accepted</div>
          <div className="text-xl font-bold font-mono text-emerald-400">{zone.avgAED.toLocaleString()} <span className="text-[10px]">AED</span></div>
        </div>
        <div className="text-right">
           <div className="text-xs text-gray-400">Total</div>
           <div className="text-lg font-bold">{zone.conversions}</div>
        </div>
      </div>
      
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase">
         Detailed Zone Audit <Icon icon={ChevronRight} size={14} />
      </div>
    </div>
  );
};

export default MarketIntelligenceDashboard;
