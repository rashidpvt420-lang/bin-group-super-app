import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  RefreshCcw, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  Filter, 
  ArrowUpRight, 
  Download,
  MoreVertical,
  ShieldCheck,
  Zap,
  History,
  TrendingUp,
  FileText
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Cell,
  LineChart,
  Line
} from 'recharts';

/**
 * 💳 REVENUE RECOVERY & STRIPE RECONCIER v1.0
 * Specialized Admin interface for financial integrity.
 * Hard Launch Ready.
 */

// Helper for type-safe icons
const Icon = ({ icon: IconComponent, size = 16, className = "" }: { icon: any, size?: number, className?: string }) => (
  <IconComponent size={size} className={className} />
);

const RevenueReconciler: React.FC = () => {
  const [activeSegment, setActiveSegment] = useState<'all' | 'mismatch' | 'recovered'>('mismatch');
  const [searchQuery, setSearchQuery] = useState('');

  const reconciliationData = [
    { id: 'TXN_9921', owner: 'Arif Rashid', amount: 4500, status: 'mismatch', event: 'Payment Success, Activation Failed', date: '2024-03-21' },
    { id: 'TXN_9920', owner: 'Fatima Al-Sayed', amount: 12500, status: 'synced', event: 'Fully Verified', date: '2024-03-20' },
    { id: 'TXN_9918', owner: 'James Wilson', amount: 8200, status: 'recovered', event: 'Manual Recovery Success', date: '2024-03-19' },
    { id: 'TXN_9915', owner: 'Khalid Dubai', amount: 3100, status: 'mismatch', event: 'Card Declined, Unit Occupied', date: '2024-03-18' },
  ];

  const chartData = [
    { name: 'Mon', revenue: 45000, recovered: 4200 },
    { name: 'Tue', revenue: 52000, recovered: 1200 },
    { name: 'Wed', revenue: 48000, recovered: 8500 },
    { name: 'Thu', revenue: 61000, recovered: 3100 },
    { name: 'Fri', revenue: 55000, recovered: 4200 },
  ];

  return (
    <div className="p-8 bg-[#020203] min-h-screen text-white font-sans">
      {/* 🚀 Financial Integrity Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs font-black tracking-[0.2em] mb-2 uppercase">
             <Icon icon={ShieldCheck} size={14} /> Revenue Protection Engine v5.0
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter">
            Stripe <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Reconciliation</span>
          </h1>
        </div>
        
        <div className="flex gap-4">
           <button className="bg-white/5 border border-white/10 px-6 py-4 rounded-2xl font-black text-xs hover:bg-white/10 transition-all uppercase tracking-widest flex items-center gap-2">
              <Icon icon={Download} size={14} /> Export Audit Log
           </button>
           <button className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm hover:translate-y-[-2px] transition-all shadow-xl shadow-blue-500/20 uppercase tracking-tighter">
              Manual Force Sync
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
        <ReconStat label="Recovered Today" value="AED 4,200" trend="+15%" icon={RefreshCcw} color="blue" />
        <ReconStat label="Mismatched Leads" value="12" trend="Action Required" icon={AlertCircle} color="orange" />
        <ReconStat label="Avg Recovery Time" value="14m" trend="-4m" icon={History} color="emerald" />
        <ReconStat label="Platform Yield" value="99.4%" trend="Target Met" icon={TrendingUp} color="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 📉 Revenue Stability Chart */}
        <div className="lg:col-span-8 bg-[#0a0a0b] p-8 rounded-[2rem] border border-white/5 relative overflow-hidden group">
           <div className="flex justify-between items-center mb-10">
              <h2 className="text-xl font-bold flex items-center gap-3 italic tracking-tight uppercase">
                 <Icon icon={TrendingUp} className="text-blue-400" /> Revenue Recovery Intensity
              </h2>
              <div className="flex gap-6 text-[10px] font-black tracking-widest uppercase text-gray-500">
                 <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" /> Base Revenue</span>
                 <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500" /> Recovered</span>
              </div>
           </div>

           <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#111" vertical={false} />
                    <XAxis dataKey="name" stroke="#333" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700}} />
                    <YAxis stroke="#333" axisLine={false} tickLine={false} />
                    <Tooltip 
                      cursor={{fill: 'rgba(255,255,255,0.02)'}}
                      contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                    />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="recovered" fill="#6366f1" radius={[4, 4, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        {/* 🚀 Active Recovery Protocol */}
        <div className="lg:col-span-4 bg-gradient-to-br from-indigo-900/40 via-[#0a0a0b] to-[#0a0a0b] p-8 rounded-[2rem] border border-white/5 relative group">
           <div className="flex items-center gap-3 mb-8">
              <div className="bg-indigo-500/10 p-3 rounded-2xl">
                 <Icon icon={Zap} className="text-indigo-400" size={24} />
              </div>
              <h3 className="text-lg font-black tracking-tighter uppercase">AI Recovery Protocol</h3>
           </div>
           
           <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                 <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Primary Rule</div>
                 <div className="text-sm font-medium italic text-white/80 leading-relaxed">
                   "Auto-reconcile unit activation if Stripe event matches quote hash within 50ms variance."
                 </div>
              </div>
              
              <div className="space-y-4">
                 <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-gray-500">
                    <span>Recovery Efficiency</span>
                    <span>94%</span>
                 </div>
                 <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full w-[94%]" />
                 </div>
              </div>

              <button className="w-full mt-4 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-black tracking-widest uppercase transition-all flex items-center justify-center gap-2">
                 Configure Logic <Icon icon={RefreshCcw} size={14} />
              </button>
           </div>
        </div>

        {/* 📑 Transaction Recon Table */}
        <div className="lg:col-span-12 bg-[#0a0a0b] p-8 rounded-[3rem] border border-white/5 overflow-hidden">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
              <h3 className="text-xl font-black tracking-tighter italic uppercase flex items-center gap-3">
                 <Icon icon={History} className="text-blue-400" /> Reconciliation Ledger
              </h3>
              
              <div className="flex gap-4 w-full md:w-auto">
                 <div className="relative flex-1 md:w-64">
                    <Icon icon={Search} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search TXN ID or Owner..." 
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-all font-medium"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                 </div>
                 <button 
                    title="Filter Reconciliation Table"
                    className="bg-white/5 border border-white/10 p-4 rounded-2xl text-gray-400 hover:text-white transition-all"
                 >
                    <Icon icon={Filter} size={16} />
                 </button>
              </div>
           </div>

           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-gray-600">
                       <th className="pb-6 pl-4">Transaction ID</th>
                       <th className="pb-6">Property Owner</th>
                       <th className="pb-6 text-right">Amount</th>
                       <th className="pb-6 text-center">Protocol Signal</th>
                       <th className="pb-6">Status</th>
                       <th className="pb-6"></th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-white/[0.03]">
                    {reconciliationData.map((txn, i) => (
                      <tr key={i} className="group hover:bg-white/[0.01] transition-all">
                         <td className="py-6 pl-4">
                            <div className="text-sm font-black tracking-widest">{txn.id}</div>
                            <div className="text-[10px] text-gray-600 font-bold uppercase">{txn.date}</div>
                         </td>
                         <td className="py-6">
                            <div className="text-sm font-bold tracking-tight text-white/80">{txn.owner}</div>
                         </td>
                         <td className="py-6 text-right">
                            <div className="text-sm font-black text-blue-400">AED {txn.amount.toLocaleString()}</div>
                         </td>
                         <td className="py-6">
                            <div className="flex items-center justify-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/5 rounded-xl">
                               <Icon icon={txn.status === 'synced' ? CheckCircle2 : txn.status === 'recovered' ? RefreshCcw : AlertCircle} size={14} className={txn.status === 'synced' ? 'text-emerald-500' : txn.status === 'recovered' ? 'text-blue-500' : 'text-orange-500'} />
                               <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{txn.event}</span>
                            </div>
                         </td>
                         <td className="py-6">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                              txn.status === 'synced' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              txn.status === 'recovered' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                              'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                            }`}>
                               {txn.status}
                            </span>
                         </td>
                         <td className="py-6 text-right pr-4">
                            <button 
                               title="More Transaction Options"
                               className="p-3 text-gray-600 hover:text-white transition-all"
                            >
                               <Icon icon={MoreVertical} size={16} />
                            </button>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
};

const ReconStat = ({ label, value, trend, icon, color }: any) => {
  const getColors = () => {
    switch(color) {
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
       <div className="flex items-end justify-between">
          <div className="text-2xl font-black tracking-tighter italic">{value}</div>
          <div className={`text-[10px] font-black px-3 py-1 rounded-lg ${getColors().split(' ')[1]} ${getColors().split(' ')[0]}`}>
             {trend}
          </div>
       </div>
    </div>
  );
};

export default RevenueReconciler;
