'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Users, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';

interface AssignedSOP {
  _id: string;
  identifier: string;
  name: string;
  version: string;
  department: string;
  needsRetraining: boolean;
  nextReviewDate?: string;
}

export default function TrainerDashboard() {
  const [sops, setSops] = useState<AssignedSOP[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSops = async () => {
      try {
        const res = await fetch('/api/trainer/sops');
        const data = await res.json();
        if (data.success) {
          setSops(data.sops);
        }
      } catch (error) {
        console.error('Failed to fetch trainer SOPs', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSops();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <PageHeader 
            title="Trainer Dashboard" 
            subtitle="Manage your assigned SOPs and track trainee progress."
            icon={BookOpen}
        />

        {loading ? (
             <div className="flex justify-center p-12">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
             </div>
        ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sops.length === 0 ? (
                    <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200">
                        <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-slate-500 font-medium">No SOPs assigned to you yet.</h3>
                    </div>
                ) : (
                    sops.map((sop) => (
                        <div key={sop._id} className="group bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-purple-200 transition-all flex flex-col justify-between h-full">
                            <div>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-purple-50 transition-colors">
                                        <BookOpen className="w-6 h-6 text-slate-600 group-hover:text-purple-600" />
                                    </div>
                                    {sop.needsRetraining && (
                                        <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
                                            <AlertTriangle className="w-3 h-3" /> Retraining Required
                                        </div>
                                    )}
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-1 line-clamp-2">{sop.identifier}: {sop.name}</h3>
                                <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">v{sop.version}</span>
                                    <span>{sop.department}</span>
                                </div>
                            </div>
                            
                            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                <Link href={`/trainer/sop/${sop._id}`} className="flex items-center gap-2 text-sm font-bold text-purple-600 hover:text-purple-700">
                                    View Progress <ArrowRight className="w-4 h-4" />
                                </Link>
                                <div className="flex items-center gap-1 text-slate-400 text-xs">
                                    <Users className="w-3 h-3" /> 
                                    <span>Track Trainees</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
             </div>
        )}
      </div>
    </div>
  );
}
