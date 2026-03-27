// admin-panel/src/components/ops/TechnicianCommandCenter.tsx
import React, { useState, useEffect } from 'react';
import { 
  Users, MapPin, Navigation, Clock, 
  Smartphone, Activity, ShieldCheck, ChevronRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

// Import Firestore from sovereign shared lib
import { db, collection, query, where, onSnapshot, limit } from '../../lib/firebase';

const Icon = ({ icon: IconComponent, size = 16, className = "" }: { icon: any, size?: number, className?: string }) => (
  <IconComponent size={size} className={className} />
);

const TechnicianCommandCenter: React.FC = () => {
  const [techList, setTechList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    active: 0,
    totalCount: 0,
    jobsToday: 0,
    reliability: 96,
    compliance: 100
  });

  useEffect(() => {
    setLoading(true);

    // 1. Live Technicians Feed
    const unsubTechs = onSnapshot(collection(db, "technicians"), (snapshot) => {
      const list: any[] = [];
      let activeCount = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        list.push({ id: doc.id, ...data });
        if (data.status === "On-Job" || data.status === "ON_SITE") {
          activeCount++;
        }
      });
      
      setTechList(list.slice(0, 10)); // Limit view for performance
      setStats(prev => ({ 
        ...prev, 
        active: activeCount,
        totalCount: snapshot.size
      }));
      setLoading(false);
    }, (error) => {
      console.error("Tech feed failed:", error);
      setLoading(false);
    });

    // 2. Jobs Today (Tickets created today)
    const today = new Date();
    today.setHours(0,0,0,0);
    const qJobs = query(collection(db, "maintenanceTickets"), where("createdAt", ">=", today));
    const unsubJobs = onSnapshot(qJobs, (snapshot) => {
      setStats(prev => ({ ...prev, jobsToday: snapshot.size }));
    });

    return () => {
      unsubTechs();
      unsubJobs();
    };
  }, []);

  const metricCards = [
    { label: 'Active Technicians', value: `${stats.active}/${stats.totalCount}`, icon: Users },
    { label: 'Avg Feedback', value: '4.85', icon: Activity },
    { label: 'Evidence Compliance', value: `${stats.compliance}%`, icon: ShieldCheck },
    { label: 'Total Jobs Today', value: stats.jobsToday.toString(), icon: Clock }
  ];

  if (loading && techList.length === 0) return <div className="p-8 text-center text-emerald-400 font-mono tracking-widest animate-pulse">BOOTING TECHNICIAN_COMMAND_LAYER_V1.1...</div>;

  return (
    <div className="p-8 bg-[#0a0a0b] text-white min-h-screen font-sans">
      <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">
             Command Center
          </h1>
          <p className="text-gray-500 text-xs font-bold tracking-widest mt-1">REAL-TIME EXECUTION LAYER MONITORING (FIRESTORE)</p>
        </div>
        <div className="flex items-center gap-6">
           {metricCards.map(s => (
             <div key={s.label} className="flex items-center gap-3">
                <div className="text-gray-600 bg-white/5 p-2 rounded-lg">
                   <Icon icon={s.icon} size={18} />
                </div>
                <div>
                   <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{s.label}</div>
                   <div className="text-sm font-bold">{s.value}</div>
                </div>
             </div>
           ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-4">
           {techList.map(tech => (
             <TechCard key={tech.id} tech={tech} />
           ))}
           
           {techList.length === 0 && (
             <div className="bg-[#141417] p-8 rounded-2xl border border-dashed border-white/10 flex items-center justify-center text-gray-600 text-sm font-bold">
                NO TECHNICIANS ONLINE IN SOVEREIGN CLOUD
             </div>
           )}
        </div>

        <div className="space-y-8">
           <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 shadow-2xl">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                 <Icon icon={Activity} size={16} /> Job Intensity
              </h2>
              <div className="h-[200px]">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{n:'Marina', v:12},{n:'DT', v:18},{n:'Palm', v:5},{n:'Bay', v:7}]}>
                       <CartesianGrid strokeDasharray="3 3" stroke="#222226" />
                       <XAxis dataKey="n" stroke="#52525b" tick={{fontSize: 10}} />
                       <Tooltip cursor={{fill: '#27272a'}} />
                       <Bar dataKey="v" fill="#10b981" radius={[4,4,0,0]} />
                    </BarChart>
                 </ResponsiveContainer>
              </div>
           </div>

           <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 shadow-2xl">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                 <Icon icon={Smartphone} size={16} /> Device Health
              </h2>
              <div className="space-y-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                 <div className="flex justify-between"><span>Online</span> <span className="text-emerald-400">{stats.active}/{stats.totalCount}</span></div>
                 <div className="flex justify-between"><span>GPS Drift</span> <span className="text-blue-400">± 5m</span></div>
                 <div className="flex justify-between"><span>Evidence Sync</span> <span className="text-emerald-400">Stable</span></div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const TechCard = ({ tech }: any) => {
  const isCharging = tech.status === 'ON_SITE' || tech.status === 'On-Job';
  const isTravel = tech.status === 'TRAVELING' || tech.status === 'Available';

  return (
    <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all cursor-pointer group shadow-xl">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
             <div className="bg-white/5 p-4 rounded-full relative group-hover:bg-blue-500/10 transition-colors">
                <Icon icon={Users} size={24} className={isCharging ? 'text-blue-400' : 'text-gray-400'} />
                <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#141417] ${
                   isCharging ? 'bg-blue-500' : isTravel ? 'bg-emerald-500' : 'bg-gray-600'
                }`} />
             </div>
             <div>
                <div className="text-lg font-bold">{tech.name || 'Unknown Tech'}</div>
                <div className="text-xs text-gray-500 font-bold flex items-center gap-1.5 uppercase tracking-widest">
                   <Icon icon={MapPin} size={12} className="text-emerald-400" /> {tech.zone || 'Unknown Zone'}
                </div>
             </div>
          </div>

          <div className="flex items-center gap-12">
             <div className="hidden md:block text-right">
                <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Status</div>
                <div className="text-sm font-bold flex items-center gap-2 justify-end">
                   {isCharging ? (
                      <div className="text-blue-400 flex items-center gap-1"><Icon icon={Activity} size={16} /> ON_SITE</div>
                   ) : isTravel ? (
                      <div className="text-emerald-400 flex items-center gap-1"><Icon icon={Navigation} size={16} /> READY</div>
                   ) : (
                      <div className="text-gray-500 flex items-center gap-1">OFFLINE</div>
                   )}
                </div>
             </div>

             <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Reliability</div>
                <div className="text-xl font-bold font-mono text-emerald-400">{tech.reliability || 95}%</div>
             </div>

             <div className="text-right flex items-center gap-4">
                <div className="hidden lg:block">
                   <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Battery</div>
                   <div className="text-xs font-bold text-gray-400">{tech.battery || 100}%</div>
                </div>
                <div className="bg-white/5 p-2 rounded-lg group-hover:bg-blue-500/20 text-gray-600 group-hover:text-blue-400 transition-all">
                   <Icon icon={ChevronRight} size={20} />
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};

export default TechnicianCommandCenter;
