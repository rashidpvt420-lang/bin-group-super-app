import React, { useState } from 'react';
import { auth, signInWithPopup } from '../lib/firebase';
import { 
    GoogleAuthProvider
} from 'firebase/auth';
import { Shield, Lock, ArrowRight, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function UnifiedLogin() {
    const { loading: authLoading, error: authError } = useAuth();
    const [localLoading, setLocalLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const error = authError || localError;
    const loading = authLoading || localLoading;

    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setLocalError(null);
        const provider = new GoogleAuthProvider();
        try {
            console.log("🔍 [DIAG] Starting signInWithPopup for Admin...");
            const result = await signInWithPopup(auth, provider);
            if (result.user) {
                console.log("🛡️ [AUTH] Admin Popup login successful for:", result.user.email);
            }
        } catch (err: any) {
            console.error("Auth popup error:", err);
            setLocalError(`IDENTITY_FAULT: ${err.message || 'Verification failed.'}`);
            setLocalLoading(false);
        }
    };

    if (loading && !error) {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4">
                <div className="w-12 h-12 border-4 border-[#C6A75E] border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-[#C6A75E] font-black uppercase tracking-[0.4em] text-sm text-center">
                    Authenticating Sovereign Identity...
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 selection:bg-[#C6A75E]/30">
            {/* Background Branding */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="w-full max-w-[420px] relative z-10">
                {/* Branding Section */}
                <div className="text-center mb-12">
                    <div className="inline-block p-4 rounded-3xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-[#C6A75E]/20 shadow-2xl mb-6">
                        <Shield className="w-12 h-12 text-[#C6A75E]" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2 italic">
                        BIN-ADMINISTRY<span className="text-[#C6A75E]">™</span>
                    </h1>
                    <p className="text-[#94a3b8] font-bold tracking-[0.2em] text-[10px] uppercase">
                        Sovereign Command & Control Center
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/5 rounded-[32px] p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C6A75E] to-transparent opacity-50"></div>
                    
                    <div className="mb-8">
                        <h2 className="text-xl font-black text-white mb-2">Institutional Access</h2>
                        <p className="text-sm text-[#64748b] leading-relaxed">
                            Authorized personnel only. All access attempts are logged under the Sovereign Audit Protocol.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"></div>
                            {error}
                        </div>
                    )}

                    <button 
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full group relative flex items-center justify-between bg-white text-black font-black py-5 px-8 rounded-2xl transition-all duration-300 hover:bg-[#C6A75E] hover:scale-[1.02] active:scale-[0.98] shadow-xl overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-4">
                            <Globe className="w-6 h-6" />
                            <span className="uppercase tracking-widest text-sm">Verify Identity</span>
                        </div>
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>

                    <div className="mt-8 flex items-center justify-center gap-2 opacity-40">
                        <Lock className="w-3 h-3 text-[#94a3b8]" />
                        <span className="text-[9px] text-[#94a3b8] font-black uppercase tracking-widest">
                            256-bit Encrypted Node
                        </span>
                    </div>
                </div>

                {/* Footer Security Marks */}
                <div className="mt-12 grid grid-cols-3 gap-4 opacity-30 grayscale hover:opacity-100 transition-opacity duration-700">
                    <div className="text-center">
                        <div className="text-[8px] text-white font-black uppercase mb-1">Status</div>
                        <div className="text-[10px] text-[#C6A75E] font-black italic">PROD_ACTIVE</div>
                    </div>
                    <div className="text-center">
                        <div className="text-[8px] text-white font-black uppercase mb-1">Protocol</div>
                        <div className="text-[10px] text-[#C6A75E] font-black italic">ALFA_4</div>
                    </div>
                    <div className="text-center">
                        <div className="text-[8px] text-white font-black uppercase mb-1">Region</div>
                        <div className="text-[10px] text-[#C6A75E] font-black italic">UAE_SOV</div>
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center opacity-40">
                <p className="text-[9px] text-[#94a3b8] font-black uppercase tracking-[0.3em]">
                    BIN-Groups CORE v1.23-STABLE
                </p>
            </div>
        </div>
    );
}
