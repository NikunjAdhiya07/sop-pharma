'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ShieldCheck, User, Calendar, ArrowRight, Loader2, AlertTriangle, Lock } from 'lucide-react';

export default function GuestVerifyPage() {
  const params = useParams(); // Returns { token: string } or similar
  // Ensure token is treated as string
  const token = typeof params?.token === 'string' ? params.token : 
                Array.isArray(params?.token) ? params.token[0] : '';
                
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: '',
    dob: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExamStarting, setIsExamStarting] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/guest/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: formData.name,
          dob: formData.dob
        })
      });
      const data = await res.json();

      if (data.success) {
        setIsExamStarting(true);
        // Delay slightly for UX
        setTimeout(() => {
          // Pass credentials in URL state or session storage if needed, 
          // but for security we might just repost them to the start endpoint 
          // or rely on the cookie if the verify endpoint set one.
          // For this implementation, I'll pass them via sessionStorage to be picked up by the exam page 
          // to re-verify with the start endpoint, keeping the API simpler (stateless-ish).
          sessionStorage.setItem('guest_creds', JSON.stringify({ token, ...formData }));
          router.push(`/guest/exam/${token}`);
        }, 1500);
      } else {
        setError(data.message || 'Verification failed');
        setLoading(false);
      }
    } catch (error) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  };

  if (!token) {
      return (
          <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
              <div className="text-center">
                  <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                  <h1 className="text-2xl font-bold">Invalid Link</h1>
                  <p className="text-slate-400">This access link is missing or broken.</p>
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header Logo/Icon */}
        <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-900/50">
                <ShieldCheck className="w-10 h-10 text-white" />
            </div>
        </div>

        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl relative">
            {isExamStarting && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
                    <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
                    <h3 className="text-xl font-bold text-purple-900">Verifying Identity...</h3>
                    <p className="text-slate-500">Preparing secure exam environment</p>
                </div>
            )}

            <div className="p-8 pb-0">
                <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">Guest Access</h1>
                <p className="text-slate-500 text-center text-sm mb-8">
                    Enter your details exactly as provided by the administrator to access the assessment.
                </p>

                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 mb-6 animate-in slide-in-from-top-2">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                    </div>
                )}
            </div>

            <form onSubmit={handleVerify} className="p-8 pt-0 space-y-5">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Full Name</label>
                    <div className="relative">
                        <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                        <input 
                            required
                            type="text" 
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-slate-900"
                            placeholder="e.g. John Doe"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Date of Birth</label>
                    <div className="relative">
                        <Calendar className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                        <input 
                            required
                            type="date" 
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-medium text-slate-900"
                            value={formData.dob}
                            onChange={e => setFormData({...formData, dob: e.target.value})}
                        />
                    </div>
                </div>

                <div className="pt-4">
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold text-lg hover:bg-purple-700 active:scale-95 transition-all shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify & Start <ArrowRight className="w-5 h-5" /></>}
                    </button>
                </div>
            </form>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400 font-medium">
                <Lock className="w-3 h-3" />
                Secure Mockup Assessment Platform
            </div>
        </div>
      </div>
    </div>
  );
}
