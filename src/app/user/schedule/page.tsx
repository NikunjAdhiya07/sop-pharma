'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Calendar, 
  ChevronLeft,
  Clock,
  MapPin,
  Users,
  AlertCircle
} from 'lucide-react';

export default function SchedulePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white text-xl font-medium">Loading Schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                <ChevronLeft className="h-6 w-6" />
              </Link>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-200 to-teal-200 bg-clip-text text-transparent">
                My Schedule
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-3 gap-8">
            {/* Calendar Widget (Simplified Visualization) */}
            <div className="md:col-span-1 space-y-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 p-6">
                    <h2 className="text-white font-bold mb-4 flex items-center">
                        <Calendar className="w-5 h-5 mr-2 text-emerald-400" />
                        February 2026
                    </h2>
                    {/* Mock Calendar Grid */}
                    <div className="grid grid-cols-7 gap-2 text-center text-sm">
                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(day => (
                            <div key={day} className="text-gray-400 py-1">{day}</div>
                        ))}
                        {Array.from({length: 28}).map((_, i) => (
                            <div key={i} className={`py-2 rounded-lg ${i === 5 ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-300 hover:bg-white/5'}`}>
                                {i + 1}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-900/50 to-teal-900/50 rounded-2xl p-6 border border-emerald-500/30">
                    <div className="flex items-start space-x-3 text-emerald-100">
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">You have 2 upcoming training sessions this week. Please review the prerequisites.</p>
                    </div>
                </div>
            </div>

            {/* Upcoming Events List */}
            <div className="md:col-span-2 space-y-4">
                <h2 className="text-xl font-bold text-white mb-2">Upcoming Sessions</h2>
                
                {/* Event Card 1 */}
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 flex flex-col md:flex-row md:items-center gap-6 hover:bg-white/10 transition-all cursor-pointer group">
                    <div className="flex-shrink-0 bg-white/10 rounded-xl p-4 text-center min-w-[80px]">
                        <span className="block text-emerald-400 font-bold text-xl">FEB</span>
                        <span className="block text-white text-3xl font-bold">06</span>
                    </div>
                    <div className="flex-grow">
                        <h3 className="text-xl font-bold text-white group-hover:text-emerald-300 transition-colors">Safety Protocols Induction</h3>
                        <p className="text-gray-400 mb-3">Comprehensive review of lab safety standards.</p>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-300">
                            <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-emerald-400"/> 10:00 AM - 12:00 PM</span>
                            <span className="flex items-center"><MapPin className="w-4 h-4 mr-1 text-purple-400"/> Conference Room B</span>
                            <span className="flex items-center"><Users className="w-4 h-4 mr-1 text-blue-400"/> 12 Attendees</span>
                        </div>
                    </div>
                    <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                        Details
                    </button>
                </div>

                {/* Event Card 2 */}
                <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 flex flex-col md:flex-row md:items-center gap-6 hover:bg-white/10 transition-all cursor-pointer group">
                     <div className="flex-shrink-0 bg-white/10 rounded-xl p-4 text-center min-w-[80px]">
                        <span className="block text-purple-400 font-bold text-xl">FEB</span>
                        <span className="block text-white text-3xl font-bold">08</span>
                    </div>
                    <div className="flex-grow">
                        <h3 className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors">Advanced SOP Compliance</h3>
                        <p className="text-gray-400 mb-3">Workshop on new compliance regulations.</p>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-300">
                            <span className="flex items-center"><Clock className="w-4 h-4 mr-1 text-emerald-400"/> 02:00 PM - 04:00 PM</span>
                            <span className="flex items-center"><MapPin className="w-4 h-4 mr-1 text-purple-400"/> Training Hall A</span>
                            <span className="flex items-center"><Users className="w-4 h-4 mr-1 text-blue-400"/> 25 Attendees</span>
                        </div>
                    </div>
                    <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors">
                        Details
                    </button>
                </div>

            </div>
        </div>
      </main>
    </div>
  );
}
