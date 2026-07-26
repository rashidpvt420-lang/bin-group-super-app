// admin-panel/src/components/ops/TechnicianCommandCenter.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, MapPin, Navigation, Clock,
  Smartphone, Activity, ShieldCheck, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { collection, limit, onSnapshot, query, where } from '../../lib/firebase';
import { db } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

const Icon = ({ icon: IconComponent, size = 16, className = '' }: { icon: any; size?: number; className?: string }) => (
  <IconComponent size={size} className={className} />
);

const timestampMs = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
  if (Number.isFinite(value)) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const numeric = (value: any): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasBeforeProof = (ticket: any) => Boolean(
  ticket.technicianBeforePhotoUrl ||
  ticket.beforePhotoUrl ||
  (Array.isArray(ticket.technicianBeforePhotos) && ticket.technicianBeforePhotos.length) ||
  (Array.isArray(ticket.beforePhotos) && ticket.beforePhotos.length),
);

const hasAfterProof = (ticket: any) => Boolean(
  ticket.afterPhotoUrl ||
  ticket.completionPhotoUrl ||
  (Array.isArray(ticket.afterPhotos) && ticket.afterPhotos.length) ||
  (Array.isArray(ticket.completionPhotos) && ticket.completionPhotos.length) ||
  (Array.isArray(ticket.proofPhotos) && ticket.proofPhotos.length),
);

const completedStatus = (value: any) => [
  'COMPLETED',
  'COMPLETED_PENDING_APPROVAL',
  'COMPLETED_PENDING_TENANT_APPROVAL',
  'RESOLVED',
  'CLOSED',
].includes(String(value || '').trim().toUpperCase());

const activeTechnician = (tech: any) => {
  const status = String(tech.status || tech.dutyStatus || '').trim().toUpperCase();
  return tech.onDuty === true || tech.isTracking === true || ['ON_JOB', 'ON-JOB', 'ON_SITE', 'TRAVELING', 'EN_ROUTE', 'AVAILABLE', 'ON_DUTY'].includes(status);
};

const freshLocation = (location: any) => {
  if (location.isTracking !== true) return false;
  const updatedAt = timestampMs(location.serverUpdatedAt || location.location?.serverUpdatedAt);
  const expiresAt = timestampMs(location.expiresAt);
  return updatedAt !== null && Date.now() - updatedAt <= 120_000 && (expiresAt === null || expiresAt > Date.now());
};

