import React, { useState, useEffect } from 'react';
import { 
    Zap, 
    Shield, 
    Activity, 
    Wifi, 
    MapPin, 
    Battery, 
    AlertTriangle,
    Clock,
    ChevronRight,
    Search,
    Filter,
    Radar,
    LucideIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './TechnicianCommandCenter.css';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

// Helper for type-safe icons in React 18
const Icon = ({ icon: IconComponent, size = 16, className = "", color = "currentColor" }: { icon: any, size?: number, className?: string, color?: string }) => (
    <IconComponent size={size} className={className} color={color} />
);

interface Telemetry {
    technicianId: string;
    lat: number;
    lng: number;
    batteryLevel: number;
    speed: number;
    status: 'ACTIVE' | 'IDLE' | 'OFFLINE' | 'EMERGENCY';
    jobId?: string;
    timestamp: number;
    riskFlag: boolean;
    lastUpdate: string;
    isStale: boolean;
}

const TechnicianCommandCenter: React.FC = () => {
    const [telemetry, setTelemetry] = useState<Record<string, Telemetry>>({});
    const [selectedTech, setSelectedTech] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLive, setIsLive] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'technicianLocations'), orderBy('timestamp', 'desc'), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const updates: Record<string, Telemetry> = {};
            snapshot.forEach((doc) => {
                updates[doc.id] = doc.data() as Telemetry;
            });
            setTelemetry(prev => ({ ...prev, ...updates }));
        });

        return () => unsubscribe();
    }, []);

    const techs = Object.values(telemetry).filter(t => 
        t.technicianId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeCount = techs.filter(t => t.status === 'ACTIVE').length;
    const emergencyCount = techs.filter(t => t.status === 'EMERGENCY').length;

    return (
        <div className="min-h-screen bg-[#050505] text-slate-200 font-sans p-6 lg:p-10">
            {/* --- 📡 LIVE COMMAND HEADER --- */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-12 border-b border-white/5 pb-10">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="relative">
                            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping absolute inset-0" />
                            <div className="w-3 h-3 bg-emerald-500 rounded-full relative z-10" />
                        </div>
                        <span className="text-emerald-500 font-black text-xs uppercase tracking-[0.3em]">
                            BIN-LIVE™ COMMAND
                        </span>
                    </div>
                    <h1 className="text-4xl lg:text-6xl font-black text-white tracking-tighter italic uppercase leading-none">
                        Operations <span className="text-slate-600">Center</span>
                    </h1>
                </div>

                <div className="flex items-center gap-4 bg-white/5 p-2 rounded-2xl border border-white/5">
                    <div className="px-6 py-3 border-r border-white/10">
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Active Assets</p>
                        <p className="text-2xl font-black text-white">{activeCount}</p>
                    </div>
                    <div className="px-6 py-3">
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Alerts</p>
                        <p className="text-2xl font-black text-red-500">{emergencyCount || 'None'}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* --- 🛰️ TELEMETRY FEED --- */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-white/5 rounded-3xl border border-white/5 p-6 space-y-6">
                        <div className="relative">
                            <i className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                <Icon icon={Search} size={16} />
                            </i>
                            <input 
                                type="text" 
                                placeholder="Search Technicians..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-owner-gold/50 transition-all"
                            />
                        </div>

                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {techs.length === 0 ? (
                                <div className="py-20 text-center space-y-4">
                                    <Icon icon={Radar} className="text-slate-700 mx-auto animate-pulse" size={48} />
                                    <p className="text-slate-600 font-bold uppercase text-[10px] tracking-widest">Scanning for active signals...</p>
                                </div>
                            ) : (
                                techs.map(tech => (
                                    <motion.div 
                                        key={tech.technicianId}
                                        layout
                                        onClick={() => setSelectedTech(tech.technicianId)}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                                            selectedTech === tech.technicianId 
                                            ? "bg-owner-gold border-owner-gold shadow-lg shadow-owner-gold/20" 
                                            : "bg-white/5 border-white/5 hover:border-white/10"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${
                                                    tech.status === 'ACTIVE' ? "bg-emerald-500 animate-pulse" : 
                                                    tech.status === 'EMERGENCY' ? "bg-red-500 animate-ping" : 
                                                    "bg-slate-500"
                                                }`} />
                                                <span className={`font-black text-xs uppercase tracking-tighter ${
                                                    selectedTech === tech.technicianId ? "text-owner-dark" : "text-white"
                                                }`}>
                                                    TECH-{tech.technicianId.slice(-4).toUpperCase()}
                                                </span>
                                            </div>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                                selectedTech === tech.technicianId 
                                                ? "bg-owner-dark/10 border-owner-dark/20 text-owner-dark" 
                                                : "bg-white/5 border-white/10 text-slate-500"
                                            }`}>
                                                {tech.status}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                                            <div className="flex items-center gap-2">
                                                <Icon icon={MapPin} size={12} />
                                                <span className={selectedTech === tech.technicianId ? "text-owner-dark" : "text-slate-400"}>
                                                    {tech.lat.toFixed(5)}, {tech.lng.toFixed(5)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Icon icon={Battery} size={12} className={tech.batteryLevel < 20 ? "text-red-500" : ""} />
                                                <span className={selectedTech === tech.technicianId ? "text-owner-dark" : "text-slate-400"}>
                                                    {tech.batteryLevel}%
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-3xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Icon icon={Activity} className="text-emerald-500" size={20} />
                            <h3 className="text-emerald-500 font-black text-sm uppercase tracking-widest">Health Metrics</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <span>Signal Stability</span>
                                <span className="text-emerald-500">99.9%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5">
                                <div className="bg-emerald-500 h-1.5 rounded-full tech-health-bar" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- 🎯 DYNAMIC RADAR MAP --- */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-[#0A0A0A] rounded-[40px] border border-white/5 p-8 h-[740px] relative overflow-hidden group">
                        {/* Fake Map Grid */}
                        <div className="absolute inset-0 opacity-20 pointer-events-none">
                            <div className="absolute inset-0 radar-grid" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent" />
                        </div>

                        {/* Radar Scan Effect */}
                        <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                            className="absolute top-1/2 left-1/2 -ml-[1000px] -mt-[1000px] w-[2000px] h-[2000px] bg-gradient-to-tr from-owner-gold/5 via-transparent to-transparent rounded-full opacity-30 pointer-events-none"
                        />

                        {/* Tech Markers on Map */}
                        {techs.map(tech => (
                            <motion.div 
                                key={tech.technicianId}
                                className="absolute cursor-pointer transform -translate-x-1/2 -translate-y-1/2 z-20 group/marker"
                                style={{ 
                                    left: `${50 + (tech.lng - 55.2708) * 10000}%`, // Simplified coordinate mapping
                                    top: `${50 - (tech.lat - 25.2048) * 10000}%` 
                                }}
                                onClick={() => setSelectedTech(tech.technicianId)}
                            >
                                <div className={`relative p-2 rounded-full transition-all ${
                                    selectedTech === tech.technicianId ? "bg-owner-gold scale-125" : "bg-white/10 hover:bg-white/20"
                                }`}>
                                    <div className={`w-3 h-3 rounded-full ${
                                        tech.status === 'ACTIVE' ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : 
                                        tech.status === 'EMERGENCY' ? "bg-red-500 animate-ping" : 
                                        "bg-slate-400"
                                    }`} />
                                    
                                    {/* Tooltip-like label */}
                                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/marker:opacity-100 transition-opacity bg-black border border-white/10 px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest text-white whitespace-nowrap">
                                        TECH-{tech.technicianId.slice(-4).toUpperCase()}
                                    </div>
                                </div>
                            </motion.div>
                        ))}

                        <div className="relative z-30 h-full flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <div className="bg-black/50 backdrop-blur-md border border-white/10 p-4 rounded-2xl max-w-[240px]">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon icon={MapPin} className="text-owner-gold" size={16} />
                                        <span className="text-white font-black text-[10px] uppercase tracking-widest">Sector: Downtown Dubai</span>
                                    </div>
                                    <p className="text-slate-500 text-[10px] font-bold">Monitoring live telemetry nodes across Dubai metropolitan area.</p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => setIsLive(!isLive)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                                            isLive ? "bg-red-500/20 text-red-500 border border-red-500/30" : "bg-white/5 text-slate-500 border border-white/10"
                                        }`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-red-500 animate-pulse" : "bg-slate-500"}`} />
                                        {isLive ? 'LIVE' : 'BUFFERED'}
                                    </button>
                                </div>
                            </div>

                            {/* Detailed Tech Overlay */}
                            <AnimatePresence>
                                {selectedTech && telemetry[selectedTech] && (
                                    <motion.div 
                                        initial={{ y: 50, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: 50, opacity: 0 }}
                                        className="bg-black/80 backdrop-blur-2xl border border-owner-gold/30 p-8 rounded-[32px] w-full max-w-[400px] shadow-2xl"
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h3 className="text-owner-gold text-2xl font-black italic tracking-tighter uppercase mb-1">
                                                    TECH-{selectedTech.slice(-4).toUpperCase()}
                                                </h3>
                                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Specialist Deployment Node</p>
                                            </div>
                                            <button 
                                                onClick={() => setSelectedTech(null)}
                                                className="bg-white/5 p-2 rounded-xl text-slate-400 hover:text-white transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-8">
                                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                    <Icon icon={Activity} size={12} />
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Speed</span>
                                                </div>
                                                <p className="text-white font-black text-xl">{telemetry[selectedTech].speed} <span className="text-[10px] text-slate-500">KM/H</span></p>
                                            </div>
                                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                    <Icon icon={Clock} size={12} />
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Session</span>
                                                </div>
                                                <p className="text-white font-black text-xl">4h 12m</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <button className="w-full bg-owner-gold py-4 rounded-2xl text-owner-dark font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-owner-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                                                Establish Voice Comms
                                            </button>
                                            <button className="w-full bg-white/5 py-4 rounded-2xl text-white font-black text-xs uppercase tracking-[0.2em] border border-white/10 hover:bg-white/10 transition-all">
                                                View Live Job Feed
                                            </button>
                                        </div>

                                            {telemetry[selectedTech].riskFlag && (
                                                <div className="mt-6 flex items-center gap-3 bg-red-500/20 border border-red-500/30 p-3 rounded-xl">
                                                    <Icon icon={AlertTriangle} className="text-red-500 animate-pulse" size={20} />
                                                    <p className="text-red-500 text-[10px] font-black uppercase tracking-widest leading-tight">
                                                        Anomalous Telemetry Detected: Signal Spoofing Suspected
                                                    </p>
                                                </div>
                                            )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TechnicianCommandCenter;
