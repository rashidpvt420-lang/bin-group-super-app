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
import { db, collection, query, where, onSnapshot } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';

const Icon = ({ icon: IconComponent, size = 16, className = "" }: { icon: any, size?: number, className?: string }) => (
  <IconComponent size={size} className={className} />
);

const TechnicianCommandCenter: React.FC = () => {
  const { t, isRTL } = useLanguage();
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
    { label: t('tech.active_technicians'), value: `${stats.active}/${stats.totalCount}`, icon: Users },
    { label: t('tech.avg_feedback'), value: '4.85', icon: Activity },
    { label: t('tech.evidence_compliance'), value: `${stats.compliance}%`, icon: ShieldCheck },
    { label: t('tech.total_jobs_today'), value: stats.jobsToday.toString(), icon: Clock }
  ];

  if (loading && techList.length === 0) return <div className="p-8 text-center text-emerald-400 font-mono tracking-widest animate-pulse">{t('tech.booting_msg')}</div>;

  return (
    <div className={`p-8 bg-[#0a0a0b] text-white min-h-screen font-sans ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
        <div className={isRTL ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">
             {t('tech.command_center')}
          </h1>
          <p className="text-gray-500 text-xs font-bold tracking-widest mt-1">{t('tech.exec_layer_monitoring')}</p>
        </div>
        <div className="flex items-center gap-6">
           {metricCards.map(s => (
             <div key={s.label} className="flex items-center gap-3">
                <div className="text-gray-600 bg-white/5 p-2 rounded-lg">
                   <Icon icon={s.icon} size={18} />
                </div>
                <div className={isRTL ? 'text-right' : 'text-left'}>
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
             <TechCard key={tech.id} tech={tech} t={t} isRTL={isRTL} />
           ))}
           
           {techList.length === 0 && (
             <div className="bg-[#141417] p-8 rounded-2xl border border-dashed border-white/10 flex items-center justify-center text-gray-600 text-sm font-bold">
                {t('tech.no_techs_online')}
             </div>
           )}
        </div>

        <div className="space-y-8">
           <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 shadow-2xl">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
                 <Icon icon={Activity} size={16} /> {t('tech.job_intensity')}
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
                 <Icon icon={Smartphone} size={16} /> {t('tech.device_health')}
              </h2>
              <div className="space-y-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                 <div className="flex justify-between"><span>{t('tech.online')}</span> <span className="text-emerald-400">{stats.active}/{stats.totalCount}</span></div>
                 <div className="flex justify-between"><span>{t('tech.gps_drift')}</span> <span className="text-blue-400">± 5m</span></div>
                 <div className="flex justify-between"><span>{t('tech.evidence_sync')}</span> <span className="text-emerald-400">{t('tech.stable')}</span></div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const TechCard = ({ tech, t, isRTL }: any) => {
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
             <div className={isRTL ? 'text-right' : 'text-left'}>
                <div className="text-lg font-bold">{tech.name || 'Unknown Tech'}</div>
                <div className="text-xs text-gray-500 font-bold flex items-center gap-1.5 uppercase tracking-widest">
                   <Icon icon={MapPin} size={12} className="text-emerald-400" /> {tech.zone || 'Unknown Zone'}
                </div>
             </div>
          </div>

          <div className="flex items-center gap-12">
             <div className="hidden md:block text-right">
                <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('tech.status')}</div>
                <div className="text-sm font-bold flex items-center gap-2 justify-end">
                   {isCharging ? (
                      <div className="text-blue-400 flex items-center gap-1"><Icon icon={Activity} size={16} /> {t('tech.on_site')}</div>
                   ) : isTravel ? (
                      <div className="text-emerald-400 flex items-center gap-1"><Icon icon={Navigation} size={16} /> {t('tech.ready')}</div>
                   ) : (
                      <div className="text-gray-500 flex items-center gap-1">OFFLINE</div>
                   )}
                </div>
             </div>

             <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('tech.reliability')}</div>
                <div className="text-xl font-bold font-mono text-emerald-400">{tech.reliability || 95}%</div>
             </div>

             <div className="text-right flex items-center gap-4">
                <div className="hidden lg:block">
                   <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('tech.battery')}</div>
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