const TechnicianCommandCenter: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const [techList, setTechList] = useState<any[]>([]);
  const [todayJobs, setTodayJobs] = useState<any[]>([]);
  const [liveLocations, setLiveLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const technicianQuery = query(collection(db, 'technicians'), limit(100));
    const jobsQuery = query(collection(db, 'maintenanceTickets'), where('createdAt', '>=', today), limit(250));
    const locationsQuery = query(collection(db, 'technician_live_locations'), where('isTracking', '==', true), limit(100));

    const setSourceError = (source: string, message: string) => {
      setErrors((current) => [...current.filter((item) => !item.startsWith(`${source}:`)), `${source}: ${message}`]);
    };
    const clearSourceError = (source: string) => {
      setErrors((current) => current.filter((item) => !item.startsWith(`${source}:`)));
    };

    const unsubscribeTechnicians = onSnapshot(technicianQuery, (snapshot) => {
      setTechList(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      clearSourceError('Technicians');
      setLoading(false);
    }, (error) => {
      console.error('[TechnicianCommandCenter] Technician feed failed:', error);
      setTechList([]);
      setSourceError('Technicians', 'Technician records could not be loaded. Metrics are unavailable.');
      setLoading(false);
    });

    const unsubscribeJobs = onSnapshot(jobsQuery, (snapshot) => {
      setTodayJobs(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      clearSourceError('Jobs');
    }, (error) => {
      console.error('[TechnicianCommandCenter] Job feed failed:', error);
      setTodayJobs([]);
      setSourceError('Jobs', 'Today’s job and evidence metrics could not be loaded.');
    });

    const unsubscribeLocations = onSnapshot(locationsQuery, (snapshot) => {
      setLiveLocations(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
      clearSourceError('GPS');
    }, (error) => {
      console.error('[TechnicianCommandCenter] Canonical GPS feed failed:', error);
      setLiveLocations([]);
      setSourceError('GPS', 'Canonical GPS accuracy and freshness could not be loaded.');
    });

    return () => {
      unsubscribeTechnicians();
      unsubscribeJobs();
      unsubscribeLocations();
    };
  }, []);

  const activeCount = useMemo(() => techList.filter(activeTechnician).length, [techList]);
  const freshGps = useMemo(() => liveLocations.filter(freshLocation), [liveLocations]);
  const averageGpsAccuracy = useMemo(() => {
    const values = freshGps
      .map((location) => numeric(location.location?.accuracy ?? location.accuracy))
      .filter((value): value is number => value !== null && value > 0 && value <= 100);
    if (!values.length) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [freshGps]);

  const completedJobs = useMemo(() => todayJobs.filter((ticket) => completedStatus(ticket.status)), [todayJobs]);
  const evidenceCompleteJobs = useMemo(
    () => completedJobs.filter((ticket) => hasBeforeProof(ticket) && hasAfterProof(ticket)),
    [completedJobs],
  );
  const evidenceCoverage = completedJobs.length
    ? Math.round((evidenceCompleteJobs.length / completedJobs.length) * 100)
    : null;

  const feedbackValues = useMemo(() => techList
    .map((tech) => numeric(tech.averageFeedback ?? tech.feedbackRating ?? tech.rating))
    .filter((value): value is number => value !== null && value >= 0 && value <= 5), [techList]);
  const averageFeedback = feedbackValues.length
    ? (feedbackValues.reduce((sum, value) => sum + value, 0) / feedbackValues.length).toFixed(2)
    : null;

  const jobIntensity = useMemo(() => {
    const counts = new Map<string, number>();
    todayJobs.forEach((ticket) => {
      const label = String(
        ticket.serviceZone ||
        ticket.propertyZone ||
        ticket.emirate ||
        ticket.city ||
        'Unspecified',
      ).trim() || 'Unspecified';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([n, v]) => ({ n, v }));
  }, [todayJobs]);

  const measured = (value: string | number | null, suffix = '') => value === null ? 'Not measured' : `${value}${suffix}`;
  const metricCards = [
    { label: t('tech.active_technicians'), value: `${activeCount}/${techList.length}`, icon: Users },
    { label: t('tech.avg_feedback'), value: measured(averageFeedback), icon: Activity },
    { label: t('tech.evidence_compliance'), value: measured(evidenceCoverage, '%'), icon: ShieldCheck },
    { label: t('tech.total_jobs_today'), value: todayJobs.length.toString(), icon: Clock },
  ];

  if (loading && techList.length === 0) {
    return <div className="p-8 text-center text-emerald-400 font-mono tracking-widest animate-pulse">{t('tech.booting_msg')}</div>;
  }

  return (
    <div className={`p-8 bg-[#0a0a0b] text-white min-h-screen font-sans ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex justify-between items-center mb-10 border-b border-white/10 pb-6 gap-6 flex-wrap">
        <div className={isRTL ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">
            {t('tech.command_center')}
          </h1>
          <p className="text-gray-500 text-xs font-bold tracking-widest mt-1">
            Verified Firestore operational records. Missing provider or device data is not estimated.
          </p>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          {metricCards.map((metric) => (
            <div key={metric.label} className="flex items-center gap-3">
              <div className="text-gray-600 bg-white/5 p-2 rounded-lg"><Icon icon={metric.icon} size={18} /></div>
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest">{metric.label}</div>
                <div className="text-sm font-bold">{metric.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {errors.map((error) => <div key={error}>{error}</div>)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-4">
          {techList.slice(0, 100).map((tech) => <TechCard key={tech.id} tech={tech} t={t} isRTL={isRTL} />)}
          {techList.length === 0 && !errors.some((error) => error.startsWith('Technicians:')) && (
            <div className="bg-[#141417] p-8 rounded-2xl border border-dashed border-white/10 flex items-center justify-center text-gray-600 text-sm font-bold">
              No Technician records returned by the bounded production query.
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 shadow-2xl">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
              <Icon icon={Activity} size={16} /> {t('tech.job_intensity')}
            </h2>
            {jobIntensity.length ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jobIntensity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222226" />
                    <XAxis dataKey="n" stroke="#52525b" tick={{ fontSize: 10 }} />
                    <Tooltip cursor={{ fill: '#27272a' }} />
                    <Bar dataKey="v" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="text-xs text-gray-500">No zone-tagged jobs were recorded today.</div>}
          </div>

          <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 shadow-2xl">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
              <Icon icon={Smartphone} size={16} /> {t('tech.device_health')}
            </h2>
            <div className="space-y-4 text-xs font-bold uppercase tracking-widest text-gray-500">
              <div className="flex justify-between"><span>{t('tech.online')}</span><span className="text-emerald-400">{activeCount}/{techList.length}</span></div>
              <div className="flex justify-between"><span>Fresh GPS sessions</span><span className="text-blue-400">{freshGps.length}</span></div>
              <div className="flex justify-between"><span>Average GPS accuracy</span><span className="text-blue-400">{measured(averageGpsAccuracy, 'm')}</span></div>
              <div className="flex justify-between"><span>Completed jobs with before/after proof</span><span className="text-emerald-400">{completedJobs.length ? `${evidenceCompleteJobs.length}/${completedJobs.length}` : 'Not measured'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TechCard = ({ tech, t, isRTL }: any) => {
  const status = String(tech.status || tech.dutyStatus || '').trim().toUpperCase();
  const isOnSite = ['ON_SITE', 'ON-JOB', 'ON_JOB'].includes(status);
  const isTravel = ['TRAVELING', 'EN_ROUTE', 'AVAILABLE', 'ON_DUTY'].includes(status) || tech.onDuty === true;
  const reliability = numeric(tech.reliability ?? tech.reliabilityScore ?? tech.performanceScore);
  const battery = numeric(tech.battery ?? tech.batteryLevel);

  return (
    <div className="bg-[#141417] p-6 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all group shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="bg-white/5 p-4 rounded-full relative group-hover:bg-blue-500/10 transition-colors">
            <Icon icon={Users} size={24} className={isOnSite ? 'text-blue-400' : 'text-gray-400'} />
            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#141417] ${isOnSite ? 'bg-blue-500' : isTravel ? 'bg-emerald-500' : 'bg-gray-600'}`} />
          </div>
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <div className="text-lg font-bold">{tech.displayName || tech.name || 'Unnamed Technician'}</div>
            <div className="text-xs text-gray-500 font-bold flex items-center gap-1.5 uppercase tracking-widest">
              <Icon icon={MapPin} size={12} className="text-emerald-400" /> {tech.serviceZone || tech.zone || 'Service zone not reported'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-12">
          <div className="hidden md:block text-right">
            <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('tech.status')}</div>
            <div className="text-sm font-bold flex items-center gap-2 justify-end">
              {isOnSite ? (
                <div className="text-blue-400 flex items-center gap-1"><Icon icon={Activity} size={16} /> {t('tech.on_site')}</div>
              ) : isTravel ? (
                <div className="text-emerald-400 flex items-center gap-1"><Icon icon={Navigation} size={16} /> {t('tech.ready')}</div>
              ) : <div className="text-gray-500 flex items-center gap-1">Status not active</div>}
            </div>
          </div>

          <div className="text-center">
            <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('tech.reliability')}</div>
            <div className="text-xl font-bold font-mono text-emerald-400">{reliability === null ? 'Not measured' : `${Math.round(reliability)}%`}</div>
          </div>

          <div className="text-right flex items-center gap-4">
            <div className="hidden lg:block">
              <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('tech.battery')}</div>
              <div className="text-xs font-bold text-gray-400">{battery === null ? 'Not reported' : `${Math.round(battery)}%`}</div>
            </div>
            <div className="bg-white/5 p-2 rounded-lg text-gray-600"><Icon icon={ChevronRight} size={20} /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicianCommandCenter;
