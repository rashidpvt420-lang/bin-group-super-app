import { useEffect, useState } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';
import { getApps, getApp } from 'firebase/app';
import { motion, AnimatePresence } from 'framer-motion';

// ── Firebase RTDB — reuse the app already initialised in AuthContext/firebase config ──
// If no app exists yet, the DB calls will simply fail gracefully; ensure FirebaseApp
// is initialised in your root index.tsx / App.tsx before rendering this component.
const db = getDatabase(getApps().length > 0 ? getApp() : undefined as any);

interface WorkOrder {
    id: string;
    category: string;
    propertyId: string;
    unitId: string;
    status: string;
    createdAt: number;
    tenantId: string;
}

interface StatCard { label: string; value: number | string; color: string; icon: string; borderColor: string; }

export default function AdminRadar() {
    const [alerts, setAlerts] = useState<WorkOrder[]>([]);
    const [allOrders, setAllOrders] = useState<WorkOrder[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const woRef = ref(db, 'workOrders');

        // Real-time listener for ALL work orders
        const unsubAll = onValue(woRef, (snap) => {
            if (snap.exists()) {
                const raw = snap.val() as Record<string, any>;
                const orders: WorkOrder[] = Object.entries(raw).map(([id, val]) => ({ id, ...val }));
                setAllOrders(orders);
                setAlerts(orders.filter(o => o.status === 'escalated' || o.status === 'pending'));
            } else {
                setAllOrders([]);
                setAlerts([]);
            }
            setLoading(false);
        });

        return () => unsubAll();
    }, []);

    const stats: StatCard[] = [
        { label: 'Total Work Orders', value: allOrders.length, color: 'text-[#64FFDA]', borderColor: 'border-[#64FFDA]/20', icon: '📋' },
        { label: 'SLA Breaches', value: alerts.filter(a => a.status === 'escalated').length, color: 'text-[#FF5252]', borderColor: 'border-[#FF5252]/20', icon: '🚨' },
        { label: 'Pending', value: allOrders.filter(o => o.status === 'pending').length, color: 'text-[#FFB74D]', borderColor: 'border-[#FFB74D]/20', icon: '⏳' },
        { label: 'Completed', value: allOrders.filter(o => o.status === 'Completed').length, color: 'text-[#69F0AE]', borderColor: 'border-[#69F0AE]/20', icon: '✅' },
    ];

    const timeSince = (ts: number) => {
        const mins = Math.floor((Date.now() - ts) / 60000);
        if (mins < 60) return `${mins}m ago`;
        return `${Math.floor(mins / 60)}h ago`;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0D1B2A] to-[#1B2A3B] p-6 font-['Outfit']">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <motion.div 
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-2.5 h-2.5 rounded-full bg-[#FF5252] shadow-[0_0_12px_#FF5252]" 
                />
                <h1 className="text-white text-2xl font-bold m-0 uppercase">SLA ESCALATION RADAR</h1>
                <span className="ml-auto text-[#64FFDA] text-[13px] bg-[#64FFDA]/10 px-3 py-1 rounded-full border border-[#64FFDA]/30 font-bold tracking-wider">
                    LIVE
                </span>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-8">
                {stats.map(s => (
                    <div key={s.label} className={`bg-white/5 rounded-xl p-4 md:p-5 border ${s.borderColor}`}>
                        <div className="text-2xl">{s.icon}</div>
                        <div className={`${s.color} text-3xl font-bold mt-2`}>{s.value}</div>
                        <div className="text-white/50 text-xs mt-1 font-medium">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Alert Feed */}
            <h2 className="text-white text-base font-semibold mb-4 flex items-center gap-2">
                Active Alerts {loading && <span className="text-[#64FFDA] text-[13px] font-medium animate-pulse">Loading...</span>}
            </h2>

            {!loading && alerts.length === 0 && (
                <div className="text-center py-16 px-5 text-[#69F0AE]">
                    <div className="text-5xl mb-3">✅</div>
                    <h3 className="m-0 mb-1 text-[#69F0AE] text-lg font-bold uppercase">All Systems Nominal</h3>
                    <p className="text-white/40 text-sm font-medium">No SLA breaches or pending alerts.</p>
                </div>
            )}

            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                {alerts.map(alert => {
                    const isEscalated = alert.status === 'escalated';
                    return (
                        <div key={alert.id} className={`
                            ${isEscalated ? 'bg-[#FF5252]/10 border-[#FF5252]/30 shadow-[0_0_20px_rgba(255,82,82,0.15)]' : 'bg-[#FFB74D]/10 border-[#FFB74D]/30'}
                            rounded-2xl p-5 border transition-all duration-300
                        `}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className={`${isEscalated ? 'text-[#FF5252]' : 'text-[#FFB74D]'} font-bold text-[15px] flex items-center gap-2`}>
                                        {isEscalated ? '🚨' : '⏳'} {alert.category}
                                    </div>
                                    <div className="text-white/50 text-xs mt-1 font-medium italic">
                                        Property: {alert.propertyId} · Unit: {alert.unitId}
                                    </div>
                                </div>
                                <span className={`
                                    ${isEscalated ? 'bg-[#FF5252]/20 text-[#FF5252]' : 'bg-[#FFB74D]/20 text-[#FFB74D]'}
                                    px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider
                                `}>
                                    {alert.status}
                                </span>
                            </div>
                            <div className="mt-4 flex justify-between items-center bg-black/20 p-3 rounded-xl">
                                <span className="text-white/30 text-[11px] font-mono">
                                    {alert.createdAt ? timeSince(alert.createdAt) : 'Just now'}
                                </span>
                                <button
                                    title="Dispatch Maintenance Technician"
                                    className="bg-[#64FFDA]/10 text-[#64FFDA] border border-[#64FFDA]/30 rounded-lg px-3 py-1.5 text-[11px] cursor-pointer font-bold uppercase tracking-wider hover:bg-[#64FFDA]/20 transition-colors"
                                    onClick={() => alert}
                                >
                                    Dispatch Tech →
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
